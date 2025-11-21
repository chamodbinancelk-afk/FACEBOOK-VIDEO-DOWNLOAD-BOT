/**
 * src/worker.js
 * Cloudflare Worker for Facebook Download Bot using grammY.
 * Handles Telegram Webhook requests.
 * * NOTE: The BOT_TOKEN is hardcoded here, which is NOT RECOMMENDED for production 
 * environments. Please replace '<YOUR_ACTUAL_BOT_TOKEN_HERE>' with your token.
 */

import { Bot, webhookCallback, InlineKeyboard } from 'grammy';

// ----------------------------------------------------------------------
// IMPORTANT: REPLACE THE PLACEHOLDER BELOW WITH YOUR ACTUAL BOT TOKEN
// ----------------------------------------------------------------------
const BOT_TOKEN = "8382727460:AAEgKVISJN5TTuV4O-82sMGQDG3khwjiKR8"; 
// ----------------------------------------------------------------------

const API_URL = "https://fdown.isuru.eu.org/info";
const bot = new Bot(BOT_TOKEN);

// The KV Binding name is updated to USER_DATABASE as per your request.
// globalThis.USER_DATABASE will be automatically available via 'env' object.

// Helper function for HTML bold text
function htmlBold(text) {
    return `<b>${text}</b>`;
}

// Helper function to safely delete a message
async function safeDeleteMessage(ctx, messageId) {
    try {
        await ctx.api.deleteMessage(ctx.chat.id, messageId);
    } catch (e) {
        console.error(`[WARN] Failed to delete message ${messageId}:`, e.message);
    }
}

// --- START COMMAND ---
bot.command('start', async (ctx) => {
    const userName = ctx.from?.first_name || "පරිශීලක";
    const userText = `👋 <b>සුභ දවසක් ${userName} මහත්මයා/මහත්මිය!</b> 💁‍♂️ මෙය Facebook වීඩියෝ බාගත කිරීමේ Bot එකයි.
    
කරුණාකර Facebook වීඩියෝ Link එකක් එවන්න.`;
    await ctx.reply(userText, { parse_mode: 'HTML' });
});

// --- MESSAGE HANDLER (Link Processing) ---
bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    const isLink = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.me)/i.test(text);
    const chatId = ctx.chat.id;

    if (!isLink) {
        await ctx.reply(htmlBold('❌ කරුණාකර වලංගු Facebook වීඩියෝ Link එකක් එවන්න.'), { parse_mode: 'HTML' });
        return;
    }
    
    // Send initial acknowledgement
    let initialMsg;
    try {
        initialMsg = await ctx.reply(htmlBold('⏳ වීඩියෝ තොරතුරු සොයමින්...'), { 
            parse_mode: 'HTML',
            reply_to_message_id: ctx.message.message_id
        });
    } catch (e) {
        console.error("Failed to send initial message:", e.message);
        return;
    }

    try {
        // Fetch video data
        const apiResponse = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'TelegramBot/Worker' // Cloudflare Worker User-Agent
            },
            body: JSON.stringify({ url: text })
        });
        
        if (!apiResponse.ok) {
            throw new Error(`API request failed with status ${apiResponse.status}`);
        }
        
        const videoData = await apiResponse.json();
        
        // Extract required information
        let rawThumbnailLink = null;
        let videoTitle = 'Facebook Video';
        let duration = null;
        
        if (videoData.video_info) {
            rawThumbnailLink = videoData.video_info.thumbnail?.replace(/&amp;/g, '&');
            videoTitle = videoData.video_info.title || videoTitle;
            duration = videoData.video_info.duration;
        } else if (videoData.thumbnail) {
            rawThumbnailLink = videoData.thumbnail.replace(/&amp;/g, '&');
        } else if (videoData.data && videoData.data.thumbnail) {
            rawThumbnailLink = videoData.data.thumbnail.replace(/&amp;/g, '&');
        }
        
        if (!videoTitle && videoData.title) {
            videoTitle = videoData.title;
        } else if (!videoTitle && videoData.data && videoData.data.title) {
            videoTitle = videoData.data.title;
        }

        // --- 1. Send Thumbnail and Details ---
        if (rawThumbnailLink) {
            try {
                let durationText = duration ? `${Math.floor(duration / 60)}:${(Math.floor(duration % 60)).toString().padStart(2, '0')}` : '';
                
                let caption = `${htmlBold(videoTitle)}\n\n`;
                if (durationText) caption += `⏱️ කාලය: ${durationText}\n`;
                caption += `\n✅ ${htmlBold('Thumbnail බාගත කිරීම සාර්ථකයි!')}`;
                
                await ctx.replyWithPhoto(rawThumbnailLink, {
                    caption: caption,
                    parse_mode: 'HTML',
                    reply_to_message_id: ctx.message.message_id
                });
                
                await safeDeleteMessage(ctx, initialMsg.message_id);

            } catch (photoError) {
                console.error('[ERROR] Failed to send photo:', photoError.message);
                await safeDeleteMessage(ctx, initialMsg.message_id);
                await ctx.reply(htmlBold('❌ Thumbnail එක යැවීම අසාර්ථක විය.'), { parse_mode: 'HTML' });
                return;
            }
        } else {
            const errorText = htmlBold('⚠️ සමාවෙන්න, මේ වීඩියෝ එකේ Thumbnail එක සොයා ගැනීමට නොහැකි විය.');
            await safeDeleteMessage(ctx, initialMsg.message_id);
            await ctx.reply(errorText, { parse_mode: 'HTML' });
            return;
        }

        // --- 2. Store Data in KV and Send Quality Selection Buttons ---
        if (videoData.available_formats && videoData.available_formats.length > 0) {
            
            const qualityMap = {};
            const availableQualities = [];

            // Populate qualityMap and availableQualities, ensuring URL decoding
            videoData.available_formats.forEach(format => {
                if (!qualityMap[format.quality]) {
                    let decodedUrl = format.url.replace(/&amp;/g, '&');
                    qualityMap[format.quality] = decodedUrl;
                    availableQualities.push(format.quality);
                }
            });
            
            // Use a short, unique key (e.g., chat ID + current timestamp, but simplified)
            const videoKey = `v${chatId}_${Math.floor(Date.now() / 1000)}`; 
            
            // Store ONLY the essential data (URL map and title) in KV. Expires after 3600 seconds (1 hour).
            // USER_DATABASE is the binding name from wrangler.toml
            const kvData = { 
                title: videoTitle, 
                qualityMap: qualityMap 
            };
            
            // Store in KV using the bound name USER_DATABASE
            // This relies on the env binding being set in the fetch handler
            await env.USER_DATABASE.put(videoKey, JSON.stringify(kvData), { expirationTtl: 3600 });
            
            // Create inline keyboard buttons
            const inlineKeyboard = new InlineKeyboard();
            availableQualities.forEach(quality => {
                // Callback format: dl_<videoKey>_<quality>
                inlineKeyboard.add({ text: `📥 ${quality} බාගත කරන්න`, callback_data: `dl_${videoKey}_${quality}` });
            });
            
            await ctx.reply(`${htmlBold('🎥 වීඩියෝ Quality එකක් තෝරන්න:')}\n\n${videoTitle}`, {
                parse_mode: 'HTML',
                reply_markup: inlineKeyboard
            });
            console.log(`[SUCCESS] Data stored in KV with key: ${videoKey}`);
        }
        
    } catch (apiError) {
        console.error(`[ERROR] API Error:`, apiError);
        await safeDeleteMessage(ctx, initialMsg.message_id);
        await ctx.reply(htmlBold('❌ වීඩියෝ තොරතුරු ලබා ගැනීමේ දෝෂයක් ඇති විය. කරුණාකර නැවත උත්සාහ කරන්න.') + `\n\n(දෝෂය: ${apiError.message})`, { parse_mode: 'HTML' });
    }
});

// --- CALLBACK QUERY HANDLER (Download Button Click) ---
bot.on('callback_query:data', async (ctx) => {
    const callbackData = ctx.callbackQuery.data;
    const chatId = ctx.chat.id;
    const messageId = ctx.callbackQuery.message.message_id;
    
    // Check if the environment variable is available (passed via fetch handler env)
    const USER_DATABASE = globalThis.USER_DATABASE;
    if (!USER_DATABASE) {
        await ctx.answerCallbackQuery({ text: '❌ Server Error: KV not initialized.' });
        await ctx.reply(htmlBold('❌ අභ්‍යන්තර දෝෂයක්: දත්ත ගබඩාව නොමැත.'), { parse_mode: 'HTML' });
        return;
    }

    if (callbackData.startsWith('dl_')) {
        let processingMsg;
        let videoUrl = ''; // Define here for fallback

        try {
            // Acknowledge the callback immediately
            const quality = callbackData.split('_').pop();
            await ctx.answerCallbackQuery({
                text: `⏬ ${quality} Video Download වෙමින්...`
            });
            
            // Remove buttons immediately
            await ctx.editMessageReplyMarkup({});

            // Parse callback data: dl_videoKey_quality
            const parts = callbackData.split('_');
            const videoKey = parts[1]; // videoKey is the second part
            // quality is already defined above

            // 1. Retrieve data from KV
            const kvDataString = await USER_DATABASE.get(videoKey);
            if (!kvDataString) {
                await ctx.reply(htmlBold('❌ වීඩියෝ තොරතුරු කල් ඉකුත් වී ඇත. නැවත සබැඳිය එවන්න.'), { parse_mode: 'HTML' });
                return;
            }
            const kvData = JSON.parse(kvDataString);
            
            const videoTitle = kvData.title;
            videoUrl = kvData.qualityMap[quality]; // Set defined variable

            if (!videoUrl) {
                await ctx.reply(htmlBold('❌ තෝරාගත් Quality එකේ URL එක සොයාගත නොහැක.'), { parse_mode: 'HTML' });
                return;
            }
            
            // 2. Send processing message
            processingMsg = await ctx.reply(`⏬ ${htmlBold(`${quality} Video Download වෙමින්...`)}\n\nකරුණාකර රැඳී සිටින්න...`, {
                parse_mode: 'HTML',
                reply_to_message_id: messageId
            });
            
            // 3. Send video directly from URL
            await ctx.replyWithVideo({
                url: videoUrl
            }, {
                caption: `${htmlBold(videoTitle)}\n\n✅ Quality: ${quality}\n📥 ${htmlBold('Video Downloaded!')}`,
                parse_mode: 'HTML'
            });
            
            // 4. Cleanup: Delete processing message and KV entry
            await safeDeleteMessage(ctx, processingMsg.message_id);
            await USER_DATABASE.delete(videoKey);
            console.log(`[SUCCESS] Video sent for ${quality} and KV cache cleared.`);

        } catch (videoError) {
            console.error(`[ERROR] Video send failed: ${videoError.message}`);
            
            if (processingMsg) {
                await safeDeleteMessage(ctx, processingMsg.message_id);
            }
            
            // Fallback: send download link
            const fallbackLink = videoUrl || 'No URL found.';
            const errorCaption = htmlBold('⚠️ වීඩියෝව යැවීම අසාර්ථක විය.') + `\n\nමෙම සබැඳිය භාවිතයෙන් බාගත කරන්න: <a href="${fallbackLink}">Click to Download</a>`;
            
            await ctx.reply(errorCaption, { 
                parse_mode: 'HTML', 
                link_preview_options: { is_disabled: true } 
            });

        }
    }
});


// --- CLOUDFLARE WORKER EXPORT ---

// Error handler for grammY to catch errors during update handling
bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`[ERROR] Bot error caught during update for chat ${ctx.chat?.id}:`, err.error);
    // Silent fail in the worker environment is often preferred for non-fatal errors
});

// Configure the webhook callback for the Worker environment
const handleUpdate = webhookCallback(bot, 'cloudflare');

export default {
    async fetch(request, env, ctx) {
        // Pass the KV binding to global context for grammY bot logic access
        // The KV namespace is accessed via 'env.USER_DATABASE'
        globalThis.USER_DATABASE = env.USER_DATABASE; 

        // Only handle POST requests from Telegram
        if (request.method === 'POST') {
            try {
                // FIX: Pass only the request object to handleUpdate. 
                // This resolves the "event.respondWith is not a function" error 
                // by using the grammY 'cloudflare' callback correctly.
                return await handleUpdate(request);
            } catch (e) {
                console.error("Webhook handling failed:", e.message);
                // Return a successful response even on internal error to prevent Telegram retries
                return new Response('Error handling update', { status: 500 });
            }
        }
        
        // Handle GET requests (e.g., setting webhook or status check)
        return new Response('OK', { status: 200 });
    },
};

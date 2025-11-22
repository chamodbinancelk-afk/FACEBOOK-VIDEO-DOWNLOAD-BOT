// fbindex.js - සම්පූර්ණ යාවත්කාලීන කේතය (Error Logging Fix සහිතව)

import { WorkerHandlers } from './handlers';
import { getApiMetadata, scrapeVideoLinkAndThumbnail } from './api';
import { formatCaption, htmlBold } from './helpers';
import { OWNER_ID, PROGRESS_STATES } from './config';

export default {
    
    async fetch(request, env, ctx) {
        
        // --- 1. /download REDIRECT LOGIC ---
        const url = new URL(request.url);
        if (url.pathname === '/download' && request.method === 'GET') {
            
            // **වැදගත්:** GITHUB_PAGES_URL ENV විචල්‍යය භාවිතා කරන්න, නැතිනම් ඔබේ GitHub Pages URL එක සකසන්න.
            const githubPagesBaseUrl = env.GITHUB_PAGES_URL || 'https://<ඔබේ_පරිශීලක_නම>.github.io/<ඔබේ_රෙපෝ_නම>/index.html'; 
            
            const redirectUrl = new URL(githubPagesBaseUrl);
            
            // Worker වෙතින් ලැබුණු query parameters, GitHub Pages වෙත යොමු කරයි.
            url.searchParams.forEach((value, key) => {
                redirectUrl.searchParams.set(key, value);
            });
            
            return Response.redirect(redirectUrl.toString(), 302);
        }
        
        if (request.method !== 'POST') {
            return new Response('Hello, I am your FDOWN Telegram Worker Bot.', { status: 200 });
        }
        
        const handlers = new WorkerHandlers(env);
        
        const userInlineKeyboard = [
            [{ text: 'C D H Corporation © ✅', callback_data: 'ignore_c_d_h' }] 
        ];
        
        const initialProgressKeyboard = [
             [{ text: PROGRESS_STATES[0].text.replace(/<[^>]*>/g, ''), callback_data: 'ignore_progress' }]
        ];

        try {
            const update = await request.json();
            const message = update.message;
            const callbackQuery = update.callback_query;
            
            if (!message && !callbackQuery) {
                 return new Response('OK', { status: 200 });
            }
            
            ctx.waitUntil(new Promise(resolve => setTimeout(resolve, 0)));

            if (message) { 
                const chatId = message.chat.id;
                const messageId = message.message_id;
                const text = message.text ? message.text.trim() : null; 
                const isOwner = OWNER_ID && chatId.toString() === OWNER_ID.toString();
                
                const userName = message.from.first_name || "User"; 

                ctx.waitUntil(handlers.saveUserId(chatId));

                // --- Admin/Broadcast Logic ---
                if (isOwner && message.reply_to_message) {
                    const repliedMessage = message.reply_to_message;
                    
                    if (repliedMessage.text && repliedMessage.text.includes("Please reply with the message you want to broadcast:")) {
                        
                        const messageToBroadcastId = messageId; 
                        const originalChatId = chatId;
                        const promptMessageId = repliedMessage.message_id; 

                        await handlers.editMessage(chatId, promptMessageId, htmlBold("📣 Broadcast started. Please wait."));
                        
                        ctx.waitUntil((async () => {
                            try {
                                const results = await handlers.broadcastMessage(originalChatId, messageToBroadcastId);
                                
                                const resultMessage = htmlBold('Broadcast Complete ✅') + `\n\n`
                                                    + htmlBold(`🚀 Successful: `) + results.successfulSends + '\n'
                                                    + htmlBold(`❗️ Failed/Blocked: `) + results.failedSends;
                                
                                await handlers.sendMessage(chatId, resultMessage, messageToBroadcastId); 

                            } catch (e) {
                                await handlers.sendMessage(chatId, htmlBold("❌ Broadcast Process Failed.") + `\n\nError: ${e.message}`, messageToBroadcastId);
                            }
                        })()); 

                        return new Response('OK', { status: 200 });
                    }
                }
                
                if (isOwner && text && text.toLowerCase().startsWith('/brod') && message.reply_to_message) {
                    const messageToBroadcastId = message.reply_to_message.message_id; 
                    const originalChatId = chatId;
                    
                    await handlers.sendMessage(chatId, htmlBold("📣 Quick Broadcast started..."), messageId);

                    ctx.waitUntil((async () => {
                        try {
                            const results = await handlers.broadcastMessage(originalChatId, messageToBroadcastId);
                            
                            const resultMessage = htmlBold('Quick Broadcast Complete ✅') + `\n\n`
                                                + htmlBold(`🚀 Successful: `) + results.successfulSends + '\n'
                                                + htmlBold(`❗️ Failed/Blocked: `) + results.failedSends;
                            
                            await handlers.sendMessage(chatId, resultMessage, messageId); 

                        } catch (e) {
                            await handlers.sendMessage(chatId, htmlBold("❌ Quick Broadcast failed.") + `\n\nError: ${e.message}`, messageId);
                        }
                    })());

                    return new Response('OK', { status: 200 });
                }
                // --- End Admin/Broadcast Logic ---
                
                if (text && text.toLowerCase().startsWith('/start')) {
                    
                    if (isOwner) {
                        const ownerText = htmlBold("👑 Welcome Back, Admin!") + "\n\nThis is your Admin Control Panel.";
                        const adminKeyboard = [
                            [{ text: '📊 Users Count', callback_data: 'admin_users_count' }],
                            [{ text: '📣 Broadcast', callback_data: 'admin_broadcast' }],
                            [{ text: 'C D H Corporation © ✅', callback_data: 'ignore_c_d_h' }] 
                        ];
                        await handlers.sendMessage(chatId, ownerText, messageId, adminKeyboard);
                    } else {
                        const userText = `👋 <b>Hello Dear ${userName}!</b> 💁‍♂️ You can easily <b>Download Facebook Videos</b> using this BOT.

🎯 This BOT is <b>Active 24/7</b>.🔔 

◇───────────────◇

🚀 <b>Developer</b> : @chamoddeshan
🔥 <b>C D H Corporation ©</b>

◇───────────────◇`;
                        
                        await handlers.sendMessage(chatId, userText, messageId, userInlineKeyboard);
                    }
                    return new Response('OK', { status: 200 });
                }

                if (text) { 
                    const isLink = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.me)/i.test(text);
                    
                    if (isLink) {
                        
                        // Action: Send 'typing'
                        ctx.waitUntil(handlers.sendAction(chatId, 'typing'));

                        const initialText = htmlBold('⌛️ Detecting video... Please wait a moment.'); 
                        const progressMessageId = await handlers.sendMessage(
                            chatId, 
                            initialText, 
                            messageId, 
                            initialProgressKeyboard
                        );
                        
                        if (progressMessageId) {
                            ctx.waitUntil(handlers.simulateProgress(chatId, progressMessageId, messageId));
                        }
                        
                        try {
                            const apiData = await getApiMetadata(text);
                            const finalCaption = formatCaption(apiData);
                            
                            const scraperData = await scrapeVideoLinkAndThumbnail(text);
                            const videoUrl = scraperData.videoUrl;
                            
                            const finalThumbnailLink = apiData.thumbnailLink || scraperData.fallbackThumbnail;

                            
                            if (videoUrl) {
                                handlers.progressActive = false; 
                                
                                // Large file handling: pass apiData for link generation
                                if (apiData.filesize > 50 * 1024 * 1024) { 
                                    if (progressMessageId) {
                                        await handlers.deleteMessage(chatId, progressMessageId);
                                    }
                                    
                                    await handlers.sendLinkMessage(
                                        chatId,
                                        videoUrl, 
                                        finalCaption, 
                                        messageId,
                                        apiData // apiData එක සම්පූර්ණයෙන් යැවීම
                                    );
                                    
                                } else {
                                    if (progressMessageId) {
                                        await handlers.deleteMessage(chatId, progressMessageId);
                                    }
                                    
                                    // Action: Send 'upload_video'
                                    ctx.waitUntil(handlers.sendAction(chatId, 'upload_video'));
                                    
                                    try {
                                        await handlers.sendVideo(
                                            chatId, 
                                            videoUrl, 
                                            finalCaption, 
                                            messageId, 
                                            finalThumbnailLink, 
                                            userInlineKeyboard
                                        ); 
                                    } catch (e) {
                                        // Fallback to sending direct link if sendVideo fails (e.g., file too big/timeout)
                                        await handlers.sendLinkMessage(
                                            chatId,
                                            videoUrl, 
                                            finalCaption, 
                                            messageId
                                        );
                                    }
                                }
                                
                            } else {
                                handlers.progressActive = false;
                                const errorText = htmlBold('⚠️ Sorry, the video Download Link could not be found. The video might be Private.');
                                if (progressMessageId) {
                                    await handlers.editMessage(chatId, progressMessageId, errorText); 
                                } else {
                                    await handlers.sendMessage(chatId, errorText, messageId);
                                }
                            }
                            
                        } catch (fdownError) {
                            handlers.progressActive = false;
                            const errorText = htmlBold('❌ An error occurred while retrieving video information.');
                            if (progressMessageId) {
                                await handlers.editMessage(chatId, progressMessageId, errorText);
                            } else {
                                await handlers.sendMessage(chatId, errorText, messageId);
                            }
                        }
                        
                    } else {
                        await handlers.sendMessage(chatId, htmlBold('❌ Please send a valid Facebook video link.'), messageId);
                    }
                } 
            }
            
            if (callbackQuery) {
                 const chatId = callbackQuery.message.chat.id;
                 const data = callbackQuery.data;
                 const messageId = callbackQuery.message.message_id;
                 
                 const allButtons = callbackQuery.message.reply_markup.inline_keyboard.flat();
                 const button = allButtons.find(b => b.callback_data === data);
                 const buttonText = button ? button.text : "Action Complete";

                 if (data === 'ignore_progress' || data === 'ignore_c_d_h') {
                     await handlers.answerCallbackQuery(callbackQuery.id, buttonText);
                     return new Response('OK', { status: 200 });
                 }
                 
                 if (OWNER_ID && chatId.toString() !== OWNER_ID.toString()) {
                      await handlers.answerCallbackQuery(callbackQuery.id, "❌ You cannot use this command.");
                      return new Response('OK', { status: 200 });
                 }

                 switch (data) {
                     case 'admin_users_count':
                          await handlers.answerCallbackQuery(callbackQuery.id, buttonText);
                          const usersCount = await handlers.getAllUsersCount();
                          const countMessage = htmlBold(`📊 Current Users in the Bot: ${usersCount}`);
                          await handlers.editMessage(chatId, messageId, countMessage);
                          break;
                     
                     case 'admin_broadcast':
                          await handlers.answerCallbackQuery(callbackQuery.id, buttonText);
                          const broadcastPrompt = htmlBold("📣 Broadcast Message") + "\n\n" + htmlBold("Please reply with the message you want to broadcast (Text, Photo, or Video).");
                          await handlers.sendMessage(chatId, broadcastPrompt, messageId); 
                          break;
                 }

                 return new Response('OK', { status: 200 });
            }


            return new Response('OK', { status: 200 });

        } catch (e) {
            // ✅ දෝෂය log කර එය නැවත throw කිරීම, එවිට Cloudflare Dashboard එකේ දෝෂය දර්ශනය වේ.
            console.error("Worker Catch Block Error:", e);
            
            // Telegram webhook එකට 500 status එකක් යැවීමෙන් සත්‍ය වශයෙන්ම දෝෂයක් ඇති බව පෙන්වයි.
            return new Response(`Worker Internal Error: ${e.message}`, { status: 500 });
        }
    }
};

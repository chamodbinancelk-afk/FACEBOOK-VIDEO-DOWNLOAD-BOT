// index.js (Cloudflare Worker Main File)

import { WorkerHandlers } from './handlers';
import { getApiMetadata, scrapeVideoLinkAndThumbnail } from './api';
import { formatCaption, htmlBold } from './helpers';
// ⚠️ නිවැරදි import: MAX_FILE_SIZE_BYTES එකතු කර ඇත
import { OWNER_ID, PROGRESS_STATES, MAX_FILE_SIZE_BYTES } from './config'; 

export default {
    
    async fetch(request, env, ctx) {
        
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
            
            // ⚠️ වැදගත්: මෙම පේළිය ඉවත් කර ඇත (පෙර දෝෂය නිවැරදි කර ඇත)
            // ctx.waitUntil(new Promise(resolve => setTimeout(resolve, 0)));

            if (message) { 
                const chatId = message.chat.id;
                const messageId = message.message_id;
                const text = message.text ? message.text.trim() : null; 
                const isOwner = OWNER_ID && chatId.toString() === OWNER_ID.toString();
               
                ctx.waitUntil(handlers.saveUserId(chatId));

                // ----------------------------------------------------
                // 1. Admin Commands
                // ----------------------------------------------------
                if (isOwner) {
                    if (text && text.startsWith('/admin')) {
                        const adminKeyboard = [
                            [{ text: '📊 Users Count', callback_data: 'admin_users_count' }],
                            [{ text: '📣 Broadcast Message', callback_data: 'admin_broadcast' }]
                        ];
                        await handlers.sendMessage(chatId, htmlBold("⚙️ Admin Panel"), messageId, adminKeyboard);
                        return new Response('OK', { status: 200 });
                    }
                    
                    if (message.reply_to_message && message.reply_to_message.text && message.reply_to_message.text.includes("📣 Broadcast Message")) {
                        const originalMessageId = message.message_id;
                        await handlers.sendMessage(chatId, htmlBold("⏳ Starting broadcast... Please wait. This may take a while."), messageId);
                        
                        ctx.waitUntil((async () => {
                            const { successfulSends, failedSends } = await handlers.broadcastMessage(chatId, originalMessageId);
                            const resultText = htmlBold("✅ Broadcast Complete!") + `\n\n`
                                             + `🟢 Successful Sends: ${successfulSends}\n`
                                             + `🔴 Failed Sends: ${failedSends}`;
                            await handlers.sendMessage(chatId, resultText, originalMessageId);
                        })());

                        return new Response('OK', { status: 200 });
                    }
                }
                
                // ----------------------------------------------------
                // 2. Start Command
                // ----------------------------------------------------
                if (text === '/start') {
                    const welcomeMessage = htmlBold("👋 Welcome to Facebook Video Downloader Bot!") + "\n\n"
                                           + "Just send me a **Facebook video link** (e.g., `https://www.facebook.com/...`) and I will process it for you." + "\n\n"
                                           + "Developer: @chamoddeshan";
                    await handlers.sendMessage(chatId, welcomeMessage, messageId);
                    return new Response('OK', { status: 200 });
                }

                // ----------------------------------------------------
                // 3. Link Handling Logic (Video Download)
                // ----------------------------------------------------
                if (text) { 
                    const isLink = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.me|m\.facebook\.com|mbasic\.facebook\.com)/i.test(text);
                    
                    if (isLink) {
                        
                        // A. Initial Progress Message
                        const initialText = htmlBold('⌛️ Detecting video... Please wait a moment.'); 
                        const progressMessageId = await handlers.sendMessage(
                            chatId, 
                            initialText, 
                            messageId, 
                            initialProgressKeyboard
                        );
                        
                        // B. Start Progress Simulation (Background Task)
                        if (progressMessageId) {
                            ctx.waitUntil(handlers.simulateProgress(chatId, progressMessageId, messageId));
                        }
                        
                        // C. Main Processing Logic
                        ctx.waitUntil((async () => {
                            try {
                                
                                ctx.waitUntil(handlers.sendAction(chatId, 'typing'));
                                
                                // 1. API හරහා Metadata ලබා ගනී
                                const apiData = await getApiMetadata(text);
                                const finalCaption = formatCaption(apiData);
                                
                                // 2. Scraper හරහා Download Link සහ Fallback Thumbnail ලබා ගනී
                                const scraperData = await scrapeVideoLinkAndThumbnail(text);
                                const videoUrl = scraperData.videoUrl;
                                
                                // 3. අවසන් Thumbnail Link එක තීරණය කරයි
                                const finalThumbnailLink = apiData.thumbnailLink || scraperData.fallbackThumbnail;

                                
                                if (videoUrl) {
                                    handlers.progressActive = false; 
                                    
                                    // ⚠️ MAX_FILE_SIZE_BYTES මෙහිදී භාවිතා කරයි
                                    if (apiData.filesize > MAX_FILE_SIZE_BYTES) { 
                                        
                                        if (progressMessageId) {
                                            await handlers.deleteMessage(chatId, progressMessageId);
                                        }
                                        
                                        await handlers.sendLinkMessage(
                                            chatId,
                                            videoUrl, 
                                            finalCaption, 
                                            messageId
                                        );
                                        
                                    } else {
                                        if (progressMessageId) {
                                            await handlers.deleteMessage(chatId, progressMessageId);
                                        }
                                        
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
                                
                            } catch (error) {
                                handlers.progressActive = false;
                                console.error("Video processing error:", error);
                                const errorText = htmlBold('❌ An error occurred while retrieving video information.');
                                if (progressMessageId) {
                                    await handlers.editMessage(chatId, progressMessageId, errorText);
                                } else {
                                    await handlers.sendMessage(chatId, errorText, messageId);
                                }
                            }
                        })());
                        
                    } else {
                        await handlers.sendMessage(chatId, htmlBold('❌ Please send a valid Facebook video link.'), messageId);
                    }
                } 

                // Bot Reply කිරීමට, මෙම OK response එක අත්‍යවශ්‍යයි.
                return new Response('OK', { status: 200 }); 

            } 
            
            // ----------------------------------------------------
            // 4. Callback Query Handling
            // ----------------------------------------------------
            if (callbackQuery) {
                 const chatId = callbackQuery.message.chat.id;
                 const messageId = callbackQuery.message.message_id;
                 const data = callbackQuery.data;
                 const buttonText = callbackQuery.message.reply_markup.inline_keyboard[0][0].text;
                 
                 // Ignore Queries
                 if (data.startsWith('ignore_')) {
                      await handlers.answerCallbackQuery(callbackQuery.id, "මෙය බොත්තමක් පමණි.");
                      return new Response('OK', { status: 200 });
                 }
                 
                 // Admin Panel Commands
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
            console.error("Global Error:", e);
            // දෝෂයක් ඇති වුවද, Telegram වෙත OK ප්‍රතිචාරය යවයි.
            return new Response('OK', { status: 200 }); 
        }
    }
};

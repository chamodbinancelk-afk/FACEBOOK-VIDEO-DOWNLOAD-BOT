// fbindex.js - යාවත්කාලීන කරන ලද කේතය

import { WorkerHandlers } from './handlers';
import { getApiMetadata, scrapeVideoLinkAndThumbnail } from './api';
import { formatCaption, htmlBold } from './helpers';
import { OWNER_ID, PROGRESS_STATES, MAX_FILE_SIZE_BYTES } from './config'; // MAX_FILE_SIZE_BYTES ද config වෙතින් import කරන්න

export default {
    
    // Cloudflare Worker හි fetch ශ්‍රිතය
    async fetch(request, env, ctx) {
        
        // ... (වෙනත් code කොටස්)
        
        // Handlers class එක initialize කිරීම (ENV variables සමග)
        const handlers = new WorkerHandlers(env);
        
        // Default Keyboards
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
            
            ctx.waitUntil(new Promise(resolve => setTimeout(resolve, 0))); // Wait until context

            if (message) { 
                const chatId = message.chat.id;
                const messageId = message.message_id;
                const text = message.text ? message.text.trim() : null; 
                
                // OWNER_ID ENV විචල්‍යයෙන් ලබා ගනී
                const isOwner = env.OWNER_ID && chatId.toString() === env.OWNER_ID.toString();
                
                const userName = message.from.first_name || "User"; 

                // User ID එක KV එකේ save කිරීම
                ctx.waitUntil(handlers.saveUserId(chatId));

                
                // --- /start විධානය හැසිරවීම ---
                if (text && text.toLowerCase().startsWith('/start')) {
                    // ... (start code) ...
                    return new Response('OK', { status: 200 });
                }
                // --- /start අවසන් ---

                // --- URL හැසිරවීම ---
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
                            // API කැඳවීමේදී env context එක යවයි
                            const apiData = await getApiMetadata(text, env); 
                            
                            // 🚨 මෙතනින් වෙනස සිදු කර ඇත: apiData undefined නම් වහාම error එකක් පෙන්වයි
                            if (!apiData) {
                                throw new Error("Could not retrieve video information from API.");
                            }
                            
                            const finalCaption = formatCaption(apiData);
                            
                            const scraperData = await scrapeVideoLinkAndThumbnail(text);
                            const videoUrl = scraperData.videoUrl;
                            
                            const finalThumbnailLink = apiData.thumbnailLink || scraperData.fallbackThumbnail;

                            
                            if (videoUrl) {
                                handlers.progressActive = false; 
                                
                                // Large file handling: MAX_FILE_SIZE_BYTES (50MB) භාවිතා කරයි
                                if (apiData.filesize > MAX_FILE_SIZE_BYTES) { 
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
                                    // 50MB ට අඩු නම්, සෘජුවම sendVideo
                                    if (progressMessageId) {
                                        ctx.waitUntil(handlers.editMessage(
                                            chatId, 
                                            progressMessageId, 
                                            htmlBold('🚀 Uploading to Telegram...')
                                        ));
                                    }
                                    
                                    await handlers.sendVideo(
                                        chatId, 
                                        videoUrl, 
                                        finalCaption, 
                                        messageId, 
                                        finalThumbnailLink,
                                        userInlineKeyboard
                                    );
                                    
                                    if (progressMessageId) {
                                        await handlers.deleteMessage(chatId, progressMessageId);
                                    }
                                }
                                
                            } else {
                                handlers.progressActive = false;
                                if (progressMessageId) {
                                    await handlers.deleteMessage(chatId, progressMessageId);
                                }
                                await handlers.sendMessage(chatId, htmlBold('❌ Could not find a high-quality video link.'), messageId);
                            }
                            
                        } catch (fdownError) {
                            handlers.progressActive = false;
                            if (progressMessageId) {
                                await handlers.deleteMessage(chatId, progressMessageId);
                            }
                            console.error("FDown Error:", fdownError.message);
                            await handlers.sendMessage(chatId, htmlBold('❌ An error occurred during video processing.') + `\n\nDetails: ${fdownError.message}`, messageId);
                        }
                        return new Response('OK', { status: 200 }); // Link received and handled
                        
                    } else {
                        // Link එකක් නොවේ නම්
                        await handlers.sendMessage(chatId, htmlBold('❌ Please send a valid Facebook video link.'), messageId);
                    }
                } 
            }
            
            // --- Callback Query Logic (Admin Commands) ---
            if (callbackQuery) {
                 // ... (callback code) ...
                 return new Response('OK', { status: 200 });
            }

            // --- Broadcast Reply Handling ---
            // ... (broadcast code) ...


            return new Response('OK', { status: 200 });

        } catch (e) {
            // 🚨 දෝෂය log කර එය 500 status එකක් ලෙස ආපසු යවයි.
            console.error("Worker Catch Block Error:", e);
            
            // Telegram webhook එකට 500 status එකක් යැවීමෙන් සත්‍ය වශයෙන්ම දෝෂයක් ඇති බව පෙන්වයි.
            return new Response(`Worker Internal Error: ${e.message}`, { status: 500 });
        }
    }
};

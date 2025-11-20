/**
 * src/index.js
 * Final Code V22 (Added Debugging Logs for sendVideo Failure)
 * Developer: @chamoddeshan
 */

// *****************************************************************
// ********** [ ඔබගේ අගයන් මෙහි ඇතුළත් කර ඇත ] ********************
// *****************************************************************
const BOT_TOKEN = '8382727460:AAEgKVISJN5TTuV4O-82sMGQDG3khwjiKR8'; 
const OWNER_ID = '1901997764'; 
// *****************************************************************

// Telegram API Base URL
const telegramApi = `https://api.telegram.org/bot${BOT_TOKEN}`;


// -------------------------------------------------------------------
// I. Helper Functions
// -------------------------------------------------------------------

function escapeMarkdownV2(text) {
    if (!text) return "";
    return text.replace(/([_*[\]()~`>#+\-=|{}.!\\\\])/g, '\\$1');
}

const PROGRESS_STATES = [
    { text: "𝙇𝙤𝙖𝙙𝙞𝙣𝙜…▒▒▒▒▒▒▒▒▒▒", percentage: "0%" },
    { text: "𝘿𝙤𝙬𝙣𝙡𝙤𝙖𝙙ింగ్…█▒▒▒▒▒▒▒▒▒", percentage: "10%" },
    { text: "𝘿𝙤𝙬𝙣𝙡𝙤𝙖𝙙ింగ్…██▒▒▒▒▒▒▒▒", percentage: "20%" },
    { text: "𝘿𝙤𝙬𝙣𝙡𝙤𝙖𝙙ింగ్…███▒▒▒▒▒▒▒", percentage: "30%" },
    { text: "𝙐𝙥𝙡𝙤𝙖𝙙ింగ్…████▒▒▒▒▒▒", percentage: "40%" },
    { text: "𝙐𝙥𝙡𝙤𝙖𝙙ింగ్…█████▒▒▒▒▒", percentage: "50%" },
    { text: "𝙐𝙥𝙡𝙤𝙖𝙙ింగ్…██████▒▒▒▒", percentage: "60%" },
    { text: "𝙐𝙥𝙡𝙤𝙖𝙙ింగ్…███████▒▒▒", percentage: "70%" },
    { text: "𝙁𝙞𝙣𝙖𝙡𝙞𝙯𝙞𝙣𝙜…████████▒▒", percentage: "80%" },
    { text: "𝙁𝙞𝙣𝙖𝙡𝙞𝙯𝙞𝙣𝙜…█████████▒", percentage: "90%" },
    { text: "✅ 𝘿𝙤𝙣𝙚\\! ██████████", percentage: "100%" } 
];

// -------------------------------------------------------------------
// II. WorkerHandlers Class
// -------------------------------------------------------------------

class WorkerHandlers {
    
    constructor(env) {
        this.env = env;
        this.progressActive = true; 
    }

    async saveUserId(userId) { /* ... */ }
    async getAllUsersCount() { /* ... */ }
    async broadcastMessage(fromChatId, messageId) { /* ... */ }

    async sendMessage(chatId, text, replyToMessageId, inlineKeyboard = null) {
        try {
            const response = await fetch(`${telegramApi}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: text, 
                    parse_mode: 'MarkdownV2', 
                    ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
                    ...(inlineKeyboard && { reply_markup: { inline_keyboard: inlineKeyboard } }),
                }),
            });
            const result = await response.json();
            if (!response.ok) {
                console.error(`sendMessage API Failed (Chat ID: ${chatId}):`, result);
                return null;
            }
            return result.result.message_id;
        } catch (e) { 
            console.error(`sendMessage Fetch Error (Chat ID: ${chatId}):`, e);
            return null;
        }
    }

    async editMessage(chatId, messageId, text, inlineKeyboard = null) {
        try {
            const body = {
                chat_id: chatId,
                message_id: messageId,
                text: text,
                parse_mode: 'MarkdownV2',
                ...(inlineKeyboard && { reply_markup: { inline_keyboard: inlineKeyboard } }),
            };
            const response = await fetch(`${telegramApi}/editMessageText`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            
            const result = await response.json(); 

             if (!response.ok) {
                if (result.error_code === 400 && result.description && result.description.includes("message to edit not found")) {
                     return;
                } else {
                     console.error(`editMessage API Failed (Chat ID: ${chatId}):`, result);
                }
            }
        } catch (e) { 
             console.error(`editMessage Fetch Error (Chat ID: ${chatId}):`, e);
        }
    }
    
    async deleteMessage(chatId, messageId) { /* ... */ }
    async sendMessageWithKeyboard(chatId, text, replyToMessageId, keyboard) { /* ... */ }
    async answerCallbackQuery(callbackQueryId, text) { /* ... */ }

    // --- sendVideo with Debugging ---
    async sendVideo(chatId, videoUrl, caption = null, replyToMessageId, thumbnailLink = null, inlineKeyboard = null) {
        
        // ** DEBUG LOG: වීඩියෝව යැවීමට පෙර Link එක පරීක්ෂා කිරීම **
        console.log(`[DEBUG] Attempting to send video. URL: ${videoUrl.substring(0, 50)}...`);
        
        try {
            const videoResponse = await fetch(videoUrl);
            
            if (videoResponse.status !== 200) {
                 // ** DEBUG LOG: Video Fetch අසාර්ථක වීම **
                console.error(`[DEBUG] Video Fetch Failed! Status: ${videoResponse.status} for URL: ${videoUrl}`);
                if (videoResponse.body) { await videoResponse.body.cancel(); }
                await this.sendMessage(chatId, escapeMarkdownV2(`⚠️ වීඩියෝව කෙලින්ම Upload කිරීමට අසාර්ථකයි\\. CDN වෙත පිවිසීමට නොහැක\\. \\(HTTP ${videoResponse.status}\\)`), replyToMessageId);
                return;
            }
            
            const videoBlob = await videoResponse.blob();
            
            const formData = new FormData();
            formData.append('chat_id', chatId);
            
            if (caption) {
                formData.append('caption', caption);
                formData.append('parse_mode', 'MarkdownV2'); 
            }
            
            if (replyToMessageId) {
                formData.append('reply_to_message_id', replyToMessageId);
            }
            
            // ** DEBUG LOG: Blob size පරීක්ෂා කිරීම **
            console.log(`[DEBUG] Video Blob size: ${videoBlob.size} bytes`);
            formData.append('video', videoBlob, 'video.mp4'); 

            if (thumbnailLink) {
               // ... (Thumbnail Fetch Logic) ...
            }
            
            if (inlineKeyboard) {
                formData.append('reply_markup', JSON.stringify({
                    inline_keyboard: inlineKeyboard
                }));
            }

            const telegramResponse = await fetch(`${telegramApi}/sendVideo`, {
                method: 'POST',
                body: formData, 
            });
            
            const telegramResult = await telegramResponse.json();
            
            if (!telegramResponse.ok) {
                 // ** DEBUG LOG: Telegram API Error **
                console.error(`[DEBUG] sendVideo API Failed! Result:`, telegramResult);
                await this.sendMessage(chatId, escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි! \\(Error: ${telegramResult.description || 'නොදන්නා දෝෂයක්\\.'}\\)`), replyToMessageId);
            } else {
                 // ** DEBUG LOG: සාර්ථකයි **
                 console.log(`[DEBUG] sendVideo successful.`);
            }
            
        } catch (e) {
             // ** DEBUG LOG: General Fetch/Network Error **
            console.error(`[DEBUG] sendVideo General Error (Chat ID: ${chatId}):`, e);
            await this.sendMessage(chatId, escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි! \\(Network හෝ Timeout දෝෂයක්\\)\\.`), replyToMessageId);
        }
    }

    // --- Progress Bar Simulation ---

    async simulateProgress(chatId, messageId, originalReplyId) { /* ... */ }
}


// -------------------------------------------------------------------
// V. Main Fetch Handler
// -------------------------------------------------------------------

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
             [{ text: `${PROGRESS_STATES[0].text} ${PROGRESS_STATES[0].percentage}`, callback_data: 'ignore_progress' }]
        ];

        try {
            const update = await request.json();
            const message = update.message;
            // ... (message and callback query handling) ...

            // --- 1. Message Handling ---
            if (message) { 
                const chatId = message.chat.id;
                const messageId = message.message_id;
                const text = message.text ? message.text.trim() : null; 
                // ... (start command and broadcast logic) ...

                // C. Facebook Link Handling 
                if (text) { 
                    const isLink = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.me)/i.test(text);
                    
                    if (isLink) {
                        
                        // 1. Initial Message Send
                        const progressMessageId = await handlers.sendMessage(/* ... */);
                        
                        // 2. Start Progress Simulation
                        if (progressMessageId) {
                            ctx.waitUntil(handlers.simulateProgress(chatId, progressMessageId, messageId));
                        }
                        
                        // 3. Start Scraping and Fetching
                        try {
                            // ... (FDown Scraping Logic) ...
                            const fdownUrl = "https://fdown.net/download.php";
                            const formData = new URLSearchParams();
                            formData.append('URLz', text); 
                            
                            const fdownResponse = await fetch(fdownUrl, { /* ... */ });
                            const resultHtml = await fdownResponse.text();
                            
                            let videoUrl = null;
                            let thumbnailLink = null;
                            // ... (Scraping logic to find videoUrl and thumbnailLink) ...

                            if (videoUrl) {
                                let cleanedUrl = videoUrl.replace(/&amp;/g, '&');
                                
                                handlers.progressActive = false; 
                                
                                if (progressMessageId) {
                                     await handlers.deleteMessage(chatId, progressMessageId);
                                }
                                
                                // Send the actual video
                                await handlers.sendVideo(
                                    chatId, 
                                    cleanedUrl, 
                                    null, 
                                    messageId, 
                                    thumbnailLink, 
                                    userInlineKeyboard
                                ); 
                                
                            } else {
                                // ** DEBUG LOG: Link සොයා ගැනීමට අපොහොසත් වීම **
                                console.error(`[DEBUG] Video Link not found for: ${text}`);
                                handlers.progressActive = false;
                                const errorText = escapeMarkdownV2('⚠️ සමාවෙන්න, වීඩියෝ Download Link එක සොයා ගැනීමට නොහැකි විය\\. වීඩියෝව Private \\(පුද්ගලික\\) විය හැක\\.');
                                if (progressMessageId) {
                                    await handlers.editMessage(chatId, progressMessageId, errorText); 
                                } else {
                                    await handlers.sendMessage(chatId, errorText, messageId);
                                }
                            }
                            
                        } catch (fdownError) {
                             // ** DEBUG LOG: Scraping Fetch Error **
                             console.error(`[DEBUG] FDown Scraping Error (Chat ID: ${chatId}):`, fdownError);
                             handlers.progressActive = false;
                             const errorText = escapeMarkdownV2('❌ වීඩියෝ තොරතුරු ලබා ගැනීමේදී දෝෂයක් ඇති විය\\.');
                             if (progressMessageId) {
                                 await handlers.editMessage(chatId, progressMessageId, errorText);
                             } else {
                                 await handlers.sendMessage(chatId, errorText, messageId);
                             }
                        }
                        
                    } else {
                        await handlers.sendMessage(chatId, escapeMarkdownV2('❌ කරුණාකර වලංගු Facebook වීඩියෝ Link එකක් එවන්න\\.'), messageId);
                    }
                } 
            }
            
            // --- 2. Callback Query Handling ---
            if (callbackQuery) {
                 // ... (Callback Logic remains the same) ...
            }


            return new Response('OK', { status: 200 });

        } catch (e) {
            console.error("--- FATAL FETCH ERROR (Worker Logic Error) ---");
            console.error("The worker failed to process the update:", e);
            console.error("-------------------------------------------------");
            return new Response('OK', { status: 200 }); 
        }
    }
};

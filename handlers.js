import { htmlBold } from './helpers';
import { 
    telegramApi, 
    OWNER_ID, 
    MAX_FILE_SIZE_BYTES, 
    PROGRESS_STATES 
} from './config';

// නව helper ශ්‍රිතය: Base64 Encoding
function encodeBase64(text) {
    if (!text) return '';
    if (typeof text === 'number') text = text.toString();
    // Cloudflare Workers පරිසරයේ btoa() භාවිතා කරයි
    return btoa(unescape(encodeURIComponent(text))); 
}

class WorkerHandlers {
    
    constructor(env) {
        this.env = env;
        this.progressActive = true; 
    }
    
    async saveUserId(userId) {
        if (!this.env.USER_DATABASE) return; 
        const key = `user:${userId}`;
        const isNew = await this.env.USER_DATABASE.get(key) === null; 
        if (isNew) {
            try {
                await this.env.USER_DATABASE.put(key, "1"); 
            } catch (e) {}
        }
    }
    
    async getAllUsersCount() {
        if (!this.env.USER_DATABASE) return 0;
        try {
            const list = await this.env.USER_DATABASE.list({ prefix: 'user:' });
            return list.keys.length;
        } catch (e) {
            return 0;
        }
    }
    
    // නව විශේෂාංගය: Chat Action යැවීම (typing, upload_video)
    async sendAction(chatId, action) {
        try {
            await fetch(`${telegramApi}/sendChatAction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    action: action,
                }),
            });
        } catch (e) {}
    }

    async sendMessage(chatId, text, replyToMessageId, inlineKeyboard = null) {
        try {
            const response = await fetch(`${telegramApi}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: text, 
                    parse_mode: 'HTML',
                    ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
                    ...(inlineKeyboard && { reply_markup: { inline_keyboard: inlineKeyboard } }),
                }),
            });
            const result = await response.json();
            if (!response.ok) {
                return null;
            }
            return result.result.message_id;
        } catch (e) { 
            return null;
        }
    }
    
    async deleteMessage(chatId, messageId) {
        try {
            const response = await fetch(`${telegramApi}/deleteMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    message_id: messageId,
                }),
            });
             if (!response.ok) {}
        } catch (e) {}
    }
    
    async editMessage(chatId, messageId, text, inlineKeyboard = null) {
        try {
            const body = {
                chat_id: chatId,
                message_id: messageId,
                text: text,
                parse_mode: 'HTML', 
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
                } else {}
            }
        } catch (e) {}
    }
    
    async answerCallbackQuery(callbackQueryId, text) {
        try {
            await fetch(`${telegramApi}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callback_query_id: callbackQueryId,
                    text: text,
                    show_alert: true, 
                }),
            });
        } catch (e) {}
    }

    async sendLinkMessage(chatId, videoUrl, caption, replyToMessageId, apiData) {
        
        // **වැදගත්:** මෙහි 'WORKER_DOMAIN' env variable එක හෝ default URL එක භාවිතා කරන්න.
        const workerDomain = this.env.WORKER_DOMAIN || 'https://facebookdownbot.your-worker-domain.workers.dev'; 
        
        const downloadPageUrl = new URL(workerDomain);
        downloadPageUrl.pathname = '/download'; // index.js මඟින් GitHub Pages වෙත යොමු කරයි.
        
        // Base64 Encoding
        downloadPageUrl.searchParams.set('url', encodeBase64(videoUrl));
        downloadPageUrl.searchParams.set('title', encodeBase64(apiData.videoTitle));
        downloadPageUrl.searchParams.set('uploader', encodeBase64(apiData.uploader));
        downloadPageUrl.searchParams.set('duration', encodeBase64(apiData.duration));
        downloadPageUrl.searchParams.set('views', encodeBase64(apiData.views));
        downloadPageUrl.searchParams.set('uploadDate', encodeBase64(apiData.uploadDate));
        // Thumbnail අවශ්‍ය නොවන බැවින්, 'thumbnail' parameter එක සම්පූර්ණයෙන්ම ඉවත් කර ඇත.

        const inlineKeyboard = [
            [{ text: '🌐 Open Download Page', url: downloadPageUrl.toString() }], 
            [{ text: 'C D H Corporation © ✅', callback_data: 'ignore_c_d_h' }] 
        ];

        const titleMatch = caption.match(/Title: (.*?)(\n|$)/i);
        const videoTitle = titleMatch ? titleMatch[1].replace(/<\/?b>/g, '').trim() : 'Video File';
        
        const largeFileMessage = htmlBold("⚠️ Large file detected (50MB+).") + `\n\n`
                               + `The video is too large for direct Telegram upload. Please click the button below to download the file directly from the secure download page.\n\n`
                               + htmlBold("Title:") + ` ${videoTitle}`; 

        await this.sendMessage(
            chatId, 
            largeFileMessage, 
            replyToMessageId, 
            inlineKeyboard
        );
    }


    async sendVideo(chatId, videoUrl, caption = null, replyToMessageId, thumbnailLink = null, inlineKeyboard = null) {
        
        try {
            const videoResponse = await fetch(videoUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': 'https://fdown.net/',
                },
            });
            
            if (videoResponse.status !== 200) {
                if (videoResponse.body) { await videoResponse.body.cancel(); }
                throw new Error(`Video Fetch Failed (HTTP ${videoResponse.status})`); 
            }
            
            const videoBlob = await videoResponse.blob(); 
            
            const formData = new FormData();
            formData.append('chat_id', chatId);
            
            if (caption) {
                formData.append('caption', caption);
                formData.append('parse_mode', 'HTML'); 
            }
            
            if (replyToMessageId) {
                formData.append('reply_to_message_id', replyToMessageId);
            }
            
            formData.append('video', videoBlob, 'video.mp4'); 

            if (thumbnailLink) {
                try {
                    const thumbResponse = await fetch(thumbnailLink);
                    if (thumbResponse.ok) {
                        const thumbBlob = await thumbResponse.blob();
                        formData.append('thumb', thumbBlob, 'thumbnail.jpg');
                    } else {
                        if (thumbResponse.body) { await thumbResponse.body.cancel(); }
                    } 
                } catch (e) {}
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
                throw new Error(`Telegram API Error: ${telegramResult.description || 'Unknown Telegram Error.'}`);
            } else {}
            
        } catch (e) {
            throw e; 
        }
    }


    async simulateProgress(chatId, messageId, originalReplyId) {
        this.progressActive = true;
        const originalText = htmlBold('⌛️ Detecting video... Please wait a moment.'); 
        
        const statesToUpdate = PROGRESS_STATES.slice(1, 10); 

        for (let i = 0; i < statesToUpdate.length; i++) {
            if (!this.progressActive) break; 
            
            await new Promise(resolve => setTimeout(resolve, 800)); 
            
            if (!this.progressActive) break; 

            const state = statesToUpdate[i];
            
            const newKeyboard = [
                [{ text: state.text.replace(/<[^>]*>/g, ''), callback_data: 'ignore_progress' }]
            ];
            const newText = originalText + "\n" + htmlBold(`\nStatus:`) + ` ${state.text}`; 
            
            this.editMessage(chatId, messageId, newText, newKeyboard);
        }
    }
    
    async broadcastMessage(fromChatId, originalMessageId) {
        if (!this.env.USER_DATABASE) return { successfulSends: 0, failedSends: 0 };
        
        const BATCH_SIZE = 50; 
        let successfulSends = 0;
        let failedSends = 0;

        try {
            const list = await this.env.USER_DATABASE.list({ prefix: 'user:' });
            const userKeys = list.keys.map(key => key.name.split(':')[1]);
            
            const totalUsers = userKeys.length;
            
            const copyMessageUrl = `${telegramApi}/copyMessage`; 
            
            for (let i = 0; i < totalUsers; i += BATCH_SIZE) {
                const batch = userKeys.slice(i, i + BATCH_SIZE);
                
                const sendPromises = batch.map(async (userId) => {
                    if (userId.toString() === OWNER_ID.toString()) return; 

                    try {
                        const copyBody = {
                            chat_id: userId,
                            from_chat_id: fromChatId,
                            message_id: originalMessageId,
                        };
                        
                        const response = await fetch(copyMessageUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(copyBody),
                        });

                        if (response.ok) {
                            successfulSends++;
                        } else {
                            failedSends++;
                            const result = await response.json();
                            if (result.error_code === 403) {
                                this.env.USER_DATABASE.delete(`user:${userId}`);
                            }
                        }
                    } catch (e) {
                        failedSends++;
                    }
                });

                await Promise.allSettled(sendPromises);
                
                await new Promise(resolve => setTimeout(resolve, 1000));
            }


        } catch (e) {}

        return { successfulSends, failedSends };
    }
}

export {
    WorkerHandlers
};

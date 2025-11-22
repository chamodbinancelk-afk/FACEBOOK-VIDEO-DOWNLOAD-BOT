// handlers.js

import { htmlBold } from './helpers';
import { 
    telegramApi, 
    OWNER_ID, 
    MAX_FILE_SIZE_BYTES, 
    PROGRESS_STATES 
} from './config';

class WorkerHandlers {
    
    constructor(env) {
        this.env = env;
        this.progressActive = true; 
    }
    
    // ... අනෙකුත් functions (saveUserId, getAllUsersCount, sendAction, sendMessage, deleteMessage, editMessage, answerCallbackQuery) එලෙසම තබන්න ...

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
    
    // ... deleteMessage, editMessage, answerCallbackQuery functions එලෙසම තබන්න ...
    
    // ⚠️ යාවත්කාලීන කළ sendLinkMessage ශ්‍රිතය
    async sendLinkMessage(chatId, videoUrl, caption, replyToMessageId) {
        const MAX_FILE_SIZE_BYTES_LIMIT = parseInt(MAX_FILE_SIZE_BYTES) || 52428800; // config.js වෙතින්
        const MAX_FILE_SIZE_MB = MAX_FILE_SIZE_BYTES_LIMIT / (1024 * 1024);
        
        // 1. Metadata Extraction
        const titleMatch = caption.match(/Title:\s*<b>(.*?)<\/b>/i);
        const videoTitle = titleMatch ? titleMatch[1].trim() : 'Video File';
        
        // Thumbnail URL Extraction (helpers.js හි නව format එක අනුව)
        const thumbnailMatch = caption.match(/Thumbnail_Link:\s*(https?:\/\/\S+)/i);
        const thumbnailUrl = thumbnailMatch ? thumbnailMatch[1].trim() : ''; 
        
        // අනෙකුත් Metadata Extraction: Emojis සහ Bold tags ඉවත් කර, අගය පමණක් ලබා ගනී.
        const cleanCaption = caption.replace(/<[^>]*>/g, '').replace(/👤|⏱️|👁️|📅/g, '').trim(); 
        
        const uploaderMatch = cleanCaption.match(/Uploader:\s*(.*?)\n/i);
        const durationMatch = cleanCaption.match(/Duration:\s*(.*?)\n/i);
        const viewsMatch = cleanCaption.match(/Views:\s*(.*?)\n/i);
        const uploadDateMatch = cleanCaption.match(/Uploaded:\s*(.*?)(\n|◇)/i); 
        
        const uploader = uploaderMatch ? uploaderMatch[1].trim() : 'N/A';
        const duration = durationMatch ? durationMatch[1].trim() : 'N/A';
        const views = viewsMatch ? viewsMatch[1].trim() : 'N/A';
        const uploadDate = uploadDateMatch ? uploadDateMatch[1].trim() : 'N/A';
        
        
        // 2. Base64 Encoding
        const encodedVideoUrl = btoa(videoUrl);
        const encodedTitle = btoa(videoTitle);
        const encodedUploader = btoa(uploader);
        const encodedDuration = btoa(duration);
        const encodedViews = btoa(views.toString().replace(/,/g, '')); 
        const encodedUploadDate = btoa(uploadDate);
        const encodedThumbnailUrl = btoa(thumbnailUrl); // Thumbnail URL Encode කිරීම
        
        // 3. Redirect Link එක සාදා, සියලු දත්ත එක් කිරීම
        const WEB_PAGE_BASE_URL = "https://chamodbinancelk-afk.github.io/FACEBOOK-VIDEO-DOWNLOAD-WEB/"; // ⚠️ මෙය ඔබගේ URL එකට වෙනස් කරන්න
        
        const redirectLink = `${WEB_PAGE_BASE_URL}?url=${encodedVideoUrl}&title=${encodedTitle}&uploader=${encodedUploader}&duration=${encodedDuration}&views=${encodedViews}&uploadDate=${encodedUploadDate}&thumbnail=${encodedThumbnailUrl}`;

        
        const inlineKeyboard = [
            [{ text: '🌐 Download Link ලබා ගන්න', url: redirectLink }], 
            [{ text: 'C D H Corporation © ✅', callback_data: 'ignore_c_d_h' }] 
        ];

        const largeFileMessage = htmlBold("⚠️ File Size Limit Reached!") + `\n\n`
                           + `The video file exceeds the Telegram upload limit (${MAX_FILE_SIZE_MB.toFixed(0)}MB).\n`
                           + `Please click the button below to get the direct download link from our website.\n\n`
                           + htmlBold("Title:") + ` ${videoTitle}`; 

        await this.sendMessage(
            chatId, 
            largeFileMessage, 
            replyToMessageId, 
            inlineKeyboard
        );
    }
    
    // ... sendVideo, simulateProgress, broadcastMessage functions එලෙසම තබන්න ...

    async sendVideo(chatId, videoUrl, caption = null, replyToMessageId, thumbnailLink = null, inlineKeyboard = null) {
        
        try {
            // ... (sendVideo function එකේ පෙර කේතය)
            
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

            const state = PROGRESS_STATES[i];
            
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

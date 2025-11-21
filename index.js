import { MAX_FILE_SIZE_BYTES, PROGRESS_STATES, USER_LIST_KEY } from './config';

function htmlBold(text) {
    return `<b>${text}</b>`;
}

function formatDuration(seconds) {
    if (typeof seconds !== 'number' || seconds < 0) return 'N/A';
    const totalSeconds = Math.round(seconds); 
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const parts = [];
    if (h > 0) parts.push(h);
    parts.push(m.toString().padStart(h > 0 ? 2 : 1, '0'));
    parts.push(s.toString().padStart(2, '0'));
    return parts.join(':');
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatCaption(data) {
    let caption = htmlBold(data.title || 'Facebook Video') + '\n\n';
    caption += htmlBold('Uploader:') + ` ${data.author || 'N/A'}\n`;
    caption += htmlBold('Duration:') + ` ${formatDuration(data.duration) || 'N/A'}\n`;
    caption += htmlBold('Views:') + ` ${data.viewCount ? data.viewCount.toLocaleString() : 'N/A'}\n`;
    caption += htmlBold('File Size:') + ` ${formatBytes(data.filesize) || 'N/A'}\n`;
    caption += htmlBold('Upload Date:') + ` ${data.uploadDate || 'N/A'}\n`;
    caption += '\n' + htmlBold('C D H Corporation ©') + ' | ' + htmlBold('Dev:') + ' @chamoddeshan';
    return caption;
}

async function getApiMetadata(videoUrl, apiUrl) {
    const url = `${apiUrl}?url=${encodeURIComponent(videoUrl)}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`External API failed with status: ${response.status}`);
    }
    const data = await response.json();
    if (data.status !== 'ok' || !data.data) {
        throw new Error(`API returned error: ${data.message || 'Unknown API Error'}`);
    }
    return data.data; 
}

class WorkerHandlers {
    
    constructor(env) {
        this.botToken = env.BOT_TOKEN;
        this.ownerId = env.OWNER_ID;
        this.apiUrl = env.API_URL;
        this.kv = env.USER_DATABASE; 
        this.telegramApiUrl = `https://api.telegram.org/bot${this.botToken}`;
        this.progressActive = false;
        this.PROGRESS_INTERVAL_MS = 3000;
        this.MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_BYTES;
        this.USER_LIST_KEY = USER_LIST_KEY; 
    }

    async apiCall(method, body) {
        const url = `${this.telegramApiUrl}/${method}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Telegram API Error (${method}):`, errorText);
            throw new Error(`Telegram API Error: ${response.statusText}`);
        }
        return await response.json();
    }
    
    async sendMessage(chatId, text, replyToMessageId = null, replyMarkup = null) {
        const body = {
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML',
            reply_to_message_id: replyToMessageId,
        };
        if (replyMarkup) {
            body.reply_markup = { inline_keyboard: replyMarkup };
        }
        const result = await this.apiCall('sendMessage', body);
        return result.ok ? result.result.message_id : null;
    }

    async editMessage(chatId, messageId, text, replyMarkup = null) {
        const body = {
            chat_id: chatId,
            message_id: messageId,
            text: text,
            parse_mode: 'HTML',
        };
        if (replyMarkup) {
            body.reply_markup = { inline_keyboard: replyMarkup };
        }
        await this.apiCall('editMessageText', body);
    }
    
    async deleteMessage(chatId, messageId) {
        try {
            await this.apiCall('deleteMessage', { chat_id: chatId, message_id: messageId });
        } catch (e) {
            console.warn(`Failed to delete message ${messageId}: ${e.message}`);
        }
    }

    async sendAction(chatId, action) {
        await this.apiCall('sendChatAction', { chat_id: chatId, action: action });
    }
    
    async answerCallbackQuery(callbackQueryId, text = null) {
        const body = { callback_query_id: callbackQueryId };
        if (text) {
            body.text = text;
        }
        await this.apiCall('answerCallbackQuery', body);
    }
    
    async sendVideo(chatId, videoUrl, caption, replyToMessageId, thumbnailLink, replyMarkup) {
        const body = {
            chat_id: chatId,
            video: videoUrl,
            caption: caption,
            parse_mode: 'HTML',
            supports_streaming: true,
            reply_to_message_id: replyToMessageId,
            reply_markup: { inline_keyboard: replyMarkup }
        };
        
        if (thumbnailLink) {
             body.thumb = thumbnailLink;
        }

        await this.apiCall('sendVideo', body);
    }

    async sendLinkMessage(chatId, videoUrl, caption, replyToMessageId) {
        const linkButton = [[{ 
            text: '⬇️ Click to Download Direct Link (Large File)', 
            url: videoUrl 
        }]];
        
        const largeFileCaption = htmlBold('⚠️ File Too Large (>50MB) ⚠️') + '\n\n' + caption;
        await this.sendMessage(chatId, largeFileCaption, replyToMessageId, linkButton);
    }

    async saveUserId(userId) {
        if (!this.kv) return; 
        const key = this.USER_LIST_KEY;
        
        try {
            const userIdsString = await this.kv.get(key) || '[]';
            let userIds = JSON.parse(userIdsString);
            const userIdStr = userId.toString();
            if (!userIds.includes(userIdStr)) {
                userIds.push(userIdStr);
                await this.kv.put(key, JSON.stringify(userIds));
            }
        } catch (e) {
            console.error("KV Error saving user ID:", e.message);
        }
    }

    async getAllUsers() {
        if (!this.kv) return [];
        try {
            const userIdsString = await this.kv.get(this.USER_LIST_KEY) || '[]';
            return JSON.parse(userIdsString);
        } catch (e) {
            console.error("KV Error retrieving user IDs:", e.message);
            return [];
        }
    }

    async getAllUsersCount() {
        const users = await this.getAllUsers();
        return users.length;
    }
    
    async broadcastMessage(senderChatId, messageId) {
        const userIds = await this.getAllUsers();
        let successfulSends = 0;
        let failedSends = 0;

        const sendPromises = userIds.map(async (userId) => {
            if (userId.toString() === senderChatId.toString()) return; 

            try {
                const body = {
                    chat_id: userId,
                    from_chat_id: senderChatId,
                    message_id: messageId
                };
                await this.apiCall('copyMessage', body);
                successfulSends++;
            } catch (e) {
                failedSends++;
            }
        });

        await Promise.all(sendPromises);
        return { successfulSends, failedSends };
    }

    async simulateProgress(chatId, messageId, replyToMessageId) {
        this.progressActive = true;
        let step = 0;

        const updateProgress = async () => {
            if (!this.progressActive) return;

            const currentState = PROGRESS_STATES[step % PROGRESS_STATES.length];
            const nextStep = (step + 1) % PROGRESS_STATES.length;

            const text = htmlBold(`${currentState.emoji} ${currentState.text}`);
            
            try {
                await this.editMessage(chatId, messageId, text);
            } catch (e) {
                 this.progressActive = false;
                 return;
            }
            
            step = nextStep;
            
            if (this.progressActive) {
                setTimeout(updateProgress, this.PROGRESS_INTERVAL_MS);
            }
        };

        updateProgress();
    }
}

export default {
    
    async fetch(request, env, ctx) {
        
        if (request.method !== 'POST') {
            return new Response('Hello, I am your FDOWN Telegram Worker Bot.', { status: 200 });
        }
        if (!env.BOT_TOKEN || !env.OWNER_ID || !env.API_URL || !env.USER_DATABASE) {
             return new Response('Configuration Error: Missing Secrets/Bindings.', { status: 500 });
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
            
            ctx.waitUntil(Promise.resolve()); 

            if (message) { 
                const chatId = message.chat.id;
                const messageId = message.message_id;
                const text = message.text ? message.text.trim() : null; 
                const isOwner = handlers.ownerId && chatId.toString() === handlers.ownerId.toString();
                const userName = message.from.first_name || "User"; 

                ctx.waitUntil(handlers.saveUserId(chatId));

                if (isOwner && message.reply_to_message) {
                    const repliedMessage = message.reply_to_message;
                    
                    if (repliedMessage.text && repliedMessage.text.includes("කරුණාකර දැන් ඔබ යැවීමට අවශ්‍ය")) {
                        
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
                            
                            await handlers.sendMessage(chatId, resultMessage, messageToBroadcastId); 

                        } catch (e) {
                            await handlers.sendMessage(chatId, htmlBold("❌ Quick Broadcast failed.") + `\n\nError: ${e.message}`, messageId);
                        }
                    })());

                    return new Response('OK', { status: 200 });
                }
                
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
                            const apiData = await getApiMetadata(text, handlers.apiUrl); 
                            const videoUrl = apiData.hd_url || apiData.sd_url || apiData.video_url || apiData.downloadLink; 
                            const fileSize = apiData.filesize || 0; 
                            
                            if (!videoUrl) {
                                throw new Error("Video download link not found in API response.");
                            }
                            
                            const finalCaption = formatCaption({
                                title: apiData.title,
                                author: apiData.author,
                                duration: apiData.duration,
                                viewCount: apiData.viewCount,
                                filesize: fileSize,
                                uploadDate: apiData.uploadDate
                            });
                            
                            const finalThumbnailLink = apiData.thumbnailLink || apiData.thumbnail;

                            handlers.progressActive = false;
                            
                            if (fileSize > handlers.MAX_FILE_SIZE_BYTES) { 
                                if (progressMessageId) {
                                    await handlers.deleteMessage(chatId, progressMessageId);
                                }
                                
                                await handlers.sendLinkMessage(chatId, videoUrl, finalCaption, messageId);
                                
                            } else {
                                if (progressMessageId) {
                                    await handlers.deleteMessage(chatId, progressMessageId);
                                }
                                
                                ctx.waitUntil(handlers.sendAction(chatId, 'upload_video'));
                                
                                try {
                                    await handlers.sendVideo(chatId, videoUrl, finalCaption, messageId, finalThumbnailLink, userInlineKeyboard); 
                                } catch (e) {
                                    await handlers.sendLinkMessage(chatId, videoUrl, finalCaption, messageId);
                                }
                            }
                            
                        } catch (fdownError) {
                            handlers.progressActive = false;
                            const errorText = htmlBold('❌ An error occurred while retrieving video information.') + `\n\n${fdownError.message}`;
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

                 if (data === 'ignore_progress' || data === 'ignore_c_d_h') {
                     const allButtons = callbackQuery.message.reply_markup.inline_keyboard.flat();
                     const button = allButtons.find(b => b.callback_data === data);
                     const buttonText = button ? button.text.replace(/<[^>]*>/g, '') : "Action Complete";
                     
                     await handlers.answerCallbackQuery(callbackQuery.id, buttonText);
                     return new Response('OK', { status: 200 });
                 }
                 
                 if (handlers.ownerId && chatId.toString() !== handlers.ownerId.toString()) {
                      await handlers.answerCallbackQuery(callbackQuery.id, "❌ You cannot use this command.");
                      return new Response('OK', { status: 200 });
                 }

                 switch (data) {
                     case 'admin_users_count':
                          const usersCount = await handlers.getAllUsersCount();
                          const countMessage = htmlBold(`📊 Current Users in the Bot: ${usersCount}`);
                          await handlers.editMessage(chatId, messageId, countMessage);
                          await handlers.answerCallbackQuery(callbackQuery.id, `Users ${usersCount} ක් සිටී.`);
                          break;
                     
                     case 'admin_broadcast':
                          const broadcastPrompt = htmlBold(`📣 Broadcast Message`) + "\n\n" + htmlBold(`කරුණාකර දැන් ඔබ යැවීමට අවශ්‍ය <b>Text, Photo, හෝ Video</b> එක <b>Reply</b> කරන්න.`);
                          await handlers.sendMessage(chatId, broadcastPrompt, messageId); 
                          await handlers.answerCallbackQuery(callbackQuery.id, "Broadcast කිරීම සඳහා පණිවිඩය සූදානම්.");
                          break;
                 }

                 return new Response('OK', { status: 200 });
            }


            return new Response('OK', { status: 200 });

        } catch (e) {
            console.error("--- FATAL FETCH ERROR (Worker Logic Error) ---");
            console.error("The worker failed to process the update: " + e.message);
            console.error("-------------------------------------------------");
            return new Response('OK', { status: 200 }); 
        }
    }
};

const BOT_TOKEN = '8382727460:AAEgKVISJN5TTuV4O-82sMGQDG3khwjiKR8'; 
const OWNER_ID = '1901997764'; 
const API_URL = "https://fdown.isuru.eu.org/info"; 
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; 

const telegramApi = `https://api.telegram.org/bot${BOT_TOKEN}`;

function htmlBold(text) {
    return `<b>${text}</b>`;
}

function formatDuration(seconds) {
    if (typeof seconds !== 'number' || seconds < 0) return 'N/A';
    
    const totalSeconds = Math.round(seconds); 

    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    } else {
        return `${m}:${String(s).padStart(2, '0')}`;
    }
}

function formatCaption(data) {
    const { videoTitle, uploader, duration, views, uploadDate } = data;
    
    const formattedDuration = formatDuration(duration);
    const formattedViews = typeof views === 'number' ? views.toLocaleString('en-US') : views;
    
    let formattedDate = uploadDate;
    if (uploadDate && /^\d{8}$/.test(uploadDate)) {
        formattedDate = uploadDate.substring(0, 4) + '-' + uploadDate.substring(4, 6) + '-' + uploadDate.substring(6, 8);
    }
    
    // Bolding the 'Title:' label
    let caption = `${htmlBold('Title:')} ${videoTitle}`;
    
    caption += `\n\n`;
    // Bolding the metadata labels (Uploader, Duration, Views, Uploaded)
    caption += `👤 ${htmlBold('Uploader:')} ${uploader}\n`;
    caption += `⏱️ ${htmlBold('Duration:')} ${formattedDuration}\n`;
    caption += `👁️ ${htmlBold('Views:')} ${formattedViews}\n`;
    caption += `📅 ${htmlBold('Uploaded:')} ${formattedDate}`; 
    
    caption += `\n\n◇───────────────◇\n`
    caption += `🚀 Developer: @chamoddeshan\n`
    caption += `🔥 C D H Corporation ©`;

    return caption;
}

const PROGRESS_STATES = [
    { text: "⏳ <b>Loading</b>...▒▒▒▒▒▒▒▒▒▒", percentage: "0%" },
    { text: "📥 <b>Downloading</b>...█▒▒▒▒▒▒▒▒▒", percentage: "10%" },
    { text: "📥 <b>Downloading</b>...██▒▒▒▒▒▒▒▒", percentage: "20%" },
    { text: "📥 <b>Downloading</b>...███▒▒▒▒▒▒▒", percentage: "30%" },
    { text: "📤 <b>Uploading</b>...████▒▒▒▒▒▒", percentage: "40%" },
    { text: "📤 <b>Uploading</b>...█████▒▒▒▒▒", percentage: "50%" },
    { text: "📤 <b>Uploading</b>...██████▒▒▒▒", percentage: "60%" },
    { text: "📤 <b>Uploading</b>...███████▒▒▒", percentage: "70%" },
    { text: "✨ <b>Finalizing</b>...████████▒▒", percentage: "80%" },
    { text: "✨ <b>Finalizing</b>...█████████▒", percentage: "90%" },
    { text: "✅ <b>Done!</b> ██████████", percentage: "100%" } 
];


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
    
    // MODIFIED: answerCallbackQuery to show the button's text as the alert
    async answerCallbackQuery(callbackQueryId, text) {
        try {
            await fetch(`${telegramApi}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callback_query_id: callbackQueryId,
                    text: text, // Use the button's text here
                    show_alert: true, // Show it on top of the screen
                }),
            });
        } catch (e) {}
    }

    async sendLinkMessage(chatId, videoUrl, caption, replyToMessageId) {
        const inlineKeyboard = [
            [{ text: '⬇️ Download Video', url: videoUrl }], 
            [{ text: 'C D H Corporation © ✅', callback_data: 'ignore_c_d_h' }] 
        ];

        // Safely extract the title from the caption 
        const titleMatch = caption.match(/Title: (.*?)(\n|$)/i);
        // Only keep the text part of the title, removing bold tags for the large file message
        const videoTitle = titleMatch ? titleMatch[1].replace(/<\/?b>/g, '').trim() : 'Video File';
        
        const largeFileMessage = htmlBold("⚠️ Large file detected.") + `\n\n`
                               + `The video file size (${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit) is too large for direct Telegram upload. Please use the button below to download the file directly.\n\n`
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


async function getApiMetadata(link) {
    try {
        const apiResponse = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'CloudflareWorker/1.0'
            },
            body: JSON.stringify({ url: link })
        });
        
        if (!apiResponse.ok) {
            throw new Error(`API request failed with status ${apiResponse.status}`);
        }
        
        const videoData = await apiResponse.json();
        
        const info = videoData.video_info || videoData.data || videoData;
        
        let rawThumbnailLink = null;
        let videoTitle = 'Facebook Video';
        let uploader = 'Unknown Uploader';
        let duration = 0;
        let views = 0;
        let uploadDate = 'N/A';
        let filesize = 0; 
        
        if (info) {
            if (info.thumbnail) {
                rawThumbnailLink = info.thumbnail.replace(/&amp;/g, '&');
            }
            if (info.title) {
                videoTitle = info.title;
            }
            uploader = info.uploader || info.page_name || 'Unknown Uploader';
            duration = info.duration || 0;
            views = info.view_count || info.views || 0;
            uploadDate = info.upload_date || 'N/A';
            filesize = info.filesize || 0; 
        }

        return {
            thumbnailLink: rawThumbnailLink,
            videoTitle: videoTitle,
            uploader: uploader,
            duration: duration,
            views: views,
            uploadDate: uploadDate,
            filesize: filesize 
        };

    } catch (e) {
        return { 
            thumbnailLink: null, 
            videoTitle: "Facebook Video", 
            uploader: 'Unknown Uploader',
            duration: 0,
            views: 0,
            uploadDate: 'N/A',
            filesize: 0 
        };
    }
}

async function scrapeVideoLinkAndThumbnail(link) {
    const fdownUrl = "https://fdown.net/download.php";
    
    const formData = new URLSearchParams();
    formData.append('URLz', link); 

    const fdownResponse = await fetch(fdownUrl, {
        method: 'POST',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': 'https://fdown.net/',
        },
        body: formData.toString(),
        redirect: 'follow'
    });

    if (!fdownResponse.ok) {
        throw new Error(`Scraper request failed with status ${fdownResponse.status}`);
    }

    const resultHtml = await fdownResponse.text();
    let videoUrl = null;
    let fallbackThumbnail = null;

    const hdLinkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*>.*Download Video in HD Quality.*<\/a>/i;
    let match = resultHtml.match(hdLinkRegex);

    if (match && match[1]) {
        videoUrl = match[1];
    } else {
        const normalLinkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*>.*Download Video in Normal Quality.*<\/a>/i;
        match = resultHtml.match(normalLinkRegex);

        if (match && match[1]) {
            videoUrl = match[1];
        }
    }
    
    const thumbnailRegex = /<img[^>]+class=["']?fb_img["']?[^>]*src=["']?([^"'\s]+)["']?/i;
    let thumbnailMatch = resultHtml.match(thumbnailRegex);
    if (thumbnailMatch && thumbnailMatch[1]) {
         fallbackThumbnail = thumbnailMatch[1];
    }

    return {
        videoUrl: videoUrl ? videoUrl.replace(/&amp;/g, '&') : null,
        fallbackThumbnail: fallbackThumbnail ? fallbackThumbnail.replace(/&amp;/g, '&') : null
    };
}


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
            
            ctx.waitUntil(new Promise(resolve => setTimeout(resolve, 0)));

            if (message) { 
                const chatId = message.chat.id;
                const messageId = message.message_id;
                const text = message.text ? message.text.trim() : null; 
                const isOwner = OWNER_ID && chatId.toString() === OWNER_ID.toString();
                
                const userName = message.from.first_name || "User"; 

                ctx.waitUntil(handlers.saveUserId(chatId));

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
                        
                        // Send 'typing' action immediately when a link is sent
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
                                    
                                    // Send 'upload_video' action before attempting sendVideo
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
                 // Get the text of the pressed button
                 const buttonText = button ? button.text : "Action Complete";

                 // If the button is not an admin action or not the progress button,
                 // answer the callback query showing the button text.
                 if (data === 'ignore_progress' || data === 'ignore_c_d_h') {
                     // The answerCallbackQuery now shows the button text as a pop-up
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
            return new Response('OK', { status: 200 }); 
        }
    }
};

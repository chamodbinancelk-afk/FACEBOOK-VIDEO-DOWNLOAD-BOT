/**
 * src/index.js
 * Final Fix V17: Fixed "escapeMarkdownV2 is not defined" error by moving Helper Functions inside fetch().
 */

export default {
    async fetch(request, env, ctx) {
        if (request.method !== 'POST') {
            return new Response('Hello, I am your FDOWN Telegram Worker Bot.', { status: 200 });
        }

        // ** 🛠️ FIX 1: Helper Functions fetch ශ්‍රිතය තුළට ගෙන ඒම **
        // 1. MarkdownV2 හි සියලුම විශේෂ අක්ෂර Escape කිරීමේ Helper Function
        function escapeMarkdownV2(text) {
            if (!text) return "";
            return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\\\])/g, '\\$1');
        }

        // 2. Scraped Text Cleaner Function 
        function sanitizeText(text) {
            if (!text) return "";
            let cleaned = text.replace(/<[^>]*>/g, '').trim(); 
            cleaned = cleaned.replace(/\s\s+/g, ' '); 
            cleaned = cleaned.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); 
            cleaned = cleaned.replace(/([_*\[\]()~`>#+\-=|{}.!\\\\])/g, '\\$1'); 
            return cleaned;
        }
        // -----------------------------------------------------------------

        const BOT_TOKEN = env.BOT_TOKEN;
        const telegramApi = `https://api.telegram.org/bot${BOT_TOKEN}`;
        
        const DOWNLOADER_URL = "https://fbdown.blog/FB-to-mp3-downloader"; 

        try {
            const update = await request.json();
            const message = update.message;

            if (message && message.text) {
                const chatId = message.chat.id;
                const text = message.text.trim();
                const messageId = message.message_id;
                
                if (text === '/start') {
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('👋 සුභ දවසක්! මට Facebook වීඩියෝ Link එකක් එවන්න. එවිට මම එය download කර දෙන්නම්.'), messageId);
                    return new Response('OK', { status: 200 });
                }

                const isLink = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.me)/i.test(text);
                
                if (isLink) {
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('⌛️ වීඩියෝව හඳුනා ගැනේ... කරුණාකර මොහොතක් රැඳී සිටින්න.'), messageId);
                    
                    try {
                        
                        const formData = new URLSearchParams();
                        
                        // V15: parameter නම 'url' ලෙස භාවිතා කරයි
                        formData.append('url', text); 
                        
                        // V16: Hidden 'locale' parameter එක එකතු කිරීම 
                        formData.append('locale', 'en'); 

                        const downloaderResponse = await fetch(DOWNLOADER_URL, {
                            method: 'POST',
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'Referer': 'https://fbdown.blog/', 
                            },
                            body: formData.toString(),
                            redirect: 'follow' 
                        });

                        const resultHtml = await downloaderResponse.text();
                        
                        let videoUrl = null;
                        let thumbnailLink = null;
                        
                        // Scraping Logic (නොවෙනස්ව තබමු)
                        const thumbnailRegex = /<img[^>]+src=["']?([^"'\s]+)["']?[^>]*width=["']?300px["']?/i;
                        let thumbnailMatch = resultHtml.match(thumbnailRegex);
                        if (thumbnailMatch && thumbnailMatch[1]) {
                            thumbnailLink = thumbnailMatch[1];
                        }

                        const linkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*target=["']?_blank["']?[^>]*>Download<\/a>/i;
                        let match = resultHtml.match(linkRegex);

                        if (match && match[1]) {
                            videoUrl = match[1]; 
                        } 
                        
                        if (videoUrl) {
                            let cleanedUrl = videoUrl.replace(/&amp;/g, '&');
                            await this.sendVideo(telegramApi, chatId, cleanedUrl, null, messageId, thumbnailLink); 
                            
                        } else {
                            // ** Debugging Log **
                            console.log(`Video URL not found. HTML snippet (1000 chars): ${resultHtml.substring(0, 1000)}`); 
                            await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('⚠️ සමාවෙන්න, වීඩියෝ Download Link එක සොයා ගැනීමට නොහැකි විය\\. \\(Private හෝ HTML ව්‍යුහය වෙනස් වී තිබිය හැක\\)'), messageId);
                        }
                        
                    } catch (fdownError) {
                        console.error('FDOWN_API_ERROR:', fdownError.message); 
                        await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('❌ වීඩියෝ තොරතුරු ලබා ගැනීමේදී දෝෂයක් ඇති විය\\. \\(Network හෝ URL වැරදි විය හැක\\)'), messageId);
                    }
                    
                } else {
                    await this.sendMessage(telegramApi, chatId, escapeMarkdownV2('❌ කරුණාකර වලංගු Facebook වීඩියෝ Link එකක් එවන්න\\.'), messageId);
                }
            }

            return new Response('OK', { status: 200 });

        } catch (e) {
            console.error('MAIN_WORKER_ERROR:', e.message);
            return new Response('OK', { status: 200 }); 
        }
    },

    // ------------------------------------
    // සහායක Functions (මේවා 'this.sendMessage' ලෙස හැඳින්වෙන නිසා ඒවා එළියේම තැබිය යුතුය)
    // ------------------------------------

    async sendMessage(api, chatId, text, replyToMessageId) {
        // 🛠️ FIX 2: මෙහිදී escapeMarkdownV2 භාවිතා නොකරන බවට තහවුරු කරයි.
        // එය 'text' විචල්‍යය තුළට ගොස් ඇති නිසා ගැටලුවක් නැත.
        try {
            await fetch(`${api}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: text, 
                    parse_mode: 'MarkdownV2', 
                    ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
                }),
            });
        } catch (e) {
            console.error('SEND_MESSAGE_ERROR:', e.message);
        }
    },

    async sendVideo(api, chatId, videoUrl, caption = null, replyToMessageId, thumbnailLink = null) {
        
        try {
            // ... (කේතයේ අනෙක් කොටස්)
            const videoResponse = await fetch(videoUrl);
            
            if (videoResponse.status !== 200) {
                console.error(`VIDEO_FETCH_ERROR: Status ${videoResponse.status} for URL ${videoUrl}`);
                // මෙහිදී ද escapeMarkdownV2 භාවිතා නොකරන බවට තහවුරු කරයි.
                await this.sendMessage(api, chatId, text, replyToMessageId); // text යනු escape කර ඇති පණිවිඩයයි.
                return;
            }
            
            // ... (කේතයේ අනෙක් කොටස්)

        } catch (e) {
            console.error('SEND_VIDEO_NETWORK_ERROR:', e.message);
        }
    }
};

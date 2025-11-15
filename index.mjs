// --- 1. Variables and Constants (ටෝකන සහ URL) ---

// ********* මෙහි ඔබගේ සැබෑ ටෝකන ඇතුළත් කරන්න *********
const BOT_TOKEN = "8382727460:AAEgKVISJN5TTuV4O-82sMGQDG3khwjiKR8"; 
const WEBHOOK_SECRET = "ec6bc090856641e9b2aca785d7a34727"; 
// ********************************************************

const TELEGRAM_API = "https://api.telegram.org/bot";

// ⚠️ වැදගත්: මෙය උපකල්පිත URL එකකි. ඔබ ක්‍රියාකාරී Facebook API URL එකක් මෙයට ආදේශ කළ යුතුය.
// සටහන: ඔබ සොයා ගන්නා API එකේ JSON ප්‍රතිචාර ව්‍යුහය අනුව 'getFbVideoLinks' ශ්‍රිතය වෙනස් කිරීමට සිදු විය හැක.
const FB_API_URL = "https://example-api.com/v1/download/facebook?url="; 

// --- 2. Telegram API Interaction (Telegram API අන්තර්ක්‍රියා) ---

/**
 * Telegram Chat එකකට සරල පණිවිඩයක් යවයි.
 */
async function sendMessage(chat_id, text) {
    const url = `${TELEGRAM_API}${BOT_TOKEN}/sendMessage`;
    const payload = {
        chat_id: chat_id,
        text: text,
        parse_mode: 'Markdown'
    };

    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

/**
 * Telegram Chat එකකට වීඩියෝව යවයි (Download Link හරහා).
 */
async function sendVideoFromUrl(chat_id, video_url, quality) {
    const url = `${TELEGRAM_API}${BOT_TOKEN}/sendVideo`;
    const payload = {
        chat_id: chat_id,
        video: video_url, // වීඩියෝ සබැඳිය
        caption: `✅ Facebook වීඩියෝව බාගත කරන ලදී! (${quality})`
    };

    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

// --- 3. Facebook Video Downloader Logic (වීඩියෝ බාගත කිරීමේ තර්කය) ---

/**
 * Facebook URL එකකින් බාගත කිරීමේ සබැඳි ලබා ගනී.
 */
async function getFbVideoLinks(videoUrl) {
    try {
        // Facebook URL එක API එකට යැවීම
        const apiResponse = await fetch(`${FB_API_URL}${encodeURIComponent(videoUrl)}`);
        
        // API response එක JSON ලෙස කියවීම
        const data = await apiResponse.json(); 

        // !!! මෙහිදී JSON ප්‍රතිචාර ව්‍යුහය ඔබගේ API එක අනුව සකස් කරන්න !!!
        
        // සාමාන්‍යයෙන් API මඟින් සපයනු ඇතැයි අපේක්ෂා කරන දත්ත ව්‍යුහය පරීක්ෂා කිරීම.
        if (data && data.status === 'success' && data.data && data.data.links) {
            
            // HD සහ SD සබැඳි සෙවීම
            const hdLink = data.data.links.find(link => link.quality === 'HD' || link.quality === '720p')?.url;
            const sdLink = data.data.links.find(link => link.quality === 'SD' || link.quality === '360p')?.url;

            return {
                hd: hdLink,
                sd: sdLink
            };
        }
        
        return null; 

    } catch (error) {
        console.error("Facebook API error:", error);
        return null;
    }
}

// --- 4. Main Handler (ප්‍රධාන Webhook හැසිරවීම) ---

async function handleTelegramWebhook(request) {
    // 1. Webhook Secret එක තහවුරු කිරීම (Security)
    const secret = request.headers.get("x-telegram-bot-api-secret-token");
    if (secret !== WEBHOOK_SECRET) {
        return new Response('Unauthorized', { status: 401 }); 
    }
    
    // 2. Body එකෙන් Telegram Update එක ලබා ගැනීම
    const update = await request.json();

    if (!update.message || !update.message.text) {
        return new Response('No message text', { status: 200 });
    }

    const chatId = update.message.chat.id;
    const text = update.message.text.trim();
    
    // 3. විධානය (Command) පරීක්ෂා කිරීම
    if (text.startsWith('/start')) {
        await sendMessage(chatId, "👋 **ආයුබෝවන්!** මම Facebook වීඩියෝ බාගත කරන්නා. මට Facebook වීඩියෝ සබැඳියක් (link) එවන්න.");
        return new Response('Start command handled', { status: 200 });
    }

    // 4. Facebook URL එකක්දැයි පරීක්ෂා කිරීම
    const fbUrlMatch = text.match(/https?:\/\/(?:www\.|m\.)?facebook\.com\/\S+/i);
    if (fbUrlMatch) {
        const fbUrl = fbUrlMatch[0];
        await sendMessage(chatId, "⏳ වීඩියෝ සබැඳිය විශ්ලේෂණය කරමින්... කරුණාකර මොහොතක් රැඳී සිටින්න.");
        
        const videoLinks = await getFbVideoLinks(fbUrl);

        if (videoLinks && videoLinks.hd) {
            // HD සබැඳිය භාවිතයෙන් යැවීම
            await sendVideoFromUrl(chatId, videoLinks.hd, 'HD');
        } else if (videoLinks && videoLinks.sd) {
             // HD නොමැති නම් SD සබැඳිය භාවිතයෙන් යැවීම
            await sendVideoFromUrl(chatId, videoLinks.sd, 'SD');
        } else {
            await sendMessage(chatId, "❌ වීඩියෝ සබැඳිය ලබා ගැනීමට නොහැකි විය. සබැඳිය නිවැරදි දැයි පරීක්ෂා කරන්න, නැතහොත් Bot ගේ API සේවාව අක්‍රිය විය හැක.");
        }
        
    } else {
        await sendMessage(chatId, "💡 කරුණාකර වලංගු Facebook වීඩියෝ සබැඳියක් පමණක් එවන්න.");
    }

    return new Response('Message handled', { status: 200 });
}

// --- 5. Cloudflare Worker Fetch Listener (Workers ප්‍රධාන පිවිසුම) ---

addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);

    // Telegram Webhook ඉල්ලීම් පමණක් හැසිරවීම
    if (request.method === 'POST') {
        event.respondWith(handleTelegramWebhook(request));
    } 
    // Webhook සකස් කිරීමට (Optional)
    else if (url.pathname === '/registerWebhook') {
        event.respondWith(registerWebhook(url.origin));
    }
    else {
        event.respondWith(new Response('Bot is running.', { status: 200 }));
    }
});

/**
 * Webhook එක Telegram හි සකස් කිරීමට උදව් කරයි.
 */
async function registerWebhook(workerUrl) {
    const webhookUrl = `${workerUrl}`; 
    const url = `${TELEGRAM_API}${BOT_TOKEN}/setWebhook?url=${webhookUrl}&secret_token=${WEBHOOK_SECRET}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        return new Response(`Error registering webhook: ${error.message}`, { status: 500 });
    }
}

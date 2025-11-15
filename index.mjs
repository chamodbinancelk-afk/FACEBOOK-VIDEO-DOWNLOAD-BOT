// --- 1. Variables and Constants (ටෝකන සහ URL) ---

// ********* ඔබගේ සැබෑ ටෝකන සහ Secret *********
const BOT_TOKEN = "8382727460:AAEgKVISJN5TTuV4O-82sMGQDG3khwjiKR8"; 
const WEBHOOK_SECRET = "ec6bc090856641e9b2aca785d7a34727"; 
// ***********************************************

const TELEGRAM_API = "https://api.telegram.org/bot";

// ⚠️ RapidAPI Endpoint Configuration
const RAPIDAPI_HOST = 'facebook17.p.rapidapi.com';
const RAPIDAPI_KEY = 'd110357f31msh2e0d5216204b77dp10675bjsn98cfa8c30266'; // ඔබගේ සැබෑ යතුර
const RAPIDAPI_URL = `https://${RAPIDAPI_HOST}/api/facebook/links`;


// --- 2. Telegram API Interaction (Telegram API අන්තර්ක්‍රියා) ---
async function sendMessage(chat_id, text) {
    const url = `${TELEGRAM_API}${BOT_TOKEN}/sendMessage`;
    const payload = { chat_id: chat_id, text: text, parse_mode: 'Markdown' };
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

async function sendVideoFromUrl(chat_id, video_url, caption) {
    const url = `${TELEGRAM_API}${BOT_TOKEN}/sendVideo`;
    const payload = { chat_id: chat_id, video: video_url, caption: caption };
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

// --- 3. Facebook Video Downloader Logic (RapidAPI භාවිතයෙන්) ---

async function getFbVideoLinks(videoUrl) {
    try {
        const response = await fetch(RAPIDAPI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-rapidapi-host': RAPIDAPI_HOST,
                'x-rapidapi-key': RAPIDAPI_KEY 
            },
            body: JSON.stringify({ url: videoUrl }) // වීඩියෝ URL එක 'url' ලෙස යවන්න
        });
        
        if (!response.ok) {
            console.error(`RapidAPI response status: ${response.status}`);
            return { error: `API සේවාවෙන් දෝෂයක් (${response.status})` };
        }
        
        const data = await response.json(); 
        console.log("RapidAPI Full Response Data:", data); 

        // ⚠️ RapidAPI ප්‍රතිචාර ව්‍යුහය පරීක්ෂා කිරීම:
        // සාර්ථක ප්‍රතිචාරයකදී, සබැඳි 'links' අරාව තුළ තිබිය යුතුය.
        if (data && Array.isArray(data.links) && data.links.length > 0) {
            
            // අපි උපකල්පනය කරන්නේ සබැඳි 'quality' සහ 'url' ලෙස තිබෙන බවයි
            // ඔබගේ පෙර කේතයේ මෙන් HD/SD සොයා ගනී
            const hdLink = data.links.find(link => link.quality && (link.quality.includes('720') || link.quality.toUpperCase() === 'HD'))?.url;
            const sdLink = data.links.find(link => link.quality && (link.quality.includes('360') || link.quality.toUpperCase() === 'SD'))?.url;
            
            if (hdLink || sdLink) {
                return { hd: hdLink, sd: sdLink };
            }
            return { error: "බාගත කිරීමේ සබැඳි හමු නොවීය. වීඩියෝව Private විය හැක." };
        } 
        
        return { error: "API ප්‍රතිචාරයේ සබැඳි හමු නොවීය." };

    } catch (error) {
        console.error("RapidAPI fetch error:", error.message);
        return { error: `API ඇමතීමේ දෝෂය: ${error.message}` };
    }
}

// --- 4. Main Handler (ප්‍රධාන Webhook හැසිරවීම) ---

async function handleTelegramWebhook(request) {
    const secret = request.headers.get("x-telegram-bot-api-secret-token");
    if (secret !== WEBHOOK_SECRET) {
        return new Response('Unauthorized', { status: 401 }); 
    }
    
    const update = await request.json();
    if (!update.message || !update.message.text) { return new Response('No message text', { status: 200 }); }

    const chatId = update.message.chat.id;
    const text = update.message.text.trim();
    
    if (text.startsWith('/start') || text.startsWith('/help')) {
        await sendMessage(chatId, "👋 **ආයුබෝවන්!** මම Facebook වීඩියෝ බාගත කරන්නා. මට Facebook වීඩියෝ සබැඳියක් (link) එවන්න.");
        return new Response('Command handled', { status: 200 });
    }

    const fbUrlMatch = text.match(/https?:\/\/(?:www\.|m\.|fb\.)?facebook\.com\/\S+|https?:\/\/fb\.watch\/\S+/i);
    if (fbUrlMatch) {
        const fbUrl = fbUrlMatch[0];
        
        await sendMessage(chatId, "⏳ වීඩියෝ සබැඳිය විශ්ලේෂණය කරමින්... කරුණාකර මොහොතක් රැඳී සිටින්න.");
        
        const result = await getFbVideoLinks(fbUrl);

        if (result.error) {
            await sendMessage(chatId, `❌ දෝෂය: ${result.error}\n\n💡 කරුණාකර පරීක්ෂා කරන්න:\n- වීඩියෝ URL නිවැරදි දැයි\n- වීඩියෝව ප්‍රසිද්ධ (public) දැයි`);
        
        } else if (result.hd) {
            // HD යැවීමට උත්සාහ කිරීම
            try {
                await sendVideoFromUrl(chatId, result.hd, '✅ Facebook වීඩියෝව බාගත කරන ලදී! (HD)');
            } catch (error) {
                console.error("Error sending HD video:", error.message);
                if (result.sd) {
                    // HD අසාර්ථක නම්, SD යවන්න
                    try {
                        await sendVideoFromUrl(chatId, result.sd, '✅ Facebook වීඩියෝව බාගත කරන ලදී! (SD)\n⚠️ HD ප්‍රමාණය ඉතා විශාල නිසා SD යැවීය.');
                    } catch (sdError) {
                        console.error("Error sending SD video:", sdError.message);
                        await sendMessage(chatId, "❌ වීඩියෝව යැවීමට නොහැකි විය. වීඩියෝ ප්‍රමාණය ඉතා විශාල විය හැක.\n\n📎 Download Link:\n" + result.sd);
                    }
                } else {
                    await sendMessage(chatId, "❌ වීඩියෝව යැවීමට නොහැකි විය. වීඩියෝ ප්‍රමාණය ඉතා විශාල විය හැක.");
                }
            }
        } else if (result.sd) {
            // HD නොමැති නම් SD සෘජුවම යවන්න
            try {
                 await sendVideoFromUrl(chatId, result.sd, '✅ Facebook වීඩියෝව බාගත කරන ලදී! (SD)');
            } catch (error) {
                console.error("Error sending SD video:", error.message);
                await sendMessage(chatId, "❌ වීඩියෝව යැවීමට නොහැකි විය. වීඩියෝ ප්‍රමාණය ඉතා විශාල විය හැක.\n\n📎 Download Link:\n" + result.sd);
            }
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

    if (request.method === 'POST') {
        event.respondWith(handleTelegramWebhook(request));
    } 
    else if (url.pathname === '/registerWebhook') {
        event.respondWith(registerWebhook(url.origin));
    }
    else {
        event.respondWith(new Response('Bot is running.', { status: 200 }));
    }
});

async function registerWebhook(workerUrl) {
    const url = `${TELEGRAM_API}${BOT_TOKEN}/setWebhook?url=${workerUrl}&secret_token=${WEBHOOK_SECRET}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        return new Response(`Error registering webhook: ${error.message}`, { status: 500 });
    }
}

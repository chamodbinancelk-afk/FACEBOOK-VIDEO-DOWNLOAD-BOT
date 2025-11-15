// --- 1. Variables and Constants ---

// ********* ඔබගේ සැබෑ ටෝකන සහ Secret *********
const BOT_TOKEN = "8382727460:AAEgKVISJN5TTuV4O-82sMGQDG3khwjiKR8"; 
const WEBHOOK_SECRET = "ec6bc090856641e9b2aca785d7a34727"; 
// ***********************************************

const TELEGRAM_API = "https://api.telegram.org/bot";

// ⚠️ fdown.net Endpoint Configuration
const FDOWN_URL = "https://fdown.net/";

// --- 2. Telegram API Interaction (පෙර පරිදිම) ---

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

// --- 3. ⚠️ fdown.net Scraping Logic ---

async function getFbVideoLinks(videoUrl) {
    try {
        // fdown.net වෙත POST request එකක් යවන්න (Form Submission අනුකරණය)
        const formData = new FormData();
        formData.append('URL', videoUrl);
        
        console.log(`Attempting to scrape fdown.net for URL: ${videoUrl}`);

        const response = await fetch(FDOWN_URL, {
            method: 'POST',
            headers: {
                // මෙය වැදගත්: බ්‍රවුසරයක් ලෙස පෙනී සිටීම
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
                // Content-Type එක අවශ්‍ය නොවේ, එය FormData මගින් ස්වයංක්‍රීයව සකසයි
            },
            body: formData 
        });

        if (!response.ok) {
            console.error(`fdown.net scraping failed with status: ${response.status}`);
            return { error: `fdown.net ප්‍රවේශ දෝෂය (${response.status})` };
        }

        const htmlText = await response.text();
        // console.log("FDOWN HTML Response:", htmlText.substring(0, 1000)); // HTML ප්‍රතිචාරයේ කොටසක් ලොග් කිරීම

        // ⚠️ අස්ථායී කොටස: HTML වෙතින් HD සහ SD සබැඳි සෙවීම
        // HD සබැඳිය: 'Download HD Video' බොත්තමේ සබැඳිය
        const hdMatch = htmlText.match(/href="(.*?)"[^>]*>Download HD Video/);
        const sdMatch = htmlText.match(/href="(.*?)"[^>]*>Download Normal Quality/); 
        
        const hdLink = hdMatch && hdMatch[1] ? hdMatch[1] : null;
        const sdLink = sdMatch && sdMatch[1] ? sdMatch[1] : null;

        if (hdLink || sdLink) {
             console.log(`Scraping Success: HD=${hdLink ? 'Found' : 'Not Found'}, SD=${sdLink ? 'Found' : 'Not Found'}`);
            return { hd: hdLink, sd: sdLink };
        } 
        
        console.error("Scraping Failure: No HD/SD links found in fdown.net response.");
        return { error: "බාගත කිරීමේ සබැඳි HTML වෙතින් උකහා ගැනීමට නොහැක. (වීඩියෝව Private හෝ අඩවි ව්‍යුහය වෙනස් වී තිබිය හැක)." };

    } catch (error) {
        console.error("fdown.net fetch error:", error.message);
        return { error: `Scraping දෝෂය: ${error.message}` };
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
        
        const result = await getFbVideoLinks(fbUrl); // Scraping ශ්‍රිතය ඇමතීම

        if (result.error) {
            await sendMessage(chatId, `❌ දෝෂය: ${result.error}\n\n💡 කරුණාකර පරීක්ෂා කරන්න:\n- වීඩියෝ URL නිවැරදි දැයි\n- වීඩියෝව ප්‍රසිද්ධ (public) දැයි`);
        
        } else if (result.hd) {
            // HD යැවීමට උත්සාහ කිරීම
            try {
                await sendVideoFromUrl(chatId, result.hd, '✅ Facebook වීඩියෝව බාගත කරන ලදී! (HD)');
            } catch (error) {
                console.error("Error sending HD video:", error.message);
                if (result.sd) {
                    try {
                        await sendVideoFromUrl(chatId, result.sd, '✅ Facebook වීඩියෝව බාගත කරන ලදී! (SD)\n⚠️ HD ප්‍රමාණය ඉතා විශාල නිසා SD යැවීය.');
                    } catch (sdError) {
                        console.error("Error sending SD video:", sdError.message);
                        await sendMessage(chatId, "❌ වීඩියෝව යැවීමට නොහැකි විය. වීඩියෝ ප්‍රමාණය ඉතා විශාල විය හැක.");
                    }
                } else {
                    await sendMessage(chatId, "❌ වීඩියෝව යැවීමට නොහැකි විය. වීඩියෝ ප්‍රමාණය ඉතා විශාල විය හැක.");
                }
            }
        } else if (result.sd) {
            // SD සෘජුවම යවන්න
            try {
                 await sendVideoFromUrl(chatId, result.sd, '✅ Facebook වීඩියෝව බාගත කරන ලදී! (SD)');
            } catch (error) {
                console.error("Error sending SD video:", error.message);
                await sendMessage(chatId, "❌ වීඩියෝව යැවීමට නොහැකි විය. වීඩියෝ ප්‍රමාණය ඉතා විශාල විය හැක.");
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

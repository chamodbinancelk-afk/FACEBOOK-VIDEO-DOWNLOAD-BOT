import { Telegraf } from 'telegraf';
import axios from 'axios';
import * as cheerio from 'cheerio'; 
import { URLSearchParams } from 'url'; // Node.js URLSearchParams Cloudflare workers වලදී අවශ්‍යයි

// ⚠️ ඔබේ Bot Token එක මෙතනටම ඇතුළත් කරන්න.
const BOT_TOKEN = '8382727460:AAEgKVISJN5TTuV4O-82sMGQDG3khwjiKR8'; 

if (BOT_TOKEN === 'ඔබේ_BotFather_Token_එක_මෙතනට_දාන්න' || !BOT_TOKEN) {
    console.error("⛔️ Error: Please replace the placeholder with your actual BotFather Token.");
}

let bot;

// 🎯 යාවත්කාලීන කරන ලද: පියවර දෙකක (Two-Step) Scraping Function එක
async function getDownloadLink(url) {
    
    // 🎯 පියවර 1: index.php වෙතට POST request එක යැවීම
    const indexUrl = 'https://fdown.net/index.php';
    
    // Facebook Video URL එක data payload එක ලෙස යවමු (form data)
    const dataPayload = new URLSearchParams();
    dataPayload.append('url', url); 
    
    // Bot හඳුනා ගැනීම වැළැක්වීමට Headers
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://fdown.net/', // Referer header එක අනිවාර්යයි
        'Content-Type': 'application/x-www-form-urlencoded', // POST request සඳහා අනිවාර්යයි
    };

    try {
        // POST request එක යැවීම. Redirects නවත්වමු (maxRedirects: 0)
        await axios.post(indexUrl, dataPayload.toString(), { 
            headers,
            maxRedirects: 0, 
            // 302/301 status code එකකදී error එකක් throw කරන්නැතිව response එකක් ලෙස පිළිගැනීමට
            validateStatus: status => status >= 200 && status < 303 
        });
        
        // ⚠️ සටහන: අපි මෙහිදී axios redirect එක block කළ නිසා,
        // සාර්ථක POST එකකින් පසු axios විසින් 302 error එකක් throw කරනු ඇත.
        // එම error එකේ response.headers.location හි redirect URL එක අඩංගු වේ.
        return null; // මෙම කොටසට code එක පැමිණියහොත් දෝෂයකි

    } catch (error) {
        // 302/301 redirect status එකක් (Redirect වීමට සූදානම්) ලැබුණු විට මෙහිදී අසු කරගනී.
        if (error.response && (error.response.status === 302 || error.response.status === 301)) {
            
            const redirectUrl = error.response.headers.location;
            
            if (redirectUrl && redirectUrl.includes('download.php')) {
                // 🎯 පියවර 2: Redirect වූ download.php පිටුව scraping කිරීම
                
                // සම්පූර්ණ Download URL එක නිර්මාණය කරමු
                const fullDownloadUrl = redirectUrl.startsWith('http') ? redirectUrl : 'https://fdown.net' + redirectUrl;

                const downloadPageResponse = await axios.get(fullDownloadUrl, { headers });

                const $ = cheerio.load(downloadPageResponse.data);

                // 🎯 යාවත්කාලීන කරන ලද Web Scraping Logic (නව පාඨය අනුව)
                const hdLinkElement = $('a:contains("Download Video in HD Quality")'); 
                
                if (hdLinkElement.length > 0) {
                    return hdLinkElement.attr('href');
                } else {
                    const sdLinkElement = $('a:contains("Download Video in Normal Quality")');
                    if (sdLinkElement.length > 0) {
                        return sdLinkElement.attr('href');
                    }
                }
                
                return null; // Download Link සොයා ගැනීමට නොහැකි විය

            } else {
                 console.error("Fdown Scraping Error: Redirected to a non-download page:", redirectUrl);
                 return null;
            }
        }
        
        // වෙනත් දෝෂයක් (Network, Server error, etc.)
        console.error("Fdown Scraping Error (Axios):", error.message);
        return null;
    }
}


// Telegram Handlers define කරන function එක (වෙනස් කර නැත)
function setupBotHandlers(botInstance) {
    botInstance.start((ctx) => {
        ctx.reply(`👋 හායි ${ctx.from.first_name}!\nමම fdown.net හරහා Facebook වීඩියෝ බාගත කරන Bot කෙනෙක්. කරුණාකර Facebook වීඩියෝ ලින්ක් එකක් (URL) මට එවන්න.`);
    });

    botInstance.help((ctx) => {
        ctx.reply('මට Facebook වීඩියෝවක ලින්ක් එක එවන්න. මම එය බාගත කරලා දෙන්නම්.');
    });

    botInstance.on('text', async (ctx) => {
        const url = ctx.message.text.trim();
        const messageId = ctx.message.message_id;

        if (url.startsWith('http')) {
            let loadingMsg;
            try {
                loadingMsg = await ctx.reply('⌛️ වීඩියෝ ලින්ක් එක සකසමින්...', { reply_to_message_id: messageId });
                
                const downloadLink = await getDownloadLink(url);

                if (downloadLink) {
                    await ctx.deleteMessage(loadingMsg.message_id).catch(e => console.log("Can't delete msg:", e.message));

                    await ctx.replyWithVideo(downloadLink, { 
                        caption: `ඔබ ඉල්ලූ වීඩියෝව මෙන්න.`,
                        reply_to_message_id: messageId 
                    });
                    
                } else {
                    await ctx.editMessageText('⚠️ වීඩියෝව සොයා ගැනීමට නොහැකි විය. කරුණාකර ලින්ක් එක නිවැරදිදැයි පරීක්ෂා කරන්න (Public වීඩියෝ පමණක් වැඩ කරයි).', {
                        chat_id: loadingMsg.chat.id,
                        message_id: loadingMsg.message_id
                    });
                }

            } catch (error) {
                console.error("Handler Error:", error.message);
                
                try {
                    if (loadingMsg) {
                         await ctx.editMessageText('❌ සමාවෙන්න! වීඩියෝව download කිරීමේදී දෝෂයක් ඇතිවිය. (internal server error).', {
                            chat_id: loadingMsg.chat.id,
                            message_id: loadingMsg.message_id
                        });
                    } else {
                         await ctx.reply('❌ සමාවෙන්න! දෝෂයක් ඇතිවිය.');
                    }
                } catch (editError) {
                     await ctx.reply('❌ සමාවෙන්න! දෝෂයක් ඇතිවිය.');
                }
            }
        } else {
            ctx.reply('කරුණාකර වලංගු Facebook වීඩියෝ ලින්ක් එකක් (URL) පමණක් එවන්න.');
        }
    });
}

// Cloudflare Worker's entry point: ES Module default export (වෙනස් කර නැත)
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!bot) {
        bot = new Telegraf(BOT_TOKEN);
        setupBotHandlers(bot);
    }
    
    // Telegram වෙතින් එන POST request එක හසුරුවයි
    if (request.method === 'POST') {
        try {
            const body = await request.json();
            await bot.handleUpdate(body);
            return new Response('OK', { status: 200 });

        } catch (error) {
            console.error('Webhook Handling Error:', error.message);
            return new Response('Error handling update', { status: 500 });
        }
    }

    return new Response('Fdown Telegram Bot Worker is running.', { status: 200 });
  },
};

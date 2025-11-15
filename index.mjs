import { Telegraf } from 'telegraf';
import axios from 'axios';
import * as cheerio from 'cheerio'; 
// Cloudflare Workers වලදී, Node.js Built-in modules සඳහා nodejs_compat flag එක අවශ්‍යයි.

// ⚠️ Bot Token එක
// සටහන: ඔබේ Token එකේ 401 Error එකක් තිබිය හැක. නිවැරදි Token එක මෙහි ඇතුළත් කරන්න.
const BOT_TOKEN = '83827277460:AAEgKVISJN5TTuV4O-82sMGQDG3khwjiKR8'; 

let bot;

// 🎯 වඩාත්ම විශ්වාසදායක Scraping Logic එක
async function getDownloadLink(url) {
    // සෘජුවම download.php URL එකට යමු, වඩා හොඳ Headers සමඟින්.
    const scrapeUrl = `https://fdown.net/download.php?url=${encodeURIComponent(url)}`;
    
    try {
        const response = await axios.get(scrapeUrl, {
            headers: {
                // බොට් හඳුනා ගැනීම අවම කිරීමට නවතම User-Agent
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                // Referer Header එක Bot Check එක මගහැරීමට අනිවාර්යයි
                'Referer': 'https://fdown.net/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            // Redirects අනුගමනය කරන්න
            maxRedirects: 5 
        });
        
        const $ = cheerio.load(response.data);

        // 🎯 පුළුල් Selector Logic: 'Download' යන වචනය අඩංගු ඕනෑම ලින්ක් එකක් සොයයි
        let linkElement = $('a:contains("Download")'); 

        if (linkElement.length > 0) {
            
            // 1. HD Link එක සොයමු (වඩා හොඳ තත්ත්වය)
            let hdLink = linkElement.filter(':contains("HD Quality")').attr('href');
            if (hdLink) return hdLink;

            // 2. Normal Quality Link එක සොයමු
            let normalLink = linkElement.filter(':contains("Normal Quality")').attr('href');
            if (normalLink) return normalLink;
            
            // 3. වෙනත් 'Download' Link එකක් (Fallback)
            // 'Download' සහිත පළමු වලංගු link එක දෙමු
            let firstDownloadLink = linkElement.first().attr('href');
            if (firstDownloadLink) return firstDownloadLink;
        }

        return null; // Download Link සොයා ගැනීමට නොහැකි විය
        
    } catch (error) {
        // දෝෂය Cloudflare Logs වෙත යවමු
        console.error("Fdown Scraping Error:", error.message);
        return null; 
    }
}

// Telegram Handlers define කරන function එක
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

// Cloudflare Worker's entry point: ES Module default export
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
            // 401 Error එක මෙතැනින් Cloudflare Logs වෙත යවනු ලැබේ.
            console.error('Webhook Handling Error:', error.message);
            return new Response('Error handling update', { status: 500 });
        }
    }

    return new Response('Fdown Telegram Bot Worker is running.', { status: 200 });
  },
};

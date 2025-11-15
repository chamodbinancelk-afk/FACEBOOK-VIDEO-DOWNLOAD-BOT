import { Telegraf } from 'telegraf';
import { Buffer } from 'buffer'; // Node.js Buffer Cloudflare Worker සඳහා භාවිතා කරයි

// ⚠️ ඔබ විසින් ලබා දුන් Token එක
const BOT_TOKEN = '8382727460:AAEgKVISJN5TTuV4O-82sMGQDG3khwjiKR8'; 

let bot;

// --- 1. API Logic: FBDownloader / SnapSave භාවිතයෙන් Link ලබා ගැනීම ---

/**
 * Primary method using FBDownloader API
 */
export async function getFbVideoInfo(videoUrl) {
  try {
    console.log(`Fetching video info for: ${videoUrl}`);
    
    // Primary API: FBDownloader
    const apiUrl = `https://www.fbdownloader.com/api/video?url=${encodeURIComponent(videoUrl)}`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) {
        console.warn(`Primary API failed with status ${response.status}. Trying fallback.`);
        throw new Error(`API request failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success && data.video) {
      return {
        sd: data.video.sd || data.video.url, // SD Link හෝ පොදු URL
        hd: data.video.hd, 
        title: data.video.title || 'Facebook Video',
        thumbnail: data.video.thumbnail || ''
      };
    }
    
    // Fallback: Try alternative API if primary was successful but links were missing
    throw new Error('Primary API successful, but no video links found.');
    
  } catch (error) {
    console.error('Primary API error:', error.message);
    
    // Try fallback method
    try {
      return await getFbVideoInfoFallback(videoUrl);
    } catch (fallbackError) {
      console.error('Fallback API error:', fallbackError.message);
      return { error: 'Unable to fetch video. Please check the URL and try again.' };
    }
  }
}

/**
 * Fallback method using alternative API (SnapSave)
 */
async function getFbVideoInfoFallback(videoUrl) {
  try {
    console.log('Trying fallback API (SnapSave)...');
    // Use SnapSave API as fallback
    const apiUrl = `https://snapsave.app/api/ajaxSearch`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: `q=${encodeURIComponent(videoUrl)}&vt=facebook`
    });
    
    if (!response.ok) {
      throw new Error(`Fallback API failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.status === 'ok' && data.data) {
      // Parse HTML response to extract video URLs (We must manually parse the HTML fragment)
      const htmlContent = data.data;
      
      // Use a simple regex to extract HD and SD links from the HTML
      // This avoids requiring the 'cheerio' library
      const hdMatch = htmlContent.match(/href="([^"]+)"[^>]*>\s*Download\s+HD/i);
      const sdMatch = htmlContent.match(/href="([^"]+)"[^>]*>\s*Download\s+SD/i);
      
      if (hdMatch || sdMatch) {
        return {
          sd: sdMatch ? sdMatch[1] : hdMatch ? hdMatch[1] : null,
          hd: hdMatch ? hdMatch[1] : null,
          title: 'Facebook Video',
          thumbnail: ''
        };
      }
    }
    
    throw new Error('No video links found in SnapSave response');
    
  } catch (error) {
    throw new Error(`Fallback method failed: ${error.message}`);
  }
}


// --- 2. Download Logic: Video Link එකෙන් Buffer එකක් ලෙස ලබා ගැනීම ---

async function downloadVideoBuffer(downloadUrl) {
    try {
        // Cloudflare Worker එකේ fetch API එකම භාවිතා කරයි
        const response = await fetch(downloadUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                // Download Links Direct Links බැවින් Referer අවශ්‍ය නොවේ
            },
        });
        
        if (!response.ok) {
            throw new Error(`Failed to download video: ${response.status}`);
        }

        // Response body එක ArrayBuffer එකක් ලෙස ලබා ගනී
        const arrayBuffer = await response.arrayBuffer(); 
        // ArrayBuffer එක Buffer එකකට හරවා Telegraf වෙත ලබා දේ
        return Buffer.from(arrayBuffer); 
        
    } catch (error) {
        console.error("Buffer Download Error:", error.message);
        return null;
    }
}


// --- 3. Telegram Handlers ---
function setupBotHandlers(botInstance) {
    
    botInstance.start((ctx) => {
        ctx.reply(`👋 හායි ${ctx.from.first_name}!\nමම FB Downloader Bot කෙනෙක්. කරුණාකර Facebook වීඩියෝ ලින්ක් එකක් (URL) මට එවන්න.`);
    });

    botInstance.on('text', async (ctx) => {
        const url = ctx.message.text.trim();
        const messageId = ctx.message.message_id;

        // Facebook URL එකක් දැයි පරීක්ෂා කිරීම
        const fbUrlMatch = url.match(/https?:\/\/(?:www\.|m\.)?facebook\.com\/\S+|https?:\/\/fb\.watch\/\S+/i);

        if (fbUrlMatch) {
            let loadingMsg;
            try {
                loadingMsg = await ctx.reply('⌛️ වීඩියෝ ලින්ක් එක විශ්ලේෂණය කරමින්...', { reply_to_message_id: messageId });
                
                const videoInfo = await getFbVideoInfo(url);
                let videoLink = null;
                let quality = null;

                if (videoInfo.error) {
                    throw new Error(videoInfo.error);
                }

                // HD Link එකට ප්‍රමුඛතාවය දීම
                if (videoInfo.hd) {
                    videoLink = videoInfo.hd;
                    quality = 'HD';
                } else if (videoInfo.sd) {
                    videoLink = videoInfo.sd;
                    quality = 'SD';
                }

                if (videoLink) {
                    await ctx.editMessageText(`📥 වීඩියෝව බාගත කරමින්... (${quality} Quality). කරුණාකර රැඳී සිටින්න.`, { 
                        chat_id: loadingMsg.chat.id,
                        message_id: loadingMsg.message_id 
                    });
                    
                    const videoBuffer = await downloadVideoBuffer(videoLink);

                    if (videoBuffer) {
                        await ctx.deleteMessage(loadingMsg.message_id).catch(e => console.log("Can't delete msg:", e.message));

                        await ctx.replyWithVideo({ source: videoBuffer, filename: 'facebook_video.mp4' }, { 
                            caption: `✅ සාර්ථකයි! ${quality} Quality වීඩියෝව මෙන්න.`,
                            reply_to_message_id: messageId 
                        });
                    
                    } else {
                        // Buffer Download අසාර්ථක නම්, Link එක පමණක් යවන්න
                        await ctx.editMessageText(`❌ වීඩියෝව යැවීමට නොහැකි විය (File Size Error). මෙන්න සෘජු Download Link එක (${quality}):\n\n\`${videoLink}\``, {
                            parse_mode: 'Markdown',
                            chat_id: loadingMsg.chat.id,
                            message_id: loadingMsg.message_id
                        });
                    }

                } else {
                    // API වෙතින් Link එකක් නොලැබුනේ නම්
                    await ctx.editMessageText('⚠️ වීඩියෝව සොයා ගැනීමට නොහැකි විය. කරුණාකර ලින්ක් එක නිවැරදිදැයි පරීක්ෂා කරන්න (Public වීඩියෝ පමණක් වැඩ කරයි).', {
                        chat_id: loadingMsg.chat.id,
                        message_id: loadingMsg.message_id
                    });
                }

            } catch (error) {
                console.error("Handler Error:", error.message);
                
                const errorMessage = `❌ වීඩියෝ ලබාගැනීමේ දෝෂය. හේතුව:\n${error.message.includes('Unable to fetch video') ? 'API අසාර්ථක විය' : error.message}`;

                try {
                    if (loadingMsg) {
                         await ctx.editMessageText(errorMessage, {
                            chat_id: loadingMsg.chat.id,
                            message_id: loadingMsg.message_id
                        });
                    } else {
                         await ctx.reply(errorMessage);
                    }
                } catch (editError) {
                     await ctx.reply(`❌ දෝෂයක් ඇතිවිය: ${error.message}`);
                }
            }
        } else {
            ctx.reply('කරුණාකර වලංගු Facebook වීඩියෝ ලින්ක් එකක් (URL) පමණක් එවන්න.');
        }
    });
}

// --- 4. Cloudflare Worker Entry Point ---
export default {
    async fetch(request, env, ctx) {
        
        if (!bot) {
            // Telegraf Bot එක Initialise කරයි
            bot = new Telegraf(BOT_TOKEN);
            setupBotHandlers(bot);
        }
        
        // Telegram වෙතින් එන POST request එක හසුරුවයි (Webhook)
        if (request.method === 'POST') {
            try {
                let body;
                try {
                    // JSON Parsing Error හසුරුවයි
                    body = await request.json(); 
                } catch (e) {
                    console.error('JSON Parsing Error (Ignoring request):', e.message);
                    return new Response('OK - JSON Error Handled', { status: 200 }); 
                }

                await bot.handleUpdate(body);
                return new Response('OK', { status: 200 });

            } catch (error) {
                console.error('Webhook Handling Error:', error.message);
                return new Response('Error handling update', { status: 500 });
            }
        }

        return new Response('Facebook Downloader Bot Worker is running.', { status: 200 });
    },
};

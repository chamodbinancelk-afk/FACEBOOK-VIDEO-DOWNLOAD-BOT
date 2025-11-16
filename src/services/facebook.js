// src/services/facebook.js

/**
 * විකල්පය 2: සෘජුවම Facebook වීඩියෝ පිටුවෙන් HTML සූරා ගැනීම
 * (Direct Facebook HTML Scraping)
 * මෙම ක්‍රමය ඉතා අස්ථිර (Brittle) බව සලකන්න.
 */
async function tryDirectFacebookScraping(videoUrl) {
  try {
    console.log(`Trying Direct Facebook Scraping: ${videoUrl}`);
    
    // Facebook වෙත සෘජු ඉල්ලීමක් යවයි
    const response = await fetch(videoUrl, {
      method: 'GET',
      headers: {
        // Desktop User Agent එකක් භාවිතා කරන්නේ වීඩියෝ සබැඳි අඩංගු සර්වර්-සයිඩ් HTML ලබා ගැනීමටය.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Facebook returned status ${response.status}`);
    }
    
    const html = await response.text();
    
    let hdUrl = null;
    let sdUrl = null;

    // HD සහ SD සබැඳි සඳහා JSON strings සෙවීම
    const hdMatch = html.match(/"hd_src":"(.*?)"/);
    const sdMatch = html.match(/"sd_src":"(.*?)"/);

    if (hdMatch && hdMatch[1]) {
        // URL escape වී ඇති බැවින් නිවැරදි කරයි
        hdUrl = hdMatch[1].replace(/\\/g, ''); 
    }

    if (sdMatch && sdMatch[1]) {
        sdUrl = sdMatch[1].replace(/\\/g, '');
    }

    if (!hdUrl && !sdUrl) {
      throw new Error('No video links found in direct HTML (hd_src/sd_src missing)');
    }
    
    return {
      url: hdUrl || sdUrl,
      hd: hdUrl,
      sd: sdUrl,
      title: 'Facebook Video',
      service: 'DirectScraping'
    };
  } catch (error) {
    console.error(`Direct Facebook Scraping failed: ${error.message}`);
    throw error;
  }
}

/**
 * ද්විතීයික විකල්පය: තෙවැනි පාර්ශවීය scraping සේවාවක් (Downloader website) භාවිතා කරයි.
 * (FBDOWN/GetFVid වැනි)
 */
async function tryScrapingService(videoUrl, serviceUrl, serviceName) {
  try {
    console.log(`Trying scraping service: ${serviceName} at ${serviceUrl}`);
    
    // Cloudflare Workers මත Time out ගැටළු වළක්වා ගැනීමට, කෙටි timeout එකක් සකසයි
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000); 

    const response = await fetch(serviceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': serviceUrl
      },
      body: `url=${encodeURIComponent(videoUrl)}`,
      signal: controller.signal // Time out control එකට
    });
    
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`${serviceName} returned status ${response.status}`);
    }
    
    const html = await response.text();
    
    // HTML ප්‍රතිචාරයෙන් HD සහ SD සබැඳි සෙවීම
    const hdMatch = html.match(/<a[^>]+href="([^"]+)"[^>]*>\s*Download\s+in\s+(?:HD|High)/i);
    const sdMatch = html.match(/<a[^>]+href="([^"]+)"[^>]*>\s*Download\s+in\s+(?:SD|Normal)/i);
    
    const hdUrl = hdMatch ? hdMatch[1] : null;
    const sdUrl = sdMatch ? sdMatch[1] : null;
    
    if (!hdUrl && !sdUrl) {
      const anyDownload = html.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/i);
      if (anyDownload) {
        return {
          url: anyDownload[1],
          hd: anyDownload[1],
          sd: anyDownload[1],
          title: 'Facebook Video',
          service: serviceName
        };
      }
      throw new Error('No download links found');
    }
    
    return {
      url: hdUrl || sdUrl,
      hd: hdUrl,
      sd: sdUrl,
      title: 'Facebook Video',
      service: serviceName
    };

  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`${serviceName} timed out.`);
      throw new Error(`${serviceName} timed out (>${9000}ms)`);
    }
    console.error(`${serviceName} failed:`, error.message);
    throw error;
  }
}

export async function getFbVideoInfo(videoUrl, env) {
  console.log(`Fetching video info for: ${videoUrl}`);
  
  // උත්සාහ කිරීමට සේවාවන් ලැයිස්තුව - Direct Scraping ප්‍රමුඛත්වය ලබා දෙයි
  const services = [
    { name: 'Direct Facebook Scraping', func: tryDirectFacebookScraping },
    { 
        name: 'FBDOWN (Backup)', 
        func: (url) => tryScrapingService(url, 'https://www.fbdown.net/download.php', 'FBDOWN') 
    },
    { 
        name: 'GetFVid (Backup)', 
        func: (url) => tryScrapingService(url, 'https://www.getfvid.com/downloader', 'GetFVid') 
    },
  ];
  
  for (const service of services) {
    try {
      const result = await service.func(videoUrl);
      console.log(`✅ Success with ${service.name}`);
      return {
        url: result.url,
        hd: result.hd,
        sd: result.sd,
        title: result.title,
        thumbnail: '',
        duration: 0,
        author: ''
      };
    } catch (error) {
      console.log(`❌ ${service.name} failed: ${error.message}`);
      continue; 
    }
  }
  
  console.log('\n⚠️ All methods failed.');
  
  return {
    error: '❌ වීඩියෝව බාගත කිරීමට නොහැකි විය. / Unable to download video.\n\n' +
           '💡 සියලුම බාගත කිරීමේ ක්‍රම අසාර්ථක විය. කරුණාකර පසුව නැවත උත්සාහ කරන්න, නැතහොත් වීඩියෝව Public දැයි පරීක්ෂා කරන්න.'
  };
}

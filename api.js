// api.js - API URL එක ENV වෙතින් ලබා ගැනීමට නිවැරදි කර ඇත

// config වෙතින් API_URL import කිරීම ඉවත් කරයි

// getApiMetadata ශ්‍රිතය දැන් env argument එක භාවිතා කර API_URL ලබා ගනී
async function getApiMetadata(link, env) { 
    
    // 🚨 API URL එක env වෙතින් ලබා ගනී (API_URL ENV variable එක තිබිය යුතුය)
    const apiUrl = env.API_URL || "https://fdown.isuru.eu.org/info"; 

    try {
        const apiResponse = await fetch(apiUrl, { // env.API_URL භාවිතා කරයි
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'CloudflareWorker/1.0'
            },
            body: JSON.stringify({ url: link })
        });
        
        if (!apiResponse.ok) {
            // API වෙතින් HTTP Error එකක් ලැබුණහොත්
            throw new Error(`External API failed with status ${apiResponse.status}`);
        }
        
        const videoData = await apiResponse.json();
        
        // API response එකේ video data අඩංගු වන ප්‍රධාන වස්තුව සොයා ගනී
        const info = videoData.video_info || videoData.data || videoData;
        
        // 🚨 වැදගත්: API response එකේ දත්ත තිබේදැයි පරීක්ෂා කිරීම
        if (!info || (!info.title && !info.url && !info.thumbnail)) {
             throw new Error("API returned successfully, but no video metadata was found in the response.");
        }
        
        let rawThumbnailLink = null;
        let videoTitle = 'Facebook Video';
        let uploader = 'Unknown Uploader';
        let duration = 0;
        let views = 0;
        let uploadDate = 'N/A';
        let filesize = 0; 
        
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
        // දෝෂය නැවත Throw කිරීමෙන් fbindex.js හි catch block එකට එය අල්ලා ගැනීමට ඉඩ සලසයි
        throw new Error(`API Metadata Error: ${e.message}`); 
    }
}


// scrapeVideoLinkAndThumbnail ශ්‍රිතය (මෙය fdown.net scraper API වෙත යොමු වේ)
async function scrapeVideoLinkAndThumbnail(link) {
    // Scraper API (fdown.net) සඳහා වන logic මෙහි ඇත 
    const formData = new URLSearchParams();
    formData.append('URL', link);

    const fdownResponse = await fetch('https://fdown.net/download.php', {
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

    // HD Link සොයයි
    const hdLinkRegex = /<a[^>]+href=[\"']?([^\"'\\s]+)[\"']?[^>]*>.*Download Video in HD Quality.*<\/a>/i;
    let match = resultHtml.match(hdLinkRegex);

    if (match && match[1]) {
        videoUrl = match[1];
    } else {
        // HD නොමැති නම් SD Link සොයයි
        const normalLinkRegex = /<a[^>]+href=[\"']?([^\"'\\s]+)[\"']?[^>]*>.*Download Video in Normal Quality.*<\/a>/i;
        match = resultHtml.match(normalLinkRegex);

        if (match && match[1]) {
            videoUrl = match[1];
        }
    }
    
    // Thumbnail සොයයි
    const thumbnailRegex = /<img[^>]+class=[\"']?fb_img[\"']?[^>]*src=[\"']?([^\"'\\s]+)[\"']?/i;
    let thumbnailMatch = resultHtml.match(thumbnailRegex);
    if (thumbnailMatch && thumbnailMatch[1]) {
        fallbackThumbnail = thumbnailMatch[1];
    }

    return { videoUrl, fallbackThumbnail };

}


export {
    getApiMetadata,
    scrapeVideoLinkAndThumbnail
};

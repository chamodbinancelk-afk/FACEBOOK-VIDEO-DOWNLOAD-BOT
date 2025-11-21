// helpers.js

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
    
    // ඔබ ඉල්ලූ පරිදි labels bold කර ඇත.
    let caption = `${htmlBold('Title:')} ${videoTitle}`;
    
    caption += `\n\n`;
    caption += `👤 ${htmlBold('Uploader:')} ${uploader}\n`;
    caption += `⏱️ ${htmlBold('Duration:')} ${formattedDuration}\n`;
    caption += `👁️ ${htmlBold('Views:')} ${formattedViews}\n`;
    caption += `📅 ${htmlBold('Uploaded:')} ${formattedDate}`; 
    
    caption += `\n\n◇───────────────◇\n`
    caption += `🚀 Developer: @chamoddeshan\n`
    caption += `🔥 C D H Corporation ©`;

    return caption;
}

export { 
    htmlBold, 
    formatDuration, 
    formatCaption 
};

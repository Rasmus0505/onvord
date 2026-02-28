// Offscreen document: annotate screenshot with click highlight
chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg.type !== 'ANNOTATE_SCREENSHOT') return;
    const { dataUrl, clickX, clickY, viewportW, viewportH } = msg;

    const img = new Image();
    img.onload = () => {
        const canvas = document.getElementById('c');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // Scale click coordinates from viewport to image size
        const sx = img.width / viewportW;
        const sy = img.height / viewportH;
        const cx = clickX * sx;
        const cy = clickY * sy;
        const r = Math.max(18, Math.min(img.width, img.height) * 0.022);

        // Soft outer glow (brighter for dark backgrounds)
        const grad = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 2.5);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
        grad.addColorStop(0.3, 'rgba(129, 140, 248, 0.2)');
        grad.addColorStop(0.7, 'rgba(99, 102, 241, 0.08)');
        grad.addColorStop(1, 'rgba(99, 102, 241, 0)');
        ctx.beginPath();
        ctx.arc(cx, cy, r * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // White outer ring (ensures visibility on dark backgrounds)
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = Math.max(2, r * 0.1);
        ctx.stroke();

        // Purple inner ring
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(129, 140, 248, 0.9)';
        ctx.lineWidth = Math.max(2.5, r * 0.15);
        ctx.stroke();

        // Center dot
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(3, r * 0.18), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.fill();

        respond({ annotatedUrl: canvas.toDataURL('image/jpeg', 0.7) });
    };
    img.onerror = () => respond({ annotatedUrl: dataUrl }); // fallback to original
    img.src = dataUrl;
    return true; // async respond
});

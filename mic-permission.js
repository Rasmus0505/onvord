const btn = document.getElementById('btn-grant');
const status = document.getElementById('status');

// Check current microphone permission state
async function checkMicPermission() {
    try {
        const result = await navigator.permissions.query({ name: 'microphone' });
        return result.state; // 'granted' | 'denied' | 'prompt'
    } catch (e) {
        return 'unknown';
    }
}

function showDeniedHelp() {
    btn.disabled = false;
    btn.textContent = '✅ 已手动允许？点击重试';
    status.innerHTML =
        '⚠️ 麦克风权限被浏览器记住为"拒绝"，需要手动重置：<br><br>' +
        '<b>方法：</b>点击地址栏左侧的 🔒 或 ⚙️ 图标 → 找到「麦克风」→ 改为「允许」<br><br>' +
        '改好后点击上方按钮重试。';
    status.className = 'status err';
}

// On page load: check permission state
(async function init() {
    const state = await checkMicPermission();
    console.log('Mic permission state on load:', state);

    if (state === 'granted') {
        status.textContent = '✅ 麦克风权限已授予！正在关闭此页面…';
        status.className = 'status ok';
        chrome.runtime.sendMessage({ type: 'MIC_PERMISSION_GRANTED' });
        setTimeout(() => window.close(), 1200);
        return;
    }

    if (state === 'denied') {
        showDeniedHelp();
        return;
    }

    // state === 'prompt' or 'unknown' — ready for user to click the button
})();

btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = '请求中…';
    status.textContent = '';
    status.className = 'status';

    // Re-check permission state
    const state = await checkMicPermission();

    if (state === 'granted') {
        status.textContent = '✅ 麦克风权限已授予！正在关闭此页面…';
        status.className = 'status ok';
        chrome.runtime.sendMessage({ type: 'MIC_PERMISSION_GRANTED' });
        setTimeout(() => window.close(), 1200);
        return;
    }

    if (state === 'denied') {
        showDeniedHelp();
        return;
    }

    // State is 'prompt' — try to trigger permission dialog via getUserMedia
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        status.textContent = '✅ 麦克风权限已授予！正在关闭此页面…';
        status.className = 'status ok';
        chrome.runtime.sendMessage({ type: 'MIC_PERMISSION_GRANTED' });
        setTimeout(() => window.close(), 1200);
        return;
    } catch (e) {
        console.warn('getUserMedia failed:', e.name, e.message);
        btn.disabled = false;
        btn.textContent = '🎤 重试授权';
        if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
            showDeniedHelp();
            return;
        }
        status.textContent = `❌ 麦克风不可用：${e.name || 'UnknownError'}`;
        status.className = 'status err';
    }
});

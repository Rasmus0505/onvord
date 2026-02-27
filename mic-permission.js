const btn = document.getElementById('btn-grant');
const status = document.getElementById('status');

btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = '请求中…';
    status.textContent = '';
    status.className = 'status';
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        status.textContent = '✅ 麦克风权限已授予！正在关闭此页面…';
        status.className = 'status ok';
        // Notify the extension that permission has been granted
        chrome.runtime.sendMessage({ type: 'MIC_PERMISSION_GRANTED' });
        setTimeout(() => window.close(), 1200);
    } catch (err) {
        console.error('Permission error:', err);
        btn.disabled = false;
        btn.textContent = '🎤 重试授权';
        if (err.name === 'NotAllowedError') {
            status.textContent = '❌ 权限被拒绝。请点击地址栏左侧的锁/设置图标，手动允许麦克风。';
        } else {
            status.textContent = '❌ 发生错误：' + err.message;
        }
        status.className = 'status err';
    }
});

// Auto-trigger the permission request
btn.click();

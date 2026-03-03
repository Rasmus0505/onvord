// Onvord Settings Page
(function () {
    'use strict';

    const keyInput = document.getElementById('dg-key');
    const langSelect = document.getElementById('dg-lang');
    const btnSave = document.getElementById('btn-save');
    const btnTest = document.getElementById('btn-test');
    const toggleVis = document.getElementById('toggle-vis');
    const statusEl = document.getElementById('status');
    const normalizeLang = (lang) => {
        if (lang === 'zh') return 'zh-CN';
        if (lang === 'en') return 'en-US';
        return (lang === 'zh-CN' || lang === 'en-US') ? lang : 'zh-CN';
    };

    // Load saved settings
    chrome.storage.local.get(['deepgramKey', 'deepgramLang'], (data) => {
        if (data.deepgramKey) keyInput.value = data.deepgramKey;
        langSelect.value = normalizeLang(data.deepgramLang);
    });

    // Toggle password visibility
    toggleVis.addEventListener('click', () => {
        const isPassword = keyInput.type === 'password';
        keyInput.type = isPassword ? 'text' : 'password';
        toggleVis.textContent = isPassword ? '🙈' : '👁️';
    });

    // Show status message
    function showStatus(msg, ok) {
        statusEl.textContent = msg;
        statusEl.style.display = '';  // clear any inline override
        statusEl.className = 'status ' + (ok ? 'ok' : 'err');
    }

    function hideStatus() {
        statusEl.className = 'status';
        statusEl.style.display = '';
    }

    // Save settings
    btnSave.addEventListener('click', () => {
        const key = keyInput.value.trim();
        const lang = normalizeLang(langSelect.value);

        const data = { deepgramLang: lang };
        if (key) data.deepgramKey = key;

        chrome.storage.local.set(data, () => {
            showStatus(key ? '✅ 设置已保存' : '⚠️ 未配置 API Key，无法开始录制', Boolean(key));
        });
    });

    // Test connection — try a quick API call to Deepgram
    btnTest.addEventListener('click', async () => {
        const key = keyInput.value.trim();
        if (!key) {
            showStatus('⚠️ 请先输入 API Key', false);
            return;
        }

        btnTest.disabled = true;
        btnTest.textContent = '测试中…';
        hideStatus();

        try {
            // Use Deepgram's projects endpoint to verify the key
            const res = await fetch('https://api.deepgram.com/v1/projects', {
                headers: { 'Authorization': `Token ${key}` }
            });

            if (res.ok) {
                showStatus('✅ 连接成功！API Key 有效', true);
            } else if (res.status === 401 || res.status === 403) {
                showStatus('❌ API Key 无效，请检查后重试', false);
            } else {
                showStatus(`⚠️ 服务器返回 ${res.status}，请稍后重试`, false);
            }
        } catch (e) {
            showStatus('❌ 无法连接到 Deepgram，请检查网络', false);
        }

        btnTest.disabled = false;
        btnTest.textContent = '🔍 测试连接';
    });
})();

// Onvord Settings Page
(function () {
    'use strict';

    const isZh = /^zh\b/i.test(navigator.language || '');
    const LOCALE = isZh ? 'zh' : 'en';

    const elProvider = document.getElementById('stt-provider');
    const elDgKey = document.getElementById('dg-key');
    const elDgLang = document.getElementById('deepgram-lang');
    const elAliyunKey = document.getElementById('aliyun-key');
    const elAliyunRegion = document.getElementById('aliyun-region');
    const elAliyunModel = document.getElementById('aliyun-model');

    const providerDeepgram = document.getElementById('provider-deepgram');
    const providerAliyun = document.getElementById('provider-aliyun');

    const btnSave = document.getElementById('btn-save');
    const btnTest = document.getElementById('btn-test');
    const statusEl = document.getElementById('status');

    const STORAGE_KEYS = [
        'sttProvider',
        'deepgramKey',
        'deepgramLang',
        'aliyunKey',
        'aliyunRegion',
        'aliyunModel'
    ];

    const DEFAULTS = {
        sttProvider: 'aliyun',
        deepgramLang: 'zh-CN',
        aliyunRegion: 'cn',
        aliyunModel: 'qwen3-asr-flash-realtime'
    };

    const I18N = {
        zh: {
            kicker: '扩展设置',
            pageTitle: 'Onvord 设置',
            title: 'Onvord 语音设置',
            subtitle: '录制前请先配置语音服务 Provider 和凭证。',

            cardEngine: '语音服务 Provider',
            labelProvider: 'Provider',

            dgTitle: 'Deepgram',
            labelDgKey: 'API Key',
            dgKeyPlaceholder: '输入你的 Deepgram API Key',
            labelDgLang: '识别语言',
            dgLangHint: 'Deepgram 流式识别需要明确指定语言。',
            dgHintHtml: '免费注册即送 $200 额度 → <a href="https://console.deepgram.com/signup" target="_blank" rel="noreferrer noopener">console.deepgram.com</a>',

            aliyunTitle: '阿里云 Qwen3-ASR-Flash-Realtime',
            labelAliyunKey: 'API Key',
            aliyunKeyPlaceholder: '输入你的 DashScope API Key',
            labelAliyunRegion: '区域',
            labelAliyunModel: '模型',
            aliyunModelPlaceholder: 'qwen3-asr-flash-realtime',
            aliyunHint: '官方模型名：qwen3-asr-flash-realtime',

            saveBtn: '保存设置',
            testBtn: '测试连接',
            testing: '测试中…',
            toggleTitle: '显示/隐藏',

            notesTitle: '使用说明',
            note1: '• 录制时只会使用当前选中的一个语音 Provider。',
            note2: '• Deepgram 需要手动选择中文或英文。',
            note3: '• 所有凭证只存储在本地浏览器中。',
            note4: '• 凭证缺失时，“开始录制”会被禁用。',

            statusSaved: '✅ 设置已保存',
            statusMissingDg: '⚠️ Deepgram API Key 未配置',
            statusMissingAliyun: '⚠️ 阿里云 API Key 未配置',
            statusNeedDg: '⚠️ 请先输入 Deepgram API Key',
            statusNeedAliyun: '⚠️ 请先输入阿里云 API Key',
            statusOkDg: '✅ Deepgram 连接成功，API Key 有效',
            statusBadDg: '❌ Deepgram API Key 无效，请检查后重试',
            statusServerDg: '⚠️ Deepgram 返回 {status}，请稍后重试',
            statusNetworkDg: '❌ 无法连接 Deepgram，请检查网络',
            statusOkAliyun: '✅ 阿里云连接成功，API Key 有效',
            statusBadAliyun: '❌ 阿里云 API Key 无效，或与区域不匹配，请检查后重试',
            statusBadAliyunFormat: '❌ 阿里云 API Key 包含非法字符（如中文/全角符号），请重新复制粘贴',
            statusServerAliyun: '⚠️ 阿里云返回 {status}，请稍后重试',
            statusNetworkAliyun: '❌ 无法连接阿里云，请检查网络'
        },
        en: {
            kicker: 'Extension Settings',
            pageTitle: 'Onvord Settings',
            title: 'Onvord Speech Settings',
            subtitle: 'Configure your speech provider and credentials before recording.',

            cardEngine: 'Speech Provider',
            labelProvider: 'Provider',

            dgTitle: 'Deepgram',
            labelDgKey: 'API Key',
            dgKeyPlaceholder: 'Enter your Deepgram API key',
            labelDgLang: 'Recognition Language',
            dgLangHint: 'Deepgram streaming requires an explicit language.',
            dgHintHtml: 'Free signup includes $200 credit → <a href="https://console.deepgram.com/signup" target="_blank" rel="noreferrer noopener">console.deepgram.com</a>',

            aliyunTitle: 'Aliyun Qwen3-ASR-Flash-Realtime',
            labelAliyunKey: 'API Key',
            aliyunKeyPlaceholder: 'Enter your DashScope API key',
            labelAliyunRegion: 'Region',
            labelAliyunModel: 'Model',
            aliyunModelPlaceholder: 'qwen3-asr-flash-realtime',
            aliyunHint: 'Official model name: qwen3-asr-flash-realtime',

            saveBtn: 'Save Settings',
            testBtn: 'Test Connection',
            testing: 'Testing…',
            toggleTitle: 'Show/Hide',

            notesTitle: 'Usage Notes',
            note1: '• Recording uses only one selected speech provider.',
            note2: '• Deepgram requires manual Chinese/English selection.',
            note3: '• All credentials are stored locally in browser storage.',
            note4: '• Recording start is disabled when credentials are missing.',

            statusSaved: '✅ Settings saved',
            statusMissingDg: '⚠️ Deepgram API key is missing',
            statusMissingAliyun: '⚠️ Aliyun API key is missing',
            statusNeedDg: '⚠️ Please enter Deepgram API key first',
            statusNeedAliyun: '⚠️ Please enter Aliyun API key first',
            statusOkDg: '✅ Deepgram connection succeeded. API key is valid',
            statusBadDg: '❌ Invalid Deepgram API key. Please check and retry',
            statusServerDg: '⚠️ Deepgram returned {status}. Please retry later',
            statusNetworkDg: '❌ Unable to connect to Deepgram. Check network',
            statusOkAliyun: '✅ Aliyun connection succeeded. API key is valid',
            statusBadAliyun: '❌ Invalid Aliyun API key, or it does not match the selected region. Please check and retry',
            statusBadAliyunFormat: '❌ Aliyun API key contains invalid characters (e.g. non-ASCII/full-width symbols). Re-copy the key',
            statusServerAliyun: '⚠️ Aliyun returned {status}. Please retry later',
            statusNetworkAliyun: '❌ Unable to connect to Aliyun. Check network'
        }
    };

    function t(key, vars = {}) {
        const table = I18N[LOCALE] || I18N.en;
        let text = table[key] || I18N.en[key] || key;
        for (const [k, v] of Object.entries(vars)) {
            text = text.replaceAll(`{${k}}`, String(v));
        }
        return text;
    }

    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function normalizeProvider(provider) {
        if (provider === 'deepgram') return 'deepgram';
        return 'aliyun';
    }

    function normalizeCredentialValue(value) {
        return String(value || '')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/\s+/g, '')
            .trim();
    }

    function normalizeAliyunRegion(region) {
        if (region === 'intl' || region === 'us') return region;
        return 'cn';
    }

    function applyLocale() {
        document.documentElement.lang = isZh ? 'zh-CN' : 'en';
        document.title = t('pageTitle');

        setText('opt-kicker', t('kicker'));
        setText('opt-title', t('title'));
        setText('opt-subtitle', t('subtitle'));

        setText('opt-card-engine', t('cardEngine'));
        setText('opt-label-provider', t('labelProvider'));

        setText('opt-dg-title', t('dgTitle'));
        setText('opt-label-dg-key', t('labelDgKey'));
        setText('opt-label-dg-lang', t('labelDgLang'));
        setText('opt-hint-dg-lang', t('dgLangHint'));

        setText('opt-aliyun-title', t('aliyunTitle'));
        setText('opt-label-aliyun-key', t('labelAliyunKey'));
        setText('opt-label-aliyun-region', t('labelAliyunRegion'));
        setText('opt-label-aliyun-model', t('labelAliyunModel'));
        setText('opt-hint-aliyun', t('aliyunHint'));

        setText('opt-card-notes', t('notesTitle'));
        setText('opt-note-1', t('note1'));
        setText('opt-note-2', t('note2'));
        setText('opt-note-3', t('note3'));
        setText('opt-note-4', t('note4'));

        const dgHint = document.getElementById('opt-hint-dg-key');
        if (dgHint) dgHint.innerHTML = t('dgHintHtml');

        elDgKey.placeholder = t('dgKeyPlaceholder');
        elAliyunKey.placeholder = t('aliyunKeyPlaceholder');
        elAliyunModel.placeholder = t('aliyunModelPlaceholder');

        btnSave.textContent = t('saveBtn');
        btnTest.textContent = t('testBtn');

        document.querySelectorAll('[data-toggle-target]').forEach((btn) => {
            btn.title = t('toggleTitle');
        });

        const dgLangZh = elDgLang.querySelector('option[value="zh-CN"]');
        const dgLangEn = elDgLang.querySelector('option[value="en-US"]');
        if (dgLangZh) dgLangZh.textContent = isZh ? '中文' : 'Chinese';
        if (dgLangEn) dgLangEn.textContent = 'English';

        const providerOptAliyun = elProvider.querySelector('option[value="aliyun"]');
        if (providerOptAliyun) providerOptAliyun.textContent = isZh ? '阿里云（Qwen 实时语音）' : 'Aliyun (Qwen Realtime ASR)';

        const regionCn = elAliyunRegion.querySelector('option[value="cn"]');
        const regionUs = elAliyunRegion.querySelector('option[value="us"]');
        const regionIntl = elAliyunRegion.querySelector('option[value="intl"]');
        if (regionCn) regionCn.textContent = isZh ? '中国大陆（北京）' : 'China Mainland (Beijing)';
        if (regionUs) regionUs.textContent = isZh ? '美国（弗吉尼亚）' : 'US (Virginia)';
        if (regionIntl) regionIntl.textContent = isZh ? '国际站（新加坡）' : 'International (Singapore)';
    }

    function showStatus(msg, ok) {
        statusEl.textContent = msg;
        statusEl.style.display = '';
        statusEl.className = `status ${ok ? 'ok' : 'err'}`;
    }

    function hideStatus() {
        statusEl.className = 'status';
        statusEl.style.display = '';
    }

    function renderProvider(provider) {
        const normalizedProvider = normalizeProvider(provider);
        providerDeepgram.classList.toggle('hidden', normalizedProvider !== 'deepgram');
        providerAliyun.classList.toggle('hidden', normalizedProvider !== 'aliyun');
    }

    function getProviderCredentialsStatus(provider, data) {
        if (normalizeProvider(provider) === 'deepgram') {
            return Boolean(String(data.deepgramKey || '').trim());
        }
        return Boolean(String(data.aliyunKey || '').trim());
    }

    function getMissingStatusText(provider) {
        if (normalizeProvider(provider) === 'deepgram') return t('statusMissingDg');
        return t('statusMissingAliyun');
    }

    function collectFormData() {
        return {
            sttProvider: normalizeProvider((elProvider.value || DEFAULTS.sttProvider).trim()),
            deepgramKey: normalizeCredentialValue(elDgKey.value),
            deepgramLang: (elDgLang.value || DEFAULTS.deepgramLang).trim(),
            aliyunKey: normalizeCredentialValue(elAliyunKey.value),
            aliyunRegion: normalizeAliyunRegion((elAliyunRegion.value || DEFAULTS.aliyunRegion).trim()),
            aliyunModel: (elAliyunModel.value.trim() || DEFAULTS.aliyunModel)
        };
    }

    function applyFormData(data) {
        const merged = { ...DEFAULTS, ...(data || {}) };
        const normalizedProvider = normalizeProvider(merged.sttProvider);
        elProvider.value = normalizedProvider;
        if (normalizedProvider !== merged.sttProvider) {
            chrome.storage.local.set({ sttProvider: normalizedProvider });
        }

        elDgKey.value = merged.deepgramKey || '';
        elDgLang.value = (merged.deepgramLang === 'en-US' ? 'en-US' : 'zh-CN');
        elAliyunKey.value = merged.aliyunKey || '';
        elAliyunRegion.value = normalizeAliyunRegion(merged.aliyunRegion);
        elAliyunModel.value = merged.aliyunModel || DEFAULTS.aliyunModel;

        renderProvider(normalizedProvider);
    }

    function getAliyunRegionCandidates(preferredRegion) {
        const first = normalizeAliyunRegion(preferredRegion);
        return Array.from(new Set([first, 'cn', 'us', 'intl']));
    }

    function getAliyunBase(region) {
        const normalized = normalizeAliyunRegion(region);
        if (normalized === 'intl') return 'https://dashscope-intl.aliyuncs.com';
        if (normalized === 'us') return 'https://dashscope-us.aliyuncs.com';
        return 'https://dashscope.aliyuncs.com';
    }

    function containsNonLatin1(text) {
        const value = String(text || '');
        for (let i = 0; i < value.length; i++) {
            if (value.charCodeAt(i) > 255) return true;
        }
        return false;
    }

    async function testDeepgram(key) {
        try {
            const res = await fetch('https://api.deepgram.com/v1/projects', {
                headers: { Authorization: `Token ${key}` }
            });
            if (res.ok) {
                showStatus(t('statusOkDg'), true);
            } else if (res.status === 401 || res.status === 403) {
                showStatus(t('statusBadDg'), false);
            } else {
                showStatus(t('statusServerDg', { status: res.status }), false);
            }
        } catch {
            showStatus(t('statusNetworkDg'), false);
        }
    }

    async function testAliyun(key, region) {
        const normalizedKey = normalizeCredentialValue(key);
        const normalizedRegion = normalizeAliyunRegion(region);
        if (normalizedKey !== key) {
            elAliyunKey.value = normalizedKey;
        }
        if (containsNonLatin1(normalizedKey)) {
            showStatus(t('statusBadAliyunFormat'), false);
            return;
        }

        const candidates = getAliyunRegionCandidates(normalizedRegion);
        let fallbackRegion = '';
        let sawAuthFailure = false;
        let serverStatus = 0;
        let networkDetail = '';

        for (const rg of candidates) {
            const base = getAliyunBase(rg);
            try {
                const res = await fetch(`${base}/compatible-mode/v1/models`, {
                    method: 'GET',
                    headers: { Authorization: `Bearer ${normalizedKey}` }
                });
                if (res.ok) {
                    if (rg !== normalizedRegion) fallbackRegion = rg;
                    if (fallbackRegion) {
                        elAliyunRegion.value = fallbackRegion;
                        chrome.storage.local.set({ aliyunRegion: fallbackRegion });
                    }
                    showStatus(t('statusOkAliyun'), true);
                    return;
                }
                if (res.status === 401 || res.status === 403) {
                    sawAuthFailure = true;
                    continue;
                }
                serverStatus = serverStatus || res.status;
            } catch (e) {
                const msg = String(e?.message || e || '');
                if (/ISO-8859-1|code point/i.test(msg)) {
                    showStatus(t('statusBadAliyunFormat'), false);
                    return;
                }
                networkDetail = msg || networkDetail;
            }
        }

        if (serverStatus) {
            showStatus(t('statusServerAliyun', { status: serverStatus }), false);
            return;
        }
        if (sawAuthFailure) {
            showStatus(t('statusBadAliyun'), false);
            return;
        }
        const detail = networkDetail ? ` (${networkDetail})` : '';
        showStatus(`${t('statusNetworkAliyun')}${detail}`, false);
    }

    function bindVisibilityToggles() {
        document.querySelectorAll('[data-toggle-target]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-toggle-target');
                const input = document.getElementById(targetId);
                if (!input) return;
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                btn.textContent = isPassword ? '🙈' : '👁️';
            });
        });
    }

    function bindEvents() {
        elProvider.addEventListener('change', () => {
            renderProvider(normalizeProvider(elProvider.value));
            hideStatus();
        });

        btnSave.addEventListener('click', () => {
            const data = collectFormData();
            chrome.storage.local.set(data, () => {
                const ok = getProviderCredentialsStatus(data.sttProvider, data);
                showStatus(ok ? t('statusSaved') : getMissingStatusText(data.sttProvider), ok);
            });
        });

        btnTest.addEventListener('click', async () => {
            const data = collectFormData();
            const provider = data.sttProvider;

            btnTest.disabled = true;
            btnTest.textContent = t('testing');
            hideStatus();

            try {
                if (provider === 'deepgram') {
                    if (!data.deepgramKey) {
                        showStatus(t('statusNeedDg'), false);
                    } else {
                        await testDeepgram(data.deepgramKey);
                    }
                } else if (!data.aliyunKey) {
                    showStatus(t('statusNeedAliyun'), false);
                } else {
                    await testAliyun(data.aliyunKey, data.aliyunRegion);
                }
            } finally {
                btnTest.disabled = false;
                btnTest.textContent = t('testBtn');
            }
        });
    }

    function init() {
        applyLocale();
        bindVisibilityToggles();
        bindEvents();

        chrome.storage.local.get(STORAGE_KEYS, (data) => {
            applyFormData(data);
        });
    }

    init();
})();

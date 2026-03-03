// Onvord Side Panel Logic
(function () {
    'use strict';

    let currentView = 'idle';
    let startTime = 0;
    let timer = null;
    let currentSOP = null;
    // evCount removed — step count now derived from timeline groups
    let audioCtx = null;
    let analyser = null;
    let micStream = null;
    let volAnimId = null;

    /* ── DOM refs ── */
    const $ = id => document.getElementById(id);
    const views = { idle: $('view-idle'), recording: $('view-recording') };
    const btnStart = $('btn-start'), btnStop = $('btn-stop');
    const btnPause = $('btn-pause');
    const btnRedo = $('btn-redo');
    const recTimer = $('rec-timer'), voiceBox = $('voice-box');
    const recBarEl = document.querySelector('#view-recording .rec-bar');
    const recActionsEl = $('rec-actions');
    const previewActionsEl = $('preview-actions');
    const recLabelEl = $('rec-label');
    const evList = $('ev-list'), evCountBadge = $('ev-count');
    const imgViewerEl = $('img-viewer');
    const imgViewerCloseEl = $('img-viewer-close');
    const imgViewerImgEl = $('img-viewer-img');
    const toastEl = $('toast');
    const micStatusEl = $('mic-status');
    const volIndicator = $('vol-indicator');
    const volBars = volIndicator ? Array.from(volIndicator.querySelectorAll('.vol-bar')) : [];

    /* ── Helpers ── */
    function switchView(v) {
        currentView = v;
        Object.entries(views).forEach(([k, el]) => {
            if (!el) return;
            el.classList.toggle('active', k === v);
        });
    }
    function fmtTime(ms) { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
    function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); setTimeout(() => toastEl.classList.remove('show'), 2000); }
    function normalizeNarrationText(text) {
        return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    }
    function isMeaningfulNarration(text) {
        const normalized = normalizeNarrationText(text);
        if (!normalized) return false;
        const core = normalized.replace(/[.。,…，、!！?？~～\-—_·•:：;；'"`“”‘’()（）[\]【】{}<>《》|\\/+=*&^%$#@\s]/g, '');
        return core.length > 0;
    }
    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function normalizeExternalUrl(url) {
        if (!url) return '';
        try {
            const u = new URL(url);
            if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
        } catch { /* noop */ }
        return '';
    }
    function normalizeImageSrc(src) {
        const s = String(src || '');
        if (s.startsWith('data:image/')) return s;
        if (s.startsWith('http://') || s.startsWith('https://')) return s;
        return '';
    }
    function safeFilename(name) {
        return String(name || 'SOP')
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
            .replace(/\s+/g, '_')
            .slice(0, 120);
    }
    function openMicPermissionGuide() {
        try {
            chrome.tabs.create({ url: chrome.runtime.getURL('mic-permission.html') });
        } catch (e) {
            console.warn('Open mic permission guide failed:', e);
        }
    }

    let isPaused = false;
    let pausedDuration = 0;
    const RECORDING_LIMIT_MS = 10 * 60 * 1000;

    function evIcon(t) {
        switch (t) {
            case 'click': return '👆';
            case 'input': return '⌨️';
            case 'navigate': case 'navigation': return '🔗';
            case 'scroll': return '📍';
            case 'select': return '📋';
            case 'keypress': return '⌨️';
            default: return '⚡';
        }
    }

    function updateTimerDisplay(elapsedMs) {
        recTimer.textContent = fmtTime(elapsedMs);
        recTimer.classList.toggle('warn', (RECORDING_LIMIT_MS - elapsedMs) <= 30000);
    }

    /* ── Audio Volume Visualizer ── */
    function startVolumeVis(stream) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 64;
            const src = audioCtx.createMediaStreamSource(stream);
            src.connect(analyser);
            const data = new Uint8Array(analyser.frequencyBinCount);
            volIndicator?.classList.add('active');

            function draw() {
                volAnimId = requestAnimationFrame(draw);
                analyser.getByteFrequencyData(data);
                const bands = [2, 4, 6, 8, 10];
                for (let i = 0; i < volBars.length; i++) {
                    const val = data[bands[i]] || 0;
                    const h = Math.max(3, (val / 255) * 14);
                    volBars[i].style.height = h + 'px';
                }
            }
            draw();
        } catch (e) { console.warn('Volume vis failed:', e); }
    }

    function stopVolumeVis() {
        if (volAnimId) { cancelAnimationFrame(volAnimId); volAnimId = null; }
        if (audioCtx) { audioCtx.close().catch(() => { }); audioCtx = null; analyser = null; }
        if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
        volIndicator?.classList.remove('active');
        volBars.forEach(b => b.style.height = '3px');
    }

    /* ── Speech-to-Text Engine ── */
    let sttEngine = null;
    let dgSocket = null;
    let mediaRecorder = null;
    let sttStream = null;
    let sttLastFailure = '';
    let preferredMicDeviceId = '';
    let pendingInterimNarration = '';
    let lastFinalNarrationText = '';

    async function ensureMicPermission() {
        const permissionState = await navigator.permissions.query({ name: 'microphone' })
            .then(r => r.state)
            .catch(() => 'unknown');
        const audioInputs = await navigator.mediaDevices.enumerateDevices()
            .then(list => list.filter(d => d.kind === 'audioinput'))
            .catch(() => []);
        console.info('Onvord mic permission state:', permissionState);
        console.info('Onvord audioinput devices:', audioInputs.map((d, i) => ({
            idx: i,
            label: d.label || '(no-label)',
            idTail: (d.deviceId || '').slice(-8)
        })));

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const defaultTrack = stream.getAudioTracks()[0];
            const defaultId = defaultTrack?.getSettings?.().deviceId || '';
            if (defaultId) preferredMicDeviceId = defaultId;
            stream.getTracks().forEach(t => t.stop());
            return { ok: true };
        } catch (e) {
            const name = e?.name || 'unknown';
            console.warn('Microphone permission preflight failed:', name, e?.message || '');
            if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
                // Fallback: default input may be stale/unavailable, retry each concrete input device id.
                for (const dev of audioInputs) {
                    if (!dev.deviceId) continue;
                    try {
                        const stream = await navigator.mediaDevices.getUserMedia({
                            audio: { deviceId: { exact: dev.deviceId } }
                        });
                        stream.getTracks().forEach(t => t.stop());
                        preferredMicDeviceId = dev.deviceId;
                        return { ok: true };
                    } catch { /* try next device */ }
                }
            }
            return { ok: false, error: name, permissionState, deviceCount: audioInputs.length };
        }
    }

    async function getMicStreamForUse() {
        if (preferredMicDeviceId) {
            try {
                return await navigator.mediaDevices.getUserMedia({
                    audio: { deviceId: { exact: preferredMicDeviceId } }
                });
            } catch {
                preferredMicDeviceId = '';
            }
        }
        return await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    function toDeepgramLanguage(lang) {
        if (lang === 'zh' || lang === 'zh-CN') return 'zh-CN';
        if (lang === 'en' || lang === 'en-US') return 'en-US';
        return 'zh-CN';
    }

    async function probeDeepgram(apiKey) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 6000);
        try {
            const res = await fetch('https://api.deepgram.com/v1/projects', {
                method: 'GET',
                headers: { Authorization: `Token ${apiKey}` },
                signal: ctrl.signal
            });
            if (res.ok) return { ok: true, reason: 'ok' };
            if (res.status === 401 || res.status === 403) return { ok: false, reason: 'deepgram-key-invalid', status: res.status };
            return { ok: false, reason: 'deepgram-server', status: res.status };
        } catch (e) {
            if (e?.name === 'AbortError') return { ok: false, reason: 'deepgram-network-timeout' };
            return { ok: false, reason: 'deepgram-network' };
        } finally {
            clearTimeout(t);
        }
    }

    /* ── Deepgram WebSocket STT ── */
    async function initDeepgram(stream, apiKey, lang, micStatusEl) {
        const params = new URLSearchParams({
            model: 'nova-2',
            language: toDeepgramLanguage(lang),
            smart_format: 'true',
            interim_results: 'true',
            utterance_end_ms: '3000',
            vad_events: 'true',
            punctuate: 'true',
        });
        const wsUrl = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

        try {
            dgSocket = new WebSocket(wsUrl, ['token', apiKey]);
        } catch (e) {
            if (micStatusEl) micStatusEl.classList.add('error');
            console.error('Deepgram WS error:', e);
            return { ok: false, reason: 'deepgram-ws-constructor' };
        }

        return await new Promise((resolve) => {
            let settled = false;
            let opened = false;
            const finish = (ok, reason) => {
                if (settled) return;
                settled = true;
                clearTimeout(handshakeTimer);
                resolve({ ok, reason });
            };
            const handshakeTimer = setTimeout(() => {
                try { dgSocket?.close(); } catch { /* noop */ }
                finish(false, 'deepgram-ws-timeout');
            }, 7000);

            dgSocket.onopen = () => {
                opened = true;
                console.log('Deepgram connected');
                try {
                    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
                    mediaRecorder.ondataavailable = (e) => {
                        if (e.data.size > 0 && dgSocket && dgSocket.readyState === WebSocket.OPEN) {
                            dgSocket.send(e.data);
                        }
                    };
                    mediaRecorder.start(250);
                    finish(true, 'ok');
                } catch (e) {
                    console.error('MediaRecorder error:', e);
                    if (micStatusEl) micStatusEl.classList.add('error');
                    finish(false, 'media-recorder-error');
                }
            };

            dgSocket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'SpeechStarted') {
                        updateListeningPlaceholder();
                        chrome.runtime.sendMessage({
                            type: 'VOICE_STARTED',
                            timestamp: Date.now() - startTime,
                            audio_start: msg.start || (Date.now() - startTime)
                        }).catch(() => {});
                        return;
                    }
                    if (msg.type === 'UtteranceEnd') {
                        const interim = evList.querySelector('.tl-narration-interim');
                        if (interim) interim.remove();
                        chrome.runtime.sendMessage({ type: 'VOICE_ENDED', timestamp: Date.now() - startTime }).catch(() => {});
                        return;
                    }
                    if (msg.type === 'Results' && msg.channel) {
                        const alt = msg.channel.alternatives[0];
                        if (!alt || !alt.transcript) return;
                        const transcript = normalizeNarrationText(alt.transcript);
                        if (msg.is_final) {
                            pendingInterimNarration = '';
                            const ts = Date.now() - startTime;
                            if (isMeaningfulNarration(transcript)) {
                                lastFinalNarrationText = transcript;
                                chrome.runtime.sendMessage({ type: 'NARRATION_EVENT', text: transcript, timestamp: ts, isFinal: true });
                                appendNarrationToTimeline(transcript, ts);
                            }
                        } else {
                            // "说完再现"：录制中只显示正在聆听占位，不展示 partial 文本。
                            pendingInterimNarration = '';
                        }
                    }
                } catch (e) { /* ignore */ }
            };

            dgSocket.onerror = (e) => {
                const stateMap = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
                console.error('Deepgram WS error:', {
                    readyState: stateMap[dgSocket?.readyState ?? 3] || String(dgSocket?.readyState),
                    url: wsUrl,
                    eventType: e?.type || 'error'
                });
                if (micStatusEl) micStatusEl.classList.add('error');
                if (!opened) finish(false, 'deepgram-ws-error');
            };

            dgSocket.onclose = (e) => {
                console.log('Deepgram WS closed:', e.code, e.reason);
                if (!opened) {
                    finish(false, `deepgram-ws-close-${e.code || 'unknown'}`);
                    return;
                }
                if (currentView === 'recording' && e.code !== 1000) {
                    if (micStatusEl) micStatusEl.classList.add('error');
                    toast('语音连接已断开，请暂停后继续重连');
                }
            };
        });
    }

    function flushPendingInterimNarration() {
        const text = normalizeNarrationText(pendingInterimNarration || '');
        if (!isMeaningfulNarration(text)) {
            pendingInterimNarration = '';
            return;
        }
        if (text === lastFinalNarrationText) {
            pendingInterimNarration = '';
            return;
        }
        const ts = Date.now() - startTime;
        pendingInterimNarration = '';
        lastFinalNarrationText = text;
        chrome.runtime.sendMessage({ type: 'NARRATION_EVENT', text, timestamp: ts, isFinal: true }).catch(() => {});
        appendNarrationToTimeline(text, ts);
    }

    function stopSTT(options = {}) {
        const { flushInterim = true } = options;
        const interim = evList.querySelector('.tl-narration-interim');
        if (interim) interim.remove();
        if (flushInterim) {
            flushPendingInterimNarration();
        } else {
            pendingInterimNarration = '';
            lastFinalNarrationText = '';
        }
        // Stop Deepgram
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            try { mediaRecorder.stop(); } catch {}
        }
        mediaRecorder = null;
        if (sttStream) {
            sttStream.getTracks().forEach(t => t.stop());
            sttStream = null;
        }
        if (dgSocket) {
            if (dgSocket.readyState === WebSocket.OPEN) {
                try { dgSocket.send(JSON.stringify({ type: 'Finalize' })); } catch {}
                setTimeout(() => {
                    if (dgSocket && dgSocket.readyState === WebSocket.OPEN) {
                        try { dgSocket.send(JSON.stringify({ type: 'CloseStream' })); } catch {}
                        dgSocket.close(1000);
                    }
                }, 220);
            }
            dgSocket = null;
        }
        sttEngine = null;
    }

    async function initSTT() {
        stopSTT({ flushInterim: false });
        sttLastFailure = '';
        micStatusEl?.classList.remove('error');

        const data = await new Promise(resolve => {
            chrome.storage.local.get(['deepgramKey', 'deepgramLang'], resolve);
        });
        const savedLang = String(data.deepgramLang || '');
        const lang = savedLang === 'zh' ? 'zh-CN'
            : savedLang === 'en' ? 'en-US'
                : (savedLang === 'en-US' || savedLang === 'zh-CN' ? savedLang : 'zh-CN');
        const apiKey = (data.deepgramKey || '').trim();

        if (!apiKey) {
            sttLastFailure = 'missing-key';
            micStatusEl?.classList.add('error');
            return false;
        }

        try {
            // Deepgram needs an actual audio stream; preflight once more with device fallback.
            const mic = await ensureMicPermission();
            if (!mic.ok) {
                if (mic.error === 'NotFoundError' || mic.error === 'DevicesNotFoundError') {
                    if (mic.permissionState === 'denied') {
                        sttLastFailure = 'mic-denied';
                    } else {
                        sttLastFailure = 'no-mic-device';
                    }
                } else if (mic.error === 'NotReadableError' || mic.error === 'TrackStartError' || mic.error === 'AbortError') {
                    sttLastFailure = 'mic-unavailable';
                } else {
                    sttLastFailure = 'mic-denied';
                }
                micStatusEl?.classList.add('error');
                return false;
            }
            sttStream = await getMicStreamForUse();
            const deepgramStarted = await initDeepgram(sttStream, apiKey, lang, micStatusEl);
            if (!deepgramStarted.ok) {
                sttStream.getTracks().forEach(t => t.stop());
                sttStream = null;
                const probe = await probeDeepgram(apiKey);
                if (!probe.ok && probe.reason === 'deepgram-key-invalid') {
                    sttLastFailure = 'deepgram-key-invalid';
                } else if (!probe.ok && (probe.reason === 'deepgram-network' || probe.reason === 'deepgram-network-timeout')) {
                    sttLastFailure = 'deepgram-network';
                } else {
                    sttLastFailure = deepgramStarted.reason || 'deepgram-init-failed';
                }
                micStatusEl?.classList.add('error');
                return false;
            }
            sttEngine = 'deepgram';
            return true;
        } catch (e) {
            console.error('Deepgram init failed:', e);
            sttLastFailure = 'deepgram-init-failed';
            micStatusEl?.classList.add('error');
            return false;
        }
    }

    /* ── Hybrid Timeline ── */
    // Narration: full-width blocks. If last item is narration, append to it.
    // Actions: inline pills inside a flex container. If last item is an action container, add pill to it.

    function clearPlaceholder() {
        const ph = evList.querySelector('.placeholder'); if (ph) ph.remove();
    }

    function getLastTimelineItem() {
        return evList.lastElementChild;
    }

    function appendNarrationToTimeline(text, timestamp) {
        const normalized = normalizeNarrationText(text);
        if (!isMeaningfulNarration(normalized)) return;
        clearPlaceholder();

        // Check for interim narration — convert it in-place (preserves position in timeline)
        // This prevents speech from jumping to the end when actions arrive during STT latency
        const interim = evList.querySelector('.tl-narration-interim');
        if (interim) {
            interim.classList.remove('tl-narration-interim');
            const span = interim.querySelector('.tl-narr-text');
            if (span) {
                span.classList.remove('voice-interim');
                span.textContent = normalized;
            }
            evList.scrollTop = evList.scrollHeight;
            updateStepCount();
            return;
        }

        // No interim — check if last item is narration, append to it
        const last = getLastTimelineItem();
        if (last && last.classList.contains('tl-narration')) {
            const span = last.querySelector('.tl-narr-text');
            if (span) span.textContent += normalized;
        } else {
            const d = document.createElement('div');
            d.className = 'tl-narration';
            const icon = document.createElement('span');
            icon.className = 'tl-narr-icon';
            icon.textContent = '🎙️';
            const safeText = document.createElement('span');
            safeText.className = 'tl-narr-text';
            safeText.textContent = normalized;
            d.appendChild(icon);
            d.appendChild(safeText);
            evList.appendChild(d);
        }
        evList.scrollTop = evList.scrollHeight;
        updateStepCount();
    }

    function updateInterimNarration(text) {
        const normalized = normalizeNarrationText(text);
        if (!isMeaningfulNarration(normalized)) return;
        clearPlaceholder();
        let interim = evList.querySelector('.tl-narration-interim');
        if (!interim) {
            interim = document.createElement('div');
            interim.className = 'tl-narration tl-narration-interim';
            const icon = document.createElement('span');
            icon.className = 'tl-narr-icon';
            icon.textContent = '🎙️';
            const span = document.createElement('span');
            span.className = 'tl-narr-text voice-interim';
            interim.appendChild(icon);
            interim.appendChild(span);
            evList.appendChild(interim);
        }
        const span = interim.querySelector('.tl-narr-text');
        if (span) span.textContent = normalized;
        evList.scrollTop = evList.scrollHeight;
    }

    function updateListeningPlaceholder() {
        clearPlaceholder();
        let interim = evList.querySelector('.tl-narration-interim');
        if (!interim) {
            interim = document.createElement('div');
            interim.className = 'tl-narration tl-narration-interim';
            const icon = document.createElement('span');
            icon.className = 'tl-narr-icon';
            icon.textContent = '🎙️';
            const span = document.createElement('span');
            span.className = 'tl-narr-text voice-interim';
            interim.appendChild(icon);
            interim.appendChild(span);
            evList.appendChild(interim);
        }
        const span = interim.querySelector('.tl-narr-text');
        if (span) span.textContent = '识别中';
        evList.scrollTop = evList.scrollHeight;
    }

    function updateStepCount() {
        // Count top-level timeline groups (narration blocks + action containers) as "big steps"
        const groups = evList.querySelectorAll(':scope > .tl-narration:not(.tl-narration-interim), :scope > .tl-actions');
        evCountBadge.textContent = groups.length;
    }

    function openImageViewer(src, altText) {
        if (!imgViewerEl || !imgViewerImgEl || !src) return;
        imgViewerImgEl.src = src;
        imgViewerImgEl.alt = altText || '截图预览';
        imgViewerEl.classList.remove('hidden');
        imgViewerEl.setAttribute('aria-hidden', 'false');
    }

    function closeImageViewer() {
        if (!imgViewerEl || !imgViewerImgEl) return;
        imgViewerEl.classList.add('hidden');
        imgViewerEl.setAttribute('aria-hidden', 'true');
        imgViewerImgEl.removeAttribute('src');
    }

    function getInlineScreenshotSrc(payload) {
        return normalizeImageSrc(payload?.screenshot || payload?.screenshot_base64 || '');
    }

    function setPillText(pill, text) {
        if (!pill) return;
        let textEl = pill.querySelector('.ev-pill-text');
        if (!textEl) {
            textEl = document.createElement('span');
            textEl.className = 'ev-pill-text';
            pill.prepend(textEl);
        }
        textEl.textContent = text;
    }

    function upsertPillThumb(pill, src, altText) {
        if (!pill) return;
        const safeImage = normalizeImageSrc(src);
        let thumbBtn = pill.querySelector('.ev-thumb-btn');
        if (!safeImage) {
            if (thumbBtn) thumbBtn.remove();
            pill.classList.remove('has-thumb');
            return;
        }
        if (!thumbBtn) {
            thumbBtn = document.createElement('button');
            thumbBtn.type = 'button';
            thumbBtn.className = 'ev-thumb-btn';
            thumbBtn.setAttribute('aria-label', '查看截图');

            const thumb = document.createElement('img');
            thumb.className = 'ev-thumb';
            thumb.alt = '';
            thumb.loading = 'lazy';
            thumb.decoding = 'async';
            thumbBtn.appendChild(thumb);
            pill.appendChild(thumbBtn);
        }
        thumbBtn.setAttribute('data-full-src', safeImage);
        thumbBtn.setAttribute('data-alt', altText || '截图预览');
        const thumb = thumbBtn.querySelector('.ev-thumb');
        if (thumb) thumb.src = safeImage;
        pill.classList.add('has-thumb');
    }

    function applyScreenshotToTimeline(timestamp, screenshot) {
        if (timestamp == null) return;
        const safeImage = normalizeImageSrc(screenshot);
        if (!safeImage) return;
        const pills = evList.querySelectorAll(`.ev-pill[data-ts="${String(timestamp)}"]`);
        if (!pills.length) return;
        pills.forEach((pill) => {
            const type = pill.getAttribute('data-type') || '操作';
            const label = pill.querySelector('.ev-pill-text')?.textContent || type;
            upsertPillThumb(pill, safeImage, `${type}：${label}`);
        });
    }

    function addActionPill(ev) {
        clearPlaceholder();

        const icon = evIcon(ev.actionType);
        let label = '';
        switch (ev.actionType) {
            case 'click': label = `点击 ${ev.target?.description || '元素'}`; break;
            case 'input': label = `输入「${(ev.value || '').substring(0, 15)}」`; break;
            case 'navigate': case 'navigation': label = ev.pageTitle || '页面'; break;
            case 'scroll': label = '滚动'; break;
            case 'select': label = `选择「${(ev.value || '').substring(0, 15)}」`; break;
            case 'keypress': label = ev.key || ev.value || '快捷键'; break;
            default: label = ev.actionType;
        }

        // For input events, update the last input pill instead of creating a new one
        if (ev.actionType === 'input') {
            const last = getLastTimelineItem();
            if (last && last.classList.contains('tl-actions')) {
                const lastPill = last.querySelector('.ev-pill[data-type="input"]:last-of-type');
                if (lastPill) {
                    lastPill.classList.add('ev-pill-preview');
                    if (ev.timestamp != null) lastPill.setAttribute('data-ts', String(ev.timestamp));
                    setPillText(lastPill, `${icon} ${label}`);
                    lastPill.setAttribute('title', `${fmtTime(ev.timestamp)} — ${label}`);
                    const shot = getInlineScreenshotSrc(ev);
                    if (shot) upsertPillThumb(lastPill, shot, `${fmtTime(ev.timestamp)} — ${label}`);
                    return; // Updated in place, no new pill needed
                }
            }
        }

        // Merge continuous scrolls to one pill in live timeline.
        if (ev.actionType === 'scroll') {
            const last = getLastTimelineItem();
            if (last && last.classList.contains('tl-actions')) {
                const tail = last.lastElementChild;
                if (tail && tail.classList.contains('ev-pill') && tail.getAttribute('data-type') === 'scroll') {
                    const count = Number(tail.getAttribute('data-count') || '1') + 1;
                    tail.setAttribute('data-count', String(count));
                    tail.classList.add('ev-pill-preview');
                    if (ev.timestamp != null) tail.setAttribute('data-ts', String(ev.timestamp));
                    setPillText(tail, `${icon} 滚动 x${count}`);
                    tail.setAttribute('title', `${fmtTime(ev.timestamp)} — 滚动（合并 ${count} 次）`);
                    const shot = getInlineScreenshotSrc(ev);
                    if (shot) upsertPillThumb(tail, shot, `${fmtTime(ev.timestamp)} — 滚动（合并 ${count} 次）`);
                    return;
                }
            }
        }

        const pill = document.createElement('span');
        pill.className = 'ev-pill ev-pill-preview';
        pill.setAttribute('data-type', ev.actionType);
        if (ev.timestamp != null) pill.setAttribute('data-ts', String(ev.timestamp));
        pill.setAttribute('title', `${fmtTime(ev.timestamp)} — ${label}`);
        setPillText(pill, `${icon} ${label}`);
        const shot = getInlineScreenshotSrc(ev);
        if (shot) upsertPillThumb(pill, shot, `${fmtTime(ev.timestamp)} — ${label}`);

        const last = getLastTimelineItem();
        if (last && last.classList.contains('tl-actions')) {
            last.appendChild(pill);
        } else {
            const container = document.createElement('div');
            container.className = 'tl-actions';
            container.appendChild(pill);
            evList.appendChild(container);
        }
        evList.scrollTop = evList.scrollHeight;
        updateStepCount();
    }

    /* ── SOP rendering (timeline-based preview) ── */
    function compactLabel(text, maxLen = 22) {
        const t = normalizeNarrationText(text);
        if (!t) return '';
        return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
    }

    function getPreviewActionLabel(step) {
        const action = step?.action || {};
        const type = action.type || '';
        const rawDesc = normalizeNarrationText(action.description || '');
        if (rawDesc) return compactLabel(rawDesc, 26);

        switch (type) {
            case 'click': return '点击元素';
            case 'input': return compactLabel(`输入「${action.value || ''}」`, 22) || '输入';
            case 'navigate':
            case 'navigation': return compactLabel(action.page_title || action.url || '页面跳转', 24);
            case 'scroll': return '滚动';
            case 'select': return compactLabel(`选择「${action.value || ''}」`, 22) || '选择';
            case 'keypress': return compactLabel(action.key || action.value || '快捷键', 18);
            default: return compactLabel(type || '操作', 22);
        }
    }

    function createPreviewPill(step) {
        const action = step?.action || {};
        const actionType = action.type || 'action';
        const label = getPreviewActionLabel(step);
        const icon = evIcon(actionType);

        const pill = document.createElement('span');
        pill.className = 'ev-pill ev-pill-preview';
        pill.setAttribute('data-type', actionType);
        if (step?.timestampMs != null) pill.setAttribute('data-ts', String(step.timestampMs));
        const ts = step?.timestamp || '';
        pill.setAttribute('title', `${ts ? `${ts} — ` : ''}${label}`);
        setPillText(pill, `${icon} ${label}`);
        const safeImage = normalizeImageSrc(step?.screenshot);
        if (safeImage) upsertPillThumb(pill, safeImage, `步骤 ${step?.stepNumber || ''} 截图`);

        return pill;
    }

    function renderSOP(sop) {
        currentSOP = sop;
        clearPlaceholder();
        evList.innerHTML = '';

        const segs = sop.segments || [];
        if (segs.length === 0 && sop.steps) {
            // Fallback: no segments, render flat steps
            segs.push({ type: 'silent', narration: '', steps: sop.steps });
        }

        let previewStepCount = 0;
        for (const seg of segs) {
            if (seg.type === 'voice' && isMeaningfulNarration(seg.narration)) {
                const hdr = document.createElement('div');
                hdr.className = 'tl-narration';
                const icon = document.createElement('span');
                icon.className = 'tl-narr-icon';
                icon.textContent = '🎙️';
                const text = document.createElement('span');
                text.className = 'tl-narr-text';
                text.textContent = seg.narration;
                hdr.appendChild(icon);
                hdr.appendChild(text);
                if (seg.timeRange) {
                    const tm = document.createElement('span');
                    tm.className = 'tl-narr-meta';
                    tm.textContent = seg.timeRange;
                    hdr.appendChild(tm);
                }
                evList.appendChild(hdr);
            }

            const steps = seg.steps || [];
            if (steps.length > 0) {
                const container = document.createElement('div');
                container.className = 'tl-actions';
                for (const s of steps) {
                    container.appendChild(createPreviewPill(s));
                    previewStepCount += 1;
                }
                evList.appendChild(container);
            }
        }

        if (!evList.children.length) {
            evList.innerHTML = '<div class="placeholder">没有可预览内容</div>';
        }
        evCountBadge.textContent = String(previewStepCount || sop.totalSteps || 0);
        evList.scrollTop = 0;
    }

    /* ── Actions ── */
    function disableStartButton(msg) {
        btnStart.disabled = true;
        btnStart.classList.add('btn-disabled');
        btnStart.innerHTML = '<span class="bi">⏺</span>' + msg;
    }

    function enableStartButton() {
        btnStart.disabled = false;
        btnStart.classList.remove('btn-disabled');
        btnStart.innerHTML = '<span class="bi">⏺</span>开始录制';
    }

    function setPauseButton(paused) {
        if (!btnPause) return;
        btnPause.innerHTML = paused
            ? '<span class="bi">▶</span>继续'
            : '<span class="bi">⏸</span>暂停';
    }

    function setRecordingLayout(mode) {
        const isPreview = mode === 'preview';
        const isPausedState = mode === 'paused';
        recBarEl?.classList.toggle('done', isPreview);
        recBarEl?.classList.toggle('paused', isPausedState);
        if (mode === 'preview') {
            recActionsEl?.classList.add('hidden');
            previewActionsEl?.classList.remove('hidden');
            if (recLabelEl) recLabelEl.textContent = '录制完成';
            return;
        }
        recActionsEl?.classList.remove('hidden');
        previewActionsEl?.classList.add('hidden');
        closeImageViewer();
        if (recLabelEl) recLabelEl.textContent = mode === 'paused' ? '已暂停' : '录制中';
    }

    async function refreshStartEligibility() {
        if (currentView !== 'idle') return;
        const data = await new Promise(resolve => chrome.storage.local.get(['deepgramKey'], resolve));
        const apiKey = String(data.deepgramKey || '').trim();
        if (!apiKey) {
            disableStartButton('请先设置 API Key');
            return;
        }
        let micPermissionState = 'unknown';
        try {
            const res = await navigator.permissions.query({ name: 'microphone' });
            micPermissionState = res.state;
        } catch { /* noop */ }
        if (micPermissionState !== 'granted') {
            disableStartButton('请先授权麦克风');
            return;
        }
        enableStartButton();
    }

    let _starting = false;
    async function doStart() {
        if (_starting) return;
        _starting = true;
        try {
            btnStart.disabled = true;
            btnStart.textContent = '初始化语音识别…';

            // Step 1: Initialize STT — must succeed before recording
            const sttOk = await initSTT();

            if (!sttOk) {
                if (sttLastFailure === 'missing-key') {
                    disableStartButton('请先设置 API Key');
                    toast('请先在设置里配置 Deepgram API Key');
                } else if (sttLastFailure === 'mic-denied') {
                    enableStartButton();
                    toast('麦克风权限未授予，无法开始录制');
                    openMicPermissionGuide();
                } else if (sttLastFailure === 'no-mic-device') {
                    enableStartButton();
                    toast('未检测到麦克风设备，无法开始录制');
                } else if (sttLastFailure === 'mic-unavailable') {
                    enableStartButton();
                    toast('麦克风暂不可用（可能被占用），无法开始录制');
                } else if (sttLastFailure === 'deepgram-key-invalid') {
                    enableStartButton();
                    toast('Deepgram API Key 无效，请在设置中更新后重试');
                } else if (sttLastFailure === 'deepgram-network') {
                    enableStartButton();
                    toast('无法连接 Deepgram（网络或 DNS 问题）');
                } else {
                    enableStartButton();
                    toast('语音识别初始化失败，无法开始录制');
                }
                stopSTT();
                return;
            }

            // Step 2: STT ready — get mic for volume visualizer (optional, non-blocking)
            if (!micStream) {
                try {
                    micStream = await getMicStreamForUse();
                    startVolumeVis(micStream);
                } catch (e) { /* volume vis not available — not critical */ }
            }

            // Step 3: Start recording
            const res = await chrome.runtime.sendMessage({ type: 'START_RECORDING' });
            if (res?.success) {
                startTime = res.startTime;
                isPaused = false;
                pausedDuration = 0;
                currentSOP = null;
                evList.innerHTML = '<div class="placeholder">等待操作或说话…</div>';
                evCountBadge.textContent = '0';
                updateTimerDisplay(0);
                setPauseButton(false);
                switchView('recording');
                setRecordingLayout('live');
                timer = setInterval(() => {
                    if (!isPaused) updateTimerDisplay(Date.now() - startTime - pausedDuration);
                }, 1000);
            }
            enableStartButton();
        } catch (e) {
            console.error(e);
            toast('启动失败');
            enableStartButton();
        } finally {
            _starting = false;
        }
    }

    async function doStop() {
        btnStop.disabled = true; btnStop.textContent = '生成中…';
        if (btnPause) btnPause.disabled = true;
        clearInterval(timer); timer = null;
        stopSTT();
        stopVolumeVis();
        await new Promise(r => setTimeout(r, 420));
        try {
            const res = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
            if (res?.success && res.sop) {
                renderSOP(res.sop);
                switchView('recording');
                setRecordingLayout('preview');
            }
            else { toast('生成 SOP 失败'); switchView('idle'); }
        } catch (e) { console.error(e); toast('生成失败'); switchView('idle'); }
        btnStop.disabled = false; btnStop.innerHTML = '<span class="bi">⏹</span>停止录制';
        if (btnPause) {
            btnPause.disabled = false;
            setPauseButton(false);
        }
        isPaused = false;
    }

    async function doTogglePause() {
        if (currentView !== 'recording' || !btnPause) return;
        btnPause.disabled = true;
        try {
            if (!isPaused) {
                await chrome.runtime.sendMessage({ type: 'PAUSE_RECORDING' });
                isPaused = true;
                stopSTT({ flushInterim: false });
                stopVolumeVis();
                setPauseButton(true);
                setRecordingLayout('paused');
                toast('已暂停');
                return;
            }

            const sttOk = await initSTT();
            if (!sttOk) {
                toast('恢复语音识别失败，请检查麦克风和 API Key');
                return;
            }
            try {
                micStream = await getMicStreamForUse();
                startVolumeVis(micStream);
            } catch { /* non-blocking */ }
            await chrome.runtime.sendMessage({ type: 'RESUME_RECORDING' });
            isPaused = false;
            setPauseButton(false);
            setRecordingLayout('live');
            toast('已继续录制');
        } catch (e) {
            console.error(e);
            toast('暂停/继续失败');
        } finally {
            btnPause.disabled = false;
        }
    }

    function doExportHTML() {
        if (!currentSOP) return;
        const sop = currentSOP;
        let stepsHtml = '';
        let lastUrl = '';

        const segs = sop.segments || [{ type: 'silent', narration: '', steps: sop.steps || [] }];

        for (const seg of segs) {
            const isVoice = seg.type === 'voice' && seg.narration;
            stepsHtml += `<div class="sop-segment ${isVoice ? 'sop-seg-voice' : 'sop-seg-silent'}">`;
            if (isVoice) {
                stepsHtml += `<div class="seg-narration"><span class="seg-icon">🎙️</span><span class="seg-text">${escapeHtml(seg.narration)}</span>${seg.timeRange ? `<span class="seg-time">${escapeHtml(seg.timeRange)}</span>` : ''}</div>`;
            }
            for (const s of (seg.steps || [])) {
                const descHtml = escapeHtml(s.action?.description || s.action?.type || '操作');
                let body = '';
                const stepUrl = s.action?.url || '';
                if (stepUrl && stepUrl !== lastUrl) {
                    const safeUrl = normalizeExternalUrl(stepUrl);
                    if (safeUrl) {
                        body += `<div class="step-url">🔗 <a href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer noopener">${escapeHtml(stepUrl)}</a></div>`;
                    } else {
                        body += `<div class="step-url">🔗 ${escapeHtml(stepUrl)}</div>`;
                    }
                    lastUrl = stepUrl;
                }
                const safeImage = normalizeImageSrc(s.screenshot);
                if (safeImage) body += `<img class="step-img" src="${escapeHtml(safeImage)}" alt="步骤${escapeHtml(s.stepNumber)}" loading="lazy">`;
                if (s.action?.selector) body += `<details class="step-code-details"><summary class="step-code-summary">执行细节（给 Agent）</summary><div class="step-sel">${escapeHtml(s.action.selector)}</div></details>`;
                stepsHtml += `<article class="sop-step"><header class="sop-hdr"><span class="step-n">${escapeHtml(s.stepNumber)}</span><span class="step-act">${descHtml}</span><span class="step-t">${escapeHtml(s.timestamp || '')}</span></header>${body ? `<div class="sop-body">${body}</div>` : ''}</article>`;
            }
            stepsHtml += `</div>`;
        }

        const desc = `<section class="doc-desc"><h2>文档说明</h2><p>本文档由 Onvord 浏览器录制工具自动生成，记录了用户在浏览器中的操作流程。</p><p><strong>如何阅读：</strong><br>• 每个步骤包含一个操作描述（如“点击按钮”、“输入文字”、“选择文字”等）<br>• <strong>讲解</strong>：用户在操作时的语音讲解，说明每一步的意图和上下文<br>• <strong>截图</strong>：操作时刻的页面截图，蓝色圆点标记了操作位置<br>• <strong>执行细节（给 Agent）</strong>：被操作元素的 CSS 选择器路径（默认折叠），可用于自动化复现</p><p><strong>信息概要：</strong><br>• 起始页面：${escapeHtml(sop.startUrl || '')}<br>• 录制时间：${escapeHtml(sop.createdAt || '')}<br>• 共 ${escapeHtml(sop.totalSteps)} 个操作步骤，总时长 ${escapeHtml(fmtTime(sop.duration || 0))}</p></section>`;

        const sopJson = JSON.stringify(sop)
            .replace(/</g, '\\u003c')
            .replace(/-->/g, '--\\u003e');
        const html = `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(sop.title || 'SOP')}</title><style>:root{--bg:#eef3f8;--surface:#fff;--surface-2:#f7fafc;--line:#d8e2ec;--text:#102a43;--muted:#52667a;--muted-soft:#7b8ea4;--ac:#0b5fff;--ach:#2f80ff;--ac-g:rgba(11,95,255,.2);--r-md:14px;--r-lg:18px;--rf:999px}*{margin:0;padding:0;box-sizing:border-box}body{font-family:\"Public Sans\",\"Manrope\",-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;color:var(--text);line-height:1.65;background:radial-gradient(circle at 92% 6%,rgba(11,95,255,.12) 0%,transparent 32%),linear-gradient(180deg,#f8fbff 0%,var(--bg) 100%);padding:24px 16px;-webkit-font-smoothing:antialiased}img{max-width:100%}.shell{max-width:940px;margin:0 auto}.hero{border:1px solid var(--line);background:rgba(255,255,255,.94);backdrop-filter:blur(8px);border-radius:var(--r-lg);padding:18px;box-shadow:0 12px 24px rgba(12,27,61,.08);margin-bottom:12px}.hero-kicker{display:inline-flex;align-items:center;border-radius:var(--rf);border:1px solid #c4d3e2;background:#f4f8fd;color:#3c5471;padding:4px 10px;text-transform:uppercase;letter-spacing:.08em;font-size:10px;font-family:\"IBM Plex Mono\",\"SF Mono\",Menlo,monospace;margin-bottom:8px}.title{font-family:\"Nunito Sans\",\"Public Sans\",-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;font-size:30px;font-weight:800;line-height:1.08;letter-spacing:-.02em;color:#123454;margin-bottom:9px}.meta{display:flex;gap:8px;flex-wrap:wrap}.badge{display:inline-flex;align-items:center;padding:3px 9px;border-radius:var(--rf);font-size:12px;font-weight:700}.badge-primary{background:linear-gradient(120deg,var(--ac),var(--ach));color:#fff}.badge-soft{background:#eaf1f9;color:#3d5774}.doc-desc{border:1px solid var(--line);background:rgba(255,255,255,.92);border-radius:var(--r-md);padding:14px 15px;box-shadow:0 10px 20px rgba(12,27,61,.07);margin-bottom:12px;font-size:13px;color:var(--muted)}.doc-desc h2{font-size:14px;color:#173453;margin-bottom:8px}.doc-desc p{margin-bottom:8px}.doc-desc p:last-child{margin-bottom:0}.steps{display:flex;flex-direction:column;gap:12px}.sop-step{border:1px solid var(--line);background:#fff;border-radius:var(--r-md);overflow:hidden;box-shadow:0 10px 20px rgba(12,27,61,.07)}.sop-hdr{display:flex;align-items:center;gap:10px;padding:11px 12px;background:#fbfdff;border-bottom:1px solid #e2eaf3}.step-n{width:24px;height:24px;border-radius:var(--rf);display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(120deg,var(--ac),var(--ach));color:#fff;font-size:11px;font-weight:700;flex-shrink:0}.step-act{flex:1;font-size:13px;font-weight:700;color:#1a3a5c}.step-act-val{color:#5f7690;font-weight:500}.step-t{font-size:11px;color:#6e849a;font-family:\"IBM Plex Mono\",\"SF Mono\",Menlo,monospace;white-space:nowrap}.sop-body{padding:10px 12px}.step-url{font-size:12px;color:#6e849a;padding:7px 10px;background:#f7fbff;border-radius:8px;border:1px solid #dbe7f4;margin-bottom:10px;word-break:break-all}.step-url a{color:#0b5fff;text-decoration:none}.step-url a:hover{text-decoration:underline}.step-narr{font-size:13px;line-height:1.6;color:#2f4a66;border-radius:8px;border:1px solid #d2e1f0;border-left:3px solid var(--ac);background:rgba(11,95,255,.05);padding:8px 10px;margin-bottom:10px}.step-narr::before{content:\"讲解：\";font-weight:700;color:#1f3e60}.step-img{width:100%;border-radius:8px;border:1px solid #e0e8f1;margin-bottom:10px}.step-code-details{margin-top:8px}.step-code-summary{cursor:pointer;user-select:none;border:1px solid #d9e4ef;border-radius:8px;background:#f9fcff;color:#4b6784;font-size:12px;font-weight:600;padding:6px 9px}.step-code-summary:hover{border-color:#c4d8ec;background:#fff;color:#2a4a6d}.step-sel{padding:6px 9px;border-radius:0 0 8px 8px;border:1px solid #d9e4ef;border-top:none;font-family:\"IBM Plex Mono\",\"SF Mono\",Menlo,monospace;font-size:11px;color:#5b7390;word-break:break-all;background:#f9fcff}.sop-segment{display:flex;flex-direction:column;gap:10px}.sop-seg-voice{border-left:3px solid var(--ac);padding-left:12px}.sop-seg-silent{border-left:3px solid #d5e2ef;padding-left:12px}.seg-narration{display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-radius:10px;background:rgba(11,95,255,.06);border:1px solid rgba(11,95,255,.12);font-size:13px;line-height:1.6;color:#1a3a5c}.seg-icon{flex-shrink:0;font-size:14px}.seg-text{flex:1}.seg-time{flex-shrink:0;font-size:11px;color:#7b8ea4;font-family:"IBM Plex Mono","SF Mono",Menlo,monospace}.footer{text-align:center;padding:18px 8px;color:#71859b;font-size:12px}@media (max-width:680px){body{padding:12px}.hero{padding:14px}.title{font-size:24px}.sop-hdr{align-items:flex-start}.step-t{padding-top:3px}}</style></head><body><div class="shell"><section class="hero"><p class="hero-kicker">ONVORD SOP EXPORT</p><h1 class="title">${escapeHtml(sop.title || 'SOP')}</h1><div class="meta"><span class="badge badge-primary">${escapeHtml(sop.totalSteps)} 步骤</span><span class="badge badge-soft">${escapeHtml(fmtTime(sop.duration || 0))}</span></div></section>${desc}<section class="steps">${stepsHtml}</section><footer class="footer">由 Onvord 录制生成 · ${escapeHtml(sop.createdAt || '')}</footer></div><script id="onvord-sop-json" type="application/json">${sopJson}</script></body></html>`;

        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${safeFilename(sop.title)}.html`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast('✅ 已导出 SOP');
    }

    /* ── Wire up ── */
    const btnExport = $('btn-export');
    const linkSettings = $('link-settings');
    btnStart.addEventListener('click', doStart);
    btnStop.addEventListener('click', doStop);
    btnPause?.addEventListener('click', doTogglePause);
    btnExport.addEventListener('click', doExportHTML);
    btnRedo.addEventListener('click', () => {
        stopVolumeVis();
        currentSOP = null;
        setRecordingLayout('live');
        switchView('idle');
    });
    evList.addEventListener('click', (e) => {
        const btn = e.target.closest('.ev-thumb-btn');
        if (!btn) return;
        e.preventDefault();
        openImageViewer(btn.getAttribute('data-full-src') || '', btn.getAttribute('data-alt') || '截图预览');
    });
    imgViewerCloseEl?.addEventListener('click', closeImageViewer);
    imgViewerEl?.addEventListener('click', (e) => {
        if (e.target === imgViewerEl) closeImageViewer();
    });
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeImageViewer();
    });
    linkSettings.addEventListener('click', async (e) => {
        e.preventDefault();
        const data = await new Promise(resolve => chrome.storage.local.get(['deepgramKey'], resolve));
        const hasKey = Boolean(String(data.deepgramKey || '').trim());
        let micPermissionState = 'unknown';
        try {
            const res = await navigator.permissions.query({ name: 'microphone' });
            micPermissionState = res.state;
        } catch { /* noop */ }
        if (hasKey && micPermissionState !== 'granted') {
            openMicPermissionGuide();
            return;
        }
        chrome.runtime.openOptionsPage();
    });

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'NEW_EVENT' && currentView === 'recording') addActionPill(msg.data);
        if (msg.type === 'EVENT_SCREENSHOT' && currentView === 'recording') {
            applyScreenshotToTimeline(msg.timestamp, msg.screenshot);
        }
        if (msg.type === 'AUTO_STOPPED' && currentView === 'recording') {
            toast('已达到录制时间上限，自动停止');
            // Clean up local state without sending another STOP_RECORDING
            clearInterval(timer); timer = null;
            stopSTT();
            stopVolumeVis();
            if (msg.sop) {
                renderSOP(msg.sop);
                switchView('recording');
                setRecordingLayout('preview');
            } else {
                // Fallback: request SOP separately
                chrome.runtime.sendMessage({ type: 'GET_SOP' }, (res) => {
                    if (res?.sop) {
                        renderSOP(res.sop);
                        switchView('recording');
                        setRecordingLayout('preview');
                    }
                    else { switchView('idle'); }
                });
            }
            btnStop.disabled = false;
            btnStop.innerHTML = '<span class="bi">⏹</span>停止录制';
            setPauseButton(false);
            if (btnPause) btnPause.disabled = false;
            isPaused = false;
        }
        if (msg.type === 'RESTRICTED_PAGE') {
            toast('当前页面操作暂不可录制');
        }
        if (msg.type === 'MIC_PERMISSION_GRANTED') {
            refreshStartEligibility();
        }
    });

    /* ── Recovery check on startup ── */
    chrome.runtime.sendMessage({ type: 'CHECK_RECOVERY' }, (res) => {
        if (res?.recovery && !res.recovery._dismissed) {
            const savedAt = new Date(res.recovery.savedAt);
            const ago = Math.round((Date.now() - res.recovery.savedAt) / 60000);
            if (ago < 30) {
                // Show recovery prompt
                const blockCount = (res.recovery.timeline || []).length;
                if (blockCount > 0 && confirm(`发现 ${ago} 分钟前的录制数据（${blockCount} 个操作块），是否恢复？`)) {
                    chrome.runtime.sendMessage({ type: 'RESTORE_RECOVERY', data: res.recovery }, () => {
                        startTime = res.recovery.startTime;
                        pausedDuration = res.recovery.pausedDuration || 0;
                        isPaused = false;
                        switchView('recording');
                        setPauseButton(false);
                        setRecordingLayout('live');
                        timer = setInterval(() => {
                            updateTimerDisplay(Date.now() - startTime - pausedDuration);
                        }, 1000);
                        initSTT().then(ok => {
                            if (!ok) toast('语音识别恢复失败');
                        });
                        getMicStreamForUse().then(stream => {
                            micStream = stream;
                            startVolumeVis(stream);
                        }).catch(() => {});
                    });
                } else {
                    chrome.runtime.sendMessage({ type: 'CLEAR_RECOVERY' });
                }
            } else {
                chrome.runtime.sendMessage({ type: 'CLEAR_RECOVERY' });
            }
        }
    });

    /* ── Startup readiness ── */
    refreshStartEligibility();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refreshStartEligibility();
    });
    window.addEventListener('focus', () => refreshStartEligibility());

    /* ── Initial state check ── */
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (res) => {
        if (res?.recording) {
            startTime = res.startTime;
            pausedDuration = res.pausedDuration || 0;
            isPaused = res.paused || false;
            switchView('recording');
            setPauseButton(isPaused);
            setRecordingLayout(isPaused ? 'paused' : 'live');
            timer = setInterval(() => {
                if (!isPaused) {
                    updateTimerDisplay(Date.now() - startTime - pausedDuration);
                }
            }, 1000);
            initSTT();
            getMicStreamForUse().then(stream => {
                micStream = stream;
                startVolumeVis(stream);
            }).catch(() => {});
        }
    });

    /* ── Re-check start eligibility when key changes ── */
    chrome.storage.onChanged.addListener((changes) => {
        if (currentView !== 'idle' || !changes.deepgramKey) return;
        refreshStartEligibility();
    });
})();

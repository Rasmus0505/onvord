// Onvord Side Panel Logic
(function () {
    'use strict';

    let currentView = 'idle';
    let startTime = 0;
    let timer = null;
    let currentSOP = null;
    let evCount = 0;
    let audioCtx = null;
    let analyser = null;
    let micStream = null;
    let volAnimId = null;

    /* ── DOM refs ── */
    const $ = id => document.getElementById(id);
    const views = { idle: $('view-idle'), recording: $('view-recording'), sop: $('view-sop') };
    const btnStart = $('btn-start'), btnStop = $('btn-stop');
    const btnRedo = $('btn-redo');
    const recTimer = $('rec-timer'), voiceBox = $('voice-box');
    const evList = $('ev-list'), evCountBadge = $('ev-count');
    const sopTitle = $('sop-title'), sopCount = $('sop-count'), sopDur = $('sop-dur'), sopSteps = $('sop-steps');
    const toastEl = $('toast');
    const volIndicator = $('vol-indicator');
    const volBars = volIndicator ? Array.from(volIndicator.querySelectorAll('.vol-bar')) : [];

    /* ── Helpers ── */
    function switchView(v) { currentView = v; Object.entries(views).forEach(([k, el]) => el.classList.toggle('active', k === v)); }
    function fmtTime(ms) { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
    function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); setTimeout(() => toastEl.classList.remove('show'), 2000); }

    function evIcon(t) {
        switch (t) { case 'click': return '👆'; case 'input': return '⌨️'; case 'navigate': return '🔗'; case 'scroll': return '📜'; case 'select': return '📋'; default: return '⚡'; }
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

    /* ── Deepgram WebSocket STT ── */
    let dgSocket = null;
    let mediaRecorder = null;

    async function initDeepgram(stream) {
        // Load API key and language from storage
        const data = await new Promise(r => chrome.storage.local.get(['deepgramKey', 'deepgramLang'], r));
        const apiKey = data.deepgramKey;
        const lang = data.deepgramLang || 'zh';

        if (!apiKey) {
            voiceBox.innerHTML = '<span class="placeholder" style="color:var(--dn)">⚠️ 未配置语音识别。<a href="#" id="open-settings" style="color:var(--ac)">点击设置 Deepgram API Key</a></span>';
            setTimeout(() => {
                const link = document.getElementById('open-settings');
                if (link) link.addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
            }, 50);
            return;
        }

        let finalText = '';

        // Build WebSocket URL
        const params = new URLSearchParams({
            model: 'nova-2',
            language: lang === 'multi' ? 'multi' : lang,
            smart_format: 'true',
            interim_results: 'true',
            utterance_end_ms: '1500',
            vad_events: 'true',
            punctuate: 'true',
        });
        const wsUrl = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

        try {
            dgSocket = new WebSocket(wsUrl, ['token', apiKey]);
        } catch (e) {
            voiceBox.innerHTML = '<span class="placeholder" style="color:var(--dn)">⚠️ WebSocket 创建失败</span>';
            console.error('Deepgram WS error:', e);
            return;
        }

        dgSocket.onopen = () => {
            console.log('Deepgram connected');
            voiceBox.innerHTML = '<span class="placeholder">🟢 语音识别已连接，开始说话…</span>';

            // Start streaming audio via MediaRecorder
            try {
                mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
                mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0 && dgSocket && dgSocket.readyState === WebSocket.OPEN) {
                        dgSocket.send(e.data);
                    }
                };
                mediaRecorder.start(250); // Send chunks every 250ms
            } catch (e) {
                console.error('MediaRecorder error:', e);
                voiceBox.innerHTML = '<span class="placeholder" style="color:var(--dn)">⚠️ 录音启动失败</span>';
            }
        };

        dgSocket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'Results' && msg.channel) {
                    const alt = msg.channel.alternatives[0];
                    if (!alt) return;
                    const transcript = alt.transcript;
                    if (!transcript) return;

                    if (msg.is_final) {
                        finalText += transcript;
                        const ts = Date.now() - startTime;
                        if (transcript.trim()) {
                            chrome.runtime.sendMessage({ type: 'NARRATION_EVENT', text: transcript, timestamp: ts, isFinal: true });
                            appendNarrationToTimeline(transcript, ts);
                        }
                        // Update voicebox with final + clear interim
                        voiceBox.innerHTML = finalText
                            ? `<span class="voice-final">${finalText}</span>`
                            : '<span class="placeholder">开始说话…</span>';
                    } else {
                        // Interim result — show in voicebox
                        let html = '';
                        if (finalText) html += `<span class="voice-final">${finalText}</span>`;
                        html += `<span class="voice-interim">${transcript}</span>`;
                        voiceBox.innerHTML = html;
                    }
                    voiceBox.scrollTop = voiceBox.scrollHeight;
                }
            } catch (e) { /* ignore non-JSON messages */ }
        };

        dgSocket.onerror = (e) => {
            console.error('Deepgram WS error:', e);
            voiceBox.innerHTML = '<span class="placeholder" style="color:var(--dn)">⚠️ 语音识别连接错误</span>';
        };

        dgSocket.onclose = (e) => {
            console.log('Deepgram WS closed:', e.code, e.reason);
            if (currentView === 'recording' && e.code !== 1000) {
                voiceBox.innerHTML += '<br><span class="placeholder" style="color:var(--dn)">连接已断开</span>';
            }
        };
    }

    function stopDeepgram() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            try { mediaRecorder.stop(); } catch { }
        }
        mediaRecorder = null;
        if (dgSocket) {
            if (dgSocket.readyState === WebSocket.OPEN) {
                try { dgSocket.send(JSON.stringify({ type: 'CloseStream' })); } catch { }
                dgSocket.close(1000);
            }
            dgSocket = null;
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
        if (!text || !text.trim()) return;
        clearPlaceholder();

        const last = getLastTimelineItem();
        if (last && last.classList.contains('tl-narration')) {
            // Append to existing narration block
            const span = last.querySelector('.tl-narr-text');
            if (span) span.textContent += text;
        } else {
            // Create new narration block
            const d = document.createElement('div');
            d.className = 'tl-narration';
            d.innerHTML = `<span class="tl-narr-icon">🎙️</span><span class="tl-narr-text">${text}</span>`;
            evList.appendChild(d);
        }
        evList.scrollTop = evList.scrollHeight;
    }

    function addActionPill(ev) {
        evCount++;
        evCountBadge.textContent = evCount;
        clearPlaceholder();

        const icon = evIcon(ev.actionType);
        let label = '';
        switch (ev.actionType) {
            case 'click': label = ev.target?.description || '点击'; break;
            case 'input': label = `输入「${(ev.value || '').substring(0, 15)}」`; break;
            case 'navigate': label = ev.pageTitle || '页面'; break;
            case 'scroll': label = '滚动'; break;
            case 'select': label = `选择「${(ev.value || '').substring(0, 15)}」`; break;
            default: label = ev.actionType;
        }

        // For input events, update the last input pill instead of creating a new one
        if (ev.actionType === 'input') {
            const last = getLastTimelineItem();
            if (last && last.classList.contains('tl-actions')) {
                const lastPill = last.querySelector('.ev-pill[data-type="input"]:last-of-type');
                if (lastPill) {
                    lastPill.innerHTML = `${icon} ${label}`;
                    lastPill.setAttribute('title', `${fmtTime(ev.timestamp)} — ${label}`);
                    return; // Updated in place, no new pill needed
                }
            }
        }

        const pill = document.createElement('span');
        pill.className = 'ev-pill';
        pill.setAttribute('data-type', ev.actionType);
        pill.setAttribute('title', `${fmtTime(ev.timestamp)} — ${label}`);
        pill.innerHTML = `${icon} ${label}`;

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
    }

    /* ── SOP rendering ── */
    function renderSOP(sop) {
        currentSOP = sop;
        sopTitle.textContent = sop.title;
        sopCount.textContent = `${sop.totalSteps} 步骤`;
        sopDur.textContent = fmtTime(sop.duration);
        sopSteps.innerHTML = '';

        sop.steps.forEach(s => {
            const el = document.createElement('div'); el.className = 'sop-step';

            // Style quoted content differently in the action description
            const descHtml = s.action.description.replace(/[「"](.*?)[」"]/g, '<span class="step-act-val">「$1」</span>');
            let html = `<div class="sop-hdr"><span class="step-n">${s.stepNumber}</span><span class="step-act">${descHtml}</span><span class="step-t">${s.timestamp}</span></div>`;

            let body = '';
            if (s.narration && s.narration.trim()) body += `<div class="step-narr">${s.narration}</div>`;
            if (s.screenshot) body += `<img class="step-img" src="${s.screenshot}" alt="步骤${s.stepNumber}" loading="lazy">`;
            if (s.action.selector) {
                body += `<details class="step-code-details"><summary class="step-code-summary">🔧 元素选择器</summary><div class="step-sel">${s.action.selector}</div></details>`;
            }

            if (body) html += `<div class="sop-body">${body}</div>`;
            el.innerHTML = html;
            sopSteps.appendChild(el);
        });
    }

    /* ── Actions ── */
    async function beginRecording() {
        btnStart.textContent = '启动中…';
        try {
            try {
                micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                startVolumeVis(micStream);
            } catch (e) { console.warn('Volume vis mic failed:', e); }

            const res = await chrome.runtime.sendMessage({ type: 'START_RECORDING' });
            if (res?.success) {
                startTime = res.startTime; evCount = 0;
                voiceBox.innerHTML = '<span class="placeholder">连接语音识别…</span>';
                evList.innerHTML = '<div class="placeholder">等待操作或说话…</div>';
                evCountBadge.textContent = '0'; recTimer.textContent = '00:00';
                switchView('recording');
                timer = setInterval(() => { recTimer.textContent = fmtTime(Date.now() - startTime); }, 1000);
                // Start Deepgram with the mic stream
                if (micStream) {
                    initDeepgram(micStream);
                } else {
                    // Try to get a new stream for Deepgram
                    try {
                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        micStream = stream;
                        initDeepgram(stream);
                    } catch (e) { console.warn('Could not get mic for Deepgram:', e); }
                }
            }
        } catch (e) { console.error(e); toast('启动失败'); }
        btnStart.disabled = false; btnStart.innerHTML = '<span class="bi">⏺</span>开始录制';
    }

    async function doStart() {
        btnStart.disabled = true; btnStart.textContent = '请求录音权限…';
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(t => t.stop());
            await beginRecording();
        } catch (err) {
            console.error("Mic permission not available in side panel, opening permission page:", err);
            toast('🎤 正在打开授权页面…');
            btnStart.textContent = '等待授权…';
            chrome.tabs.create({ url: chrome.runtime.getURL('mic-permission.html'), active: true });
        }
    }

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'MIC_PERMISSION_GRANTED' && currentView === 'idle') {
            toast('✅ 麦克风权限已授予，开始录制！');
            beginRecording();
        }
    });

    async function doStop() {
        btnStop.disabled = true; btnStop.textContent = '生成中…';
        clearInterval(timer); timer = null;
        stopDeepgram();
        stopVolumeVis();
        await new Promise(r => setTimeout(r, 200));
        try {
            const res = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
            if (res?.success && res.sop) { renderSOP(res.sop); switchView('sop'); }
            else { toast('生成 SOP 失败'); switchView('idle'); }
        } catch (e) { console.error(e); toast('生成失败'); switchView('idle'); }
        btnStop.disabled = false; btnStop.innerHTML = '<span class="bi">⏹</span>停止录制';
    }

    function doExportHTML() {
        if (!currentSOP) return;
        const sop = currentSOP;
        let stepsHtml = '';
        let lastUrl = '';
        sop.steps.forEach(s => {
            const descHtml = s.action.description.replace(/[「"](.*?)[」"]/g, '<span style="font-weight:400;color:#9898b0;font-size:13px">「$1」</span>');
            let body = '';
            // Show URL if it changed from previous step
            const stepUrl = s.action.url || '';
            if (stepUrl && stepUrl !== lastUrl) {
                body += `<div style="font-size:12px;color:#686880;padding:6px 12px;background:#14141f;border-radius:6px;margin-bottom:10px;word-break:break-all">🔗 <a href="${stepUrl}" style="color:#818cf8;text-decoration:none" target="_blank">${stepUrl}</a></div>`;
                lastUrl = stepUrl;
            }
            if (s.narration && s.narration.trim()) body += `<div style="font-size:14px;line-height:1.6;color:#9898b0;padding:10px 14px;background:#14141f;border-radius:6px;border-left:3px solid #6366f1;margin-bottom:10px">💬 ${s.narration}</div>`;
            if (s.screenshot) body += `<img src="${s.screenshot}" style="width:100%;border-radius:6px;margin-bottom:10px;border:1px solid rgba(255,255,255,.06)" loading="lazy">`;
            if (s.action.selector) body += `<details style="margin-top:10px"><summary style="font-size:13px;color:#686880;cursor:pointer;padding:6px 10px;background:#14141f;border-radius:6px;border:1px solid rgba(255,255,255,.06)">🔧 元素选择器</summary><div style="font-size:12px;color:#686880;font-family:monospace;padding:6px 10px;background:#14141f;border-radius:0 0 6px 6px;word-break:break-all">${s.action.selector}</div></details>`;
            stepsHtml += `<div style="background:#1c1c2b;border-radius:14px;border:1px solid rgba(255,255,255,.06);overflow:hidden;margin-bottom:16px"><div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.06)"><span style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:#6366f1;color:#fff;border-radius:999px;font-size:13px;font-weight:700;flex-shrink:0">${s.stepNumber}</span><span style="flex:1;font-size:14px;font-weight:600">${descHtml}</span><span style="font-size:12px;color:#686880">${s.timestamp}</span></div>${body ? `<div style="padding:14px">${body}</div>` : ''}</div>`;
        });

        const desc = `<div style="padding:16px;background:#1c1c2b;border-radius:12px;border:1px solid rgba(255,255,255,.06);margin-bottom:24px;font-size:13px;line-height:1.8;color:#9898b0"><strong style="color:#e8e8f0;font-size:14px">📖 文档说明</strong><br>本文档由 Onvord 浏览器录制工具自动生成，记录了用户在浏览器中的操作流程。<br><br><strong style="color:#e8e8f0">如何阅读：</strong><br>• 每个步骤包含一个操作描述（如"点击按钮"、"输入文字"、"选择文字"等）<br>• 💬 <strong>讲解</strong>：用户在操作时的语音讲解，说明每一步的意图和上下文<br>• 📷 <strong>截图</strong>：操作时刻的页面截图，紫色圆点标记了操作位置<br>• 🔧 <strong>元素选择器</strong>：被操作元素的 CSS 选择器路径（默认折叠），可用于自动化复现<br><br><strong style="color:#e8e8f0">信息概要：</strong><br>• 起始页面：${sop.startUrl}<br>• 录制时间：${sop.createdAt}<br>• 共 ${sop.totalSteps} 个操作步骤，总时长 ${fmtTime(sop.duration)}</div>`;

        const html = `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${sop.title}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:#0c0c14;color:#e8e8f0;padding:24px;max-width:900px;margin:0 auto;-webkit-font-smoothing:antialiased}img{max-width:100%}</style></head><body><h1 style="font-size:22px;font-weight:700;margin-bottom:8px">${sop.title}</h1><div style="display:flex;gap:8px;margin-bottom:16px"><span style="display:inline-flex;align-items:center;padding:2px 8px;background:#6366f1;color:#fff;border-radius:999px;font-size:11px;font-weight:600">${sop.totalSteps} 步骤</span><span style="display:inline-flex;align-items:center;padding:2px 8px;background:#1c1c2b;color:#9898b0;border-radius:999px;font-size:11px;font-weight:600">${fmtTime(sop.duration)}</span></div>${desc}${stepsHtml}<div style="text-align:center;padding:20px;color:#686880;font-size:12px">由 Onvord 录制生成 · ${sop.createdAt}</div></body></html>`;

        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${sop.title.replace(/\s+/g, '_')}.html`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast('✅ 已导出网页');
    }

    /* ── Wire up ── */
    const btnExport = $('btn-export');
    const linkSettings = $('link-settings');
    btnStart.addEventListener('click', doStart);
    btnStop.addEventListener('click', doStop);
    btnExport.addEventListener('click', doExportHTML);
    btnRedo.addEventListener('click', () => { stopVolumeVis(); switchView('idle'); });
    linkSettings.addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'NEW_EVENT' && currentView === 'recording') addActionPill(msg.data);
    });

    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (res) => {
        if (res?.recording) {
            startTime = res.startTime; evCount = 0;
            switchView('recording');
            timer = setInterval(() => { recTimer.textContent = fmtTime(Date.now() - startTime); }, 1000);
            navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
                micStream = stream;
                startVolumeVis(stream);
                initDeepgram(stream);
            }).catch(() => { });
        }
    });
})();

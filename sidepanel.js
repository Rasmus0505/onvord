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
            const descHtml = s.action.description.replace(/[「"](.*?)[」"]/g, '<span class="step-act-val">「$1」</span>');
            let body = '';
            // Show URL if it changed from previous step
            const stepUrl = s.action.url || '';
            if (stepUrl && stepUrl !== lastUrl) {
                body += `<div class="step-url">🔗 <a href="${stepUrl}" target="_blank" rel="noreferrer noopener">${stepUrl}</a></div>`;
                lastUrl = stepUrl;
            }
            if (s.narration && s.narration.trim()) body += `<div class="step-narr">${s.narration}</div>`;
            if (s.screenshot) body += `<img class="step-img" src="${s.screenshot}" alt="步骤${s.stepNumber}" loading="lazy">`;
            if (s.action.selector) body += `<details class="step-code-details"><summary class="step-code-summary">元素选择器</summary><div class="step-sel">${s.action.selector}</div></details>`;
            stepsHtml += `<article class="sop-step"><header class="sop-hdr"><span class="step-n">${s.stepNumber}</span><span class="step-act">${descHtml}</span><span class="step-t">${s.timestamp}</span></header>${body ? `<div class="sop-body">${body}</div>` : ''}</article>`;
        });

        const desc = `<section class="doc-desc"><h2>文档说明</h2><p>本文档由 Onvord 浏览器录制工具自动生成，记录了用户在浏览器中的操作流程。</p><p><strong>如何阅读：</strong><br>• 每个步骤包含一个操作描述（如“点击按钮”、“输入文字”、“选择文字”等）<br>• <strong>讲解</strong>：用户在操作时的语音讲解，说明每一步的意图和上下文<br>• <strong>截图</strong>：操作时刻的页面截图，蓝色圆点标记了操作位置<br>• <strong>元素选择器</strong>：被操作元素的 CSS 选择器路径（默认折叠），可用于自动化复现</p><p><strong>信息概要：</strong><br>• 起始页面：${sop.startUrl}<br>• 录制时间：${sop.createdAt}<br>• 共 ${sop.totalSteps} 个操作步骤，总时长 ${fmtTime(sop.duration)}</p></section>`;

        const html = `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${sop.title}</title><style>:root{--bg:#eef3f8;--surface:#fff;--surface-2:#f7fafc;--line:#d8e2ec;--text:#102a43;--muted:#52667a;--muted-soft:#7b8ea4;--ac:#0b5fff;--ach:#2f80ff;--ac-g:rgba(11,95,255,.2);--r-md:14px;--r-lg:18px;--rf:999px}*{margin:0;padding:0;box-sizing:border-box}body{font-family:\"Public Sans\",\"Manrope\",-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;color:var(--text);line-height:1.65;background:radial-gradient(circle at 92% 6%,rgba(11,95,255,.12) 0%,transparent 32%),linear-gradient(180deg,#f8fbff 0%,var(--bg) 100%);padding:24px 16px;-webkit-font-smoothing:antialiased}img{max-width:100%}.shell{max-width:940px;margin:0 auto}.hero{border:1px solid var(--line);background:rgba(255,255,255,.94);backdrop-filter:blur(8px);border-radius:var(--r-lg);padding:18px;box-shadow:0 12px 24px rgba(12,27,61,.08);margin-bottom:12px}.hero-kicker{display:inline-flex;align-items:center;border-radius:var(--rf);border:1px solid #c4d3e2;background:#f4f8fd;color:#3c5471;padding:4px 10px;text-transform:uppercase;letter-spacing:.08em;font-size:10px;font-family:\"IBM Plex Mono\",\"SF Mono\",Menlo,monospace;margin-bottom:8px}.title{font-family:\"Nunito Sans\",\"Public Sans\",-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;font-size:30px;font-weight:800;line-height:1.08;letter-spacing:-.02em;color:#123454;margin-bottom:9px}.meta{display:flex;gap:8px;flex-wrap:wrap}.badge{display:inline-flex;align-items:center;padding:3px 9px;border-radius:var(--rf);font-size:12px;font-weight:700}.badge-primary{background:linear-gradient(120deg,var(--ac),var(--ach));color:#fff}.badge-soft{background:#eaf1f9;color:#3d5774}.doc-desc{border:1px solid var(--line);background:rgba(255,255,255,.92);border-radius:var(--r-md);padding:14px 15px;box-shadow:0 10px 20px rgba(12,27,61,.07);margin-bottom:12px;font-size:13px;color:var(--muted)}.doc-desc h2{font-size:14px;color:#173453;margin-bottom:8px}.doc-desc p{margin-bottom:8px}.doc-desc p:last-child{margin-bottom:0}.steps{display:flex;flex-direction:column;gap:12px}.sop-step{border:1px solid var(--line);background:#fff;border-radius:var(--r-md);overflow:hidden;box-shadow:0 10px 20px rgba(12,27,61,.07)}.sop-hdr{display:flex;align-items:center;gap:10px;padding:11px 12px;background:#fbfdff;border-bottom:1px solid #e2eaf3}.step-n{width:24px;height:24px;border-radius:var(--rf);display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(120deg,var(--ac),var(--ach));color:#fff;font-size:11px;font-weight:700;flex-shrink:0}.step-act{flex:1;font-size:13px;font-weight:700;color:#1a3a5c}.step-act-val{color:#5f7690;font-weight:500}.step-t{font-size:11px;color:#6e849a;font-family:\"IBM Plex Mono\",\"SF Mono\",Menlo,monospace;white-space:nowrap}.sop-body{padding:10px 12px}.step-url{font-size:12px;color:#6e849a;padding:7px 10px;background:#f7fbff;border-radius:8px;border:1px solid #dbe7f4;margin-bottom:10px;word-break:break-all}.step-url a{color:#0b5fff;text-decoration:none}.step-url a:hover{text-decoration:underline}.step-narr{font-size:13px;line-height:1.6;color:#2f4a66;border-radius:8px;border:1px solid #d2e1f0;border-left:3px solid var(--ac);background:rgba(11,95,255,.05);padding:8px 10px;margin-bottom:10px}.step-narr::before{content:\"讲解：\";font-weight:700;color:#1f3e60}.step-img{width:100%;border-radius:8px;border:1px solid #e0e8f1;margin-bottom:10px}.step-code-details{margin-top:8px}.step-code-summary{cursor:pointer;user-select:none;border:1px solid #d9e4ef;border-radius:8px;background:#f9fcff;color:#4b6784;font-size:12px;font-weight:600;padding:6px 9px}.step-code-summary:hover{border-color:#c4d8ec;background:#fff;color:#2a4a6d}.step-sel{padding:6px 9px;border-radius:0 0 8px 8px;border:1px solid #d9e4ef;border-top:none;font-family:\"IBM Plex Mono\",\"SF Mono\",Menlo,monospace;font-size:11px;color:#5b7390;word-break:break-all;background:#f9fcff}.footer{text-align:center;padding:18px 8px;color:#71859b;font-size:12px}@media (max-width:680px){body{padding:12px}.hero{padding:14px}.title{font-size:24px}.sop-hdr{align-items:flex-start}.step-t{padding-top:3px}}</style></head><body><div class="shell"><section class="hero"><p class="hero-kicker">ONVORD SOP EXPORT</p><h1 class="title">${sop.title}</h1><div class="meta"><span class="badge badge-primary">${sop.totalSteps} 步骤</span><span class="badge badge-soft">${fmtTime(sop.duration)}</span></div></section>${desc}<section class="steps">${stepsHtml}</section><footer class="footer">由 Onvord 录制生成 · ${sop.createdAt}</footer></div></body></html>`;

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

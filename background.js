// Onvord Background Service Worker
let state = { recording: false, startTime: 0, events: [], narrations: [], screenshots: {} };
let offscreenReady = false;

/* ── Offscreen document for Canvas annotation ── */
async function ensureOffscreen() {
    if (offscreenReady) return;
    try {
        await chrome.offscreen.createDocument({
            url: 'annotate.html',
            reasons: ['DOM_PARSER'],
            justification: 'Annotate screenshots with click position using Canvas'
        });
        offscreenReady = true;
    } catch (e) {
        // Already exists
        if (e.message?.includes('already exists')) offscreenReady = true;
        else console.warn('offscreen create failed:', e);
    }
}

/* ── Screenshot ── */
async function capture() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return null;
        return await chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 50 });
    } catch { return null; }
}

async function captureAndAnnotate(clickX, clickY, viewportW, viewportH) {
    const dataUrl = await capture();
    if (!dataUrl || clickX == null || clickY == null) return dataUrl;
    try {
        await ensureOffscreen();
        const res = await chrome.runtime.sendMessage({
            type: 'ANNOTATE_SCREENSHOT', dataUrl, clickX, clickY, viewportW, viewportH
        });
        return res?.annotatedUrl || dataUrl;
    } catch (e) {
        console.warn('annotate failed:', e);
        return dataUrl;
    }
}

/* ── Recording lifecycle ── */
async function startRecording() {
    state = { recording: true, startTime: Date.now(), events: [], narrations: [], screenshots: {} };
    // Pre-create offscreen document
    ensureOffscreen().catch(() => { });
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    for (const tab of tabs) {
        try {
            await chrome.tabs.sendMessage(tab.id, { type: 'START_RECORDING', startTime: state.startTime });
        } catch {
            try {
                await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
                await chrome.tabs.sendMessage(tab.id, { type: 'START_RECORDING', startTime: state.startTime });
            } catch (e) { console.warn('inject failed', e); }
        }
    }
    return { success: true, startTime: state.startTime };
}

async function stopRecording() {
    state.recording = false;
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) { try { await chrome.tabs.sendMessage(tab.id, { type: 'STOP_RECORDING' }); } catch { } }
    return generateSOP();
}

/* ── SOP generation ── */
function fmtTime(ms) {
    const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function actionDesc(ev) {
    switch (ev.actionType) {
        case 'click': return `点击 ${ev.target?.description || '元素'}`;
        case 'input': return `在 ${ev.target?.description || '输入框'} 中输入 "${(ev.value || '').substring(0, 40)}"`;
        case 'navigate': return `导航到 ${ev.pageTitle || ev.url}`;
        case 'select': return `选择文字「${(ev.value || '').substring(0, 40)}」`;
        default: return ev.actionType;
    }
}

function generateSOP() {
    const actions = state.events.filter(e => e.actionType !== 'scroll').sort((a, b) => a.timestamp - b.timestamp);
    const narrs = state.narrations.filter(n => n.isFinal && n.text).sort((a, b) => a.timestamp - b.timestamp);

    // Assign each narration to the nearest preceding action (or the first one)
    // Build a map: actionIndex -> [narration texts]
    const narrationMap = {};
    for (const n of narrs) {
        let bestIdx = 0;
        for (let i = 0; i < actions.length; i++) {
            if (actions[i].timestamp <= n.timestamp) bestIdx = i;
            else break;
        }
        if (!narrationMap[bestIdx]) narrationMap[bestIdx] = [];
        narrationMap[bestIdx].push(n.text);
    }

    const steps = actions.map((ev, i) => {
        const narration = (narrationMap[i] || []).join(' ');
        return {
            stepNumber: i + 1,
            timestamp: fmtTime(ev.timestamp),
            timestampMs: ev.timestamp,
            action: { type: ev.actionType, description: actionDesc(ev), target: ev.target || null, selector: ev.target?.selector || '', url: ev.url, pageTitle: ev.pageTitle, value: ev.value || null },
            screenshot: state.screenshots[ev.timestamp] || null,
            narration
        };
    });

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return {
        title: `SOP - ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
        createdAt: now.toISOString(),
        duration: state.events.length ? state.events[state.events.length - 1].timestamp : 0,
        startUrl: actions[0]?.url || '',
        totalSteps: steps.length,
        steps
    };
}

function sopToMarkdown(sop) {
    let md = `# ${sop.title}\n\n> 录制时间: ${sop.createdAt}  \n> 起始页面: ${sop.startUrl}  \n> 总步骤数: ${sop.totalSteps}\n\n---\n\n`;
    sop.steps.forEach(s => {
        md += `## 步骤 ${s.stepNumber} [${s.timestamp}]\n\n`;
        // 1. Narration first
        if (s.narration) md += `**讲解：** ${s.narration}\n\n`;
        // 2. Action description
        md += `**操作：** ${s.action.description}\n\n`;
        if (s.action.url) md += `**页面：** ${s.action.url}\n\n`;
        // 3. Code/selector collapsed
        if (s.action.selector) md += `<details>\n<summary>🔧 元素选择器</summary>\n\n\`\`\`\n${s.action.selector}\n\`\`\`\n\n</details>\n\n`;
        md += `---\n\n`;
    });
    return md;
}

/* ── Tab lifecycle (keep recording across navigations) ── */
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    if (!state.recording) return;
    try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
        await chrome.tabs.sendMessage(tabId, { type: 'START_RECORDING', startTime: state.startTime });
    } catch { }
});

chrome.tabs.onUpdated.addListener(async (tabId, info) => {
    if (!state.recording || info.status !== 'complete') return;
    try {
        await chrome.tabs.sendMessage(tabId, { type: 'START_RECORDING', startTime: state.startTime });
    } catch {
        try {
            await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
            await chrome.tabs.sendMessage(tabId, { type: 'START_RECORDING', startTime: state.startTime });
        } catch { }
    }
});

/* ── Open side panel on icon click ── */
chrome.action.onClicked.addListener(async (tab) => {
    await chrome.sidePanel.open({ tabId: tab.id });
});

/* ── Message router ── */
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg.type === 'START_RECORDING') { startRecording().then(r => respond(r)); return true; }
    if (msg.type === 'STOP_RECORDING') { stopRecording().then(sop => respond({ success: true, sop })); return true; }
    if (msg.type === 'GET_STATE') { respond({ recording: state.recording, startTime: state.startTime, eventCount: state.events.length }); return false; }
    if (msg.type === 'ACTION_EVENT') {
        if (!state.recording) return;
        state.events.push(msg.data);
        if (msg.data.actionType === 'click' || msg.data.actionType === 'select') {
            // Capture and annotate screenshot with click position
            captureAndAnnotate(msg.data.clickX, msg.data.clickY, msg.data.viewportW, msg.data.viewportH)
                .then(s => { if (s) state.screenshots[msg.data.timestamp] = s; });
        } else if (msg.data.actionType === 'navigate') {
            capture().then(s => { if (s) state.screenshots[msg.data.timestamp] = s; });
        }
        chrome.runtime.sendMessage({ type: 'NEW_EVENT', data: msg.data }).catch(() => { });
        return false;
    }
    if (msg.type === 'NARRATION_EVENT') {
        if (!state.recording) return;
        state.narrations.push({ text: msg.text, timestamp: msg.timestamp, isFinal: msg.isFinal });
        return false;
    }
    if (msg.type === 'GET_MARKDOWN') { respond({ markdown: sopToMarkdown(msg.sop) }); return false; }
    if (msg.type === 'MIC_PERMISSION_GRANTED') {
        // Relay to all extension views (side panel, etc.)
        chrome.runtime.sendMessage({ type: 'MIC_PERMISSION_GRANTED' }).catch(() => { });
        return false;
    }
});

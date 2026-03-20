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
    let llmEnabled = false;
    let currentNarrationDraftId = '';
    let currentNarrationDraftMap = new Map();
    let activeNarrationSegmentIndex = null;
    let narrationDraftPersistTimer = 0;
    let markAreaStatusTimer = 0;
    const pendingPointCaptureTimestamps = new Set();

    /* ── DOM refs ── */
    const $ = id => document.getElementById(id);
    const views = { idle: $('view-idle'), recording: $('view-recording') };
    const btnStart = $('btn-start'), btnStop = $('btn-stop');
    const btnStartManual = $('btn-start-manual');
    const btnPause = $('btn-pause');
    const btnMarkArea = $('btn-mark-area');
    const btnExport = $('btn-export');
    const btnRefineCopy = $('btn-refine-copy');
    const btnRedo = $('btn-redo');
    const btnDownload = $('btn-download');
    const linkSettings = $('link-settings');
    const recTimer = $('rec-timer'), voiceBox = $('voice-box');
    const recBarEl = document.querySelector('#view-recording .rec-bar');
    const liveSectionEl = document.querySelector('#view-recording .section.grow');
    const recActionsEl = $('rec-actions');
    const previewActionsEl = $('preview-actions');
    const previewEditorKickerEl = previewActionsEl?.querySelector('.preview-editor-kicker');
    const previewEditorTitleEl = previewActionsEl?.querySelector('.preview-editor-title');
    const previewEditorDescEl = previewActionsEl?.querySelector('.preview-editor-desc');
    const btnCopyFull = previewActionsEl?.querySelector('.preview-btn-copy-full');
    const btnResetNarration = previewActionsEl?.querySelector('.preview-btn-reset');
    const previewLocatorPaneTitleEl = previewActionsEl?.querySelector('.preview-locator .preview-pane-title');
    const previewLocatorPaneMetaEl = previewActionsEl?.querySelector('.preview-locator .preview-pane-meta');
    const previewEditorPaneTitleEl = previewActionsEl?.querySelector('.preview-editor .preview-pane-title');
    const previewEditorPaneMetaEl = previewActionsEl?.querySelector('.preview-editor .preview-pane-meta');
    const previewLocatorListEl = $('preview-locator-list');
    const previewNarrationCardsEl = $('preview-narration-cards');
    const previewLocatorEmptyEl = $('preview-locator-empty');
    const previewEditorEmptyEl = $('preview-editor-empty');
    const recLabelEl = $('rec-label');
    const evList = $('ev-list'), evCountBadge = $('ev-count');
    const imgViewerEl = $('img-viewer');
    const imgViewerCloseEl = $('img-viewer-close');
    const imgViewerImgEl = $('img-viewer-img');
    const toastEl = $('toast');
    const markAreaStatusEl = $('mark-area-status');
    const micStatusEl = $('mic-status');
    const micIconEl = micStatusEl?.querySelector('.mic-icon');
    const modeChipEl = $('mode-chip');
    const volIndicator = $('vol-indicator');
    const volBars = volIndicator ? Array.from(volIndicator.querySelectorAll('.vol-bar')) : [];
    const manualComposeEl = $('manual-compose');
    const manualComposeTitleEl = $('manual-compose-title');
    const manualComposeHintEl = $('manual-compose-hint');
    const manualNoteInputEl = $('manual-note-input');
    const btnAddNote = $('btn-add-note');
    const btnClearNote = $('btn-clear-note');
    const uiLocale = /^zh\b/i.test(navigator.language || '') ? 'zh' : 'en';
    const I18N = {
        zh: {
            titleTagline: '一边操作，一边讲解<br>AI 立即学会流程',
            inst1: '打开要演示的网页',
            inst2: '点击下方按钮开始录制',
            inst3: '操作浏览器，同时语音讲解',
            inst4: '完成后生成 SOP，发送给 AI',
            startRecording: '开始录制',
            settingsLink: '语音识别设置',
            recRecording: '录制中',
            recDone: '录制完成',
            recPaused: '已暂停',
            sectionActionLog: '操作记录',
            waitingPlaceholder: '等待操作或说话…',
            noPreview: '没有可预览内容',
            stopRecording: '停止录制',
            pause: '暂停',
            resume: '继续',
            exportSop: '复制可编辑版 SOP',
            exportFullSop: '复制完整版 SOP',
            resetNarration: '恢复原讲解',
            refineCopy: 'GPT 整理后复制',
            refiningCopy: 'GPT 整理复制中...',
            downloadFullSop: '下载完整 SOP（含截图）',
            recordAgain: '重新录制',
            previewEditorKicker: '讲解优先编辑模式',
            previewEditorTitle: '先改讲解，再复制给 AI',
            previewEditorDesc: '左侧按段定位对应操作，右侧直接逐段改写讲解内容。',
            previewLocatorTitle: '对应步骤',
            previewLocatorMeta: '{count} 段',
            previewEditorPaneTitle: '讲解编辑',
            previewEditorPaneMeta: '本地自动保存',
            previewNarrationLabel: '讲解 {index}',
            previewNarrationMap: '对应步骤 {steps}',
            previewNoMappedSteps: '未关联步骤',
            previewLocatorEmpty: '当前录制没有可编辑的讲解段。',
            previewEditorEmpty: '当前录制没有讲解内容，可直接复制完整版 SOP。',
            micStatusTitle: '语音识别',
            recognizing: '识别中',
            screenshotPreview: '截图预览',
            viewScreenshot: '查看截图',
            actionFallback: '操作',
            elementFallback: '元素',
            pageFallback: '页面',
            keypressFallback: '快捷键',
            actionClick: '点击 {target}',
            actionPoint: '标记这里',
            actionPointWithTarget: '标记这里：{target}',
            actionInput: '输入「{value}」',
            actionInputWithTarget: '在 {target} 中输入「{value}」',
            actionInputTargetOnly: '在 {target} 中输入',
            actionScroll: '滚动',
            actionScrollMerged: '滚动（合并 {count} 次）',
            actionSelect: '选择「{value}」',
            actionSelectWithTarget: '在 {target} 中选择「{value}」',
            actionSelectTargetOnly: '在 {target} 中选择',
            actionClickElement: '点击元素',
            actionInputShort: '输入',
            actionSelectShort: '选择',
            actionNavigate: '页面跳转',
            clickPointScreenshot: '步骤 {step} 截图',
            startNeedKey: '请先设置 API Key',
            startNeedMic: '开启麦克风权限',
            startProviderUnsupported: '当前语音服务暂不支持',
            initStt: '初始化语音识别…',
            toastWsDisconnected: '语音连接已断开，请暂停后继续重连',
            toastNeedSetupKey: '请先在设置里配置当前语音服务凭证',
            toastMicDenied: '麦克风权限未授予，无法开始录制',
            toastNoMic: '未检测到麦克风设备，无法开始录制',
            toastMicBusy: '麦克风暂不可用（可能被占用），无法开始录制',
            toastKeyInvalid: 'Deepgram API Key 无效，请在设置中更新后重试',
            toastNetwork: '无法连接 Deepgram（网络或 DNS 问题）',
            toastAliyunKeyInvalid: '阿里云 API Key 无效，或与区域不匹配，请在设置中检查后重试',
            toastAliyunKeyFormat: '阿里云 API Key 含非法字符（如中文/全角符号），请重新复制粘贴',
            toastAliyunNetwork: '无法连接阿里云（网络或 DNS 问题）',
            toastAliyunAuthRule: '浏览器未加载阿里云 WebSocket 鉴权头规则，请重载扩展后重试',
            toastAliyunWsHandshake: '阿里云鉴权通过但实时连接握手失败，已尝试多种连接方式。请切换区域后重试',
            toastAliyunInitFailed: '阿里云实时语音初始化失败，请检查区域设置；若仍失败，请先切回 Deepgram',
            toastInitFailed: '语音识别初始化失败，无法开始录制',
            toastStartFailed: '启动失败',
            generating: '生成中…',
            toastGenerateFailed: '生成 SOP 失败',
            toastGenerateError: '生成失败',
            toastPaused: '已暂停',
            toastResumeSttFailed: '恢复语音识别失败，请检查麦克风与语音服务凭证',
            toastResumed: '已继续录制',
            toastPauseResumeFailed: '暂停/继续失败',
            exportSuccess: '✅ 已复制可编辑版 SOP',
            exportFullSuccess: '✅ 已复制完整版 SOP',
            downloadSuccess: '✅ 已下载完整 SOP',
            toastCopyFailed: '复制 SOP 失败',
            refineCopySuccess: '✅ 已复制 GPT 整理后的讲解',
            toastNeedLlmSetup: '请先在设置中启用 GPT 润色，并配置接口 URL、API Key 和模型',
            toastRefineFailed: 'GPT 润色失败',
            toastRefineParseFailed: 'GPT 返回内容无法解析',
            toastLlmDisabled: 'GPT 润色当前已关闭，请先到设置中开启',
            toastNarrationReset: '已恢复原讲解并清除本地记忆',
            toastAutoStopped: '已达到录制时间上限，自动停止',
            toastRestricted: '当前页面操作暂不可录制',
            recoveryPrompt: '发现 {ago} 分钟前的录制数据（{count} 个操作块），是否恢复？',
            toastRecoverySttFailed: '语音识别恢复失败',
            toastGenerateRecovered: '主生成未正常返回，已回退到本地 SOP',
            copySectionIntro: 'SOP 介绍',
            copySectionNotes: '说明',
            copySectionOps: '操作',
            copyFieldStartUrl: '起始页面',
            copyFieldCreatedAt: '录制时间',
            copyFieldDuration: '总时长',
            copyFieldStepCount: '操作步骤数',
            copyFieldTime: '时间',
            copyFieldPage: '页面',
            copyNarrationTitle: '讲解',
            copyMappedSteps: '对应步骤',
            copyMappedOps: '对应操作',
            copyEmptyOps: '暂无操作步骤',
            exportStepAlt: '步骤{step}',
            exportAgentDetail: '执行细节（给 Agent）',
            exportDocTitle: '文档说明',
            exportDocIntro: '本文档由 Onvord 浏览器录制工具自动生成，记录了用户在浏览器中的操作流程。',
            exportHowToRead: '如何阅读：',
            exportHowToReadItems: '• 每个步骤包含一个操作描述（如“点击按钮”、“输入文字”、“选择文字”等）<br>• <strong>讲解</strong>：用户在操作时的语音讲解，说明每一步的意图和上下文<br>• <strong>截图</strong>：操作时刻的页面截图，蓝色圆点标记了操作位置<br>• <strong>执行细节（给 Agent）</strong>：被操作元素的 CSS 选择器路径（默认折叠），可用于自动化复现',
            exportSummary: '信息概要：',
            exportSummaryLines: '• 起始页面：{startUrl}<br>• 录制时间：{createdAt}<br>• 共 {steps} 个操作步骤，总时长 {duration}',
            exportGeneratedBy: '由 Onvord 录制生成 · {createdAt}',
            exportStepsUnit: '步骤',
            exportLang: 'zh'
        },
        en: {
            titleTagline: 'Operate while explaining<br>AI learns your workflow instantly',
            inst1: 'Open the page you want to demonstrate',
            inst2: 'Click start below to begin recording',
            inst3: 'Perform actions while explaining by voice',
            inst4: 'Generate SOP and share with AI',
            startRecording: 'Start Recording',
            settingsLink: 'Speech Settings',
            recRecording: 'Recording',
            recDone: 'Recording Done',
            recPaused: 'Paused',
            sectionActionLog: 'Action Log',
            waitingPlaceholder: 'Waiting for actions or speech…',
            noPreview: 'No preview content',
            stopRecording: 'Stop Recording',
            pause: 'Pause',
            resume: 'Resume',
            exportSop: 'Copy Editable SOP',
            exportFullSop: 'Copy Full SOP',
            resetNarration: 'Restore Narration',
            refineCopy: 'GPT Refine & Copy',
            refiningCopy: 'Refining for Copy...',
            downloadFullSop: 'Download Full SOP',
            recordAgain: 'Record Again',
            previewEditorKicker: 'NARRATION-FIRST EDIT MODE',
            previewEditorTitle: 'Edit narration first, then copy for AI',
            previewEditorDesc: 'Left side helps you locate mapped steps. Right side is for fast narration rewriting.',
            previewLocatorTitle: 'Mapped Steps',
            previewLocatorMeta: '{count} segments',
            previewEditorPaneTitle: 'Narration Editor',
            previewEditorPaneMeta: 'Auto saved locally',
            previewNarrationLabel: 'Narration {index}',
            previewNarrationMap: 'Mapped to steps {steps}',
            previewNoMappedSteps: 'No mapped steps',
            previewLocatorEmpty: 'No editable narration segments yet.',
            previewEditorEmpty: 'No narration to edit for this recording. You can still copy the full SOP.',
            micStatusTitle: 'Speech Recognition',
            recognizing: 'Recognizing',
            screenshotPreview: 'Screenshot Preview',
            viewScreenshot: 'View Screenshot',
            actionFallback: 'Action',
            elementFallback: 'element',
            pageFallback: 'Page',
            keypressFallback: 'Shortcut',
            actionClick: 'Click {target}',
            actionPoint: 'Mark here',
            actionPointWithTarget: 'Mark here: {target}',
            actionInput: 'Type "{value}"',
            actionInputWithTarget: 'Type "{value}" in {target}',
            actionInputTargetOnly: 'Type in {target}',
            actionScroll: 'Scroll',
            actionScrollMerged: 'Scroll (merged {count})',
            actionSelect: 'Select "{value}"',
            actionSelectWithTarget: 'Select "{value}" in {target}',
            actionSelectTargetOnly: 'Select in {target}',
            actionClickElement: 'Click element',
            actionInputShort: 'Type',
            actionSelectShort: 'Select',
            actionNavigate: 'Navigate',
            clickPointScreenshot: 'Step {step} Screenshot',
            startNeedKey: 'Set API Key First',
            startNeedMic: 'Enable Microphone Access',
            startProviderUnsupported: 'Selected provider is not supported yet',
            initStt: 'Initializing speech recognition…',
            toastWsDisconnected: 'Speech connection disconnected. Pause and resume to reconnect.',
            toastNeedSetupKey: 'Configure credentials for the selected speech provider first',
            toastMicDenied: 'Microphone permission denied. Cannot start recording',
            toastNoMic: 'No microphone device found. Cannot start recording',
            toastMicBusy: 'Microphone unavailable (possibly occupied). Cannot start recording',
            toastKeyInvalid: 'Invalid Deepgram API key. Update it in settings and retry',
            toastNetwork: 'Cannot connect to Deepgram (network or DNS issue)',
            toastAliyunKeyInvalid: 'Invalid Aliyun API key, or it does not match the selected region. Check settings and retry',
            toastAliyunKeyFormat: 'Aliyun API key contains invalid characters (e.g. non-ASCII/full-width symbols). Re-copy the key',
            toastAliyunNetwork: 'Cannot connect to Aliyun (network or DNS issue)',
            toastAliyunAuthRule: 'Aliyun WebSocket auth-header rule is unavailable in this extension context. Reload extension and retry',
            toastAliyunWsHandshake: 'Aliyun key is valid but realtime websocket handshake failed after fallback attempts. Try switching region and retry',
            toastAliyunInitFailed: 'Aliyun realtime initialization failed. Check region settings; if it still fails, switch to Deepgram first',
            toastInitFailed: 'Speech recognition initialization failed. Cannot start recording',
            toastStartFailed: 'Failed to start',
            generating: 'Generating…',
            toastGenerateFailed: 'Failed to generate SOP',
            toastGenerateError: 'Generation failed',
            toastPaused: 'Paused',
            toastResumeSttFailed: 'Failed to resume speech recognition. Check microphone and provider credentials',
            toastResumed: 'Recording resumed',
            toastPauseResumeFailed: 'Pause/Resume failed',
            exportSuccess: '✅ Editable SOP copied to clipboard',
            exportFullSuccess: '✅ Full SOP copied to clipboard',
            downloadSuccess: '✅ Full SOP downloaded',
            toastCopyFailed: 'Failed to copy SOP',
            refineCopySuccess: 'GPT-refined narration copied to clipboard',
            toastNeedLlmSetup: 'Configure the GPT endpoint URL, API key, and model in settings first',
            toastRefineFailed: 'GPT refinement failed',
            toastRefineParseFailed: 'GPT response could not be parsed',
            toastLlmDisabled: 'GPT refinement is disabled. Turn it on in settings first',
            toastNarrationReset: 'Narration restored and local memory cleared',
            toastAutoStopped: 'Recording time limit reached. Stopped automatically',
            toastRestricted: 'Recording is unavailable on this page',
            recoveryPrompt: 'Found recording data from {ago} minutes ago ({count} action groups). Restore?',
            toastRecoverySttFailed: 'Failed to recover speech recognition',
            toastGenerateRecovered: 'Primary stop did not return. Recovered the local SOP instead',
            copySectionIntro: 'SOP Overview',
            copySectionNotes: 'Notes',
            copySectionOps: 'Operations',
            copyFieldStartUrl: 'Start page',
            copyFieldCreatedAt: 'Recorded at',
            copyFieldDuration: 'Duration',
            copyFieldStepCount: 'Action steps',
            copyFieldTime: 'Time',
            copyFieldPage: 'Page',
            copyNarrationTitle: 'Narration',
            copyMappedSteps: 'Mapped Steps',
            copyMappedOps: 'Mapped Operations',
            copyEmptyOps: 'No action steps',
            exportStepAlt: 'Step {step}',
            exportAgentDetail: 'Execution Details (For Agent)',
            exportDocTitle: 'Document Notes',
            exportDocIntro: 'This document is automatically generated by Onvord and records the browser operation workflow.',
            exportHowToRead: 'How to read:',
            exportHowToReadItems: '• Each step includes an action description (e.g. click, input, select)<br>• <strong>Narration</strong>: voice explanation during operation, describing intent and context<br>• <strong>Screenshot</strong>: page screenshot at operation time with click marker<br>• <strong>Execution Details (For Agent)</strong>: CSS selector path of target element (collapsed by default) for automation replay',
            exportSummary: 'Summary:',
            exportSummaryLines: '• Start page: {startUrl}<br>• Recorded at: {createdAt}<br>• {steps} action steps, total duration {duration}',
            exportGeneratedBy: 'Generated by Onvord · {createdAt}',
            exportStepsUnit: 'steps',
            exportLang: 'en'
        }
    };

    Object.assign(I18N.zh, {
        startManual: '开始说明',
        manualModeChip: '文字说明',
        manualModeTitle: '文字说明',
        manualModeHint: '先操作，再用文字补充你刚刚做了什么、目的是什么。按 Ctrl+Enter 可快速加入。',
        manualModePlaceholder: '输入这一步的说明，让 AI 更容易理解你的意图和要求',
        manualAdd: '加入说明',
        manualClear: '清空',
        manualBadgeTitle: '文字说明模式',
        manualNoteEmpty: '请输入说明内容',
        manualNoteAdded: '说明已加入时间线',
        recRecordingManual: '文字说明中'
    });
    Object.assign(I18N.en, {
        startManual: 'Start Typing Notes',
        manualModeChip: 'Typing',
        manualModeTitle: 'Type Explanation',
        manualModeHint: 'Operate first, then type what you did and why. Press Ctrl+Enter to add it.',
        manualModePlaceholder: 'Describe what you just did and what the AI should understand from this step',
        manualAdd: 'Add Explanation',
        manualClear: 'Clear',
        manualBadgeTitle: 'Typing Notes Mode',
        manualNoteEmpty: 'Type an explanation first',
        manualNoteAdded: 'Explanation added to timeline',
        recRecordingManual: 'Typing Notes'
    });

    Object.assign(I18N.zh, {
        startManual: '开始说明',
        manualModeChip: '文字说明',
        manualModeTitle: '文字说明',
        manualModeHint: '先操作，再用文字补充你刚刚做了什么、目的是什么。按 Enter 加入，Shift+Enter 换行。',
        manualModePlaceholder: '输入这一步的说明，让 AI 更容易理解你的意图和要求',
        manualAdd: '加入说明',
        manualClear: '清空',
        manualBadgeTitle: '文字说明模式',
        manualNoteEmpty: '请输入说明内容',
        manualNoteAdded: '说明已加入时间线',
        recRecordingManual: '文字说明中'
    });
    Object.assign(I18N.en, {
        manualModeHint: 'Operate first, then type what you did and why. Press Enter to add it, or Shift+Enter for a new line.'
    });
    Object.assign(I18N.zh, {
        markArea: '标记位置',
        toastCaptureReady: '拖拽框选要标记的区域',
        toastCaptureQueued: '已标记该区域，正在保存局部截图',
        toastCaptureSaved: '局部截图已保存',
        toastCaptureFailed: '区域已标记，但局部截图保存失败',
        toastCaptureStartFailed: '无法进入标记模式'
    });
    Object.assign(I18N.en, {
        markArea: 'Mark Area',
        toastCaptureReady: 'Drag to mark an area',
        toastCaptureQueued: 'Area marked. Saving local snapshot...',
        toastCaptureSaved: 'Local area saved',
        toastCaptureFailed: 'Area marked, but the local snapshot failed',
        toastCaptureStartFailed: 'Could not start area marking'
    });

    function t(key, vars = {}) {
        const table = I18N[uiLocale] || I18N.en;
        let text = table[key] || I18N.en[key] || key;
        for (const [k, v] of Object.entries(vars)) {
            text = text.replaceAll(`{${k}}`, String(v));
        }
        return text;
    }

    function setText(id, text) {
        const el = $(id);
        if (el) el.textContent = text;
    }

    function isManualMode() {
        return recordingMode === 'text';
    }

    function recordingElapsedMs() {
        return Math.max(0, Date.now() - startTime - pausedDuration);
    }

    function syncNarrationModeUi() {
        const manual = isManualMode();
        const showManualComposer = manual && currentView === 'recording' && recordingLayoutMode !== 'preview';
        const canEditManual = showManualComposer && !isPaused;

        manualComposeEl?.classList.toggle('hidden', !showManualComposer);
        if (manualNoteInputEl) manualNoteInputEl.disabled = !canEditManual;
        if (btnAddNote) btnAddNote.disabled = !canEditManual;
        if (btnClearNote) btnClearNote.disabled = !showManualComposer;

        if (micStatusEl) {
            micStatusEl.classList.toggle('manual', manual);
            micStatusEl.setAttribute('title', manual ? t('manualBadgeTitle') : t('micStatusTitle'));
        }
        if (micIconEl) micIconEl.textContent = manual ? '⌨️' : '🎙️';
        if (modeChipEl) {
            modeChipEl.textContent = t('manualModeChip');
            modeChipEl.classList.toggle('hidden', !manual);
        }
        volIndicator?.classList.toggle('hidden', manual);
        if (manualComposeTitleEl) manualComposeTitleEl.textContent = t('manualModeTitle');
        if (manualComposeHintEl) manualComposeHintEl.textContent = t('manualModeHint');
        if (manualNoteInputEl) manualNoteInputEl.placeholder = t('manualModePlaceholder');
        if (btnAddNote) btnAddNote.textContent = t('manualAdd');
        if (btnClearNote) btnClearNote.textContent = t('manualClear');
        if (recLabelEl && currentView === 'recording' && recordingLayoutMode !== 'preview') {
            recLabelEl.textContent = isPaused
                ? t('recPaused')
                : (manual ? t('recRecordingManual') : t('recRecording'));
        }
    }

    function applyUiLocale() {
        document.documentElement.lang = uiLocale === 'zh' ? 'zh-CN' : 'en';
        const tagline = $('tagline');
        if (tagline) tagline.innerHTML = t('titleTagline');
        setText('inst-1', t('inst1'));
        setText('inst-2', t('inst2'));
        setText('inst-3', t('inst3'));
        setText('inst-4', t('inst4'));
        setText('link-settings', t('settingsLink'));
        setText('btn-start-manual', t('startManual'));
        setText('sec-title-text', t('sectionActionLog'));
        setText('timeline-placeholder', t('waitingPlaceholder'));
        if (btnMarkArea) btnMarkArea.innerHTML = `<span class="bi">⌗</span>${escapeHtml(t('markArea'))}`;
        imgViewerCloseEl?.setAttribute('aria-label', t('screenshotPreview'));
        if (imgViewerImgEl) imgViewerImgEl.alt = t('screenshotPreview');
        enableStartButton();
        setPauseButton(false);
        if (btnStop) btnStop.innerHTML = `<span class="bi">⏹</span>${t('stopRecording')}`;
        if (btnExport) btnExport.textContent = t('exportSop');
        if (btnCopyFull) btnCopyFull.textContent = t('exportFullSop');
        if (btnResetNarration) btnResetNarration.textContent = t('resetNarration');
        if (btnRefineCopy) btnRefineCopy.textContent = t('refineCopy');
        if (btnDownload) btnDownload.textContent = t('downloadFullSop');
        if (btnRedo) btnRedo.textContent = t('recordAgain');
        if (previewEditorKickerEl) previewEditorKickerEl.textContent = t('previewEditorKicker');
        if (previewEditorTitleEl) previewEditorTitleEl.textContent = t('previewEditorTitle');
        if (previewEditorDescEl) previewEditorDescEl.textContent = t('previewEditorDesc');
        if (previewLocatorPaneTitleEl) previewLocatorPaneTitleEl.textContent = t('previewLocatorTitle');
        if (previewLocatorPaneMetaEl) previewLocatorPaneMetaEl.textContent = t('previewLocatorMeta', { count: 0 });
        if (previewEditorPaneTitleEl) previewEditorPaneTitleEl.textContent = t('previewEditorPaneTitle');
        if (previewEditorPaneMetaEl) previewEditorPaneMetaEl.textContent = t('previewEditorPaneMeta');
        if (previewLocatorEmptyEl) previewLocatorEmptyEl.textContent = t('previewLocatorEmpty');
        if (previewEditorEmptyEl) previewEditorEmptyEl.textContent = t('previewEditorEmpty');
        syncNarrationModeUi();
    }

    function applyLlmAvailability(enabled) {
        llmEnabled = normalizeLlmEnabled(enabled);
        btnRefineCopy?.classList.toggle('hidden', !llmEnabled);
        if (btnRefineCopy) btnRefineCopy.disabled = !llmEnabled;
    }

    function normalizeNarrationDraftText(text) {
        return String(text == null ? '' : text)
            .replace(/\r\n/g, '\n')
            .trim();
    }

    function hashString(text) {
        let hash = 2166136261;
        const value = String(text || '');
        for (let i = 0; i < value.length; i++) {
            hash ^= value.charCodeAt(i);
            hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        }
        return (hash >>> 0).toString(16);
    }

    function buildSopDraftId(sop) {
        const stepFingerprint = (Array.isArray(sop?.steps) ? sop.steps : []).map((step) => {
            const ts = Number(step?.timestampMs);
            const actionType = normalizeActionTypeForExport(step?.action?.type || step?.actionType || '');
            const desc = normalizeNarrationText(step?.action?.description || '');
            return [
                Number.isFinite(ts) ? ts : '',
                actionType,
                desc
            ].join('~');
        }).join('|');
        const narrationFingerprint = (Array.isArray(sop?.segments) ? sop.segments : [])
            .filter((seg) => seg?.type === 'voice')
            .map((seg) => [
                seg?.timeRange || '',
                normalizeNarrationDraftText(seg?.narration || '')
            ].join('~'))
            .join('|');
        const raw = [
            sop?.startUrl || '',
            sop?.totalSteps || 0,
            sop?.duration || 0,
            stepFingerprint,
            narrationFingerprint
        ].join('|');
        return `sop_${hashString(raw)}`;
    }

    async function getNarrationDraftStore() {
        const data = await new Promise((resolve) => chrome.storage.local.get([NARRATION_DRAFTS_STORAGE_KEY], resolve));
        const store = data?.[NARRATION_DRAFTS_STORAGE_KEY];
        return store && typeof store === 'object' ? store : {};
    }

    async function setNarrationDraftStore(store) {
        await chrome.storage.local.set({ [NARRATION_DRAFTS_STORAGE_KEY]: store }).catch(() => { });
    }

    function serializeNarrationOverrides(overrides) {
        if (!(overrides instanceof Map)) return [];
        return Array.from(overrides.entries())
            .map(([segment_index, text]) => ({
                segment_index,
                text: normalizeNarrationDraftText(text)
            }))
            .filter((item) => Number.isInteger(Number(item.segment_index)));
    }

    function deserializeNarrationOverrides(items) {
        const map = new Map();
        if (!Array.isArray(items)) return map;
        for (const item of items) {
            const segIndex = Number(item?.segment_index);
            if (!Number.isInteger(segIndex)) continue;
            map.set(segIndex, normalizeNarrationDraftText(item?.text || ''));
        }
        return map;
    }

    function buildRefinementContentFingerprint(sop, overrides = new Map()) {
        const { segments } = getExportPresentation(sop);
        const raw = segments
            .map((seg, segIndex) => {
                if (seg?.type !== 'voice') return '';
                const narration = normalizeNarrationDraftText(getNarrationOverrideText(
                    overrides,
                    segIndex,
                    normalizeNarrationDraftText(seg?.narration || '')
                ));
                return [segIndex, seg?.timeRange || '', narration].join('~');
            })
            .filter(Boolean)
            .join('|');
        return `ref_${hashString(raw)}`;
    }

    async function getRefinementCacheStore() {
        const data = await new Promise((resolve) => chrome.storage.local.get([REFINEMENT_CACHE_STORAGE_KEY], resolve));
        const store = data?.[REFINEMENT_CACHE_STORAGE_KEY];
        return store && typeof store === 'object' ? store : {};
    }

    async function setRefinementCacheStore(store) {
        await chrome.storage.local.set({ [REFINEMENT_CACHE_STORAGE_KEY]: store }).catch(() => { });
    }

    async function readCachedRefinement(draftId, contentFingerprint) {
        if (!draftId || !contentFingerprint) return null;
        const store = await getRefinementCacheStore();
        const bucket = store?.[draftId];
        const entry = bucket?.[contentFingerprint];
        if (!entry || typeof entry !== 'object') return null;
        return {
            updatedAt: Number(entry.updatedAt) || 0,
            title: String(entry.title || ''),
            narrationOverrides: deserializeNarrationOverrides(entry.narrationOverrides)
        };
    }

    async function writeCachedRefinement(draftId, contentFingerprint, title, narrationOverrides) {
        if (!draftId || !contentFingerprint) return;
        const store = await getRefinementCacheStore();
        const bucket = store?.[draftId] && typeof store[draftId] === 'object'
            ? store[draftId]
            : {};
        bucket[contentFingerprint] = {
            updatedAt: Date.now(),
            title: String(title || ''),
            narrationOverrides: serializeNarrationOverrides(narrationOverrides)
        };
        store[draftId] = bucket;
        await setRefinementCacheStore(store);
    }

    async function persistCurrentNarrationDrafts() {
        if (narrationDraftPersistTimer) {
            clearTimeout(narrationDraftPersistTimer);
            narrationDraftPersistTimer = 0;
        }
        if (!currentNarrationDraftId) return;
        const store = await getNarrationDraftStore();
        if (!currentNarrationDraftMap.size) {
            delete store[currentNarrationDraftId];
            await setNarrationDraftStore(store);
            return;
        }
        store[currentNarrationDraftId] = {
            updatedAt: Date.now(),
            title: currentSOP?.title || '',
            items: Array.from(currentNarrationDraftMap.entries()).map(([segment_index, edited_narration]) => ({
                segment_index,
                edited_narration
            }))
        };
        await setNarrationDraftStore(store);
    }

    function scheduleNarrationDraftPersist() {
        if (!currentNarrationDraftId) return;
        if (narrationDraftPersistTimer) clearTimeout(narrationDraftPersistTimer);
        narrationDraftPersistTimer = window.setTimeout(() => {
            persistCurrentNarrationDrafts().catch((e) => {
                console.warn('Persist narration drafts failed:', e);
            });
        }, 220);
    }

    async function loadNarrationDraftsForSop(sop) {
        currentNarrationDraftId = buildSopDraftId(sop);
        currentNarrationDraftMap = new Map();
        const store = await getNarrationDraftStore();
        const items = Array.isArray(store?.[currentNarrationDraftId]?.items)
            ? store[currentNarrationDraftId].items
            : [];
        for (const item of items) {
            const segIndex = Number(item?.segment_index);
            if (!Number.isInteger(segIndex)) continue;
            currentNarrationDraftMap.set(segIndex, normalizeNarrationDraftText(item?.edited_narration || ''));
        }
    }

    async function clearNarrationDraftsForCurrentSop() {
        currentNarrationDraftMap = new Map();
        if (!currentNarrationDraftId) return;
        if (narrationDraftPersistTimer) {
            clearTimeout(narrationDraftPersistTimer);
            narrationDraftPersistTimer = 0;
        }
        const store = await getNarrationDraftStore();
        delete store[currentNarrationDraftId];
        await setNarrationDraftStore(store);
    }

    function getNarrationOverrideText(overrides, segIndex, fallbackText = '') {
        if (!(overrides instanceof Map)) return fallbackText;
        return overrides.has(segIndex)
            ? String(overrides.get(segIndex) ?? '')
            : fallbackText;
    }

    function formatStepRange(stepNumbers) {
        const numbers = Array.from(new Set((Array.isArray(stepNumbers) ? stepNumbers : [])
            .map((n) => Number(n))
            .filter(Number.isFinite)))
            .sort((a, b) => a - b);
        if (!numbers.length) return t('previewNoMappedSteps');
        const ranges = [];
        let start = numbers[0];
        let end = numbers[0];
        for (let i = 1; i < numbers.length; i++) {
            const current = numbers[i];
            if (current === end + 1) {
                end = current;
                continue;
            }
            ranges.push(start === end ? `${start}` : `${start}-${end}`);
            start = current;
            end = current;
        }
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        return ranges.join(', ');
    }

    function summarizeStepsForLocator(steps) {
        const summary = (steps || []).map((step) => {
            const desc = normalizeNarrationText(step?.action?.description || step?.action?.type || t('actionFallback'));
            const no = Number(step?.stepNumber);
            return Number.isFinite(no) ? `${no}. ${desc}` : desc;
        }).filter(Boolean);
        return summary.join(' · ');
    }

    function autoResizeNarrationTextarea(textarea) {
        if (!textarea) return;
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.max(textarea.scrollHeight, 120)}px`;
    }

    function buildNarrationEditorModel(sop, overrides = currentNarrationDraftMap) {
        const { segments, totalSteps } = getExportPresentation(sop);
        const items = [];
        let displayIndex = 0;

        segments.forEach((seg, segIndex) => {
            const originalNarration = normalizeNarrationDraftText(seg?.narration || '');
            const overrideText = getNarrationOverrideText(overrides, segIndex, originalNarration);
            const isVoice = seg?.type === 'voice' && (isMeaningfulNarration(originalNarration) || overrides.has(segIndex));
            if (!isVoice) return;

            displayIndex += 1;
            const stepNumbers = (seg?.steps || [])
                .map((step) => Number(step?.stepNumber))
                .filter(Number.isFinite);
            items.push({
                segmentIndex: segIndex,
                displayIndex,
                label: t('previewNarrationLabel', { index: String(displayIndex).padStart(2, '0') }),
                stepNumbers,
                stepRangeText: formatStepRange(stepNumbers),
                stepSummary: summarizeStepsForLocator(seg?.steps || []),
                originalNarration,
                editedNarration: overrideText,
                steps: seg?.steps || [],
                segment: seg
            });
        });

        return { items, totalSteps, segments };
    }

    function updatePreviewActionState(itemCount = 0) {
        if (btnExport) btnExport.disabled = !currentSOP;
        if (btnCopyFull) btnCopyFull.disabled = !currentSOP;
        if (btnResetNarration) btnResetNarration.disabled = !currentSOP || !itemCount || !currentNarrationDraftMap.size;
    }

    function setActiveNarrationSegment(segmentIndex, options = {}) {
        activeNarrationSegmentIndex = Number.isInteger(segmentIndex) ? segmentIndex : null;
        const locatorGroups = Array.from(previewLocatorListEl?.querySelectorAll('.locator-group') || []);
        const narrationCards = Array.from(previewNarrationCardsEl?.querySelectorAll('.narration-card') || []);
        let activeGroup = null;
        let activeCard = null;

        locatorGroups.forEach((group) => {
            const current = Number(group.getAttribute('data-segment-index'));
            const isActive = current === activeNarrationSegmentIndex;
            group.classList.toggle('locator-group-active', isActive);
            if (isActive) activeGroup = group;
        });

        narrationCards.forEach((card) => {
            const current = Number(card.getAttribute('data-segment-index'));
            const isActive = current === activeNarrationSegmentIndex;
            card.classList.toggle('narration-card-active', isActive);
            if (isActive) activeCard = card;
        });

        if (options.scrollLocator && activeGroup) {
            activeGroup.scrollIntoView({ block: 'nearest', behavior: options.behavior || 'smooth' });
        }
        if (options.scrollEditor && activeCard) {
            activeCard.scrollIntoView({ block: 'nearest', behavior: options.behavior || 'smooth' });
        }
        if (options.focusEditor && activeCard) {
            const textarea = activeCard.querySelector('.narration-textarea');
            textarea?.focus({ preventScroll: true });
        }
    }

    function renderNarrationEditor(sop) {
        if (!previewLocatorListEl || !previewNarrationCardsEl || !sop) return;

        const { items } = buildNarrationEditorModel(sop);
        previewLocatorListEl.replaceChildren();
        previewNarrationCardsEl.replaceChildren();

        if (previewLocatorPaneMetaEl) previewLocatorPaneMetaEl.textContent = t('previewLocatorMeta', { count: items.length });
        if (previewEditorPaneMetaEl) previewEditorPaneMetaEl.textContent = t('previewEditorPaneMeta');

        if (!items.length) {
            previewLocatorEmptyEl?.classList.remove('hidden');
            previewEditorEmptyEl?.classList.remove('hidden');
            if (previewLocatorEmptyEl) previewLocatorListEl.appendChild(previewLocatorEmptyEl);
            if (previewEditorEmptyEl) previewNarrationCardsEl.appendChild(previewEditorEmptyEl);
            activeNarrationSegmentIndex = null;
            updatePreviewActionState(0);
            return;
        }

        previewLocatorEmptyEl?.classList.add('hidden');
        previewEditorEmptyEl?.classList.add('hidden');

        items.forEach((item) => {
            const locatorButton = document.createElement('button');
            locatorButton.type = 'button';
            locatorButton.className = 'locator-group';
            locatorButton.setAttribute('data-segment-index', String(item.segmentIndex));
            locatorButton.innerHTML = `
                <div class="locator-group-head">
                    <span class="locator-group-title">${escapeHtml(item.label)}</span>
                    <span class="locator-group-map">${escapeHtml(t('previewNarrationMap', { steps: item.stepRangeText }))}</span>
                </div>
                <div class="locator-group-steps">${escapeHtml(item.stepSummary || t('previewNoMappedSteps'))}</div>
            `;
            previewLocatorListEl.appendChild(locatorButton);

            const card = document.createElement('article');
            card.className = 'narration-card';
            card.setAttribute('data-segment-index', String(item.segmentIndex));

            const head = document.createElement('div');
            head.className = 'narration-card-head';
            head.innerHTML = `
                <span class="narration-card-title">${escapeHtml(item.label)}</span>
                <span class="narration-card-map">${escapeHtml(t('previewNarrationMap', { steps: item.stepRangeText }))}</span>
            `;

            const textarea = document.createElement('textarea');
            textarea.className = 'narration-textarea';
            textarea.rows = 4;
            textarea.value = item.editedNarration;
            textarea.setAttribute('data-segment-index', String(item.segmentIndex));
            textarea.setAttribute('data-original-narration', item.originalNarration);

            card.appendChild(head);
            card.appendChild(textarea);
            previewNarrationCardsEl.appendChild(card);
            autoResizeNarrationTextarea(textarea);
        });

        const preferredActive = items.some((item) => item.segmentIndex === activeNarrationSegmentIndex)
            ? activeNarrationSegmentIndex
            : items[0].segmentIndex;
        setActiveNarrationSegment(preferredActive, { behavior: 'auto' });
        updatePreviewActionState(items.length);
    }

    function getCurrentNarrationOverrides() {
        return new Map(currentNarrationDraftMap);
    }

    async function maybeRestoreDraftPreview() {
        const [draftStore, refinementStore] = await Promise.all([
            getNarrationDraftStore(),
            getRefinementCacheStore()
        ]);
        if (!Object.keys(draftStore).length && !Object.keys(refinementStore).length) return false;
        const sop = await requestSopFallback();
        if (!sop) return false;
        const draftId = buildSopDraftId(sop);
        const hasDraft = Boolean(draftStore[draftId]);
        const refinementBucket = refinementStore[draftId];
        const hasRefinement = Boolean(
            refinementBucket &&
            typeof refinementBucket === 'object' &&
            Object.keys(refinementBucket).length
        );
        if (!hasDraft && !hasRefinement) return false;
        showSopPreview(sop);
        return true;
    }

    /* ── Helpers ── */
    function switchView(v) {
        currentView = v;
        Object.entries(views).forEach(([k, el]) => {
            if (!el) return;
            el.classList.toggle('active', k === v);
        });
        syncNarrationModeUi();
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
    function safeFilename(name) {
        return String(name || 'SOP')
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
            .replace(/\s+/g, '_')
            .slice(0, 120);
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
    function openMicPermissionGuide() {
        try {
            chrome.tabs.create({ url: chrome.runtime.getURL('mic-permission.html') });
        } catch (e) {
            console.warn('Open mic permission guide failed:', e);
        }
    }

    function showSopPreview(sop) {
        if (narrationDraftPersistTimer) {
            clearTimeout(narrationDraftPersistTimer);
            narrationDraftPersistTimer = 0;
        }
        currentSOP = sop;
        applySopScreenshotsToCurrentTimeline(sop);
        renderSOP(sop);
        switchView('recording');
        setRecordingLayout('preview');
        currentNarrationDraftId = buildSopDraftId(sop);
        currentNarrationDraftMap = new Map();
        activeNarrationSegmentIndex = null;
        previewLocatorListEl?.replaceChildren();
        previewNarrationCardsEl?.replaceChildren();
        updatePreviewActionState(0);
        loadNarrationDraftsForSop(sop)
            .catch((e) => {
                console.warn('Load narration drafts failed:', e);
            })
            .finally(() => {
                if (currentSOP !== sop) return;
                renderNarrationEditor(sop);
            });
    }

    async function triggerActiveTabShiftCapture() {
        if (currentView !== 'recording') return { success: false, reason: 'not-recording' };
        if (recordingLayoutMode === 'preview') return { success: false, reason: 'preview' };
        if (isPaused) return { success: false, reason: 'paused' };
        try {
            return await chrome.runtime.sendMessage({ type: 'TRIGGER_SHIFT_CAPTURE' });
        } catch (e) {
            console.warn('Trigger active tab shift capture failed:', e);
            return { success: false, reason: 'start-shift-capture-failed' };
        }
    }

    async function handleMarkAreaClick() {
        const res = await triggerActiveTabShiftCapture();
        if (res?.success) {
            toast(t('toastCaptureReady'));
            return;
        }
        if (res?.reason === 'restricted-page') {
            toast(t('toastRestricted'));
            return;
        }
        if (res?.reason === 'not-recording' || res?.reason === 'preview' || res?.reason === 'paused') {
            return;
        }
        toast(t('toastCaptureStartFailed'));
    }

    async function sendRuntimeMessageWithTimeout(message, timeoutMs, timeoutCode) {
        let timerId = 0;
        const timeoutPromise = new Promise((_, reject) => {
            timerId = window.setTimeout(() => reject(new Error(timeoutCode)), timeoutMs);
        });
        try {
            return await Promise.race([
                chrome.runtime.sendMessage(message),
                timeoutPromise
            ]);
        } finally {
            window.clearTimeout(timerId);
        }
    }

    async function requestSopFallback() {
        try {
            const res = await sendRuntimeMessageWithTimeout({ type: 'GET_SOP' }, GET_SOP_TIMEOUT_MS, 'get-sop-timeout');
            return res?.sop || null;
        } catch (e) {
            console.warn('GET_SOP fallback failed:', e);
            return null;
        }
    }

    async function stopRecordingWithFallback() {
        try {
            const res = await sendRuntimeMessageWithTimeout({ type: 'STOP_RECORDING' }, STOP_RECORDING_TIMEOUT_MS, 'stop-recording-timeout');
            if (res?.success && res.sop) {
                return { sop: res.sop, usedFallback: false };
            }
        } catch (e) {
            console.warn('STOP_RECORDING failed:', e);
        }

        const fallbackSop = await requestSopFallback();
        if (fallbackSop) {
            return { sop: fallbackSop, usedFallback: true };
        }
        return null;
    }

    let isPaused = false;
    let pausedDuration = 0;
    let recordingMode = 'voice';
    let recordingLayoutMode = 'live';
    const RECORDING_LIMIT_MS = 10 * 60 * 1000;

    function evIcon(t) {
        switch (t) {
            case 'click': return '👆';
            case 'point': return '📌';
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
    const STT_PROVIDER = {
        DEEPGRAM: 'deepgram',
        ALIYUN: 'aliyun'
    };
    const STT_SETTINGS_KEYS = [
        'sttProvider',
        'deepgramKey',
        'deepgramLang',
        'aliyunKey',
        'aliyunRegion',
        'aliyunModel'
    ];
    const STT_SETTINGS_DEFAULTS = {
        sttProvider: STT_PROVIDER.ALIYUN,
        deepgramLang: 'zh-CN',
        aliyunRegion: 'cn',
        aliyunModel: 'qwen3-asr-flash-realtime'
    };
    const LLM_SETTINGS_KEYS = ['llmEnabled', 'llmBaseUrl', 'llmApiKey', 'llmModel'];
    const LLM_SETTINGS_DEFAULTS = {
        llmEnabled: false,
        llmBaseUrl: 'https://gmn.chuangzuoli.com/v1/responses',
        llmModel: 'gpt-5.4'
    };
    const NARRATION_DRAFTS_STORAGE_KEY = 'sopNarrationDrafts';
    const REFINEMENT_CACHE_STORAGE_KEY = 'sopRefinementCache';
    const LLM_REQUEST_TIMEOUT_MS = 30000;
    const STOP_RECORDING_TIMEOUT_MS = 10000;
    const GET_SOP_TIMEOUT_MS = 3000;
    const ALIYUN_WS_AUTH_RULE_IDS = [391001, 391002, 391003];
    const ALIYUN_WS_AUTH_HOSTS = [
        'dashscope.aliyuncs.com',
        'dashscope-us.aliyuncs.com',
        'dashscope-intl.aliyuncs.com'
    ];
    let sttEngine = null;
    let sttSocket = null;
    let mediaRecorder = null;
    let aliyunAudioCtx = null;
    let aliyunAudioSource = null;
    let aliyunAudioProcessor = null;
    let aliyunAudioProcessorMode = '';
    let aliyunAudioSink = null;
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

    function resolveSttProvider(provider) {
        if (provider === STT_PROVIDER.DEEPGRAM) return STT_PROVIDER.DEEPGRAM;
        return STT_PROVIDER.ALIYUN;
    }

    function normalizeDeepgramLanguage(lang) {
        return lang === 'en-US' ? 'en-US' : 'zh-CN';
    }

    function normalizeAliyunLanguage(lang) {
        return lang === 'en-US' ? 'en' : 'zh';
    }

    function normalizeAliyunRegion(region) {
        if (region === 'intl' || region === 'us') return region;
        return 'cn';
    }

    function getAliyunRegionCandidates(preferredRegion) {
        const first = normalizeAliyunRegion(preferredRegion);
        return Array.from(new Set([first, 'cn', 'us', 'intl']));
    }

    function getAliyunHost(region) {
        const normalized = normalizeAliyunRegion(region);
        if (normalized === 'intl') return 'dashscope-intl.aliyuncs.com';
        if (normalized === 'us') return 'dashscope-us.aliyuncs.com';
        return 'dashscope.aliyuncs.com';
    }

    function getAliyunRealtimeWsAttempts(region, model, apiKey, options = {}) {
        const { preferHeaderAuth = false } = options;
        const host = getAliyunHost(region);
        const encodedModel = encodeURIComponent(model);
        const keyProtocol = `openai-insecure-api-key.${apiKey}`;
        const betaProtocol = 'openai-beta.realtime-v1';
        const attempts = [];

        if (preferHeaderAuth) {
            attempts.push(
                {
                    label: 'apiws-header-auth',
                    url: `wss://${host}/api-ws/v1/realtime?model=${encodedModel}`,
                    protocols: []
                },
                {
                    label: 'apiws-header-auth-beta-subprotocol',
                    url: `wss://${host}/api-ws/v1/realtime?model=${encodedModel}`,
                    protocols: [betaProtocol]
                },
                {
                    label: 'compatible-header-auth',
                    url: `wss://${host}/compatible-mode/v1/realtime?model=${encodedModel}`,
                    protocols: []
                },
                {
                    label: 'compatible-ws-header-auth',
                    url: `wss://${host}/compatible-mode/v1/realtime/ws?model=${encodedModel}`,
                    protocols: []
                }
            );
        }

        attempts.push(
            {
                label: 'compatible-ws-subprotocol',
                url: `wss://${host}/compatible-mode/v1/realtime/ws?model=${encodedModel}`,
                protocols: [keyProtocol, betaProtocol]
            },
            {
                label: 'compatible-subprotocol',
                url: `wss://${host}/compatible-mode/v1/realtime?model=${encodedModel}`,
                protocols: [keyProtocol, betaProtocol]
            },
            {
                label: 'compatible-ws-subprotocol-legacy',
                url: `wss://${host}/compatible-mode/v1/realtime/ws?model=${encodedModel}`,
                protocols: ['realtime', keyProtocol, betaProtocol]
            },
            {
                label: 'apiws-subprotocol',
                url: `wss://${host}/api-ws/v1/realtime?model=${encodedModel}`,
                protocols: [keyProtocol, betaProtocol]
            },
        );
        return attempts;
    }

    function sanitizeAliyunWsLog(wsUrl, protocols) {
        const safeUrl = String(wsUrl || '').replace(/([?&](?:api[-_]?key)=)[^&]+/ig, '$1***');
        const safeProtocols = (Array.isArray(protocols) ? protocols : []).map((item) => {
            const text = String(item || '');
            if (text.startsWith('openai-insecure-api-key.')) return 'openai-insecure-api-key.***';
            return text;
        });
        return { safeUrl, safeProtocols };
    }

    function getAliyunWsRuleRegex(host) {
        const escaped = String(host || '').replace(/\./g, '\\.');
        return `^wss://${escaped}/(?:api-ws/v1/realtime|compatible-mode/v1/realtime(?:/ws)?)\\?.*`;
    }

    async function applyAliyunWsAuthRules(apiKey) {
        const dnr = chrome.declarativeNetRequest;
        if (!dnr?.updateSessionRules) {
            return { ok: false, reason: 'dnr-unavailable' };
        }
        const bearer = `Bearer ${apiKey}`;
        const addRules = ALIYUN_WS_AUTH_RULE_IDS.map((id, idx) => ({
            id,
            priority: 10,
            action: {
                type: 'modifyHeaders',
                requestHeaders: [
                    { header: 'Authorization', operation: 'set', value: bearer },
                    { header: 'OpenAI-Beta', operation: 'set', value: 'realtime=v1' }
                ]
            },
            condition: {
                regexFilter: getAliyunWsRuleRegex(ALIYUN_WS_AUTH_HOSTS[idx]),
                resourceTypes: ['websocket']
            }
        }));
        try {
            await dnr.updateSessionRules({ removeRuleIds: ALIYUN_WS_AUTH_RULE_IDS, addRules });
            return { ok: true, reason: 'ok' };
        } catch (e) {
            console.warn('Aliyun WS auth rule apply failed:', String(e?.message || e || ''));
            return { ok: false, reason: 'dnr-update-failed' };
        }
    }

    function clearAliyunWsAuthRules() {
        const dnr = chrome.declarativeNetRequest;
        if (!dnr?.updateSessionRules) return;
        dnr.updateSessionRules({ removeRuleIds: ALIYUN_WS_AUTH_RULE_IDS }).catch(() => { });
    }


    function getAliyunProbeBase(region) {
        return `https://${getAliyunHost(region)}`;
    }

    function containsNonLatin1(text) {
        const value = String(text || '');
        for (let i = 0; i < value.length; i++) {
            if (value.charCodeAt(i) > 255) return true;
        }
        return false;
    }

    function normalizeCredentialValue(value) {
        return String(value || '')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/\s+/g, '')
            .trim();
    }

    function normalizeLlmUrl(url) {
        let value = String(url || LLM_SETTINGS_DEFAULTS.llmBaseUrl).trim().replace(/\s+/g, '');
        if (!value) return '';
        if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
        try {
            const parsed = new URL(value);
            parsed.hash = '';
            parsed.search = '';
            let path = String(parsed.pathname || '').replace(/\/+$/, '');
            if (!path || path === '/') {
                path = '/v1/responses';
            } else if (/\/v1$/i.test(path)) {
                path = `${path}/responses`;
            }
            parsed.pathname = path;
            return parsed.toString().replace(/\/$/, '');
        } catch {
            value = value.replace(/\/+$/, '');
            if (/\/v1$/i.test(value)) return `${value}/responses`;
            if (!/\/v1\/responses$/i.test(value) && /^https?:\/\/[^/]+$/i.test(value)) return `${value}/v1/responses`;
            return value;
        }
    }

    function normalizeLlmModel(model) {
        return String(model || LLM_SETTINGS_DEFAULTS.llmModel).trim() || LLM_SETTINGS_DEFAULTS.llmModel;
    }

    function normalizeLlmEnabled(value) {
        return value === true;
    }

    async function getSttSettings() {
        const data = await new Promise(resolve => chrome.storage.local.get(STT_SETTINGS_KEYS, resolve));
        const merged = { ...STT_SETTINGS_DEFAULTS, ...(data || {}) };
        const normalizedProvider = resolveSttProvider(merged.sttProvider);
        if (normalizedProvider !== merged.sttProvider) {
            merged.sttProvider = normalizedProvider;
            chrome.storage.local.set({ sttProvider: normalizedProvider }).catch(() => { });
        }
        merged.deepgramKey = normalizeCredentialValue(merged.deepgramKey);
        merged.aliyunKey = normalizeCredentialValue(merged.aliyunKey);
        return merged;
    }

    async function getLlmSettings() {
        const data = await new Promise(resolve => chrome.storage.local.get(LLM_SETTINGS_KEYS, resolve));
        const merged = { ...LLM_SETTINGS_DEFAULTS, ...(data || {}) };
        merged.llmEnabled = normalizeLlmEnabled(merged.llmEnabled);
        merged.llmBaseUrl = normalizeLlmUrl(merged.llmBaseUrl);
        merged.llmApiKey = normalizeCredentialValue(merged.llmApiKey);
        merged.llmModel = normalizeLlmModel(merged.llmModel);
        return merged;
    }

    function hasProviderCredential(settings) {
        const provider = resolveSttProvider(settings.sttProvider);
        if (provider === STT_PROVIDER.DEEPGRAM) {
            return Boolean(String(settings.deepgramKey || '').trim());
        }
        return Boolean(String(settings.aliyunKey || '').trim());
    }

    function sttMissingCredentialReason(provider) {
        if (provider === STT_PROVIDER.DEEPGRAM) return 'missing-deepgram-key';
        return 'missing-aliyun-key';
    }

    function emitVoiceStarted(audioStartHint) {
        updateListeningPlaceholder();
        chrome.runtime.sendMessage({
            type: 'VOICE_STARTED',
            timestamp: Date.now() - startTime,
            audio_start: audioStartHint || (Date.now() - startTime)
        }).catch(() => { });
    }

    function emitVoiceEnded() {
        const interim = evList.querySelector('.tl-narration-interim');
        if (interim) interim.remove();
        chrome.runtime.sendMessage({ type: 'VOICE_ENDED', timestamp: Date.now() - startTime }).catch(() => { });
    }

    function emitFinalNarration(text) {
        const transcript = normalizeNarrationText(text);
        if (!isMeaningfulNarration(transcript)) return;
        pendingInterimNarration = '';
        const ts = Date.now() - startTime;
        lastFinalNarrationText = transcript;
        chrome.runtime.sendMessage({ type: 'NARRATION_EVENT', text: transcript, timestamp: ts, isFinal: true }).catch(() => { });
        appendNarrationToTimeline(transcript, ts);
    }

    function pickMediaRecorderOptions() {
        const preferred = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4'
        ];
        for (const type of preferred) {
            try {
                if (MediaRecorder.isTypeSupported(type)) return { mimeType: type };
            } catch { /* noop */ }
        }
        return undefined;
    }

    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        const chunk = 0x8000;
        let binary = '';
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
    }

    function downsampleFloat32(input, inputRate, outputRate) {
        if (inputRate === outputRate) return input;
        if (outputRate > inputRate) return input;
        const ratio = inputRate / outputRate;
        const length = Math.max(1, Math.round(input.length / ratio));
        const output = new Float32Array(length);
        let outIdx = 0;
        let inIdx = 0;
        while (outIdx < length) {
            const nextInIdx = Math.min(input.length, Math.round((outIdx + 1) * ratio));
            let sum = 0;
            let count = 0;
            for (let i = inIdx; i < nextInIdx; i++) {
                sum += input[i];
                count += 1;
            }
            output[outIdx] = count ? (sum / count) : 0;
            outIdx += 1;
            inIdx = nextInIdx;
        }
        return output;
    }

    function float32ToPcm16Bytes(input) {
        const out = new Uint8Array(input.length * 2);
        const view = new DataView(out.buffer);
        for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            const v = s < 0 ? s * 0x8000 : s * 0x7FFF;
            view.setInt16(i * 2, v, true);
        }
        return out;
    }

    function stopAliyunPcmCapture() {
        if (aliyunAudioProcessor) {
            try { aliyunAudioProcessor.disconnect(); } catch { /* noop */ }
            if ('onaudioprocess' in aliyunAudioProcessor) {
                aliyunAudioProcessor.onaudioprocess = null;
            }
            if (aliyunAudioProcessor.port) {
                try { aliyunAudioProcessor.port.onmessage = null; } catch { /* noop */ }
                try { aliyunAudioProcessor.port.close(); } catch { /* noop */ }
            }
            aliyunAudioProcessor = null;
            aliyunAudioProcessorMode = '';
        }
        if (aliyunAudioSource) {
            try { aliyunAudioSource.disconnect(); } catch { /* noop */ }
            aliyunAudioSource = null;
        }
        if (aliyunAudioSink) {
            try { aliyunAudioSink.disconnect(); } catch { /* noop */ }
            aliyunAudioSink = null;
        }
        if (aliyunAudioCtx) {
            aliyunAudioCtx.close().catch(() => { });
            aliyunAudioCtx = null;
        }
    }

    function appendAliyunPcmChunk(socket, inRate, float32Samples) {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        if (!(float32Samples instanceof Float32Array) || float32Samples.length === 0) return;
        const mono = downsampleFloat32(float32Samples, inRate, 16000);
        if (!mono || mono.length === 0) return;
        const pcm16 = float32ToPcm16Bytes(mono);
        if (!pcm16.byteLength) return;
        try {
            const audio = arrayBufferToBase64(pcm16.buffer);
            socket.send(JSON.stringify({ type: 'input_audio_buffer.append', audio }));
        } catch (e) {
            console.warn('Aliyun PCM append failed:', String(e?.message || e || ''));
        }
    }

    function formatAliyunRealtimeError(msg) {
        const error = msg?.error || {};
        return {
            type: String(error?.type || msg?.type || '').trim(),
            code: String(error?.code || '').trim(),
            message: String(error?.message || '').trim(),
            param: String(error?.param || '').trim(),
            eventId: String(error?.event_id || msg?.event_id || '').trim()
        };
    }

    async function startAliyunPcmCapture(stream, socket) {
        stopAliyunPcmCapture();
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return { ok: false, reason: 'aliyun-audiocontext-unavailable' };
        try {
            aliyunAudioCtx = new Ctx({ sampleRate: 16000 });
        } catch {
            aliyunAudioCtx = new Ctx();
        }

        try {
            await aliyunAudioCtx.resume();
        } catch { /* noop */ }

        const inRate = aliyunAudioCtx.sampleRate || 48000;
        aliyunAudioSource = aliyunAudioCtx.createMediaStreamSource(stream);
        aliyunAudioSink = aliyunAudioCtx.createGain();
        aliyunAudioSink.gain.value = 0;

        const supportsAudioWorklet = Boolean(aliyunAudioCtx.audioWorklet?.addModule && window.AudioWorkletNode);
        if (supportsAudioWorklet) {
            try {
                await aliyunAudioCtx.audioWorklet.addModule(chrome.runtime.getURL('aliyun-pcm-worklet.js'));
                aliyunAudioProcessor = new AudioWorkletNode(aliyunAudioCtx, 'aliyun-pcm-capture', {
                    numberOfInputs: 1,
                    numberOfOutputs: 1,
                    outputChannelCount: [1],
                    channelCount: 1,
                    channelCountMode: 'explicit',
                    processorOptions: {
                        frameSize: 4096
                    }
                });
                aliyunAudioProcessor.port.onmessage = (event) => {
                    const buffer = event?.data;
                    if (!(buffer instanceof ArrayBuffer)) return;
                    appendAliyunPcmChunk(socket, inRate, new Float32Array(buffer));
                };
                aliyunAudioSource.connect(aliyunAudioProcessor);
                aliyunAudioProcessor.connect(aliyunAudioSink);
                aliyunAudioSink.connect(aliyunAudioCtx.destination);
                aliyunAudioProcessorMode = 'audio-worklet';
            } catch (e) {
                console.warn('Aliyun AudioWorklet init failed, falling back to ScriptProcessorNode:', String(e?.message || e || ''));
            }
        }

        if (!aliyunAudioProcessor) {
            aliyunAudioProcessor = aliyunAudioCtx.createScriptProcessor(4096, 1, 1);
            aliyunAudioSource.connect(aliyunAudioProcessor);
            aliyunAudioProcessor.connect(aliyunAudioSink);
            aliyunAudioSink.connect(aliyunAudioCtx.destination);
            aliyunAudioProcessor.onaudioprocess = (event) => {
                appendAliyunPcmChunk(socket, inRate, event.inputBuffer.getChannelData(0));
            };
            aliyunAudioProcessorMode = 'script-processor';
        }

        console.info('Aliyun PCM capture started:', {
            mode: aliyunAudioProcessorMode || 'unknown',
            inputSampleRate: inRate,
            outputSampleRate: 16000
        });
        return { ok: true, reason: 'ok' };
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

    async function probeAliyun(apiKey, region) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 6000);
        try {
            const res = await fetch(`${getAliyunProbeBase(region)}/compatible-mode/v1/models`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${apiKey}` },
                signal: ctrl.signal
            });
            if (res.ok) return { ok: true, reason: 'ok' };
            if (res.status === 401 || res.status === 403) return { ok: false, reason: 'aliyun-key-invalid', status: res.status };
            return { ok: false, reason: 'aliyun-server', status: res.status };
        } catch (e) {
            const msg = String(e?.message || e || '');
            if (/ISO-8859-1|code point/i.test(msg)) return { ok: false, reason: 'aliyun-key-format-invalid' };
            if (e?.name === 'AbortError') return { ok: false, reason: 'aliyun-network-timeout' };
            return { ok: false, reason: 'aliyun-network' };
        } finally {
            clearTimeout(t);
        }
    }

    async function probeAliyunWithFallback(apiKey, preferredRegion) {
        let best = { ok: false, reason: 'aliyun-network' };
        let sawAuthFailure = false;
        let authFailureRegion = normalizeAliyunRegion(preferredRegion);
        for (const region of getAliyunRegionCandidates(preferredRegion)) {
            const current = await probeAliyun(apiKey, region);
            if (current.ok) return { ...current, region };
            if (current.reason === 'aliyun-key-invalid') {
                sawAuthFailure = true;
                authFailureRegion = region;
                continue;
            }
            if (current.reason === 'aliyun-key-format-invalid') return { ...current, region };
            if (current.reason === 'aliyun-server') best = { ...current, region };
            if ((current.reason === 'aliyun-network' || current.reason === 'aliyun-network-timeout') && best.reason !== 'aliyun-server') {
                best = { ...current, region };
            }
        }
        if (sawAuthFailure) return { ok: false, reason: 'aliyun-key-invalid', region: authFailureRegion };
        return best;
    }

    /* ── Deepgram WebSocket STT ── */
    async function initDeepgram(stream, apiKey, lang, micStatusEl) {
        const params = new URLSearchParams({
            model: 'nova-2',
            language: normalizeDeepgramLanguage(lang),
            smart_format: 'true',
            interim_results: 'true',
            utterance_end_ms: '3000',
            vad_events: 'true',
            punctuate: 'true',
        });
        const wsUrl = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

        try {
            sttSocket = new WebSocket(wsUrl, ['token', apiKey]);
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
                try { sttSocket?.close(); } catch { /* noop */ }
                finish(false, 'deepgram-ws-timeout');
            }, 7000);

            sttSocket.onopen = () => {
                opened = true;
                console.log('Deepgram connected');
                try {
                    mediaRecorder = new MediaRecorder(stream, pickMediaRecorderOptions());
                    mediaRecorder.ondataavailable = (e) => {
                        if (e.data.size > 0 && sttSocket && sttSocket.readyState === WebSocket.OPEN) {
                            sttSocket.send(e.data);
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

            sttSocket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'SpeechStarted') {
                        emitVoiceStarted(msg.start || (Date.now() - startTime));
                        return;
                    }
                    if (msg.type === 'UtteranceEnd') {
                        emitVoiceEnded();
                        return;
                    }
                    if (msg.type === 'Results' && msg.channel) {
                        const alt = msg.channel.alternatives?.[0];
                        if (!alt || !alt.transcript) return;
                        if (msg.is_final) {
                            emitFinalNarration(alt.transcript);
                        } else {
                            // 录制中仅显示“识别中”状态，不展示 partial 文本。
                            pendingInterimNarration = '';
                        }
                    }
                } catch { /* ignore */ }
            };

            sttSocket.onerror = (e) => {
                const stateMap = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
                console.error('Deepgram WS error:', {
                    readyState: stateMap[e?.target?.readyState ?? 3] || String(e?.target?.readyState),
                    url: wsUrl,
                    eventType: e?.type || 'error'
                });
                if (micStatusEl) micStatusEl.classList.add('error');
                if (!opened) finish(false, 'deepgram-ws-error');
            };

            sttSocket.onclose = (e) => {
                console.log('Deepgram WS closed:', e.code, e.reason);
                const closedByExpectedFlow = Boolean(e?.target?.__onvordExpectedClose);
                if (!opened) {
                    if (closedByExpectedFlow) {
                        finish(false, 'deepgram-ws-closed-by-client');
                        return;
                    }
                    finish(false, `deepgram-ws-close-${e.code || 'unknown'}`);
                    return;
                }
                if (!closedByExpectedFlow && currentView === 'recording' && !isPaused && e.code !== 1000) {
                    if (micStatusEl) micStatusEl.classList.add('error');
                    toast(t('toastWsDisconnected'));
                }
            };
        });
    }

    function extractAliyunTranscript(msg) {
        const candidates = [
            msg?.transcript,
            msg?.transcript?.text,
            msg?.text,
            msg?.delta,
            msg?.output_text,
            msg?.response?.transcript,
            msg?.response?.text,
            msg?.response?.output_text,
            msg?.item?.content?.[0]?.transcript,
            msg?.item?.content?.[0]?.text,
            msg?.item?.content?.[0]?.output_text,
            msg?.item?.input_audio_transcription?.text
        ];
        for (const raw of candidates) {
            const text = normalizeNarrationText(raw || '');
            if (isMeaningfulNarration(text)) return text;
        }
        return '';
    }

    function isAliyunFinalEvent(msg) {
        const type = String(msg?.type || '');
        if (msg?.is_final === true) return true;
        return /completed|done|final|finished/i.test(type);
    }

    async function initAliyunWithRegion(stream, settings, micStatusEl, region) {
        const apiKey = String(settings.aliyunKey || '').trim();
        if (containsNonLatin1(apiKey)) {
            return { ok: false, reason: 'aliyun-key-format-invalid', region: normalizeAliyunRegion(region) };
        }
        const model = String(settings.aliyunModel || STT_SETTINGS_DEFAULTS.aliyunModel).trim() || STT_SETTINGS_DEFAULTS.aliyunModel;
        const normalizedRegion = normalizeAliyunRegion(region);
        const lang = normalizeAliyunLanguage(settings.deepgramLang);
        const authRule = await applyAliyunWsAuthRules(apiKey);
        console.info('Aliyun WS auth rule:', {
            ok: authRule.ok,
            reason: authRule.reason,
            region: normalizedRegion
        });
        const wsAttempts = getAliyunRealtimeWsAttempts(normalizedRegion, model, apiKey, {
            preferHeaderAuth: authRule.ok
        });
        let lastFailure = { ok: false, reason: 'aliyun-init-failed', region: normalizedRegion };

        for (const attempt of wsAttempts) {
            const { safeUrl, safeProtocols } = sanitizeAliyunWsLog(attempt.url, attempt.protocols);
            console.info('Aliyun WS attempt:', {
                region: normalizedRegion,
                mode: attempt.label,
                url: safeUrl,
                protocols: safeProtocols
            });

            try {
                sttSocket = new WebSocket(attempt.url, attempt.protocols);
            } catch (e) {
                console.error('Aliyun WS constructor error:', {
                    region: normalizedRegion,
                    mode: attempt.label,
                    error: String(e?.message || e || '')
                });
                lastFailure = { ok: false, reason: 'aliyun-ws-constructor', region: normalizedRegion, attempt: attempt.label };
                continue;
            }

            const attemptResult = await new Promise((resolve) => {
                let settled = false;
                let opened = false;
                let speechActive = false;
                const finish = (ok, reason, meta = {}) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(handshakeTimer);
                    resolve({ ok, reason, region: normalizedRegion, attempt: attempt.label, ...meta });
                };
                const handshakeTimer = setTimeout(() => {
                    try { sttSocket?.close(); } catch { /* noop */ }
                    finish(false, 'aliyun-ws-timeout');
                }, 9000);

                sttSocket.onopen = () => {
                    opened = true;
                    console.log('Aliyun realtime connected:', normalizedRegion, attempt.label);
                    try {
                        sttSocket.send(JSON.stringify({
                            type: 'session.update',
                            session: {
                                modalities: ['text'],
                                input_audio_format: 'pcm',
                                input_audio_transcription: {
                                    model,
                                    language: lang
                                },
                                turn_detection: {
                                    type: 'server_vad',
                                    threshold: 0,
                                    silence_duration_ms: 600
                                },
                                sample_rate: 16000
                            }
                        }));
                    } catch (e) {
                        console.warn('Aliyun session.update failed:', e);
                    }

                    try {
                        startAliyunPcmCapture(stream, sttSocket).then((captureResult) => {
                            if (!captureResult.ok) {
                                if (micStatusEl) micStatusEl.classList.add('error');
                                finish(false, captureResult.reason || 'aliyun-audio-capture-failed');
                                return;
                            }
                            finish(true, 'ok');
                        }).catch((err) => {
                            console.error('Aliyun PCM capture init failed:', err);
                            if (micStatusEl) micStatusEl.classList.add('error');
                            finish(false, 'aliyun-audio-capture-failed');
                        });
                    } catch (e) {
                        console.error('Aliyun audio capture error:', e);
                        if (micStatusEl) micStatusEl.classList.add('error');
                        finish(false, 'aliyun-audio-capture-failed');
                    }
                };

                sttSocket.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);
                        const type = String(msg?.type || '');
                        if (type === 'input_audio_buffer.speech_started') {
                            if (!speechActive) {
                                speechActive = true;
                                emitVoiceStarted(Date.now() - startTime);
                            }
                            return;
                        }
                        if (type === 'input_audio_buffer.speech_stopped') {
                            if (speechActive) {
                                speechActive = false;
                                emitVoiceEnded();
                            }
                            return;
                        }
                        if (type === 'session.finished') {
                            if (sttSocket?.__onvordExpectedClose && sttSocket.readyState === WebSocket.OPEN) {
                                try { sttSocket.close(1000, 'client-stop'); } catch { /* noop */ }
                            }
                            return;
                        }
                        if (type === 'error') {
                            console.error('Aliyun realtime error:', formatAliyunRealtimeError(msg), msg);
                            return;
                        }
                        const transcript = extractAliyunTranscript(msg);
                        if (!transcript) return;
                        if (!speechActive) {
                            speechActive = true;
                            emitVoiceStarted(Date.now() - startTime);
                        }
                        if (isAliyunFinalEvent(msg)) {
                            emitFinalNarration(transcript);
                        } else {
                            pendingInterimNarration = '';
                        }
                    } catch { /* ignore */ }
                };

                sttSocket.onerror = (e) => {
                    const stateMap = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
                    console.error('Aliyun WS error:', {
                        readyState: stateMap[e?.target?.readyState ?? 3] || String(e?.target?.readyState),
                        url: safeUrl,
                        protocols: safeProtocols,
                        eventType: e?.type || 'error',
                        region: normalizedRegion,
                        mode: attempt.label
                    });
                    if (!opened) finish(false, 'aliyun-ws-error');
                };

                sttSocket.onclose = (e) => {
                    const closedByExpectedFlow = Boolean(e?.target?.__onvordExpectedClose);
                    console.log('Aliyun WS closed:', {
                        code: e.code,
                        reason: e.reason || '',
                        region: normalizedRegion,
                        mode: attempt.label,
                        expected: closedByExpectedFlow
                    });
                    if (!opened) {
                        if (closedByExpectedFlow) {
                            finish(false, 'aliyun-ws-closed-by-client');
                            return;
                        }
                        finish(false, `aliyun-ws-close-${e.code || 'unknown'}`, { closeCode: e.code || 0 });
                        return;
                    }
                    if (!closedByExpectedFlow && currentView === 'recording' && !isPaused && e.code !== 1000) {
                        if (micStatusEl) micStatusEl.classList.add('error');
                        toast(t('toastWsDisconnected'));
                    }
                };
            });

            if (attemptResult.ok) return attemptResult;
            if (attemptResult.reason === 'aliyun-ws-closed-by-client') return attemptResult;
            lastFailure = attemptResult;

            try {
                if (sttSocket && sttSocket.readyState !== WebSocket.CLOSED) sttSocket.close();
            } catch { /* noop */ }
            sttSocket = null;
        }

        if (micStatusEl) micStatusEl.classList.add('error');
        if (!authRule.ok && String(lastFailure.reason || '').startsWith('aliyun-ws-')) {
            return { ok: false, reason: 'aliyun-auth-rule-unavailable', region: normalizedRegion };
        }
        return lastFailure;
    }

    async function initAliyun(stream, settings, micStatusEl) {
        let bestFail = { ok: false, reason: 'aliyun-init-failed' };
        for (const region of getAliyunRegionCandidates(settings.aliyunRegion)) {
            const current = await initAliyunWithRegion(stream, settings, micStatusEl, region);
            if (current.ok) {
                if (normalizeAliyunRegion(settings.aliyunRegion) !== current.region) {
                    chrome.storage.local.set({ aliyunRegion: current.region }).catch(() => { });
                }
                return current;
            }
            if (current.reason === 'aliyun-ws-closed-by-client') return current;
            bestFail = current;
        }
        return bestFail;
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
        chrome.runtime.sendMessage({ type: 'NARRATION_EVENT', text, timestamp: ts, isFinal: true }).catch(() => { });
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
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            try { mediaRecorder.stop(); } catch { /* noop */ }
        }
        mediaRecorder = null;
        stopAliyunPcmCapture();
        if (sttStream) {
            sttStream.getTracks().forEach(t => t.stop());
            sttStream = null;
        }
        if (sttSocket) {
            const ws = sttSocket;
            ws.__onvordExpectedClose = true;
            if (ws.readyState === WebSocket.OPEN) {
                if (sttEngine === STT_PROVIDER.DEEPGRAM) {
                    try { ws.send(JSON.stringify({ type: 'Finalize' })); } catch { /* noop */ }
                    setTimeout(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            try { ws.send(JSON.stringify({ type: 'CloseStream' })); } catch { /* noop */ }
                            try { ws.close(1000, 'client-stop'); } catch { /* noop */ }
                        }
                    }, 220);
                } else if (sttEngine === STT_PROVIDER.ALIYUN) {
                    try {
                        ws.send(JSON.stringify({
                            event_id: `event_${Date.now()}`,
                            type: 'session.finish'
                        }));
                    } catch { /* noop */ }
                    setTimeout(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            try { ws.close(1000, 'client-stop'); } catch { /* noop */ }
                        }
                    }, 1200);
                } else {
                    try { ws.close(1000, 'client-stop'); } catch { /* noop */ }
                }
            } else if (ws.readyState === WebSocket.CONNECTING) {
                try { ws.close(1000, 'client-stop'); } catch { /* noop */ }
            }
            sttSocket = null;
        }
        clearAliyunWsAuthRules();
        sttEngine = null;
    }

    async function initSTT() {
        stopSTT({ flushInterim: false });
        sttLastFailure = '';
        micStatusEl?.classList.remove('error');

        const settings = await getSttSettings();
        const provider = resolveSttProvider(settings.sttProvider);

        if (!hasProviderCredential(settings)) {
            sttLastFailure = sttMissingCredentialReason(provider);
            micStatusEl?.classList.add('error');
            return false;
        }

        if (provider === STT_PROVIDER.ALIYUN && containsNonLatin1(settings.aliyunKey)) {
            sttLastFailure = 'aliyun-key-format-invalid';
            micStatusEl?.classList.add('error');
            return false;
        }

        try {
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

            if (provider === STT_PROVIDER.DEEPGRAM) {
                const apiKey = String(settings.deepgramKey || '').trim();
                const deepgramStarted = await initDeepgram(sttStream, apiKey, settings.deepgramLang, micStatusEl);
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
                sttEngine = STT_PROVIDER.DEEPGRAM;
                return true;
            }

            if (provider === STT_PROVIDER.ALIYUN) {
                const apiKey = String(settings.aliyunKey || '').trim();
                const aliyunStarted = await initAliyun(sttStream, settings, micStatusEl);
                if (!aliyunStarted.ok) {
                    sttStream.getTracks().forEach(t => t.stop());
                    sttStream = null;
                    const probe = await probeAliyunWithFallback(apiKey, settings.aliyunRegion);
                    const startedReason = String(aliyunStarted.reason || '');
                    const wsInitFailed = startedReason.startsWith('aliyun-ws-') || aliyunStarted.reason === 'aliyun-audio-capture-failed';
                    if (!probe.ok && probe.reason === 'aliyun-key-invalid') {
                        sttLastFailure = 'aliyun-key-invalid';
                    } else if (!probe.ok && probe.reason === 'aliyun-key-format-invalid') {
                        sttLastFailure = 'aliyun-key-format-invalid';
                    } else if (!probe.ok && (probe.reason === 'aliyun-network' || probe.reason === 'aliyun-network-timeout')) {
                        sttLastFailure = 'aliyun-network';
                    } else if (aliyunStarted.reason === 'aliyun-auth-rule-unavailable') {
                        sttLastFailure = 'aliyun-auth-rule-unavailable';
                    } else if (probe.ok && wsInitFailed) {
                        sttLastFailure = 'aliyun-ws-handshake-failed';
                    } else if (wsInitFailed) {
                        sttLastFailure = 'aliyun-init-failed';
                    } else {
                        sttLastFailure = aliyunStarted.reason || 'aliyun-init-failed';
                    }
                    micStatusEl?.classList.add('error');
                    return false;
                }
                sttEngine = STT_PROVIDER.ALIYUN;
                return true;
            }

            sttLastFailure = 'aliyun-init-failed';
            micStatusEl?.classList.add('error');
            return false;
        } catch (e) {
            console.error('STT init failed:', e);
            if (provider === STT_PROVIDER.ALIYUN) sttLastFailure = 'aliyun-init-failed';
            else sttLastFailure = 'deepgram-init-failed';
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

    function setInterimNarrationState(span, text, isStatus = false) {
        if (!span) return;
        span.classList.add('voice-interim');
        span.classList.toggle('voice-interim-status', Boolean(isStatus));
        span.textContent = text;
    }

    function appendNarrationToTimeline(text, timestamp) {
        const normalized = normalizeNarrationText(text);
        if (!isMeaningfulNarration(normalized)) return;
        clearPlaceholder();

        // Check for interim narration — convert it in-place (preserves position in timeline)
        // This prevents speech from jumping to the end when actions arrive during STT latency
        const interim = evList.querySelector('.tl-narration-interim');
        if (interim) {
            const prev = interim.previousElementSibling;
            // If there are no actions between two speech chunks, merge into the previous narration block.
            if (prev && prev.classList.contains('tl-narration') && !prev.classList.contains('tl-narration-interim')) {
                const prevSpan = prev.querySelector('.tl-narr-text');
                if (prevSpan) {
                    prevSpan.textContent = normalizeNarrationText(`${prevSpan.textContent || ''} ${normalized}`);
                }
                interim.remove();
                evList.scrollTop = evList.scrollHeight;
                updateStepCount();
                return;
            }
            interim.classList.remove('tl-narration-interim');
            const span = interim.querySelector('.tl-narr-text');
            if (span) {
                span.classList.remove('voice-interim');
                span.classList.remove('voice-interim-status');
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
            span.className = 'tl-narr-text';
            interim.appendChild(icon);
            interim.appendChild(span);
            evList.appendChild(interim);
        }
        const span = interim.querySelector('.tl-narr-text');
        setInterimNarrationState(span, normalized, false);
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
            span.className = 'tl-narr-text';
            interim.appendChild(icon);
            interim.appendChild(span);
            evList.appendChild(interim);
        }
        const span = interim.querySelector('.tl-narr-text');
        setInterimNarrationState(span, t('recognizing'), true);
        evList.scrollTop = evList.scrollHeight;
    }

    function updateStepCount() {
        // Count top-level timeline groups (narration blocks + action containers) as "big steps"
        const groups = evList.querySelectorAll(':scope > .tl-narration:not(.tl-narration-interim), :scope > .tl-actions');
        evCountBadge.textContent = groups.length;
    }

    function submitManualNote() {
        if (!isManualMode() || isPaused || currentView !== 'recording') return;
        const text = normalizeNarrationText(manualNoteInputEl?.value || '');
        if (!isMeaningfulNarration(text)) {
            toast(t('manualNoteEmpty'));
            manualNoteInputEl?.focus();
            return;
        }
        const ts = recordingElapsedMs();
        chrome.runtime.sendMessage({ type: 'NARRATION_EVENT', text, timestamp: ts, isFinal: true }).catch(() => { });
        appendNarrationToTimeline(text, ts);
        if (manualNoteInputEl) {
            manualNoteInputEl.value = '';
            manualNoteInputEl.focus();
        }
        toast(t('manualNoteAdded'));
    }

    function openImageViewer(src, altText) {
        if (!imgViewerEl || !imgViewerImgEl || !src) return;
        imgViewerImgEl.src = src;
        imgViewerImgEl.alt = altText || t('screenshotPreview');
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
            thumbBtn.setAttribute('aria-label', t('viewScreenshot'));

            const thumb = document.createElement('img');
            thumb.className = 'ev-thumb';
            thumb.alt = '';
            thumb.loading = 'lazy';
            thumb.decoding = 'async';
            thumbBtn.appendChild(thumb);
            pill.appendChild(thumbBtn);
        }
        thumbBtn.setAttribute('data-full-src', safeImage);
        thumbBtn.setAttribute('data-alt', altText || t('screenshotPreview'));
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
            const type = pill.getAttribute('data-type') || t('actionFallback');
            const label = pill.querySelector('.ev-pill-text')?.textContent || type;
            upsertPillThumb(pill, safeImage, `${type}：${label}`);
        });
    }

    function addActionPill(ev) {
        clearPlaceholder();
        if (ev?.actionType === 'point' && ev.timestamp != null) {
            pendingPointCaptureTimestamps.add(String(ev.timestamp));
            toast(t('toastCaptureQueued'));
        }

        const icon = evIcon(ev.actionType);
        const fullLabel = describeAction(ev, ev.actionType);
        const label = compactLabel(fullLabel, 26) || fullLabel || ev.actionType;

        // For input events, update the last input pill instead of creating a new one
        if (ev.actionType === 'input') {
            const last = getLastTimelineItem();
            if (last && last.classList.contains('tl-actions')) {
                const lastPill = last.querySelector('.ev-pill[data-type="input"]:last-of-type');
                if (lastPill) {
                    lastPill.classList.add('ev-pill-preview');
                    if (ev.timestamp != null) lastPill.setAttribute('data-ts', String(ev.timestamp));
                    setPillText(lastPill, `${icon} ${label}`);
                    lastPill.setAttribute('title', `${fmtTime(ev.timestamp)} — ${fullLabel}`);
                    const shot = getInlineScreenshotSrc(ev);
                    if (shot) upsertPillThumb(lastPill, shot, `${fmtTime(ev.timestamp)} — ${fullLabel}`);
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
                    setPillText(tail, `${icon} ${t('actionScroll')} x${count}`);
                    tail.setAttribute('title', `${fmtTime(ev.timestamp)} — ${t('actionScrollMerged', { count })}`);
                    const shot = getInlineScreenshotSrc(ev);
                    if (shot) upsertPillThumb(tail, shot, `${fmtTime(ev.timestamp)} — ${t('actionScrollMerged', { count })}`);
                    return;
                }
            }
        }

        const pill = document.createElement('span');
        pill.className = 'ev-pill ev-pill-preview';
        pill.setAttribute('data-type', ev.actionType);
        if (ev.timestamp != null) pill.setAttribute('data-ts', String(ev.timestamp));
        pill.setAttribute('title', `${fmtTime(ev.timestamp)} — ${fullLabel}`);
        setPillText(pill, `${icon} ${label}`);
        const shot = getInlineScreenshotSrc(ev);
        if (shot) upsertPillThumb(pill, shot, `${fmtTime(ev.timestamp)} — ${fullLabel}`);

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

    function describeAction(action, fallback = '') {
        const type = normalizeActionTypeForExport(action?.type || action?.actionType || '');
        const target = normalizeNarrationText(action?.target?.description || '');
        const targetTag = normalizeNarrationText(action?.target?.tag || '').toLowerCase();
        const value = normalizeNarrationText(action?.value || '');
        const pageTitle = normalizeNarrationText(action?.pageTitle || action?.page_title || action?.url || '');

        switch (type) {
            case 'click':
                return target ? t('actionClick', { target }) : (fallback || t('actionClickElement'));
            case 'point':
                return target ? t('actionPointWithTarget', { target }) : (fallback || t('actionPoint'));
            case 'input':
                if (target && value) return t('actionInputWithTarget', { target, value });
                if (value) return t('actionInput', { value });
                if (target) return t('actionInputTargetOnly', { target });
                return fallback || t('actionInputShort');
            case 'navigate':
            case 'navigation':
                return pageTitle || fallback || t('actionNavigate');
            case 'scroll':
                return fallback || t('actionScroll');
            case 'select':
                if (targetTag === 'select') {
                    if (target && value) return t('actionSelectWithTarget', { target, value });
                    if (target) return t('actionSelectTargetOnly', { target });
                }
                if (value) return t('actionSelect', { value });
                if (target) return t('actionSelectTargetOnly', { target });
                return fallback || t('actionSelectShort');
            case 'keypress':
                return normalizeNarrationText(action?.key || action?.value || '') || fallback || t('keypressFallback');
            default:
                return fallback || normalizeNarrationText(action?.description || '') || type || t('actionFallback');
        }
    }

    function getPreviewActionLabel(step) {
        const action = step?.action || {};
        const desc = describeAction(action, normalizeNarrationText(action.description || ''));
        return compactLabel(desc, 26) || t('actionFallback');
    }

    function createPreviewPill(step) {
        const action = step?.action || {};
        const actionType = action.type || 'action';
        const fullLabel = describeAction(action, normalizeNarrationText(action.description || ''));
        const label = compactLabel(fullLabel, 26) || getPreviewActionLabel(step);
        const icon = evIcon(actionType);

        const pill = document.createElement('span');
        pill.className = 'ev-pill ev-pill-preview';
        pill.setAttribute('data-type', actionType);
        if (step?.timestampMs != null) pill.setAttribute('data-ts', String(step.timestampMs));
        const ts = step?.timestamp || '';
        pill.setAttribute('title', `${ts ? `${ts} — ` : ''}${fullLabel || label}`);
        setPillText(pill, `${icon} ${label}`);
        const safeImage = normalizeImageSrc(step?.screenshot);
        if (safeImage) upsertPillThumb(pill, safeImage, t('clickPointScreenshot', { step: step?.stepNumber || '' }));

        return pill;
    }

    function normalizeSegmentImages(images) {
        const list = Array.isArray(images) ? images : [];
        const seen = new Set();
        const normalized = [];
        for (const item of list) {
            const screenshot = normalizeImageSrc(
                typeof item === 'string'
                    ? item
                    : (item?.screenshot || item?.src || '')
            );
            if (!screenshot) continue;
            const ts = Number(item?.timestampMs);
            const stepNo = Number(item?.stepNumber);
            const description = normalizeNarrationText(item?.description || '');
            const target = item?.target ?? null;
            const normalizedItem = {
                screenshot,
                timestampMs: Number.isFinite(ts) ? ts : null,
                stepNumber: Number.isFinite(stepNo) ? stepNo : null,
                description: description || null,
                target
            };
            const key = `${normalizedItem.timestampMs == null ? '' : normalizedItem.timestampMs}|${normalizedItem.screenshot}`;
            if (seen.has(key)) continue;
            seen.add(key);
            normalized.push(normalizedItem);
        }
        return normalized;
    }

    function deriveSegmentImagesFromSteps(steps) {
        const derived = [];
        for (const step of (steps || [])) {
            const type = normalizeActionTypeForExport(step?.action?.type || step?.actionType || '');
            if (type !== 'point') continue;
            const screenshot = normalizeImageSrc(step?.screenshot || step?.action?.screenshot_base64 || '');
            if (!screenshot) continue;
            const ts = Number(step?.timestampMs);
            const stepNo = Number(step?.stepNumber);
            const description = normalizeNarrationText(step?.action?.description || '');
            derived.push({
                screenshot,
                timestampMs: Number.isFinite(ts) ? ts : null,
                stepNumber: Number.isFinite(stepNo) ? stepNo : null,
                description: description || null,
                target: step?.action?.target || null
            });
        }
        return normalizeSegmentImages(derived);
    }

    function mergeSegmentImages(...lists) {
        const merged = [];
        for (const list of lists) {
            if (!Array.isArray(list)) continue;
            merged.push(...list);
        }
        return normalizeSegmentImages(merged);
    }

    function getSegmentImages(seg) {
        const explicit = normalizeSegmentImages(seg?.images);
        const derived = deriveSegmentImagesFromSteps(seg?.steps || []);
        return mergeSegmentImages(explicit, derived);
    }

    function createPreviewSegmentImages(seg) {
        const images = getSegmentImages(seg);
        if (!images.length) return null;

        const group = document.createElement('div');
        group.className = 'tl-seg-images';
        group.style.display = 'flex';
        group.style.flexDirection = 'column';
        group.style.gap = '8px';
        group.style.margin = '-2px 0 2px';

        for (const image of images) {
            const stepLabel = image.stepNumber != null
                ? t('clickPointScreenshot', { step: image.stepNumber })
                : t('screenshotPreview');
            const altText = image.description || stepLabel;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'seg-shot-btn';
            btn.setAttribute('data-full-src', image.screenshot);
            btn.setAttribute('data-alt', altText);
            if (image.timestampMs != null) btn.setAttribute('data-ts', String(image.timestampMs));
            if (image.stepNumber != null) btn.setAttribute('data-step', String(image.stepNumber));
            if (image.description) btn.setAttribute('data-description', image.description);
            if (image.target != null) {
                try {
                    btn.setAttribute('data-target', typeof image.target === 'string' ? image.target : JSON.stringify(image.target));
                } catch {
                    btn.setAttribute('data-target', String(image.target));
                }
            }
            btn.style.width = '100%';
            btn.style.padding = '0';
            btn.style.border = '1px solid #ccdeef';
            btn.style.borderRadius = '10px';
            btn.style.overflow = 'hidden';
            btn.style.background = '#ffffff';
            btn.style.cursor = 'zoom-in';
            btn.style.boxShadow = '0 4px 10px rgba(12,27,61,0.06)';

            const img = document.createElement('img');
            img.className = 'seg-shot-img';
            img.src = image.screenshot;
            img.alt = '';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.style.display = 'block';
            img.style.width = '100%';
            img.style.maxHeight = '220px';
            img.style.objectFit = 'cover';

            btn.appendChild(img);
            group.appendChild(btn);
        }
        return group;
    }

    function extractSegmentImagesFromNode(node) {
        if (!node) return [];
        const buttons = Array.from(node.querySelectorAll('.seg-shot-btn'));
        if (!buttons.length) return [];
        const images = buttons.map((btn) => {
            const ts = Number(btn.getAttribute('data-ts'));
            const stepNo = Number(btn.getAttribute('data-step'));
            const targetRaw = btn.getAttribute('data-target') || '';
            let parsedTarget = null;
            if (targetRaw) {
                try {
                    parsedTarget = JSON.parse(targetRaw);
                } catch {
                    parsedTarget = targetRaw;
                }
            }
            return {
                screenshot: btn.getAttribute('data-full-src') || btn.querySelector('img')?.getAttribute('src') || '',
                timestampMs: Number.isFinite(ts) ? ts : null,
                stepNumber: Number.isFinite(stepNo) ? stepNo : null,
                description: normalizeNarrationText(btn.getAttribute('data-description') || '') || null,
                target: parsedTarget
            };
        });
        return normalizeSegmentImages(images);
    }

    function applySopScreenshotsToCurrentTimeline(sop) {
        if (!sop) return;
        const segs = sop.segments || [];
        for (const seg of segs) {
            for (const step of (seg.steps || [])) {
                if (step?.timestampMs == null || !step?.screenshot) continue;
                applyScreenshotToTimeline(step.timestampMs, step.screenshot);
            }
        }
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
                const images = createPreviewSegmentImages(seg);
                if (images) evList.appendChild(images);
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
            evList.innerHTML = `<div class="placeholder">${escapeHtml(t('noPreview'))}</div>`;
        }
        evCountBadge.textContent = String(previewStepCount || sop.totalSteps || 0);
        evList.scrollTop = 0;
    }

    /* ── Actions ── */
    let startButtonMode = 'record';

    function setStartButtonMode(mode) {
        startButtonMode = mode || 'record';
        btnStart.dataset.mode = startButtonMode;
    }

    function disableStartButton(msg) {
        setStartButtonMode('disabled');
        btnStart.disabled = true;
        btnStart.classList.add('btn-disabled');
        btnStart.innerHTML = '<span class="bi">⏺</span>' + msg;
    }

    function enableStartButton() {
        setStartButtonMode('record');
        btnStart.disabled = false;
        btnStart.classList.remove('btn-disabled');
        btnStart.innerHTML = `<span class="bi">⏺</span>${t('startRecording')}`;
    }

    function showMicPermissionButton() {
        setStartButtonMode('mic-permission');
        btnStart.disabled = false;
        btnStart.classList.remove('btn-disabled');
        btnStart.innerHTML = `<span class="bi">🎙</span>${t('startNeedMic')}`;
    }

    function setPauseButton(paused) {
        if (!btnPause) return;
        btnPause.innerHTML = paused
            ? `<span class="bi">▶</span>${t('resume')}`
            : `<span class="bi">⏸</span>${t('pause')}`;
    }

    function setRecordingLayout(mode) {
        recordingLayoutMode = mode || 'live';
        const isPreview = mode === 'preview';
        const isPausedState = mode === 'paused';
        recBarEl?.classList.toggle('done', isPreview);
        recBarEl?.classList.toggle('paused', isPausedState);
        liveSectionEl?.classList.toggle('hidden', isPreview);
        if (btnMarkArea) btnMarkArea.disabled = isPreview || isPausedState;
        if (mode === 'preview') {
            recActionsEl?.classList.add('hidden');
            previewActionsEl?.classList.remove('hidden');
            if (recLabelEl) recLabelEl.textContent = t('recDone');
            syncNarrationModeUi();
            return;
        }
        recActionsEl?.classList.remove('hidden');
        previewActionsEl?.classList.add('hidden');
        closeImageViewer();
        if (recLabelEl) recLabelEl.textContent = mode === 'paused' ? t('recPaused') : t('recRecording');
        syncNarrationModeUi();
    }

    async function refreshStartEligibility() {
        if (currentView !== 'idle') return;
        const settings = await getSttSettings();
        if (!hasProviderCredential(settings)) {
            disableStartButton(t('startNeedKey'));
            return;
        }
        let micPermissionState = 'unknown';
        try {
            const res = await navigator.permissions.query({ name: 'microphone' });
            micPermissionState = res.state;
        } catch { /* noop */ }
        if (micPermissionState !== 'granted') {
            showMicPermissionButton();
            return;
        }
        enableStartButton();
    }

    async function handleStartClick() {
        if (startButtonMode === 'mic-permission') {
            openMicPermissionGuide();
            return;
        }
        if (startButtonMode === 'disabled') return;
        await doStart();
    }

    function prepareRecordingUi(mode, startTimestamp) {
        recordingMode = mode === 'text' ? 'text' : 'voice';
        startTime = startTimestamp;
        isPaused = false;
        pausedDuration = 0;
        currentSOP = null;
        currentNarrationDraftId = '';
        currentNarrationDraftMap = new Map();
        activeNarrationSegmentIndex = null;
        pendingPointCaptureTimestamps.clear();
        if (narrationDraftPersistTimer) {
            clearTimeout(narrationDraftPersistTimer);
            narrationDraftPersistTimer = 0;
        }
        if (manualNoteInputEl) manualNoteInputEl.value = '';
        evList.innerHTML = `<div class="placeholder">${escapeHtml(t('waitingPlaceholder'))}</div>`;
        evCountBadge.textContent = '0';
        updateTimerDisplay(0);
        setPauseButton(false);
        switchView('recording');
        setRecordingLayout('live');
        clearInterval(timer);
        timer = setInterval(() => {
            if (!isPaused) updateTimerDisplay(Date.now() - startTime - pausedDuration);
        }, 1000);
        syncNarrationModeUi();
        if (recordingMode === 'text') {
            setTimeout(() => manualNoteInputEl?.focus(), 0);
        }
    }

    async function handleStartManualClick() {
        await doStartManual();
    }

    let _starting = false;
    async function doStart() {
        if (_starting) return;
        _starting = true;
        try {
            btnStart.disabled = true;
            if (btnStartManual) btnStartManual.disabled = true;
            btnStart.textContent = t('initStt');

            // Step 1: Initialize STT — must succeed before recording
            const sttOk = await initSTT();

            if (!sttOk) {
                if (sttLastFailure === 'missing-deepgram-key' || sttLastFailure === 'missing-aliyun-key') {
                    disableStartButton(t('startNeedKey'));
                    toast(t('toastNeedSetupKey'));
                } else if (sttLastFailure === 'mic-denied') {
                    showMicPermissionButton();
                    toast(t('toastMicDenied'));
                    openMicPermissionGuide();
                } else if (sttLastFailure === 'no-mic-device') {
                    enableStartButton();
                    toast(t('toastNoMic'));
                } else if (sttLastFailure === 'mic-unavailable') {
                    enableStartButton();
                    toast(t('toastMicBusy'));
                } else if (sttLastFailure === 'deepgram-key-invalid') {
                    enableStartButton();
                    toast(t('toastKeyInvalid'));
                } else if (sttLastFailure === 'deepgram-network') {
                    enableStartButton();
                    toast(t('toastNetwork'));
                } else if (sttLastFailure === 'aliyun-key-invalid') {
                    enableStartButton();
                    toast(t('toastAliyunKeyInvalid'));
                } else if (sttLastFailure === 'aliyun-key-format-invalid') {
                    enableStartButton();
                    toast(t('toastAliyunKeyFormat'));
                } else if (sttLastFailure === 'aliyun-network') {
                    enableStartButton();
                    toast(t('toastAliyunNetwork'));
                } else if (sttLastFailure === 'aliyun-auth-rule-unavailable') {
                    enableStartButton();
                    toast(t('toastAliyunAuthRule'));
                } else if (sttLastFailure === 'aliyun-ws-handshake-failed') {
                    enableStartButton();
                    toast(t('toastAliyunWsHandshake'));
                } else if (sttLastFailure === 'aliyun-init-failed') {
                    enableStartButton();
                    toast(t('toastAliyunInitFailed'));
                } else {
                    enableStartButton();
                    toast(t('toastInitFailed'));
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
            const res = await chrome.runtime.sendMessage({ type: 'START_RECORDING', mode: 'voice' });
            if (res?.success) {
                prepareRecordingUi(res.recordingMode || 'voice', res.startTime);
            } else {
                stopSTT({ flushInterim: false });
                stopVolumeVis();
                if (res?.reason === 'restricted-page') {
                    toast(t('toastRestricted'));
                } else {
                    toast(t('toastStartFailed'));
                }
            }
            enableStartButton();
        } catch (e) {
            console.error(e);
            toast(t('toastStartFailed'));
            enableStartButton();
        } finally {
            if (btnStartManual) btnStartManual.disabled = false;
            _starting = false;
        }
    }

    async function doStartManual() {
        if (_starting) return;
        _starting = true;
        try {
            btnStart.disabled = true;
            if (btnStartManual) btnStartManual.disabled = true;
            stopSTT({ flushInterim: false });
            stopVolumeVis();

            const res = await chrome.runtime.sendMessage({ type: 'START_RECORDING', mode: 'text' });
            if (res?.success) {
                prepareRecordingUi(res.recordingMode || 'text', res.startTime);
            } else if (res?.reason === 'restricted-page') {
                toast(t('toastRestricted'));
            } else {
                toast(t('toastStartFailed'));
            }

            enableStartButton();
        } catch (e) {
            console.error(e);
            toast(t('toastStartFailed'));
            enableStartButton();
        } finally {
            if (btnStartManual) btnStartManual.disabled = false;
            _starting = false;
        }
    }

    async function doStop() {
        btnStop.disabled = true; btnStop.textContent = t('generating');
        if (btnPause) btnPause.disabled = true;
        if (btnMarkArea) btnMarkArea.disabled = true;
        clearInterval(timer); timer = null;
        stopSTT();
        stopVolumeVis();
        await new Promise(r => setTimeout(r, 420));
        try {
            const result = await stopRecordingWithFallback();
            if (result?.sop) {
                showSopPreview(result.sop);
                if (result.usedFallback) toast(t('toastGenerateRecovered'));
            }
            else { toast(t('toastGenerateFailed')); switchView('idle'); }
        } catch (e) { console.error(e); toast(t('toastGenerateError')); switchView('idle'); }
        btnStop.disabled = false; btnStop.innerHTML = `<span class="bi">⏹</span>${t('stopRecording')}`;
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
                toast(t('toastPaused'));
                return;
            }

            if (!isManualMode()) {
                const sttOk = await initSTT();
                if (!sttOk) {
                    toast(t('toastResumeSttFailed'));
                    return;
                }
                try {
                    micStream = await getMicStreamForUse();
                    startVolumeVis(micStream);
                } catch { /* non-blocking */ }
            }
            await chrome.runtime.sendMessage({ type: 'RESUME_RECORDING' });
            isPaused = false;
            setPauseButton(false);
            setRecordingLayout('live');
            toast(t('toastResumed'));
        } catch (e) {
            console.error(e);
            toast(t('toastPauseResumeFailed'));
        } finally {
            btnPause.disabled = false;
        }
    }

    function normalizeActionTypeForExport(type) {
        const t = String(type || '').toLowerCase();
        return t === 'navigate' ? 'navigation' : t;
    }

    function buildStepLookupByTimestamp(steps) {
        const map = new Map();
        for (const step of (steps || [])) {
            const ts = Number(step?.timestampMs);
            if (!Number.isFinite(ts)) continue;
            const queue = map.get(ts) || [];
            queue.push(step);
            map.set(ts, queue);
        }
        return map;
    }

    function consumeStepForExport(stepLookup, timestampMs, actionType) {
        if (!Number.isFinite(timestampMs)) return null;
        const queue = stepLookup.get(timestampMs);
        if (!queue || queue.length === 0) return null;
        const wantType = normalizeActionTypeForExport(actionType);
        let idx = queue.findIndex((s) => normalizeActionTypeForExport(s?.action?.type) === wantType);
        if (idx < 0) idx = 0;
        const [picked] = queue.splice(idx, 1);
        return picked || null;
    }

    function getPillExportLabel(pill, fallback) {
        const raw = normalizeNarrationText(pill?.querySelector('.ev-pill-text')?.textContent || '');
        if (!raw) return fallback || t('actionFallback');
        const stripped = raw.replace(/^[^A-Za-z0-9\u4e00-\u9fff]+/, '').trim();
        return stripped || fallback || t('actionFallback');
    }

    function getExportPresentation(sop) {
        const timelineSegs = buildExportSegmentsFromTimeline(sop);
        const hasTimelineSegs = timelineSegs.some(seg =>
            (seg.steps && seg.steps.length > 0) || (seg.type === 'voice' && isMeaningfulNarration(seg.narration))
        );
        const baseSegments = hasTimelineSegs
            ? timelineSegs
            : ((Array.isArray(sop?.segments) && sop.segments.length > 0)
                ? sop.segments
                : [{ type: 'silent', narration: '', steps: sop?.steps || [] }]);
        const segments = baseSegments.map((seg) => ({
            ...seg,
            images: getSegmentImages(seg)
        }));
        const totalSteps = segments.reduce((sum, seg) => sum + ((seg.steps || []).length), 0);
        return { segments, totalSteps };
    }

    function decodeHtmlEntities(value) {
        return String(value || '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");
    }

    function htmlToPlainText(value) {
        return decodeHtmlEntities(String(value || ''))
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>\s*<p>/gi, '\n\n')
            .replace(/<\/li>\s*<li>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function buildClipboardPayload(sop) {
        const { segments, totalSteps } = getExportPresentation(sop);
        const introTitle = t('copySectionIntro');
        const notesTitle = t('copySectionNotes');
        const opsTitle = t('copySectionOps');
        const introLines = [
            `- ${t('copyFieldStartUrl')}：${sop.startUrl || ''}`,
            `- ${t('copyFieldCreatedAt')}：${sop.createdAt || ''}`,
            `- ${t('copyFieldDuration')}：${fmtTime(sop.duration || 0)}`,
            `- ${t('copyFieldStepCount')}：${totalSteps}`
        ];
        const notesLines = [
            t('exportDocIntro'),
            htmlToPlainText(t('exportHowToReadItems'))
        ].filter(Boolean);

        const operationBlocks = [];
        const operationHtmlBlocks = [];
        let lastUrl = '';

        for (const seg of segments) {
            const blockLines = [];
            const blockHtml = [];
            const hasVoice = seg.type === 'voice' && isMeaningfulNarration(seg.narration);

            if (hasVoice) {
                const narrationTitle = t('copyNarrationTitle');
                blockLines.push(`### ${narrationTitle}`);
                blockLines.push(seg.narration);
                if (seg.timeRange) blockLines.push(`- ${t('copyFieldTime')}：${seg.timeRange}`);

                blockHtml.push(`<section class="copy-seg copy-seg-voice">`);
                blockHtml.push(`<h3>${escapeHtml(narrationTitle)}</h3>`);
                blockHtml.push(`<p>${escapeHtml(seg.narration)}</p>`);
                if (seg.timeRange) blockHtml.push(`<p><strong>${escapeHtml(t('copyFieldTime'))}:</strong> ${escapeHtml(seg.timeRange)}</p>`);
            } else {
                blockHtml.push(`<section class="copy-seg">`);
            }

            for (const step of (seg.steps || [])) {
                const desc = normalizeNarrationText(step?.action?.description || step?.action?.type || t('actionFallback'));
                const stepLines = [`${step.stepNumber}. ${desc}`];
                const stepMeta = [];
                const stepMetaHtml = [];
                if (step?.timestamp) {
                    stepMeta.push(`- ${t('copyFieldTime')}：${step.timestamp}`);
                    stepMetaHtml.push(`<li><strong>${escapeHtml(t('copyFieldTime'))}:</strong> ${escapeHtml(step.timestamp)}</li>`);
                }
                const stepUrl = normalizeNarrationText(step?.action?.url || '');
                if (stepUrl && stepUrl !== lastUrl) {
                    stepMeta.push(`- ${t('copyFieldPage')}：${stepUrl}`);
                    stepMetaHtml.push(`<li><strong>${escapeHtml(t('copyFieldPage'))}:</strong> ${escapeHtml(stepUrl)}</li>`);
                    lastUrl = stepUrl;
                }
                const selector = normalizeNarrationText(step?.action?.selector || '');
                if (selector) {
                    stepMeta.push(`- ${t('exportAgentDetail')}：${selector}`);
                    stepMetaHtml.push(`<li><strong>${escapeHtml(t('exportAgentDetail'))}:</strong> <code>${escapeHtml(selector)}</code></li>`);
                }
                if (stepMeta.length) stepLines.push(stepMeta.map(line => `   ${line}`).join('\n'));
                blockLines.push(stepLines.join('\n'));

                blockHtml.push(`<div class="copy-step"><p><strong>${escapeHtml(`${step.stepNumber}. ${desc}`)}</strong></p>${stepMetaHtml.length ? `<ul>${stepMetaHtml.join('')}</ul>` : ''}</div>`);
            }

            if (hasVoice || (seg.steps || []).length) {
                operationBlocks.push(blockLines.join('\n\n').trim());
                blockHtml.push(`</section>`);
                operationHtmlBlocks.push(blockHtml.join(''));
            }
        }

        if (!operationBlocks.length) {
            operationBlocks.push(t('copyEmptyOps'));
            operationHtmlBlocks.push(`<p>${escapeHtml(t('copyEmptyOps'))}</p>`);
        }

        const plainText = [
            `# ${sop.title || 'SOP'}`,
            `## ${introTitle}`,
            introLines.join('\n'),
            `## ${notesTitle}`,
            notesLines.join('\n\n'),
            `## ${opsTitle}`,
            operationBlocks.join('\n\n')
        ].join('\n\n').trim();

        const html = [
            `<article>`,
            `<h1>${escapeHtml(sop.title || 'SOP')}</h1>`,
            `<h2>${escapeHtml(introTitle)}</h2>`,
            `<ul>${introLines.map(line => `<li>${escapeHtml(line.replace(/^- /, ''))}</li>`).join('')}</ul>`,
            `<h2>${escapeHtml(notesTitle)}</h2>`,
            notesLines.map(line => `<p>${escapeHtml(line)}</p>`).join(''),
            `<h2>${escapeHtml(opsTitle)}</h2>`,
            operationHtmlBlocks.join(''),
            `</article>`
        ].join('');

        return { plainText, html };
    }

    function getDefaultCopyNotesLines() {
        return [
            t('exportDocIntro'),
            htmlToPlainText(t('exportHowToReadItems'))
        ].filter(Boolean);
    }

    function normalizeCopyBlockText(value) {
        return htmlToPlainText(String(value || ''))
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function normalizeCopyNotesLines(lines) {
        const normalized = Array.isArray(lines)
            ? lines.map(normalizeCopyBlockText).filter(Boolean)
            : [];
        return normalized.length ? normalized : getDefaultCopyNotesLines();
    }

    function buildCopyNarrationHtml(title, narrationText, timeRange) {
        const safeTitle = escapeHtml(title);
        const safeNarration = escapeHtml(narrationText).replace(/\n/g, '<br>');
        const safeTime = timeRange
            ? `<div style="margin-top:8px;font-size:12px;color:#6b7f95;"><strong>${escapeHtml(t('copyFieldTime'))}:</strong> ${escapeHtml(timeRange)}</div>`
            : '';
        return [
            '<div style="margin:0 0 12px;padding:12px 14px;border-radius:12px;border:1px solid rgba(11,95,255,0.16);',
            'background:linear-gradient(135deg, rgba(11,95,255,0.12), rgba(47,128,255,0.04));',
            'box-shadow:0 10px 24px rgba(12,27,61,0.06);">',
            `<div style="margin:0 0 6px;font-size:12px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:#30527c;">${safeTitle}</div>`,
            `<div style="font-size:14px;line-height:1.7;font-weight:700;color:#123454;">${safeNarration}</div>`,
            safeTime,
            '</div>'
        ].join('');
    }

    function buildEditableNarrationHtml(title, mapText, narrationText, timeRange) {
        const safeTitle = escapeHtml(title);
        const safeMap = escapeHtml(mapText);
        const safeNarration = narrationText
            ? escapeHtml(narrationText).replace(/\n/g, '<br>')
            : '&nbsp;';
        const safeTime = timeRange
            ? `<div style="margin-top:8px;font-size:12px;color:#6b7f95;"><strong>${escapeHtml(t('copyFieldTime'))}:</strong> ${escapeHtml(timeRange)}</div>`
            : '';
        return [
            '<div style="margin:0 0 12px;padding:14px 16px;border-radius:14px;border:1px solid rgba(11,95,255,0.18);',
            'background:linear-gradient(135deg, rgba(11,95,255,0.14), rgba(47,128,255,0.05));',
            'box-shadow:0 10px 24px rgba(12,27,61,0.06);">',
            `<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin:0 0 8px;">`,
            `<div style="font-size:12px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:#30527c;">${safeTitle}</div>`,
            `<div style="font-size:12px;font-weight:700;color:#4a6786;">${safeMap}</div>`,
            '</div>',
            `<div style="font-size:14px;line-height:1.7;font-weight:700;color:#123454;white-space:normal;">${safeNarration}</div>`,
            safeTime,
            '</div>'
        ].join('');
    }

    function buildInlineSegmentImagesHtml(images, opts = {}) {
        const safeImages = normalizeSegmentImages(images);
        if (!safeImages.length) return '';
        const gap = opts.gap || '8px';
        const margin = opts.margin || '0 0 12px';
        const maxHeight = opts.maxHeight || '260px';
        const borderColor = opts.borderColor || '#cfe0f2';
        const shadow = opts.shadow || '0 8px 20px rgba(12,27,61,0.08)';
        const wrapper = [
            `<div style="display:flex;flex-direction:column;gap:${gap};margin:${margin};">`
        ];
        for (const image of safeImages) {
            const stepLabel = image.stepNumber != null
                ? t('clickPointScreenshot', { step: image.stepNumber })
                : t('screenshotPreview');
            const altText = image.description || stepLabel;
            wrapper.push(
                `<img src="${escapeHtml(image.screenshot)}" alt="${escapeHtml(altText)}" loading="lazy" ` +
                `style="display:block;width:100%;max-height:${maxHeight};object-fit:cover;border-radius:10px;border:1px solid ${borderColor};box-shadow:${shadow};background:#fff;">`
            );
        }
        wrapper.push('</div>');
        return wrapper.join('');
    }

    function buildEditableClipboardPayload(sop, options = {}) {
        const { segments, totalSteps } = getExportPresentation(sop);
        const introTitle = t('copySectionIntro');
        const notesTitle = t('copySectionNotes');
        const opsTitle = t('copySectionOps');
        const notesLines = normalizeCopyNotesLines(options.notesLines);
        const narrationOverrides = options.narrationOverrides instanceof Map ? options.narrationOverrides : new Map();
        const introLines = [
            `- ${t('copyFieldStartUrl')}: ${sop.startUrl || ''}`,
            `- ${t('copyFieldCreatedAt')}: ${sop.createdAt || ''}`,
            `- ${t('copyFieldDuration')}: ${fmtTime(sop.duration || 0)}`,
            `- ${t('copyFieldStepCount')}: ${totalSteps}`
        ];

        const operationBlocks = [];
        const operationHtmlBlocks = [];
        let lastUrl = '';
        let narrationDisplayIndex = 0;

        segments.forEach((seg, segIndex) => {
            const blockLines = [];
            const blockHtml = [];
            const originalNarration = normalizeNarrationDraftText(seg?.narration || '');
            const rawNarration = normalizeNarrationDraftText(getNarrationOverrideText(narrationOverrides, segIndex, originalNarration));
            const hasVoice = seg?.type === 'voice' && (isMeaningfulNarration(originalNarration) || narrationOverrides.has(segIndex));
            const stepNumbers = (seg?.steps || []).map((step) => Number(step?.stepNumber)).filter(Number.isFinite);
            const stepRangeText = formatStepRange(stepNumbers);
            const segImages = getSegmentImages(seg);

            if (hasVoice) {
                narrationDisplayIndex += 1;
                const label = t('previewNarrationLabel', { index: String(narrationDisplayIndex).padStart(2, '0') });
                const mapText = t('previewNarrationMap', { steps: stepRangeText });
                blockLines.push(`========== ${label} | ${t('copyMappedSteps')}: ${stepRangeText} ==========`);
                if (rawNarration) blockLines.push(rawNarration);
                if (seg.timeRange) blockLines.push(`- ${t('copyFieldTime')}: ${seg.timeRange}`);
                blockLines.push(`---------- ${t('copyMappedOps')} ----------`);

                blockHtml.push('<section class="copy-seg copy-seg-voice">');
                blockHtml.push(buildEditableNarrationHtml(label, mapText, rawNarration, seg.timeRange || ''));
                if (segImages.length) {
                    blockHtml.push(buildInlineSegmentImagesHtml(segImages, {
                        gap: '8px',
                        margin: '0 0 12px',
                        maxHeight: '300px',
                        borderColor: '#c7dbef',
                        shadow: '0 8px 20px rgba(12,27,61,0.08)'
                    }));
                }
            } else {
                if (!(seg?.steps || []).length) return;
                blockHtml.push('<section class="copy-seg">');
            }

            for (const step of (seg.steps || [])) {
                const desc = normalizeNarrationText(step?.action?.description || step?.action?.type || t('actionFallback'));
                const stepLines = [`${step.stepNumber}. ${desc}`];
                const stepMeta = [];
                const stepMetaHtml = [];

                if (step?.timestamp) {
                    stepMeta.push(`- ${t('copyFieldTime')}: ${step.timestamp}`);
                    stepMetaHtml.push(`<li><strong>${escapeHtml(t('copyFieldTime'))}:</strong> ${escapeHtml(step.timestamp)}</li>`);
                }

                const stepUrl = normalizeNarrationText(step?.action?.url || '');
                if (stepUrl && stepUrl !== lastUrl) {
                    stepMeta.push(`- ${t('copyFieldPage')}: ${stepUrl}`);
                    stepMetaHtml.push(`<li><strong>${escapeHtml(t('copyFieldPage'))}:</strong> ${escapeHtml(stepUrl)}</li>`);
                    lastUrl = stepUrl;
                }

                const selector = normalizeNarrationText(step?.action?.selector || '');
                if (selector) {
                    stepMeta.push(`- ${t('exportAgentDetail')}: ${selector}`);
                    stepMetaHtml.push(`<li><strong>${escapeHtml(t('exportAgentDetail'))}:</strong> <code>${escapeHtml(selector)}</code></li>`);
                }

                if (stepMeta.length) stepLines.push(stepMeta.map((line) => `   ${line}`).join('\n'));
                blockLines.push(stepLines.join('\n'));
                blockHtml.push(`<div class="copy-step"><p><strong>${escapeHtml(`${step.stepNumber}. ${desc}`)}</strong></p>${stepMetaHtml.length ? `<ul>${stepMetaHtml.join('')}</ul>` : ''}</div>`);
            }

            if (hasVoice || (seg.steps || []).length) {
                operationBlocks.push(blockLines.join('\n\n').trim());
                blockHtml.push('</section>');
                operationHtmlBlocks.push(blockHtml.join(''));
            }
        });

        if (!operationBlocks.length) {
            operationBlocks.push(t('copyEmptyOps'));
            operationHtmlBlocks.push(`<p>${escapeHtml(t('copyEmptyOps'))}</p>`);
        }

        const plainText = [
            `# ${sop.title || 'SOP'}`,
            `## ${introTitle}`,
            introLines.join('\n'),
            `## ${notesTitle}`,
            notesLines.join('\n\n'),
            `## ${opsTitle}`,
            operationBlocks.join('\n\n')
        ].join('\n\n').trim();

        const html = [
            '<article>',
            `<h1>${escapeHtml(sop.title || 'SOP')}</h1>`,
            `<h2>${escapeHtml(introTitle)}</h2>`,
            `<ul>${introLines.map((line) => `<li>${escapeHtml(line.replace(/^- /, ''))}</li>`).join('')}</ul>`,
            `<h2>${escapeHtml(notesTitle)}</h2>`,
            notesLines.map((line) => `<p>${escapeHtml(line).replace(/\n/g, '<br>')}</p>`).join(''),
            `<h2>${escapeHtml(opsTitle)}</h2>`,
            operationHtmlBlocks.join(''),
            '</article>'
        ].join('');

        return { plainText, html };
    }

    function buildClipboardPayloadV2(sop, options = {}) {
        const { segments, totalSteps } = getExportPresentation(sop);
        const introTitle = t('copySectionIntro');
        const notesTitle = t('copySectionNotes');
        const opsTitle = t('copySectionOps');
        const notesLines = normalizeCopyNotesLines(options.notesLines);
        const narrationOverrides = options.narrationOverrides instanceof Map ? options.narrationOverrides : new Map();
        const introLines = [
            `- ${t('copyFieldStartUrl')}: ${sop.startUrl || ''}`,
            `- ${t('copyFieldCreatedAt')}: ${sop.createdAt || ''}`,
            `- ${t('copyFieldDuration')}: ${fmtTime(sop.duration || 0)}`,
            `- ${t('copyFieldStepCount')}: ${totalSteps}`
        ];

        const operationBlocks = [];
        const operationHtmlBlocks = [];
        let lastUrl = '';

        segments.forEach((seg, segIndex) => {
            const blockLines = [];
            const blockHtml = [];
            const rawNarration = normalizeNarrationDraftText(getNarrationOverrideText(
                narrationOverrides,
                segIndex,
                normalizeNarrationDraftText(seg?.narration || '')
            ));
            const hasVoice = seg.type === 'voice' && isMeaningfulNarration(rawNarration);
            const segImages = getSegmentImages(seg);

            if (hasVoice) {
                const narrationTitle = t('copyNarrationTitle');
                blockLines.push([
                    `### ${narrationTitle}`,
                    '',
                    ` ${rawNarration} `,
                    '',
                    seg.timeRange ? `- ${t('copyFieldTime')}: ${seg.timeRange}` : ''
                ].filter(Boolean).join('\n'));

                blockHtml.push('<section class="copy-seg copy-seg-voice">');
                blockHtml.push(buildCopyNarrationHtml(narrationTitle, rawNarration, seg.timeRange || ''));
                if (segImages.length) {
                    blockHtml.push(buildInlineSegmentImagesHtml(segImages, {
                        gap: '8px',
                        margin: '0 0 12px',
                        maxHeight: '300px',
                        borderColor: '#c7dbef',
                        shadow: '0 8px 20px rgba(12,27,61,0.08)'
                    }));
                }
            } else {
                blockHtml.push('<section class="copy-seg">');
            }

            for (const step of (seg.steps || [])) {
                const desc = normalizeNarrationText(step?.action?.description || step?.action?.type || t('actionFallback'));
                const stepLines = [`${step.stepNumber}. ${desc}`];
                const stepMeta = [];
                const stepMetaHtml = [];

                if (step?.timestamp) {
                    stepMeta.push(`- ${t('copyFieldTime')}: ${step.timestamp}`);
                    stepMetaHtml.push(`<li><strong>${escapeHtml(t('copyFieldTime'))}:</strong> ${escapeHtml(step.timestamp)}</li>`);
                }

                const stepUrl = normalizeNarrationText(step?.action?.url || '');
                if (stepUrl && stepUrl !== lastUrl) {
                    stepMeta.push(`- ${t('copyFieldPage')}: ${stepUrl}`);
                    stepMetaHtml.push(`<li><strong>${escapeHtml(t('copyFieldPage'))}:</strong> ${escapeHtml(stepUrl)}</li>`);
                    lastUrl = stepUrl;
                }

                const selector = normalizeNarrationText(step?.action?.selector || '');
                if (selector) {
                    stepMeta.push(`- ${t('exportAgentDetail')}: ${selector}`);
                    stepMetaHtml.push(`<li><strong>${escapeHtml(t('exportAgentDetail'))}:</strong> <code>${escapeHtml(selector)}</code></li>`);
                }

                if (stepMeta.length) stepLines.push(stepMeta.map(line => `   ${line}`).join('\n'));
                blockLines.push(stepLines.join('\n'));
                blockHtml.push(`<div class="copy-step"><p><strong>${escapeHtml(`${step.stepNumber}. ${desc}`)}</strong></p>${stepMetaHtml.length ? `<ul>${stepMetaHtml.join('')}</ul>` : ''}</div>`);
            }

            if (hasVoice || (seg.steps || []).length) {
                operationBlocks.push(blockLines.join('\n\n').trim());
                blockHtml.push('</section>');
                operationHtmlBlocks.push(blockHtml.join(''));
            }
        });

        if (!operationBlocks.length) {
            operationBlocks.push(t('copyEmptyOps'));
            operationHtmlBlocks.push(`<p>${escapeHtml(t('copyEmptyOps'))}</p>`);
        }

        const plainText = [
            `# ${sop.title || 'SOP'}`,
            `## ${introTitle}`,
            introLines.join('\n'),
            `## ${notesTitle}`,
            notesLines.join('\n\n'),
            `## ${opsTitle}`,
            operationBlocks.join('\n\n')
        ].join('\n\n').trim();

        const html = [
            '<article>',
            `<h1>${escapeHtml(sop.title || 'SOP')}</h1>`,
            `<h2>${escapeHtml(introTitle)}</h2>`,
            `<ul>${introLines.map(line => `<li>${escapeHtml(line.replace(/^- /, ''))}</li>`).join('')}</ul>`,
            `<h2>${escapeHtml(notesTitle)}</h2>`,
            notesLines.map(line => `<p>${escapeHtml(line).replace(/\n/g, '<br>')}</p>`).join(''),
            `<h2>${escapeHtml(opsTitle)}</h2>`,
            operationHtmlBlocks.join(''),
            '</article>'
        ].join('');

        return { plainText, html };
    }

    function buildSopRefinementSource(sop, options = {}) {
        const { segments, totalSteps } = getExportPresentation(sop);
        const narrations = [];
        const narrationOverrides = options.narrationOverrides instanceof Map ? options.narrationOverrides : new Map();

        segments.forEach((seg, segIndex) => {
            const narration = normalizeNarrationDraftText(getNarrationOverrideText(
                narrationOverrides,
                segIndex,
                normalizeNarrationDraftText(seg?.narration || '')
            ));
            if (seg?.type !== 'voice' || !isMeaningfulNarration(narration)) return;

            narrations.push({
                segment_index: segIndex,
                time_range: seg.timeRange || '',
                text: narration,
                related_steps: (seg.steps || []).map((step) => ({
                    step_number: step.stepNumber,
                    description: normalizeNarrationText(step?.action?.description || step?.action?.type || t('actionFallback'))
                }))
            });
        });

        return {
            title: sop.title || 'SOP',
            start_url: sop.startUrl || '',
            created_at: sop.createdAt || '',
            duration: fmtTime(sop.duration || 0),
            total_steps: totalSteps,
            narrations
        };
    }

    function getSopRefinementPrompt() {
        return [
            'You refine narration text for AI-ready SOPs.',
            'Keep the same language as the input.',
            'Lightly polish only the narration texts.',
            'Do not add, remove, merge, split, or reorder narration items.',
            'Do not invent facts, steps, URLs, selectors, timestamps, or actions.',
            'Do not rewrite notes, step order, step numbers, action descriptions, URLs, timestamps, or selectors.',
            'Return strict JSON only. Do not wrap the answer in markdown fences.',
            'JSON schema:',
            '{"narrations":[{"segment_index":0,"text":"string"}]}'
        ].join('\n');
    }

    function collectResponseTextChunks(node, chunks) {
        if (!node) return;
        if (typeof node === 'string') {
            if (node.trim()) chunks.push(node);
            return;
        }
        if (Array.isArray(node)) {
            node.forEach((item) => collectResponseTextChunks(item, chunks));
            return;
        }
        if (typeof node.output_text === 'string' && node.output_text.trim()) chunks.push(node.output_text);
        if (typeof node.text === 'string' && node.text.trim()) chunks.push(node.text);
        if (Array.isArray(node.content)) collectResponseTextChunks(node.content, chunks);
        if (Array.isArray(node.output)) collectResponseTextChunks(node.output, chunks);
    }

    function extractResponseOutputText(payload) {
        if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
            return payload.output_text.trim();
        }
        const chunks = [];
        collectResponseTextChunks(payload?.output, chunks);
        if (!chunks.length) collectResponseTextChunks(payload?.content, chunks);
        if (!chunks.length) collectResponseTextChunks(payload, chunks);
        return chunks.join('\n').trim();
    }

    function parseModelJson(text) {
        let cleaned = String(text || '').trim();
        cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            cleaned = cleaned.slice(firstBrace, lastBrace + 1);
        }
        return JSON.parse(cleaned);
    }

    function normalizeSopRefinementResult(result, source) {
        const validIndexes = new Set((source.narrations || []).map(item => item.segment_index));
        const narrationOverrides = new Map();

        if (Array.isArray(result?.narrations)) {
            for (const item of result.narrations) {
                const segIndex = Number(item?.segment_index);
                const text = normalizeNarrationText(item?.text || '');
                if (!Number.isInteger(segIndex)) continue;
                if (!validIndexes.has(segIndex)) continue;
                if (!isMeaningfulNarration(text)) continue;
                narrationOverrides.set(segIndex, text);
            }
        }

        return { narrationOverrides };
    }

    async function fetchWithTimeout(url, options, timeoutMs) {
        const controller = new AbortController();
        const timerId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } finally {
            clearTimeout(timerId);
        }
    }

    async function requestSopRefinement(sop, options = {}) {
        const settings = await getLlmSettings();
        if (!settings.llmEnabled) {
            throw new Error('llm-disabled');
        }
        if (!settings.llmBaseUrl || !settings.llmApiKey || !settings.llmModel) {
            throw new Error('missing-llm-config');
        }

        const source = buildSopRefinementSource(sop, options);
        if (!source.narrations.length) {
            return { narrationOverrides: new Map() };
        }
        const response = await fetchWithTimeout(settings.llmBaseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${settings.llmApiKey}`
            },
            body: JSON.stringify({
                model: settings.llmModel,
                input: [
                    {
                        type: 'message',
                        role: 'developer',
                        content: [
                            { type: 'input_text', text: getSopRefinementPrompt() }
                        ]
                    },
                    {
                        type: 'message',
                        role: 'user',
                        content: [
                            { type: 'input_text', text: JSON.stringify(source) }
                        ]
                    }
                ]
            })
        }, LLM_REQUEST_TIMEOUT_MS);

        if (!response.ok) {
            throw new Error(`llm-http-${response.status}`);
        }

        const payload = await response.json();
        const outputText = extractResponseOutputText(payload);
        if (!outputText) {
            throw new Error('empty-llm-output');
        }

        let parsed;
        try {
            parsed = parseModelJson(outputText);
        } catch {
            throw new Error('invalid-llm-response');
        }

        return normalizeSopRefinementResult(parsed, source);
    }

    async function writeClipboard(payload) {
        const plainText = String(payload?.plainText || '').trim();
        const html = String(payload?.html || '').trim();
        if (!plainText) throw new Error('empty-clipboard-payload');

        if (navigator.clipboard?.write && window.ClipboardItem) {
            try {
                const item = new ClipboardItem({
                    'text/plain': new Blob([plainText], { type: 'text/plain' }),
                    'text/html': new Blob([html || `<pre>${escapeHtml(plainText)}</pre>`], { type: 'text/html' })
                });
                await navigator.clipboard.write([item]);
                return;
            } catch (e) {
                console.warn('Clipboard rich write failed, fallback to text:', e);
            }
        }

        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(plainText);
            return;
        }

        const ta = document.createElement('textarea');
        ta.value = plainText;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        ta.style.pointerEvents = 'none';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        const ok = document.execCommand('copy');
        ta.remove();
        if (!ok) throw new Error('clipboard-copy-failed');
    }

    function buildDownloadHtml(sop, options = {}) {
        const { segments, totalSteps } = getExportPresentation(sop);
        const narrationOverrides = options.narrationOverrides instanceof Map ? options.narrationOverrides : new Map();
        let stepsHtml = '';
        let lastUrl = '';

        for (const [segIndex, seg] of segments.entries()) {
            const narration = normalizeNarrationDraftText(getNarrationOverrideText(
                narrationOverrides,
                segIndex,
                normalizeNarrationDraftText(seg?.narration || '')
            ));
            const isVoice = seg.type === 'voice' && isMeaningfulNarration(narration);
            const segImages = getSegmentImages(seg);
            stepsHtml += `<div class="sop-segment ${isVoice ? 'sop-seg-voice' : 'sop-seg-silent'}">`;
            if (isVoice) {
                stepsHtml += `<div class="seg-narration"><span class="seg-icon">🎙️</span><span class="seg-text">${escapeHtml(narration)}</span>${seg.timeRange ? `<span class="seg-time">${escapeHtml(seg.timeRange)}</span>` : ''}</div>`;
                if (segImages.length) {
                    stepsHtml += buildInlineSegmentImagesHtml(segImages, {
                        gap: '8px',
                        margin: '0 0 4px',
                        maxHeight: '360px',
                        borderColor: '#d7e4f2',
                        shadow: '0 8px 18px rgba(12,27,61,0.07)'
                    });
                }
            }
            for (const s of (seg.steps || [])) {
                const descHtml = escapeHtml(s.action?.description || s.action?.type || t('actionFallback'));
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
                const isNarrationDuplicate = safeImage && segImages.some((image) => {
                    if (image.stepNumber != null && s.stepNumber != null && image.stepNumber === s.stepNumber) return true;
                    if (image.timestampMs != null && s.timestampMs != null && image.timestampMs === s.timestampMs) return true;
                    return image.screenshot === safeImage;
                });
                if (safeImage && !isNarrationDuplicate) body += `<img class="step-img" src="${escapeHtml(safeImage)}" alt="${escapeHtml(t('exportStepAlt', { step: s.stepNumber }))}" loading="lazy">`;
                if (s.action?.selector) body += `<details class="step-code-details"><summary class="step-code-summary">${escapeHtml(t('exportAgentDetail'))}</summary><div class="step-sel">${escapeHtml(s.action.selector)}</div></details>`;
                stepsHtml += `<article class="sop-step"><header class="sop-hdr"><span class="step-n">${escapeHtml(s.stepNumber)}</span><span class="step-act">${descHtml}</span><span class="step-t">${escapeHtml(s.timestamp || '')}</span></header>${body ? `<div class="sop-body">${body}</div>` : ''}</article>`;
            }
            stepsHtml += `</div>`;
        }

        const summaryLines = t('exportSummaryLines', {
            startUrl: escapeHtml(sop.startUrl || ''),
            createdAt: escapeHtml(sop.createdAt || ''),
            steps: escapeHtml(totalSteps),
            duration: escapeHtml(fmtTime(sop.duration || 0))
        });
        const desc = `<section class="doc-desc"><h2>${escapeHtml(t('exportDocTitle'))}</h2><p>${escapeHtml(t('exportDocIntro'))}</p><p><strong>${escapeHtml(t('exportHowToRead'))}</strong><br>${t('exportHowToReadItems')}</p><p><strong>${escapeHtml(t('exportSummary'))}</strong><br>${summaryLines}</p></section>`;
        const sopJson = JSON.stringify(sop)
            .replace(/</g, '\\u003c')
            .replace(/-->/g, '--\\u003e');

        return `<!DOCTYPE html><html lang="${escapeHtml(t('exportLang'))}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(sop.title || 'SOP')}</title><style>:root{--bg:#eef3f8;--surface:#fff;--surface-2:#f7fafc;--line:#d8e2ec;--text:#102a43;--muted:#52667a;--muted-soft:#7b8ea4;--ac:#0b5fff;--ach:#2f80ff;--ac-g:rgba(11,95,255,.2);--r-md:14px;--r-lg:18px;--rf:999px}*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Public Sans","Manrope",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);line-height:1.65;background:radial-gradient(circle at 92% 6%,rgba(11,95,255,.12) 0%,transparent 32%),linear-gradient(180deg,#f8fbff 0%,var(--bg) 100%);padding:24px 16px;-webkit-font-smoothing:antialiased}img{max-width:100%}.shell{max-width:940px;margin:0 auto}.hero{border:1px solid var(--line);background:rgba(255,255,255,.94);backdrop-filter:blur(8px);border-radius:var(--r-lg);padding:18px;box-shadow:0 12px 24px rgba(12,27,61,.08);margin-bottom:12px}.hero-kicker{display:inline-flex;align-items:center;border-radius:var(--rf);border:1px solid #c4d3e2;background:#f4f8fd;color:#3c5471;padding:4px 10px;text-transform:uppercase;letter-spacing:.08em;font-size:10px;font-family:"IBM Plex Mono","SF Mono",Menlo,monospace;margin-bottom:8px}.title{font-family:"Nunito Sans","Public Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:30px;font-weight:800;line-height:1.08;letter-spacing:-.02em;color:#123454;margin-bottom:9px}.meta{display:flex;gap:8px;flex-wrap:wrap}.badge{display:inline-flex;align-items:center;padding:3px 9px;border-radius:var(--rf);font-size:12px;font-weight:700}.badge-primary{background:linear-gradient(120deg,var(--ac),var(--ach));color:#fff}.badge-soft{background:#eaf1f9;color:#3d5774}.doc-desc{border:1px solid var(--line);background:rgba(255,255,255,.92);border-radius:var(--r-md);padding:14px 15px;box-shadow:0 10px 20px rgba(12,27,61,.07);margin-bottom:12px;font-size:13px;color:var(--muted)}.doc-desc h2{font-size:14px;color:#173453;margin-bottom:8px}.doc-desc p{margin-bottom:8px}.doc-desc p:last-child{margin-bottom:0}.steps{display:flex;flex-direction:column;gap:12px}.sop-step{border:1px solid var(--line);background:#fff;border-radius:var(--r-md);overflow:hidden;box-shadow:0 10px 20px rgba(12,27,61,.07)}.sop-hdr{display:flex;align-items:center;gap:10px;padding:11px 12px;background:#fbfdff;border-bottom:1px solid #e2eaf3}.step-n{width:24px;height:24px;border-radius:var(--rf);display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(120deg,var(--ac),var(--ach));color:#fff;font-size:11px;font-weight:700;flex-shrink:0}.step-act{flex:1;font-size:13px;font-weight:700;color:#1a3a5c}.step-act-val{color:#5f7690;font-weight:500}.step-t{font-size:11px;color:#6e849a;font-family:"IBM Plex Mono","SF Mono",Menlo,monospace;white-space:nowrap}.sop-body{padding:10px 12px}.step-url{font-size:12px;color:#6e849a;padding:7px 10px;background:#f7fbff;border-radius:8px;border:1px solid #dbe7f4;margin-bottom:10px;word-break:break-all}.step-url a{color:#0b5fff;text-decoration:none}.step-url a:hover{text-decoration:underline}.step-img{width:100%;border-radius:8px;border:1px solid #e0e8f1;margin-bottom:10px}.step-code-details{margin-top:8px}.step-code-summary{cursor:pointer;user-select:none;border:1px solid #d9e4ef;border-radius:8px;background:#f9fcff;color:#4b6784;font-size:12px;font-weight:600;padding:6px 9px}.step-code-summary:hover{border-color:#c4d8ec;background:#fff;color:#2a4a6d}.step-sel{padding:6px 9px;border-radius:0 0 8px 8px;border:1px solid #d9e4ef;border-top:none;font-family:"IBM Plex Mono","SF Mono",Menlo,monospace;font-size:11px;color:#5b7390;word-break:break-all;background:#f9fcff}.sop-segment{display:flex;flex-direction:column;gap:10px}.sop-seg-voice{border-left:3px solid var(--ac);padding-left:12px}.sop-seg-silent{border-left:3px solid #d5e2ef;padding-left:12px}.seg-narration{display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-radius:10px;background:rgba(11,95,255,.06);border:1px solid rgba(11,95,255,.12);font-size:13px;line-height:1.6;color:#1a3a5c}.seg-icon{flex-shrink:0;font-size:14px}.seg-text{flex:1}.seg-time{flex-shrink:0;font-size:11px;color:#7b8ea4;font-family:"IBM Plex Mono","SF Mono",Menlo,monospace}.footer{text-align:center;padding:18px 8px;color:#71859b;font-size:12px}@media (max-width:680px){body{padding:12px}.hero{padding:14px}.title{font-size:24px}.sop-hdr{align-items:flex-start}.step-t{padding-top:3px}}</style></head><body><div class="shell"><section class="hero"><p class="hero-kicker">ONVORD SOP EXPORT</p><h1 class="title">${escapeHtml(sop.title || 'SOP')}</h1><div class="meta"><span class="badge badge-primary">${escapeHtml(totalSteps)} ${escapeHtml(t('exportStepsUnit'))}</span><span class="badge badge-soft">${escapeHtml(fmtTime(sop.duration || 0))}</span></div></section>${desc}<section class="steps">${stepsHtml}</section><footer class="footer">${escapeHtml(t('exportGeneratedBy', { createdAt: sop.createdAt || '' }))}</footer></div><script id="onvord-sop-json" type="application/json">${sopJson}</script></body></html>`;
    }

    function buildExportSegmentsFromTimeline(sop) {
        const timelineItems = Array.from(evList?.children || []);
        if (!timelineItems.length) return [];

        const stepLookup = buildStepLookupByTimestamp(sop?.steps || []);
        const segments = [];
        let pendingVoice = null;
        let exportStepNumber = 0;

        const flushPendingVoice = () => {
            if (!pendingVoice) return;
            pendingVoice.images = mergeSegmentImages(pendingVoice.images, deriveSegmentImagesFromSteps(pendingVoice.steps || []));
            segments.push(pendingVoice);
            pendingVoice = null;
        };

        for (const item of timelineItems) {
            if (item.classList.contains('tl-narration')) {
                if (item.classList.contains('tl-narration-interim')) continue;
                const narration = normalizeNarrationText(item.querySelector('.tl-narr-text')?.textContent || '');
                if (!isMeaningfulNarration(narration)) continue;
                flushPendingVoice();
                pendingVoice = {
                    type: 'voice',
                    narration,
                    timeRange: '',
                    timeRangeMs: null,
                    steps: [],
                    images: []
                };
                continue;
            }

            if (item.classList.contains('tl-seg-images')) {
                if (!pendingVoice) continue;
                pendingVoice.images = mergeSegmentImages(pendingVoice.images, extractSegmentImagesFromNode(item));
                continue;
            }

            if (!item.classList.contains('tl-actions')) continue;
            const pills = Array.from(item.querySelectorAll('.ev-pill'));
            if (!pills.length) continue;

            const segSteps = [];
            for (const pill of pills) {
                const type = normalizeActionTypeForExport(pill.getAttribute('data-type') || 'action');
                const ts = Number(pill.getAttribute('data-ts'));
                const matchedStep = consumeStepForExport(stepLookup, ts, type);
                const pillLabel = getPillExportLabel(pill, matchedStep?.action?.description || type || t('actionFallback'));
                const inlineShot = normalizeImageSrc(pill.querySelector('.ev-thumb-btn')?.getAttribute('data-full-src') || '');
                const stepShot = normalizeImageSrc(matchedStep?.screenshot || matchedStep?.action?.screenshot_base64 || '');
                const screenshot = inlineShot || stepShot || '';
                const timestampMs = Number.isFinite(ts)
                    ? ts
                    : (Number.isFinite(Number(matchedStep?.timestampMs)) ? Number(matchedStep.timestampMs) : null);
                const description = matchedStep?.action
                    ? describeAction(matchedStep.action, normalizeNarrationText(matchedStep.action.description || pillLabel))
                    : pillLabel;

                segSteps.push({
                    stepNumber: ++exportStepNumber,
                    timestamp: timestampMs != null ? fmtTime(timestampMs) : (matchedStep?.timestamp || ''),
                    timestampMs,
                    action: {
                        ...(matchedStep?.action || {}),
                        type: matchedStep?.action?.type || type || 'action',
                        description
                    },
                    screenshot,
                    narration: ''
                });
            }

            if (!segSteps.length) continue;

            if (pendingVoice && pendingVoice.steps.length === 0) {
                pendingVoice.steps = segSteps;
                pendingVoice.images = mergeSegmentImages(pendingVoice.images, deriveSegmentImagesFromSteps(segSteps));
                const firstTs = segSteps[0]?.timestampMs;
                const lastTs = segSteps[segSteps.length - 1]?.timestampMs;
                if (Number.isFinite(firstTs) && Number.isFinite(lastTs)) {
                    pendingVoice.timeRange = `${fmtTime(firstTs)} - ${fmtTime(lastTs)}`;
                    pendingVoice.timeRangeMs = { start: firstTs, end: lastTs };
                }
                segments.push(pendingVoice);
                pendingVoice = null;
            } else {
                segments.push({
                    type: 'silent',
                    narration: '',
                    timeRange: '',
                    timeRangeMs: null,
                    steps: segSteps,
                    images: deriveSegmentImagesFromSteps(segSteps)
                });
            }
        }

        flushPendingVoice();
        return segments;
    }

    async function doCopySOP() {
        if (!currentSOP) return;
        const sop = currentSOP;
        try {
            const payload = buildEditableClipboardPayload(sop, {
                narrationOverrides: getCurrentNarrationOverrides()
            });
            await writeClipboard(payload);
            toast(t('exportSuccess'));
        } catch (e) {
            console.error('Copy SOP failed:', e);
            toast(t('toastCopyFailed'));
        }
    }

    async function doCopyFullSOP() {
        if (!currentSOP) return;
        const sop = currentSOP;
        try {
            const payload = buildClipboardPayloadV2(sop, {
                narrationOverrides: getCurrentNarrationOverrides()
            });
            await writeClipboard(payload);
            toast(t('exportFullSuccess'));
        } catch (e) {
            console.error('Copy full SOP failed:', e);
            toast(t('toastCopyFailed'));
        }
    }

    async function doRefineCopySOP() {
        if (!currentSOP || !btnRefineCopy) return;
        if (!llmEnabled) {
            toast(t('toastLlmDisabled'));
            return;
        }
        const sop = currentSOP;
        btnRefineCopy.disabled = true;
        btnRefineCopy.textContent = t('refiningCopy');

        try {
            const baseNarrationOverrides = getCurrentNarrationOverrides();
            const draftId = buildSopDraftId(sop);
            const contentFingerprint = buildRefinementContentFingerprint(sop, baseNarrationOverrides);
            const cachedRefinement = await readCachedRefinement(draftId, contentFingerprint);
            if (cachedRefinement) {
                const cachedPayload = buildClipboardPayloadV2(sop, {
                    narrationOverrides: cachedRefinement.narrationOverrides
                });
                await writeClipboard(cachedPayload);
                toast(t('refineCopySuccess'));
                return;
            }
            const refinement = await requestSopRefinement(sop, {
                narrationOverrides: baseNarrationOverrides
            });
            const mergedNarrationOverrides = new Map(baseNarrationOverrides);
            refinement.narrationOverrides?.forEach((text, segIndex) => {
                mergedNarrationOverrides.set(segIndex, text);
            });
            await writeCachedRefinement(draftId, contentFingerprint, sop.title, mergedNarrationOverrides);
            const payload = buildClipboardPayloadV2(sop, {
                narrationOverrides: mergedNarrationOverrides
            });
            await writeClipboard(payload);
            toast(t('refineCopySuccess'));
        } catch (e) {
            console.error('GPT refine copy failed:', e);
            if (e?.message === 'llm-disabled') {
                toast(t('toastLlmDisabled'));
            } else if (e?.message === 'missing-llm-config') {
                toast(t('toastNeedLlmSetup'));
            } else if (e?.message === 'invalid-llm-response') {
                toast(t('toastRefineParseFailed'));
            } else {
                toast(t('toastRefineFailed'));
            }
        } finally {
            btnRefineCopy.disabled = false;
            btnRefineCopy.textContent = t('refineCopy');
        }
    }

    function doDownloadHTML() {
        if (!currentSOP) return;
        const sop = currentSOP;
        try {
            const html = buildDownloadHtml(sop, {
                narrationOverrides: getCurrentNarrationOverrides()
            });
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            const a = document.createElement('a');
            const href = URL.createObjectURL(blob);
            a.href = href;
            a.download = `${safeFilename(sop.title)}.html`;
            a.click();
            URL.revokeObjectURL(href);
            toast(t('downloadSuccess'));
        } catch (e) {
            console.error('Download SOP failed:', e);
            toast(t('toastGenerateFailed'));
        }
    }

    async function doResetNarrationDrafts() {
        if (!currentSOP) return;
        try {
            await clearNarrationDraftsForCurrentSop();
            renderNarrationEditor(currentSOP);
            toast(t('toastNarrationReset'));
        } catch (e) {
            console.error('Reset narration drafts failed:', e);
            toast(t('toastGenerateError'));
        }
    }

    /* ── Wire up ── */
    applyUiLocale();
    applyLlmAvailability(false);
    getLlmSettings()
        .then((settings) => applyLlmAvailability(settings.llmEnabled))
        .catch(() => applyLlmAvailability(false));
    btnStart.addEventListener('click', handleStartClick);
    btnStartManual?.addEventListener('click', handleStartManualClick);
    btnMarkArea?.addEventListener('click', () => {
        handleMarkAreaClick().catch(() => {});
    });
    btnStop.addEventListener('click', doStop);
    btnPause?.addEventListener('click', doTogglePause);
    btnExport.addEventListener('click', doCopySOP);
    btnCopyFull?.addEventListener('click', doCopyFullSOP);
    btnResetNarration?.addEventListener('click', doResetNarrationDrafts);
    btnRefineCopy?.addEventListener('click', doRefineCopySOP);
    btnDownload?.addEventListener('click', doDownloadHTML);
    btnAddNote?.addEventListener('click', submitManualNote);
    btnClearNote?.addEventListener('click', () => {
        if (!manualNoteInputEl) return;
        manualNoteInputEl.value = '';
        manualNoteInputEl.focus();
    });
    manualNoteInputEl?.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitManualNote();
        }
    });
    btnRedo.addEventListener('click', () => {
        stopVolumeVis();
        currentSOP = null;
        currentNarrationDraftId = '';
        currentNarrationDraftMap = new Map();
        activeNarrationSegmentIndex = null;
        pendingPointCaptureTimestamps.clear();
        if (narrationDraftPersistTimer) {
            clearTimeout(narrationDraftPersistTimer);
            narrationDraftPersistTimer = 0;
        }
        recordingMode = 'voice';
        if (manualNoteInputEl) manualNoteInputEl.value = '';
        setRecordingLayout('live');
        switchView('idle');
    });
    previewLocatorListEl?.addEventListener('click', (e) => {
        const group = e.target.closest('.locator-group');
        if (!group) return;
        const segmentIndex = Number(group.getAttribute('data-segment-index'));
        if (!Number.isInteger(segmentIndex)) return;
        setActiveNarrationSegment(segmentIndex, {
            scrollEditor: true,
            focusEditor: true
        });
    });
    previewNarrationCardsEl?.addEventListener('focusin', (e) => {
        const card = e.target.closest('.narration-card');
        if (!card) return;
        const segmentIndex = Number(card.getAttribute('data-segment-index'));
        if (!Number.isInteger(segmentIndex)) return;
        setActiveNarrationSegment(segmentIndex, {
            scrollLocator: true
        });
    });
    previewNarrationCardsEl?.addEventListener('click', (e) => {
        const card = e.target.closest('.narration-card');
        if (!card) return;
        const segmentIndex = Number(card.getAttribute('data-segment-index'));
        if (!Number.isInteger(segmentIndex)) return;
        setActiveNarrationSegment(segmentIndex);
    });
    previewNarrationCardsEl?.addEventListener('input', (e) => {
        const textarea = e.target.closest('.narration-textarea');
        if (!textarea) return;
        const segmentIndex = Number(textarea.getAttribute('data-segment-index'));
        if (!Number.isInteger(segmentIndex)) return;
        const originalNarration = normalizeNarrationDraftText(textarea.getAttribute('data-original-narration') || '');
        const editedNarration = normalizeNarrationDraftText(textarea.value);
        if (editedNarration === originalNarration) {
            currentNarrationDraftMap.delete(segmentIndex);
        } else {
            currentNarrationDraftMap.set(segmentIndex, editedNarration);
        }
        autoResizeNarrationTextarea(textarea);
        updatePreviewActionState(previewNarrationCardsEl.querySelectorAll('.narration-card').length);
        scheduleNarrationDraftPersist();
    });
    evList.addEventListener('click', (e) => {
        const btn = e.target.closest('.ev-thumb-btn, .seg-shot-btn');
        if (!btn) return;
        e.preventDefault();
        openImageViewer(btn.getAttribute('data-full-src') || '', btn.getAttribute('data-alt') || t('screenshotPreview'));
    });
    imgViewerCloseEl?.addEventListener('click', closeImageViewer);
    imgViewerEl?.addEventListener('click', (e) => {
        if (e.target === imgViewerEl) closeImageViewer();
    });
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeImageViewer();
            return;
        }

        const key = String(e.key || '').toLowerCase();
        const isCtrlShiftCaptureHotkey =
            !e.repeat &&
            !e.metaKey &&
            !e.altKey &&
            e.ctrlKey &&
            e.shiftKey &&
            (e.key === 'Shift' || e.key === 'Control' || key === 's');

        if (!isCtrlShiftCaptureHotkey) return;
        e.preventDefault();
        e.stopPropagation();
        handleMarkAreaClick().catch(() => {});
    });
    linkSettings.addEventListener('click', async (e) => {
        e.preventDefault();
        const settings = await getSttSettings();
        const hasCredential = hasProviderCredential(settings);
        let micPermissionState = 'unknown';
        try {
            const res = await navigator.permissions.query({ name: 'microphone' });
            micPermissionState = res.state;
        } catch { /* noop */ }
        if (hasCredential && micPermissionState !== 'granted') {
            openMicPermissionGuide();
            return;
        }
        chrome.runtime.openOptionsPage();
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !('llmEnabled' in changes)) return;
        applyLlmAvailability(changes.llmEnabled.newValue);
    });

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'NEW_EVENT' && currentView === 'recording') addActionPill(msg.data);
        if (msg.type === 'EVENT_SCREENSHOT' && currentView === 'recording') {
            applyScreenshotToTimeline(msg.timestamp, msg.screenshot);
            if (msg.actionType === 'point') {
                pendingPointCaptureTimestamps.delete(String(msg.timestamp));
                toast(t('toastCaptureSaved'));
            }
        }
        if (msg.type === 'EVENT_SCREENSHOT_FAILED' && currentView === 'recording') {
            if (msg.actionType === 'point') {
                pendingPointCaptureTimestamps.delete(String(msg.timestamp));
                toast(t('toastCaptureFailed'));
            }
        }
        if (msg.type === 'AUTO_STOPPED' && currentView === 'recording') {
            toast(t('toastAutoStopped'));
            // Clean up local state without sending another STOP_RECORDING
            clearInterval(timer); timer = null;
            stopSTT();
            stopVolumeVis();
            if (msg.sop) {
                showSopPreview(msg.sop);
            } else {
                // Fallback: request SOP separately
                chrome.runtime.sendMessage({ type: 'GET_SOP' }, (res) => {
                    if (res?.sop) {
                        showSopPreview(res.sop);
                    }
                    else { switchView('idle'); }
                });
            }
            btnStop.disabled = false;
            btnStop.innerHTML = `<span class="bi">⏹</span>${t('stopRecording')}`;
            setPauseButton(false);
            if (btnPause) btnPause.disabled = false;
            isPaused = false;
        }
        if (msg.type === 'RESTRICTED_PAGE') {
            toast(t('toastRestricted'));
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
                if (blockCount > 0 && confirm(t('recoveryPrompt', { ago, count: blockCount }))) {
                    chrome.runtime.sendMessage({ type: 'RESTORE_RECOVERY', data: res.recovery }, () => {
                        startTime = res.recovery.startTime;
                        pausedDuration = res.recovery.pausedDuration || 0;
                        recordingMode = res.recovery.recordingMode === 'text' ? 'text' : 'voice';
                        isPaused = false;
                        switchView('recording');
                        setPauseButton(false);
                        setRecordingLayout('live');
                        timer = setInterval(() => {
                            updateTimerDisplay(Date.now() - startTime - pausedDuration);
                        }, 1000);
                        if (!isManualMode()) {
                            initSTT().then(ok => {
                                if (!ok) toast(t('toastRecoverySttFailed'));
                            });
                            getMicStreamForUse().then(stream => {
                                micStream = stream;
                                startVolumeVis(stream);
                            }).catch(() => {});
                        } else {
                            stopSTT({ flushInterim: false });
                            stopVolumeVis();
                            syncNarrationModeUi();
                            manualNoteInputEl?.focus();
                        }
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
        if (document.visibilityState === 'visible') {
            refreshStartEligibility();
            return;
        }
        persistCurrentNarrationDrafts().catch(() => { });
    });
    window.addEventListener('focus', () => refreshStartEligibility());
    window.addEventListener('pagehide', () => {
        persistCurrentNarrationDrafts().catch(() => { });
    });

    /* ── Initial state check ── */
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (res) => {
        if (res?.recording) {
            startTime = res.startTime;
            pausedDuration = res.pausedDuration || 0;
            recordingMode = res.recordingMode === 'text' ? 'text' : 'voice';
            isPaused = res.paused || false;
            switchView('recording');
            setPauseButton(isPaused);
            setRecordingLayout(isPaused ? 'paused' : 'live');
            timer = setInterval(() => {
                if (!isPaused) {
                    updateTimerDisplay(Date.now() - startTime - pausedDuration);
                }
            }, 1000);
            if (!isManualMode()) {
                initSTT();
                getMicStreamForUse().then(stream => {
                    micStream = stream;
                    startVolumeVis(stream);
                }).catch(() => {});
            } else {
                stopSTT({ flushInterim: false });
                stopVolumeVis();
                syncNarrationModeUi();
                if (!isPaused) manualNoteInputEl?.focus();
            }
            return;
        }
        maybeRestoreDraftPreview().catch((e) => {
            console.warn('Restore draft preview failed:', e);
        });
    });

    /* ── Re-check start eligibility when key changes ── */
    chrome.storage.onChanged.addListener((changes) => {
        if (currentView !== 'idle') return;
        if (!changes.sttProvider &&
            !changes.deepgramKey &&
            !changes.deepgramLang &&
            !changes.aliyunKey &&
            !changes.aliyunRegion &&
            !changes.aliyunModel) {
            return;
        }
        refreshStartEligibility();
    });
})();

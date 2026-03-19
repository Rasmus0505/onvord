// Onvord Content Script — Phase 2 Enhanced
(function () {
  'use strict';

  // Guard against duplicate injection within the same JS context.
  // Do not use DOM attributes for this, otherwise extension reload leaves stale marks
  // and new content script contexts fail to initialize.
  if (window.__onvord_injected) return;
  window.__onvord_injected = true;

  let isRecording = false;
  let isPaused = false;
  let recordingStartTime = 0;
  let listenersAttached = false;
  let lastPointer = { clientX: null, clientY: null, target: null };
  const IS_ZH = /^zh\b/i.test(navigator.language || '');
  const SHIFT_CAPTURE_MIN_SIZE = 12;
  const shiftCaptureState = {
    active: false,
    overlayEl: null,
    boxEl: null,
    hintEl: null,
    startX: null,
    startY: null,
    endX: null,
    endY: null,
    fallbackTarget: null
  };
  const captureFeedbackState = {
    el: null,
    timer: 0
  };
  const CAPTURE_FEEDBACK_TEXT = {
    success: IS_ZH ? '局部截图已保存' : 'Local area saved',
    'capture-tab-failed': IS_ZH ? '网页截图失败' : 'Page capture failed',
    'crop-failed': IS_ZH ? '裁剪失败，请再试一次' : 'Crop failed, try again',
    'crop-exception': IS_ZH ? '截图出错，请再试一次' : 'Capture error, try again',
    'missing-input': IS_ZH ? '缺少选区' : 'Missing selection',
    tooSmall: IS_ZH ? '选区太小，请重新框选' : 'Selection too small, try again',
    cancelled: IS_ZH ? '已取消标记' : 'Marking cancelled',
    marked: IS_ZH ? '已标记该区域' : 'Area marked'
  };

  /* ── Utilities ── */

  function debounce(fn, delay) {
    let t;
    return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), delay); };
  }

  /* ── XPath Generation ── */
  function getXPath(el) {
    if (el.id) return `//*[@id="${el.id}"]`;
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === Node.ELEMENT_NODE) {
      let idx = 0;
      let sib = cur.previousSibling;
      while (sib) {
        if (sib.nodeType === Node.ELEMENT_NODE && sib.tagName === cur.tagName) idx++;
        sib = sib.previousSibling;
      }
      const tag = cur.tagName.toLowerCase();
      const hasSameTagSibling = idx > 0 ||
        (cur.parentNode && Array.from(cur.parentNode.children).filter(c => c.tagName === cur.tagName).length > 1);
      parts.unshift(hasSameTagSibling ? `${tag}[${idx + 1}]` : tag);
      cur = cur.parentNode;
      if (cur === document) break;
    }
    return '/' + parts.join('/');
  }

  /* ── Selector with Confidence ── */
  function getSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);

    // Shadow DOM: walk up through shadow roots
    const path = [];
    let cur = el;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      let sel = cur.tagName.toLowerCase();
      if (cur.id) { path.unshift('#' + CSS.escape(cur.id)); break; }
      if (cur.className && typeof cur.className === 'string') {
        const cls = cur.className.trim().split(/\s+/).filter(c => c && !/^\d/.test(c) && c.length < 30).slice(0, 2);
        if (cls.length) sel += '.' + cls.map(CSS.escape).join('.');
      }
      const parent = cur.parentElement || (cur.getRootNode && cur.getRootNode()).host;
      if (parent && parent !== document) {
        const sibs = Array.from(parent.children || []).filter(c => c.tagName === cur.tagName);
        if (sibs.length > 1) sel += ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')';
      }
      path.unshift(sel);
      cur = parent;
    }
    return path.join(' > ');
  }

  function getSelectorWithConfidence(el) {
    const xpath = getXPath(el);
    let selector = '';
    let confidence = 'low';

    // Priority: id > data-testid/data-cy > aria-label/role > composite
    if (el.id) {
      selector = '#' + CSS.escape(el.id);
      confidence = 'high';
    } else if (el.getAttribute('data-testid')) {
      selector = `[data-testid="${el.getAttribute('data-testid')}"]`;
      confidence = 'high';
    } else if (el.getAttribute('data-cy')) {
      selector = `[data-cy="${el.getAttribute('data-cy')}"]`;
      confidence = 'high';
    } else if (el.getAttribute('aria-label')) {
      const tag = el.tagName.toLowerCase();
      selector = `${tag}[aria-label="${el.getAttribute('aria-label')}"]`;
      confidence = 'medium';
    } else if (el.getAttribute('role')) {
      const tag = el.tagName.toLowerCase();
      selector = `${tag}[role="${el.getAttribute('role')}"]`;
      confidence = 'medium';
    } else {
      selector = getSelector(el);
      confidence = 'low';
    }

    return { selector, xpath, selector_confidence: confidence };
  }

  function quoteText(text) {
    return IS_ZH ? `「${text}」` : `"${text}"`;
  }

  function cleanLabelText(text) {
    return String(text == null ? '' : text)
      .replace(/\s+/g, ' ')
      .replace(/\s*\*+\s*/g, ' ')
      .trim()
      .substring(0, 30);
  }

  const TAG_NAMES = IS_ZH ? {
    a: '链接', button: '按钮', input: '输入框', textarea: '文本框', select: '下拉框',
    img: '图片', video: '视频', audio: '音频', label: '标签',
    h1: '标题', h2: '标题', h3: '标题', h4: '标题', h5: '标题', h6: '标题',
    nav: '导航', form: '表单', table: '表格', li: '列表项', option: '选项',
    details: '折叠区', summary: '折叠标题', dialog: '对话框', menu: '菜单',
    td: '表格单元格', th: '表头', tr: '表格行',
  } : {
    a: 'Link', button: 'Button', input: 'Input', textarea: 'Textarea', select: 'Select',
    img: 'Image', video: 'Video', audio: 'Audio', label: 'Label',
    h1: 'Heading', h2: 'Heading', h3: 'Heading', h4: 'Heading', h5: 'Heading', h6: 'Heading',
    nav: 'Navigation', form: 'Form', table: 'Table', li: 'List Item', option: 'Option',
    details: 'Details', summary: 'Summary', dialog: 'Dialog', menu: 'Menu',
    td: 'Table Cell', th: 'Table Header', tr: 'Table Row',
  };
  const ROLE_NAMES = IS_ZH
    ? { button: '按钮', link: '链接', textbox: '输入框', tab: '标签页', menuitem: '菜单项', checkbox: '复选框', radio: '单选框', switch: '开关', option: '选项' }
    : { button: 'Button', link: 'Link', textbox: 'Textbox', tab: 'Tab', menuitem: 'Menu Item', checkbox: 'Checkbox', radio: 'Radio', switch: 'Switch', option: 'Option' };
  const LABEL_ICON = IS_ZH ? '图标' : 'Icon';
  const LABEL_SELECT_TEXT = IS_ZH ? '选择文字' : 'Select text';
  const LABEL_INPUT_FALLBACK = IS_ZH ? '输入框' : 'Input';
  const LABEL_RECORDING_TITLE = IS_ZH ? 'Onvord 录制中' : 'Onvord Recording';
  const LABEL_MARK_HERE = IS_ZH ? '标记这里' : 'Mark here';
  const LABEL_PAGE_AREA = IS_ZH ? '页面位置' : 'Page area';

  // Interactive tags that should always be recorded
  const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'textarea', 'select', 'option', 'summary', 'label']);

  // Interactive roles
  const INTERACTIVE_ROLES = new Set(['button', 'link', 'tab', 'menuitem', 'option', 'checkbox', 'radio', 'switch', 'textbox', 'combobox', 'slider', 'treeitem']);

  // Icon-like elements
  const ICON_TAGS = new Set(['mat-icon', 'ion-icon', 'fa-icon', 'svg']);

  // Large layout containers to skip
  const LAYOUT_TAGS = new Set(['body', 'html', 'main', 'article', 'section', 'header', 'footer', 'aside', 'nav', 'form', 'ul', 'ol', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'dl']);

  // Keypress keys to capture (Backspace/Delete excluded — they are editing operations, not SOP steps)
  const CAPTURE_KEYS = new Set(['Enter', 'Tab', 'Escape']);
  const LABEL_SHIFT_CAPTURE_HINT = IS_ZH ? '拖拽框选截图区域，按 Esc 取消' : 'Drag to capture an area, Esc to cancel';

  function getDirectText(el) {
    let text = '';
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
    }
    return text.trim();
  }

  function extractLabelText(labelEl) {
    if (!labelEl) return '';

    const preferred = labelEl.querySelector('.field-label, .form-label, .label, .input-label');
    if (preferred) {
      const preferredText = cleanLabelText(preferred.textContent || '');
      if (preferredText) return preferredText;
    }

    let text = '';
    for (const node of labelEl.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += ' ' + node.textContent;
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = node.tagName.toLowerCase();
      if (['input', 'textarea', 'select', 'button', 'option'].includes(tag)) continue;
      text += ' ' + node.textContent;
    }

    return cleanLabelText(text);
  }

  function getAssociatedLabel(el) {
    if (!el) return '';

    try {
      const labels = Array.from(el.labels || []);
      for (const labelEl of labels) {
        const text = extractLabelText(labelEl);
        if (text) return text;
      }
    } catch {}

    try {
      const wrapped = el.closest?.('label');
      const wrappedText = extractLabelText(wrapped);
      if (wrappedText) return wrappedText;
    } catch {}

    if (el.id) {
      try {
        const explicit = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        const explicitText = extractLabelText(explicit);
        if (explicitText) return explicitText;
      } catch {}
    }

    return '';
  }

  /* ── Find the most meaningful element (walk up if needed) ── */
  function findMeaningfulTarget(el) {
    let cur = el;
    // Walk up at most 4 levels to find a meaningful interactive ancestor
    for (let i = 0; i < 4 && cur && cur !== document.body; i++) {
      const tag = cur.tagName.toLowerCase();
      if (INTERACTIVE_TAGS.has(tag)) return cur;
      const role = cur.getAttribute('role') || '';
      if (INTERACTIVE_ROLES.has(role)) return cur;
      if (cur.getAttribute('onclick') || cur.getAttribute('tabindex')) return cur;
      if (cur.getAttribute('aria-label')) return cur;
      cur = cur.parentElement;
    }
    return el; // fallback to original
  }

  /* ── Should we skip this click? ── */
  function isBlankClick(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'body' || tag === 'html') return true;
    if (LAYOUT_TAGS.has(tag)) {
      const role = el.getAttribute('role') || '';
      if (!INTERACTIVE_ROLES.has(role) && !el.getAttribute('onclick')) return true;
    }
    if (tag === 'div' || tag === 'span' || tag === 'p' || tag === 'li' || tag === 'td' || tag === 'th') {
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      // Large container — almost certainly a background area
      if (r.width > vw * 0.6 && r.height > vh * 0.4) return true;
    }
    return false;
  }

  /* ── Is this a non-interactive generic element after walking up? ── */
  function isGenericContainer(el) {
    const tag = el.tagName.toLowerCase();
    if (INTERACTIVE_TAGS.has(tag)) return false;
    const role = el.getAttribute('role') || '';
    if (INTERACTIVE_ROLES.has(role)) return false;
    if (el.getAttribute('onclick') || el.getAttribute('tabindex')) return false;
    // Has cursor:pointer style — likely intentionally clickable
    try { if (getComputedStyle(el).cursor === 'pointer') return false; } catch {}
    // Generic div/span/p/li without explicit interactive signals
    const generic = new Set(['div', 'span', 'p', 'li', 'td', 'th', 'dd', 'dt', 'figcaption', 'figure', 'blockquote', 'pre', 'code']);
    return generic.has(tag);
  }

  function describeElement(el) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role') || '';

    const explicitLabel = getAssociatedLabel(el)
      || el.getAttribute('aria-label')
      || el.getAttribute('placeholder')
      || el.getAttribute('title')
      || el.getAttribute('alt')
      || '';
    if (explicitLabel.trim()) {
      const label = explicitLabel.trim().substring(0, 30);
      const friendly = TAG_NAMES[tag];
      return friendly ? `${friendly}${quoteText(label)}` : quoteText(label);
    }

    if (ICON_TAGS.has(tag) || role === 'img') {
      const parentLabel = el.parentElement?.getAttribute('aria-label') || el.parentElement?.getAttribute('title') || '';
      if (parentLabel.trim()) return `${LABEL_ICON}${quoteText(parentLabel.trim().substring(0, 20))}`;
      return LABEL_ICON;
    }

    if (tag === 'i') {
      const cls = el.className || '';
      if (/icon|fa-|material|bi-/i.test(cls)) {
        const parentLabel = el.parentElement?.getAttribute('aria-label') || el.parentElement?.getAttribute('title') || '';
        if (parentLabel.trim()) return `${LABEL_ICON}${quoteText(parentLabel.trim().substring(0, 20))}`;
        return LABEL_ICON;
      }
    }

    let directText = getDirectText(el);
    if (!directText && el.children.length <= 2) {
      directText = (el.innerText || '').trim().substring(0, 30);
    }
    if (directText) {
      const friendly = TAG_NAMES[tag];
      const short = directText.substring(0, 25);
      return friendly ? `${friendly}${quoteText(short)}` : quoteText(short);
    }

    if (TAG_NAMES[tag]) return TAG_NAMES[tag];
    if (INTERACTIVE_ROLES.has(role)) {
      return ROLE_NAMES[role] || role;
    }

    return null;
  }

  function rect(el) {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }

  function clampToViewport(value, max) {
    const upper = Math.max(0, Math.round(max) - 1);
    return Math.min(Math.max(0, Math.round(value)), upper);
  }

  function rememberPointer(e) {
    if (shiftCaptureState.active) return;
    if (!e) return;
    const clientX = Number(e.clientX);
    const clientY = Number(e.clientY);
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
    lastPointer = {
      clientX,
      clientY,
      target: e.target instanceof Element ? e.target : null
    };
  }

  function getHoveredElementFallback() {
    try {
      const hovered = document.querySelectorAll(':hover');
      return hovered.length ? hovered[hovered.length - 1] : null;
    } catch {
      return null;
    }
  }

  function resolvePointCaptureContext() {
    let clientX = Number(lastPointer.clientX);
    let clientY = Number(lastPointer.clientY);
    let target = lastPointer.target instanceof Element && lastPointer.target.isConnected ? lastPointer.target : null;

    if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
      try {
        target = document.elementFromPoint(clientX, clientY) || target;
      } catch {}
    }

    if (!(target instanceof Element)) {
      target = getHoveredElementFallback();
      if (target instanceof Element) {
        const bounds = target.getBoundingClientRect();
        clientX = bounds.left + Math.max(bounds.width / 2, 0);
        clientY = bounds.top + Math.max(bounds.height / 2, 0);
      }
    }

    if (!(target instanceof Element)) return null;

    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      const bounds = target.getBoundingClientRect();
      if (!bounds.width && !bounds.height) return null;
      clientX = bounds.left + Math.max(bounds.width / 2, 0);
      clientY = bounds.top + Math.max(bounds.height / 2, 0);
    }

    return {
      clientX: clampToViewport(clientX, window.innerWidth),
      clientY: clampToViewport(clientY, window.innerHeight),
      target
    };
  }

  function describePointTarget(el, clientX, clientY) {
    const candidate = findMeaningfulTarget(el);
    const inspected = [];
    if (candidate instanceof Element) inspected.push(candidate);
    if (el instanceof Element && el !== candidate) inspected.push(el);

    for (const item of inspected) {
      const desc = describeElement(item);
      if (desc) {
        return { element: item, description: desc };
      }
    }

    const coords = `${Math.round(clientX)}, ${Math.round(clientY)}`;
    return {
      element: el,
      description: `${LABEL_PAGE_AREA} (${coords})`
    };
  }

  function recordPointMarker() {
    const ctx = resolvePointCaptureContext();
    if (!ctx) return;

    const described = describePointTarget(ctx.target, ctx.clientX, ctx.clientY);
    const targetEl = described?.element instanceof Element ? described.element : ctx.target;
    const selectorInfo = getSelectorWithConfidence(targetEl);
    const text = getDirectText(targetEl).substring(0, 40);

    send({
      actionType: 'point',
      key: 'Ctrl+Shift',
      target: {
        tag: targetEl.tagName.toLowerCase(),
        text,
        selector: selectorInfo.selector,
        xpath: selectorInfo.xpath,
        selector_confidence: selectorInfo.selector_confidence,
        description: described?.description || LABEL_MARK_HERE,
        rect: rect(targetEl)
      },
      clickX: ctx.clientX,
      clickY: ctx.clientY,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight
    });
  }

  function resetShiftCaptureState() {
    shiftCaptureState.active = false;
    shiftCaptureState.overlayEl = null;
    shiftCaptureState.boxEl = null;
    shiftCaptureState.hintEl = null;
    shiftCaptureState.startX = null;
    shiftCaptureState.startY = null;
    shiftCaptureState.endX = null;
    shiftCaptureState.endY = null;
    shiftCaptureState.fallbackTarget = null;
  }

  function getShiftCaptureRect() {
    if (shiftCaptureState.startX == null || shiftCaptureState.startY == null || shiftCaptureState.endX == null || shiftCaptureState.endY == null) {
      return null;
    }
    const x1 = clampToViewport(Math.min(shiftCaptureState.startX, shiftCaptureState.endX), window.innerWidth);
    const y1 = clampToViewport(Math.min(shiftCaptureState.startY, shiftCaptureState.endY), window.innerHeight);
    const x2 = clampToViewport(Math.max(shiftCaptureState.startX, shiftCaptureState.endX), window.innerWidth);
    const y2 = clampToViewport(Math.max(shiftCaptureState.startY, shiftCaptureState.endY), window.innerHeight);
    const width = Math.max(0, x2 - x1);
    const height = Math.max(0, y2 - y1);
    return { x: x1, y: y1, width, height };
  }

  function updateShiftCaptureOverlay() {
    const boxEl = shiftCaptureState.boxEl;
    if (!boxEl) return;
    const rectInfo = getShiftCaptureRect();
    if (!rectInfo || rectInfo.width <= 0 || rectInfo.height <= 0) {
      boxEl.style.display = 'none';
      return;
    }
    boxEl.style.display = 'block';
    boxEl.style.left = `${rectInfo.x}px`;
    boxEl.style.top = `${rectInfo.y}px`;
    boxEl.style.width = `${rectInfo.width}px`;
    boxEl.style.height = `${rectInfo.height}px`;
    if (shiftCaptureState.hintEl) {
      shiftCaptureState.hintEl.textContent = `${LABEL_SHIFT_CAPTURE_HINT} (${rectInfo.width}x${rectInfo.height})`;
    }
  }

  function consumeShiftCapturePointerEvent(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function resolveShiftCaptureTarget(clientX, clientY) {
    let target = null;
    const overlay = shiftCaptureState.overlayEl;
    if (overlay) {
      const prev = overlay.style.pointerEvents;
      overlay.style.pointerEvents = 'none';
      try {
        target = document.elementFromPoint(clientX, clientY);
      } catch {}
      overlay.style.pointerEvents = prev;
    }

    if (!(target instanceof Element)) {
      target = shiftCaptureState.fallbackTarget instanceof Element ? shiftCaptureState.fallbackTarget : null;
    }
    if (!(target instanceof Element)) {
      target = lastPointer.target instanceof Element ? lastPointer.target : null;
    }
    if (!(target instanceof Element)) {
      target = getHoveredElementFallback();
    }
    if (!(target instanceof Element)) {
      target = document.body;
    }
    return target;
  }

  function finishShiftCapture() {
    const captureRect = getShiftCaptureRect();
    if (!captureRect) return false;
    if (captureRect.width < SHIFT_CAPTURE_MIN_SIZE || captureRect.height < SHIFT_CAPTURE_MIN_SIZE) {
      showCaptureFeedback(captureRect, false, 'tooSmall');
      return false;
    }

    const clickX = clampToViewport(captureRect.x + captureRect.width / 2, window.innerWidth);
    const clickY = clampToViewport(captureRect.y + captureRect.height / 2, window.innerHeight);
    const rawTarget = resolveShiftCaptureTarget(clickX, clickY);
    const described = describePointTarget(rawTarget, clickX, clickY);
    const targetEl = described?.element instanceof Element ? described.element : rawTarget;
    const selectorInfo = getSelectorWithConfidence(targetEl);
    const text = getDirectText(targetEl).substring(0, 40);

    send({
      actionType: 'point',
      key: 'Ctrl+Shift',
      target: {
        tag: targetEl.tagName.toLowerCase(),
        text,
        selector: selectorInfo.selector,
        xpath: selectorInfo.xpath,
        selector_confidence: selectorInfo.selector_confidence,
        description: described?.description || LABEL_MARK_HERE,
        rect: rect(targetEl)
      },
      captureRect,
      clickX,
      clickY,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight
    });
    showCaptureFeedback(captureRect, true, 'marked');
    return true;
  }

  function stopShiftCaptureMode() {
    if (!shiftCaptureState.active) return;
    document.removeEventListener('mousedown', onShiftCaptureMouseDown, true);
    document.removeEventListener('mousemove', onShiftCaptureMouseMove, true);
    document.removeEventListener('mouseup', onShiftCaptureMouseUp, true);
    document.removeEventListener('keydown', onShiftCaptureKeyDown, true);
    if (shiftCaptureState.overlayEl) shiftCaptureState.overlayEl.remove();
    resetShiftCaptureState();
  }

  function onShiftCaptureMouseDown(e) {
    if (!shiftCaptureState.active) return;
    if (e.button !== 0) {
      consumeShiftCapturePointerEvent(e);
      return;
    }
    shiftCaptureState.startX = clampToViewport(e.clientX, window.innerWidth);
    shiftCaptureState.startY = clampToViewport(e.clientY, window.innerHeight);
    shiftCaptureState.endX = shiftCaptureState.startX;
    shiftCaptureState.endY = shiftCaptureState.startY;
    updateShiftCaptureOverlay();
    consumeShiftCapturePointerEvent(e);
  }

  function onShiftCaptureMouseMove(e) {
    if (!shiftCaptureState.active) return;
    if (shiftCaptureState.startX == null || shiftCaptureState.startY == null) {
      consumeShiftCapturePointerEvent(e);
      return;
    }
    shiftCaptureState.endX = clampToViewport(e.clientX, window.innerWidth);
    shiftCaptureState.endY = clampToViewport(e.clientY, window.innerHeight);
    updateShiftCaptureOverlay();
    consumeShiftCapturePointerEvent(e);
  }

  function onShiftCaptureMouseUp(e) {
    if (!shiftCaptureState.active) return;
    if (e.button === 0) {
      shiftCaptureState.endX = clampToViewport(e.clientX, window.innerWidth);
      shiftCaptureState.endY = clampToViewport(e.clientY, window.innerHeight);
      finishShiftCapture();
      stopShiftCaptureMode();
    }
    consumeShiftCapturePointerEvent(e);
  }

  function onShiftCaptureKeyDown(e) {
    if (!shiftCaptureState.active) return;
    if (e.key === 'Escape') {
      stopShiftCaptureMode();
      showCaptureFeedback(getShiftCaptureRect() || { x: 16, y: 52 }, false, 'cancelled');
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key === 'Shift') {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function startShiftCaptureMode() {
    if (!isRecording || isPaused || shiftCaptureState.active) return;
    const root = document.documentElement || document.body;
    if (!root) return;

    const overlay = document.createElement('div');
    overlay.id = 'onvord-shift-capture-overlay';
    overlay.setAttribute('style', [
      'position:fixed',
      'left:0',
      'top:0',
      'width:100vw',
      'height:100vh',
      'z-index:2147483647',
      'cursor:crosshair',
      'background:rgba(8,16,32,0.25)',
      'backdrop-filter:blur(1px)',
      'pointer-events:auto',
      'user-select:none'
    ].join(';'));

    const box = document.createElement('div');
    box.setAttribute('style', [
      'position:absolute',
      'display:none',
      'border:2px solid rgba(255,255,255,0.95)',
      'background:rgba(64,145,255,0.18)',
      'box-shadow:0 0 0 9999px rgba(6,10,20,0.25)',
      'pointer-events:none'
    ].join(';'));

    const hint = document.createElement('div');
    hint.textContent = LABEL_SHIFT_CAPTURE_HINT;
    hint.setAttribute('style', [
      'position:absolute',
      'left:16px',
      'top:16px',
      'padding:8px 10px',
      'border-radius:8px',
      'background:rgba(16,20,30,0.82)',
      'color:#fff',
      'font:12px/1.35 -apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif',
      'pointer-events:none'
    ].join(';'));

    overlay.appendChild(box);
    overlay.appendChild(hint);
    root.appendChild(overlay);

    shiftCaptureState.active = true;
    shiftCaptureState.overlayEl = overlay;
    shiftCaptureState.boxEl = box;
    shiftCaptureState.hintEl = hint;
    shiftCaptureState.startX = null;
    shiftCaptureState.startY = null;
    shiftCaptureState.endX = null;
    shiftCaptureState.endY = null;
    shiftCaptureState.fallbackTarget = lastPointer.target instanceof Element ? lastPointer.target : null;

    document.addEventListener('mousedown', onShiftCaptureMouseDown, true);
    document.addEventListener('mousemove', onShiftCaptureMouseMove, true);
    document.addEventListener('mouseup', onShiftCaptureMouseUp, true);
    document.addEventListener('keydown', onShiftCaptureKeyDown, true);
  }

  function ensureCaptureFeedbackEl() {
    if (captureFeedbackState.el) return captureFeedbackState.el;
    const el = document.createElement('div');
    el.id = 'onvord-capture-feedback';
    Object.assign(el.style, {
      position: 'fixed',
      padding: '6px 12px',
      borderRadius: '999px',
      background: 'rgba(16, 20, 30, 0.9)',
      color: '#fff',
      font: '12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      pointerEvents: 'none',
      zIndex: '2147483648',
      opacity: '0',
      transition: 'opacity 0.2s ease, transform 0.2s ease',
      boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
      maxWidth: '260px',
      wordBreak: 'keep-all'
    });
    document.body.appendChild(el);
    captureFeedbackState.el = el;
    return el;
  }

  function formatCaptureFeedbackText(success, reason) {
    if (reason === 'marked') return CAPTURE_FEEDBACK_TEXT.marked;
    if (success) return CAPTURE_FEEDBACK_TEXT.success;
    return CAPTURE_FEEDBACK_TEXT[reason] || (IS_ZH ? '区域截图失败' : 'Area capture failed');
  }

  function showCaptureFeedback(rect, success, reason) {
    const el = ensureCaptureFeedbackEl();
    el.textContent = formatCaptureFeedbackText(success, reason);
    el.style.background = success ? 'rgba(6, 171, 95, 0.95)' : 'rgba(198, 57, 57, 0.95)';
    const safeWidth = 220;
    const x = Number(rect?.x) || 0;
    const y = Number(rect?.y) || 0;
    const left = Math.min(Math.max(8, x), Math.max(8, window.innerWidth - safeWidth - 8));
    const top = Math.min(Math.max(12, y - 34), window.innerHeight - 32);
    el.style.transform = 'translate3d(0,0,0)';
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.opacity = '1';
    if (captureFeedbackState.timer) {
      window.clearTimeout(captureFeedbackState.timer);
    }
    captureFeedbackState.timer = window.setTimeout(() => {
      el.style.opacity = '0';
    }, 2200);
  }

  let sendErrorMuted = false;
  function handleSendError(err) {
    const msg = String(err?.message || err || '');
    // Fire-and-forget messages may legitimately close without response.
    if (/message port closed before a response was received/i.test(msg)) return;
    // Typical after extension reload/update: old content script context becomes invalid.
    const isContextInvalid = /Extension context invalidated|Receiving end does not exist/i.test(msg);
    if (isContextInvalid) {
      isRecording = false;
      isPaused = false;
      if (!sendErrorMuted) {
        sendErrorMuted = true;
        console.warn('Onvord message channel unavailable, stop recording in this page context:', msg);
      }
      return;
    }
    console.warn('Onvord sendMessage failed:', msg || err);
  }

  function safeSendMessage(payload) {
    try {
      const maybePromise = chrome.runtime.sendMessage(payload);
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(handleSendError);
      }
    } catch (e) {
      handleSendError(e);
    }
  }

  function send(data) {
    if (!isRecording || isPaused) return;
    safeSendMessage({
      type: 'ACTION_EVENT',
      data: { ...data, timestamp: Date.now() - recordingStartTime, url: location.href, pageTitle: document.title }
    });
  }

  /* ── Floating Mic Indicator ── */
  let micIndicatorEl = null;

  function injectMicIndicator() {
    if (micIndicatorEl) return;
    micIndicatorEl = document.createElement('div');
    micIndicatorEl.id = 'onvord-mic-indicator';
    micIndicatorEl.setAttribute('style', [
      'position:fixed', 'bottom:20px', 'right:20px', 'z-index:2147483647',
      'width:40px', 'height:40px', 'border-radius:50%',
      'background:rgba(229,72,77,0.9)', 'color:#fff',
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-size:18px', 'box-shadow:0 4px 14px rgba(229,72,77,0.4)',
      'cursor:default', 'user-select:none', 'pointer-events:none',
      'animation:onvord-pulse 1.5s ease-in-out infinite',
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif'
    ].join(';'));
    micIndicatorEl.textContent = '🎙️';
    micIndicatorEl.title = LABEL_RECORDING_TITLE;

    // Inject pulse animation
    const style = document.createElement('style');
    style.id = 'onvord-mic-style';
    style.textContent = '@keyframes onvord-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.08);opacity:0.75}}';
    document.head.appendChild(style);
    document.body.appendChild(micIndicatorEl);
  }

  function removeMicIndicator() {
    if (micIndicatorEl) { micIndicatorEl.remove(); micIndicatorEl = null; }
    const style = document.getElementById('onvord-mic-style');
    if (style) style.remove();
  }

  function updateMicIndicatorPaused(paused) {
    if (!micIndicatorEl) return;
    if (paused) {
      micIndicatorEl.style.background = 'rgba(120,120,120,0.7)';
      micIndicatorEl.style.animationPlayState = 'paused';
      micIndicatorEl.textContent = '⏸️';
    } else {
      micIndicatorEl.style.background = 'rgba(229,72,77,0.9)';
      micIndicatorEl.style.animationPlayState = 'running';
      micIndicatorEl.textContent = '🎙️';
    }
  }

  /* ── Scroll Filtering ── */
  let pendingScroll = null;
  let scrollBufferTimer = null;
  let scrollAnchor = null; // Tracks where a scroll sequence started

  function handleScroll() {
    if (!isRecording || isPaused) return;

    const scrollY = window.scrollY;
    const viewportH = window.innerHeight;

    clearTimeout(scrollBufferTimer);

    // Set anchor on first scroll of a sequence
    if (scrollAnchor === null) {
      scrollAnchor = scrollY;
    }

    // Total distance from scroll start, not just between consecutive events
    const totalDelta = Math.abs(scrollY - scrollAnchor);

    // Large scroll (>50% viewport): record immediately
    if (totalDelta > viewportH * 0.5) {
      const direction = scrollY >= scrollAnchor ? 'down' : 'up';
      pendingScroll = null;
      send({
        actionType: 'scroll',
        direction,
        distance_px: Math.round(totalDelta)
      });
      scrollAnchor = scrollY; // Reset anchor for next segment
      return;
    }

    // Small scroll: buffer and send as PENDING_SCROLL after 500ms idle
    pendingScroll = {
      scrollY,
      distance_px: Math.round(totalDelta),
      direction: scrollY >= scrollAnchor ? 'down' : 'up',
      timestamp: Date.now() - recordingStartTime
    };

    scrollBufferTimer = setTimeout(() => {
      if (pendingScroll) {
        safeSendMessage({
          type: 'PENDING_SCROLL',
          data: {
            actionType: 'scroll',
            direction: pendingScroll.direction,
            distance_px: pendingScroll.distance_px,
            timestamp: pendingScroll.timestamp,
            url: location.href,
            pageTitle: document.title
          }
        });
        pendingScroll = null;
      }
      scrollAnchor = null; // Reset anchor after scroll sequence ends
    }, 500);
  }

  /* ── Click/Select Debounce ── */
  let lastActionKey = '';
  let lastActionTime = 0;
  const ACTION_DEBOUNCE_MS = 200;

  function isDuplicateAction(key) {
    const now = Date.now();
    if (key === lastActionKey && (now - lastActionTime) < ACTION_DEBOUNCE_MS) {
      return true;
    }
    lastActionKey = key;
    lastActionTime = now;
    return false;
  }

  /* ── Handlers ── */

  function onMouseUp(e) {
    if (shiftCaptureState.active) return;
    if (!isRecording || isPaused) return;

    // Check if text was selected
    const sel = window.getSelection();
    const selectedText = (sel ? sel.toString() : '').trim();
    if (selectedText.length > 1) {
      // Debounce: skip same text selected rapidly
      const selectKey = 'select:' + selectedText.substring(0, 50);
      if (isDuplicateAction(selectKey)) return;

      const selectorInfo = getSelectorWithConfidence(e.target);
      send({
        actionType: 'select',
        value: selectedText.substring(0, 200),
        target: {
          tag: e.target.tagName.toLowerCase(),
          selector: selectorInfo.selector,
          xpath: selectorInfo.xpath,
          selector_confidence: selectorInfo.selector_confidence,
          description: `${LABEL_SELECT_TEXT}${quoteText(selectedText.substring(0, 30))}`,
          rect: rect(e.target)
        },
        clickX: e.clientX, clickY: e.clientY,
        viewportW: window.innerWidth, viewportH: window.innerHeight
      });
      return;
    }

    // Regular click handling
    let t = e.target;
    if (isBlankClick(t)) return;

    const meaningful = findMeaningfulTarget(t);
    if (meaningful !== t) t = meaningful;

    // Keep text-entry clicks: a focus-only action still matters for the SOP
    // even when the user never types a value afterwards.

    // After walking up, if target is still a generic container, skip it
    if (isGenericContainer(t)) return;

    const desc = describeElement(t);
    if (!desc) return;

    // Debounce: skip same element clicked rapidly
    const selectorInfo = getSelectorWithConfidence(t);
    const clickKey = 'click:' + selectorInfo.selector;
    if (isDuplicateAction(clickKey)) return;

    send({
      actionType: 'click',
      target: {
        tag: t.tagName.toLowerCase(),
        text: getDirectText(t).substring(0, 40),
        selector: selectorInfo.selector,
        xpath: selectorInfo.xpath,
        selector_confidence: selectorInfo.selector_confidence,
        description: desc,
        rect: rect(t)
      },
      clickX: e.clientX, clickY: e.clientY,
      viewportW: window.innerWidth, viewportH: window.innerHeight
    });
  }

  const onInput = debounce(function (e) {
    if (!isRecording || isPaused) return;
    const t = e.target;
    if (t?.tagName?.toLowerCase() === 'select') return;
    let val = (t.value || t.textContent || '').substring(0, 200);
    if (!val.trim()) return;

    // Password masking
    if (t.type === 'password') {
      val = '***';
    }

    const selectorInfo = getSelectorWithConfidence(t);
    send({
      actionType: 'input',
      target: {
        tag: t.tagName.toLowerCase(),
        selector: selectorInfo.selector,
        xpath: selectorInfo.xpath,
        selector_confidence: selectorInfo.selector_confidence,
        description: describeElement(t) || LABEL_INPUT_FALLBACK,
        rect: rect(t)
      },
      value: val
    });
  }, 500);

  function onChange(e) {
    if (!isRecording || isPaused) return;

    const t = e.target;
    if (!t || t.tagName?.toLowerCase() !== 'select') return;

    const optionText = (t.selectedOptions?.[0]?.textContent || '').replace(/\s+/g, ' ').trim();
    const rawValue = String(t.value || '').replace(/\s+/g, ' ').trim();
    const displayValue = (optionText || rawValue).substring(0, 200);
    if (!displayValue) return;

    const selectorInfo = getSelectorWithConfidence(t);
    send({
      actionType: 'select',
      target: {
        tag: t.tagName.toLowerCase(),
        selector: selectorInfo.selector,
        xpath: selectorInfo.xpath,
        selector_confidence: selectorInfo.selector_confidence,
        description: describeElement(t) || TAG_NAMES.select || 'Select',
        rect: rect(t)
      },
      value: displayValue,
      rawValue: rawValue.substring(0, 200) || null
    });
  }

  /* ── Keypress Handler ── */
  function onKeyDown(e) {
    if (!isRecording || isPaused) return;
    if (shiftCaptureState.active) {
      if (e.key === 'Escape') {
        stopShiftCaptureMode();
        e.preventDefault();
        e.stopPropagation();
      }
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

    if (isCtrlShiftCaptureHotkey) {
      if (!e.repeat) startShiftCaptureMode();
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const hasModifier = e.ctrlKey || e.metaKey || e.altKey;
    // Capture special keys or modifier combos (but not standalone Shift)
    if (!CAPTURE_KEYS.has(e.key) && !hasModifier) return;
    // Skip lone modifier keys
    if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return;

    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.metaKey) parts.push('Cmd');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey && hasModifier) parts.push('Shift');
    parts.push(e.key);
    const combo = parts.join('+');

    const t = e.target;
    const selectorInfo = getSelectorWithConfidence(t);
    send({
      actionType: 'keypress',
      key: combo,
      value: combo,
      target: {
        tag: t.tagName.toLowerCase(),
        selector: selectorInfo.selector,
        xpath: selectorInfo.xpath,
        selector_confidence: selectorInfo.selector_confidence,
        description: describeElement(t) || t.tagName.toLowerCase(),
        rect: rect(t)
      }
    });
  }

  /* ── Recording control ── */

  function start(startTime) {
    // Defensive cleanup for stale listeners from previous extension contexts.
    stop();
    const wasRecording = isRecording;
    isRecording = true;
    isPaused = false;
    recordingStartTime = startTime;
    lastPointer = { clientX: null, clientY: null, target: null };
    if (!listenersAttached) {
      document.addEventListener('mouseup', onMouseUp, true);
      document.addEventListener('mousemove', rememberPointer, true);
      document.addEventListener('input', onInput, true);
      document.addEventListener('change', onChange, true);
      document.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('scroll', handleScroll, { passive: true });
      listenersAttached = true;
    }
    if (!wasRecording) {
      send({ actionType: 'navigation', pageTitle: document.title, from_url: document.referrer || null });
    }
  }

  function stop() {
    isRecording = false;
    isPaused = false;
    stopShiftCaptureMode();
    if (listenersAttached) {
      document.removeEventListener('mouseup', onMouseUp, true);
      document.removeEventListener('mousemove', rememberPointer, true);
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('change', onChange, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', handleScroll);
      listenersAttached = false;
    }
    clearTimeout(scrollBufferTimer);
    pendingScroll = null;
    lastPointer = { clientX: null, clientY: null, target: null };
  }

  function pause() {
    stopShiftCaptureMode();
    isPaused = true;
  }

  function resume() {
    isPaused = false;
    updateMicIndicatorPaused(false);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg.type === 'START_RECORDING') { start(msg.startTime); respond({ ok: true }); }
    else if (msg.type === 'STOP_RECORDING') { stop(); respond({ ok: true }); }
    else if (msg.type === 'PAUSE_RECORDING') { pause(); respond({ ok: true }); }
    else if (msg.type === 'RESUME_RECORDING') { resume(); respond({ ok: true }); }
    else if (msg.type === 'START_SHIFT_CAPTURE') { startShiftCaptureMode(); respond({ ok: true }); }
    else if (msg.type === 'POINT_CAPTURE_RESULT') { showCaptureFeedback(msg.captureRect, msg.success, msg.reason); respond({ ok: true }); }
    else if (msg.type === 'PING') { respond({ ok: true, isRecording }); }
    return true;
  });
})();

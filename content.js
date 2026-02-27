// Onvord Content Script — 录制浏览器操作
(function () {
  'use strict';

  let isRecording = false;
  let recordingStartTime = 0;

  /* ── Utilities ── */

  function debounce(fn, delay) {
    let t;
    return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), delay); };
  }

  function getSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    const path = [];
    let cur = el;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      let sel = cur.tagName.toLowerCase();
      if (cur.id) { path.unshift('#' + CSS.escape(cur.id)); break; }
      if (cur.className && typeof cur.className === 'string') {
        const cls = cur.className.trim().split(/\s+/).filter(c => c && !/^\d/.test(c) && c.length < 30).slice(0, 2);
        if (cls.length) sel += '.' + cls.map(CSS.escape).join('.');
      }
      const parent = cur.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter(c => c.tagName === cur.tagName);
        if (sibs.length > 1) sel += ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')';
      }
      path.unshift(sel);
      cur = cur.parentElement;
    }
    return path.join(' > ');
  }

  // Friendly names for common tags
  const TAG_NAMES = {
    a: '链接', button: '按钮', input: '输入框', textarea: '文本框', select: '下拉框',
    img: '图片', video: '视频', audio: '音频', label: '标签',
    h1: '标题', h2: '标题', h3: '标题', h4: '标题', h5: '标题', h6: '标题',
    nav: '导航', form: '表单', table: '表格', li: '列表项', option: '选项',
    details: '折叠区', summary: '折叠标题', dialog: '对话框', menu: '菜单',
    td: '表格单元格', th: '表头', tr: '表格行',
  };

  // Interactive tags that should always be recorded
  const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'textarea', 'select', 'option', 'summary', 'label']);

  // Interactive roles
  const INTERACTIVE_ROLES = new Set(['button', 'link', 'tab', 'menuitem', 'option', 'checkbox', 'radio', 'switch', 'textbox', 'combobox', 'slider', 'treeitem']);

  // Icon-like elements
  const ICON_TAGS = new Set(['mat-icon', 'ion-icon', 'fa-icon', 'svg']);

  // Large layout containers to skip
  const LAYOUT_TAGS = new Set(['body', 'html', 'main', 'article', 'section', 'header', 'footer', 'aside']);

  function getDirectText(el) {
    let text = '';
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
    }
    return text.trim();
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
      // Check for aria-label (usually means it's intentionally interactive)
      if (cur.getAttribute('aria-label')) return cur;
      cur = cur.parentElement;
    }
    return el; // fallback to original
  }

  /* ── Should we skip this click? ── */
  function isBlankClick(el) {
    const tag = el.tagName.toLowerCase();

    // Always skip body/html
    if (tag === 'body' || tag === 'html') return true;

    // Skip large layout containers with no interactive role
    if (LAYOUT_TAGS.has(tag)) {
      const role = el.getAttribute('role') || '';
      if (!INTERACTIVE_ROLES.has(role) && !el.getAttribute('onclick')) return true;
    }

    // Skip large generic divs/spans that cover most of the viewport
    if (tag === 'div' || tag === 'span' || tag === 'p') {
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      if (r.width > vw * 0.8 && r.height > vh * 0.6) return true;
    }

    return false;
  }

  function describeElement(el) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role') || '';

    // 1. Explicit accessible label
    const explicitLabel = el.getAttribute('aria-label') || el.getAttribute('placeholder')
      || el.getAttribute('title') || el.getAttribute('alt') || '';
    if (explicitLabel.trim()) {
      const label = explicitLabel.trim().substring(0, 30);
      const friendly = TAG_NAMES[tag];
      return friendly ? `${friendly}「${label}」` : `「${label}」`;
    }

    // 2. Icon elements
    if (ICON_TAGS.has(tag) || role === 'img') {
      // Try parent's aria-label for context
      const parentLabel = el.parentElement?.getAttribute('aria-label') || el.parentElement?.getAttribute('title') || '';
      if (parentLabel.trim()) return `图标「${parentLabel.trim().substring(0, 20)}」`;
      return '图标';
    }

    // 3. <i> tag with icon classes
    if (tag === 'i') {
      const cls = el.className || '';
      if (/icon|fa-|material|bi-/i.test(cls)) {
        const parentLabel = el.parentElement?.getAttribute('aria-label') || el.parentElement?.getAttribute('title') || '';
        if (parentLabel.trim()) return `图标「${parentLabel.trim().substring(0, 20)}」`;
        return '图标';
      }
    }

    // 4. Direct text of the element
    let directText = getDirectText(el);
    if (!directText && el.children.length <= 2) {
      directText = (el.innerText || '').trim().substring(0, 30);
    }
    if (directText) {
      const friendly = TAG_NAMES[tag];
      const short = directText.substring(0, 25);
      return friendly ? `${friendly}「${short}」` : `「${short}」`;
    }

    // 5. Friendly tag name or role
    if (TAG_NAMES[tag]) return TAG_NAMES[tag];
    if (INTERACTIVE_ROLES.has(role)) {
      const roleNames = { button: '按钮', link: '链接', textbox: '输入框', tab: '标签页', menuitem: '菜单项', checkbox: '复选框', radio: '单选框', switch: '开关', option: '选项' };
      return roleNames[role] || role;
    }

    return null; // Return null to indicate we couldn't describe it well
  }

  function rect(el) {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }

  function send(data) {
    if (!isRecording) return;
    chrome.runtime.sendMessage({
      type: 'ACTION_EVENT',
      data: { ...data, timestamp: Date.now() - recordingStartTime, url: location.href, pageTitle: document.title }
    });
  }

  /* ── Handlers ── */

  function onMouseUp(e) {
    if (!isRecording) return;

    // Check if text was selected
    const sel = window.getSelection();
    const selectedText = (sel ? sel.toString() : '').trim();
    if (selectedText.length > 1) {
      // This is a text selection, not a click
      send({
        actionType: 'select',
        value: selectedText.substring(0, 200),
        target: { tag: e.target.tagName.toLowerCase(), selector: getSelector(e.target), description: `选择文字「${selectedText.substring(0, 30)}」`, rect: rect(e.target) },
        clickX: e.clientX, clickY: e.clientY,
        viewportW: window.innerWidth, viewportH: window.innerHeight
      });
      return;
    }

    // Regular click handling
    let t = e.target;

    // Skip blank/background clicks
    if (isBlankClick(t)) return;

    // Try to find a more meaningful target
    const meaningful = findMeaningfulTarget(t);
    if (meaningful !== t) t = meaningful;

    // Describe the element
    const desc = describeElement(t);
    if (!desc) return; // Can't describe → skip (likely a meaningless container)

    send({
      actionType: 'click',
      target: { tag: t.tagName.toLowerCase(), text: getDirectText(t).substring(0, 40), selector: getSelector(t), description: desc, rect: rect(t) },
      clickX: e.clientX, clickY: e.clientY,
      viewportW: window.innerWidth, viewportH: window.innerHeight
    });
  }

  const onInput = debounce(function (e) {
    if (!isRecording) return;
    const t = e.target;
    const val = (t.value || t.textContent || '').substring(0, 200);
    if (!val.trim()) return;
    send({ actionType: 'input', target: { tag: t.tagName.toLowerCase(), selector: getSelector(t), description: describeElement(t) || '输入框', rect: rect(t) }, value: val });
  }, 1500);

  let scrollT = null;
  function onScroll() {
    if (!isRecording || scrollT) return;
    scrollT = setTimeout(() => { send({ actionType: 'scroll', scrollY: window.scrollY }); scrollT = null; }, 1000);
  }

  /* ── Recording control ── */

  function start(startTime) {
    isRecording = true;
    recordingStartTime = startTime;
    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('input', onInput, true);
    window.addEventListener('scroll', onScroll, { passive: true });
    send({ actionType: 'navigate', pageTitle: document.title });
  }

  function stop() {
    isRecording = false;
    document.removeEventListener('mouseup', onMouseUp, true);
    document.removeEventListener('input', onInput, true);
    window.removeEventListener('scroll', onScroll);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg.type === 'START_RECORDING') { start(msg.startTime); respond({ ok: true }); }
    else if (msg.type === 'STOP_RECORDING') { stop(); respond({ ok: true }); }
    else if (msg.type === 'PING') { respond({ ok: true, isRecording }); }
    return true;
  });
})();

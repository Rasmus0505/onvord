<p align="center">
  <img src="icons/icon128.png" width="80" alt="Onvord Logo">
</p>

<h1 align="center">Onvord</h1>

<p align="center">
  <strong>Record your actions, generate AI-executable SOPs</strong><br>
  Browser action recording + voice narration → Structured SOPs for AI agents
</p>

<p align="center">
  <a href="README.md">中文</a> · <b>English</b>
</p>

---

## What is Onvord?

**Onvord** is a Chrome extension that lets you record browser workflows by simply "doing and talking" — it automatically captures your actions and voice narration, then generates a structured SOP (Standard Operating Procedure).

The generated SOP is both **human-friendly** (rich screenshots, clear steps) and **AI-ready** (precise CSS selectors and action semantics that AI agents can execute).

> This directory is the **Onvord open-source edition (OSS)**. You bring your own speech API credentials.

> 🎯 **In one sentence**: Do it once, let AI do it a thousand times.

---

## Features

### 🎙️ Real-time Speech-to-Text
- Supports self-configured **Deepgram** and **Aliyun Qwen Realtime ASR**
- Current recognition options: **Chinese (zh-CN)** and **English (en-US)**
- Voice narration is auto-linked to action steps (non-meaningful text is filtered out)
- Provider credentials stay only in your local browser storage

### 🖱️ Smart Action Capture
- Automatically records clicks, inputs, scrolls, and page navigation
- **Text selection** vs **click** — precisely distinguished
- Intelligent filtering of meaningless actions (blank area clicks, etc.)
- Auto-identifies element types (buttons, links, inputs, icons, etc.)

### 📸 Inline Thumbnail Screenshots
- Auto-captures and annotates screenshots for **click** and **select** events
- Thumbnails are embedded inside action pills (same pattern during recording and preview)
- Click any thumbnail to open a larger viewer

### 📋 Single-Page Hybrid Timeline
- **Recording** and **post-stop preview** share the same timeline view
- **Voice** → merged narration blocks, with the placeholder text `识别中`
- **Actions** → compact pills, with merged scroll display (for example `Scroll xN`)

### 📄 Standalone HTML Export
- One-click export to self-contained HTML file
- Rich visual output with segmented narration and screenshots
- Send directly to colleagues or upload to AI agents
- Built-in guide plus "Execution Details (For Agent)" for automation

## Recent Updates (2026-03)

- Refreshed extension icon assets: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`, `icons/logo.png`
- The OSS edition now supports self-configured `Deepgram` and `Aliyun Qwen Realtime ASR`
- Recording and preview were unified into one timeline page
- Sidebar wording was updated to "Execution Details (For Agent)"
- Voice placeholder changed from line marks to `识别中`
- Action pills now support inline screenshot thumbnails with click-to-zoom
- Unrecognized / non-meaningful speech text (for example `...` or punctuation-only) is no longer shown in timeline/preview
- Scroll actions are filtered by PRD rules and merged in live timeline (for example `Scroll xN`)
- The Aliyun realtime path now has a safer stop flow plus `AudioWorklet` capture fallback

---

## Use Cases

| Scenario | How |
|----------|-----|
| **Teach AI repetitive tasks** | Record a workflow once, export SOP for AI agent to execute |
| **Create product tutorials** | Operate while narrating, auto-generate visual guides |
| **Bug reproduction** | Record the exact steps to reproduce, with screenshots and selectors |
| **Employee onboarding** | Experienced staff record SOPs, new hires self-learn |
| **Process auditing** | Document operation steps with visual evidence |

---

## Quick Start

### 1. Install

> Currently in developer preview — manual loading required.

1. Download this project
2. Open Chrome → `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" → Select the project folder

### 2. Configure Speech Recognition

1. Choose one provider: `Deepgram` or `Aliyun Qwen Realtime ASR`
2. Prepare the corresponding API key
3. Open the settings page (sidebar "Settings" link or the extension options page)
4. Paste your key → Test connection → Save

### 3. Start Recording

1. Open the webpage you want to demonstrate
2. Click the Onvord icon in the toolbar to open the sidebar
3. Click **⏺ Start Recording**
4. Operate the browser normally while narrating each step
5. Click **⏹ Stop Recording** → SOP auto-generates
6. Click **Export SOP** to download the standalone HTML file

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  Chrome Extension (Manifest V3)             │
├──────────────┬──────────────┬───────────────┤
│ content.js   │ sidepanel.js │ background.js │
│ · Capture    │ · Unified    │ · State       │
│   actions    │   timeline UI│   management  │
│ · Element    │ · Speech STT │ · SOP         │
│   describe   │              │   generation  │
│ · Event      │ · HTML       │ · Screenshot  │
│   filtering  │   export     │   annotation  │
└──────────────┴──────────────┴───────────────┘
         │                          │
    ┌───────────────┐         ┌──────┴──────┐
    │ Deepgram /    │         │ Offscreen   │
    │ Aliyun STT    │         │ Canvas      │
    │ WebSocket API │         │ (Annotate)  │
    └───────────────┘         └─────────────┘
```

- **content.js** — injected into pages to capture user actions (clicks, inputs, text selection)
- **sidepanel.js** — sidebar UI, unified recording/preview timeline, Deepgram / Aliyun speech recognition, SOP export
- **background.js** — service worker for recording state, SOP generation, and screenshot annotation
- **annotate.js** — offscreen document for marking click positions on screenshots
- **aliyun-pcm-worklet.js** — PCM capture worklet used by the Aliyun realtime path

---

## Privacy & Security

- 🔒 **API Key stored locally** — Only in `chrome.storage.local`, never uploaded
- 🔒 **Voice data** — Sent directly to your selected provider (Deepgram or Aliyun); Onvord stores no audio
- 🔒 **Screenshots** — Processed entirely in your browser, never leave your machine
- 🔒 **Open source** — Full source code available for audit

---

## Roadmap

- [x] Real-time speech-to-text (Deepgram / Aliyun)
- [x] Smart action capture & filtering
- [x] Screenshot click-position annotation
- [x] Hybrid timeline (narration blocks + action pills)
- [x] Standalone HTML export
- [ ] iFlytek speech engine (China mainland, no VPN needed)
- [ ] AI-powered SOP refinement (LLM-enhanced narration)
- [ ] Cloud SOP sharing (shareable links)
- [ ] Chrome Web Store listing
- [ ] Team collaboration (shared SOP library)
- [ ] Multi-language UI

---

## Contributing

Issues and Pull Requests are welcome!

---

## License

MIT License

---

<p align="center">
  <strong>Onvord</strong> — Let AI see what you do<br>
  <sub>Built with ❤️ for the AI-native workflow</sub>
</p>

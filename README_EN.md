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

> 🎯 **In one sentence**: Do it once, let AI do it a thousand times.

---

## Features

### 🎙️ Real-time Speech-to-Text
- Powered by **Deepgram Nova-2** — streaming WebSocket transcription
- Supports Chinese, English, Japanese, Korean, and auto language detection
- Voice narration auto-linked to corresponding action steps

### 🖱️ Smart Action Capture
- Automatically records clicks, inputs, scrolls, and page navigation
- **Text selection** vs **click** — precisely distinguished
- Intelligent filtering of meaningless actions (blank area clicks, etc.)
- Auto-identifies element types (buttons, links, inputs, icons, etc.)

### 📸 Annotated Screenshots
- Auto-captures screenshot on every click/selection
- Click position marked with a visible annotation ring
- Clear on both light and dark themed pages

### 📋 Hybrid Timeline
- **Voice** → Merged into continuous narration blocks
- **Actions** → Compact pill-style tags, minimal vertical space
- Real-time updates during recording

### 📄 Standalone HTML Export
- One-click export to self-contained HTML file
- Dark theme, rich visuals, embedded images
- Send directly to colleagues or upload to AI agents
- Built-in documentation header — AI understands it immediately

## Recent Updates (2026-03)

- Refreshed extension icon assets: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`, `icons/logo.png`
- Speech-to-text now defaults to third-party API (Deepgram); Chrome built-in Web Speech is removed
- Sidebar label was updated from "Technical Details" to "Execution Details (For Agent)"
- Unrecognized / non-meaningful speech text (for example `...` or punctuation-only) is no longer shown in timeline/preview
- Scroll actions are filtered by PRD rules and merged in live timeline (for example `Scroll xN`)

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

1. Sign up at [Deepgram](https://console.deepgram.com/signup) (free $200 credit)
2. Create an API Key
3. Click **⚙️ Set up Speech Recognition API Key** in the extension sidebar
4. Paste your key → Test connection → Save

### 3. Start Recording

1. Open the webpage you want to demonstrate
2. Click the Onvord icon in the toolbar to open the sidebar
3. Click **⏺ Start Recording**
4. Operate the browser normally while narrating each step
5. Click **⏹ Stop Recording** → SOP auto-generates
6. Click **📄 Export Webpage** to download the standalone HTML file

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  Chrome Extension (Manifest V3)             │
├──────────────┬──────────────┬───────────────┤
│ content.js   │ sidepanel.js │ background.js │
│ · Capture    │ · UI &       │ · State       │
│   actions    │   Timeline   │   management  │
│ · Element    │ · Speech     │ · SOP         │
│   describe   │   (Deepgram) │   generation  │
│ · Event      │ · HTML       │ · Screenshot  │
│   filtering  │   export     │   annotation  │
└──────────────┴──────────────┴───────────────┘
         │                          │
    ┌────┴────┐              ┌──────┴──────┐
    │ Deepgram │              │ Offscreen   │
    │ WebSocket│              │ Canvas      │
    │ (STT)    │              │ (Annotate)  │
    └──────────┘              └─────────────┘
```

---

## Privacy & Security

- 🔒 **API Key stored locally** — Only in `chrome.storage.local`, never uploaded
- 🔒 **Voice data** — Sent directly to Deepgram, Onvord stores no audio
- 🔒 **Screenshots** — Processed entirely in your browser, never leave your machine
- 🔒 **Open source** — Full source code available for audit

---

## Roadmap

- [x] Real-time speech-to-text (Deepgram)
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

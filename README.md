---
feature: thumbnails/external/56cd4236abaa41d7c3c2b73cb7feb976.svg
---
# 🎙️ Deepgram Live Transcription Extension for TypingMind

A lightweight, fast, and accurate voice transcription extension that integrates seamlessly with TypingMind.

![Version](https://img.shields.io/badge/version-1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ Features

- **⚡ Ultra-fast transcription** - 2-4 seconds for 2 minutes of audio (powered by Deepgram Nova-3)
- **🎯 Optimized for deliberate speech** - 10-second pause tolerance before sentence finalization
- **⌨️ Keyboard shortcuts** - Space bar toggle, Ctrl+Enter to copy & clear
- **💬 Direct TypingMind integration** - Insert transcribed text directly into chat
- **🔑 Keyterm support** - Add technical terms for improved accuracy
- **💾 Persistent settings** - API key and keyterms saved across sessions
- **🎨 Beautiful UI** - Clean, modern floating widget design
- **🔒 Privacy-focused** - All transcription happens via your own Deepgram API key

---

## 🚀 Quick Start

### 1. Installation

Add this URL to TypingMind Extensions:

```
https://YOUR_USERNAME.github.io/deepgram-typingmind-extension/deepgram-typingmind-extension.js
```

**Steps:**
1. Open TypingMind
2. Go to **Settings** → **Advanced** → **Extensions**
3. Click **"Add Extension"**
4. Paste the URL above (replace `YOUR_USERNAME` with your GitHub username)
5. Save and reload TypingMind

### 2. Get Deepgram API Key

1. Sign up at [Deepgram Console](https://console.deepgram.com/signup?jump=keys)
2. Copy your API key (free tier includes $200 credit = ~645 hours of transcription)
3. Paste it in the extension's API Key field

### 3. Start Transcribing

1. Click the 🎤 button (bottom-right corner)
2. Click **"Start Recording"** (or press **Space** when not typing)
3. Speak naturally with pauses
4. Watch the transcript appear in real-time
5. Click **"Insert to Chat"** to send to TypingMind

---

## 🎯 Use Cases

Perfect for:
- **Brainstorming sessions** - Capture ideas without typing
- **Meeting notes** - Transcribe discussions in real-time
- **Content creation** - Draft blog posts, emails, or documentation
- **Accessibility** - Voice input for those who prefer or need it
- **Multilingual work** - Deepgram supports 30+ languages

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Space** | Toggle recording (when not typing in input fields) |
| **Ctrl+Enter** | Copy transcript and clear |

---

## 🔧 Configuration

### Keyterms (Optional)

Improve accuracy for technical terms, proper nouns, or specialized vocabulary:

**Examples:**
```
LlamaIndex, TypingMind, Obsidian, Kubernetes, PostgreSQL
```

Deepgram's Nova-3 model uses **Keyterm Prompting** with up to 90% recall rate for specified terms.

### WebSocket Parameters

The extension uses these optimized Deepgram settings:

- **Model:** `nova-3` (latest, most accurate)
- **Punctuation:** Enabled
- **Smart formatting:** Enabled
- **Endpointing:** 10 seconds (maximum pause before finalizing)
- **Utterance end:** 5 seconds (recommended maximum)
- **Interim results:** Enabled (required for utterance detection)

---

## 🏗️ Technical Details

### Architecture

```
User Speech → Browser MediaRecorder → WebSocket → Deepgram Nova-3 API
                                                          ↓
    TypingMind Chat ← "Insert to Chat" ← Transcript UI ← Final Transcript
```

### Performance

- **Latency:** 2-4 seconds for 2 minutes of audio
- **Accuracy:** Matches OpenAI Whisper quality
- **Speed:** 85% faster than traditional transcription tools
- **Streaming:** Real-time WebSocket connection
- **Optimization:** Deliberate speech with long pauses (10 sec tolerance)

### Browser Compatibility

- ✅ Chrome/Edge (recommended)
- ✅ Firefox
- ✅ Safari (macOS)
- ✅ Brave
- ⚠️ Requires HTTPS (automatically handled by GitHub Pages)

---

## 🎨 UI Preview

**Floating Button:**
- Bottom-right corner
- Purple gradient (blue when recording)
- Pulsing animation during recording

**Transcription Panel:**
- Clean, modern design
- 500px width, responsive
- Draggable and resizable transcript area
- Clear status indicators
- Color-coded buttons

---

## 🔐 Privacy & Security

- **No data storage:** All transcription happens directly between your browser and Deepgram
- **API key security:** Stored locally in browser localStorage (never transmitted to third parties)
- **HTTPS only:** Secure connection required for microphone access
- **Open source:** Full code available for audit

---

## 🛠️ Development

### Local Testing

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/deepgram-typingmind-extension.git
cd deepgram-typingmind-extension

# Serve locally (for testing)
python -m http.server 8000

# Test in browser
# Open TypingMind DevTools (F12) and paste:
(function() {
  const script = document.createElement('script');
  script.src = 'http://localhost:8000/deepgram-typingmind-extension.js';
  document.head.appendChild(script);
})();
```

### File Structure

```
deepgram-typingmind-extension/
├── deepgram-typingmind-extension.js  # Main extension file
├── README.md                          # This file
└── LICENSE                            # MIT License
```

---

## 📝 Changelog

### Version 1.0 (Current)

- ✅ Initial release
- ✅ Real-time transcription with Deepgram Nova-3
- ✅ Keyboard shortcuts (Space, Ctrl+Enter)
- ✅ Direct TypingMind integration
- ✅ Keyterm support
- ✅ Persistent API key and settings
- ✅ Optimized for deliberate speech (10-second pause tolerance)
- ✅ Beautiful floating widget UI

---

## 🐛 Known Issues

1. **"Insert to Chat" may not work** if TypingMind's DOM structure changes
   - **Workaround:** Use "Copy" button and paste manually
   - **Fix planned:** More robust selector detection

2. **Microphone permission on first use**
   - Browser will request permission on first recording
   - This is expected security behavior

---

## 🤝 Contributing

Contributions are welcome! To contribute:

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

MIT License - feel free to use, modify, and distribute.

---

## 🙏 Acknowledgments

- **Deepgram** for their excellent Nova-3 speech-to-text API
- **TypingMind** for creating an extensible AI chat interface
- **Community** for feedback and testing

---

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/YOUR_USERNAME/deepgram-typingmind-extension/issues)
- **Deepgram Docs:** https://developers.deepgram.com/
- **TypingMind Docs:** https://docs.typingmind.com/

---

## ⭐ Star this repo if you find it useful!

**Made with ❤️ for the TypingMind community**

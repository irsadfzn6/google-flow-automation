# Google Flow Automation (`google-flow-automation`)

Autonomous browser automation agent, CLI, and programmatic Node.js SDK for **Google Flow** (`flow.google.com`). Automates AI video generation (DeepMind Veo 3.1 & Omni 1.1 Flash) and static image keyframing (Nano Banana 2.1 / Pro / Lite) via persistent Chrome DevTools Protocol (CDP).

---

## ⚡ Key Features

- **Autonomous Agent Integration (`generate-assistant.js`)**: Pass prompts directly to generate videos and images and auto-download them locally.
- **Permanent Login (Zero Bot Flags)**: Connects directly to native Google Chrome via Chrome DevTools Protocol (CDP) on port 9222.
- **Windows One-Click Launcher (`launch-flow-chrome.bat`)**: Launches Google Chrome on port 9222 with an isolated user profile.
- **AI Models Supported**:
  - **Video**: DeepMind Veo 3.1 (Fast, Quality, Lite) & Omni 1.1 Flash.
  - **Image**: Nano Banana 2.1, Nano Banana Pro, and Nano Banana 2 Lite.
- **Model Context Protocol (MCP)**: Native stdio MCP server (`bin/flow-mcp.js`) to allow AI agents (Claude, Cursor, Antigravity) to generate videos and images autonomously.

---

## 🚀 Quick Start

### 1. Launch Chrome with Remote Debugging
On Windows, run:
```cmd
launch-flow-chrome.bat
```
Log in to your Google Account on `flow.google.com` once.

### 2. Autonomous Prompt Generation
```bash
# Generate image
node generate-assistant.js --type image --prompt "A cute orange astronaut cat in earth orbit, cinematic 8k"

# Generate video
node generate-assistant.js --type video --prompt "Cinematic drone flythrough of a cybernetic neon city in rain"
```

### 3. CLI Commands
```bash
# Environment diagnostics
node bin/flow.js doctor

# List projects
node bin/flow.js project list

# Project status
node bin/flow.js status
```

---

## 📜 License
MIT

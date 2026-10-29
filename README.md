# Google Flow Automation (`google-flow-automation`)

Autonomous browser automation agent, CLI, and programmatic Node.js SDK for **Google Flow** (`flow.google.com`). Automates AI video generation (DeepMind Veo 3.1 & Omni 1.1 Flash) and static image keyframing (Nano Banana 2.1 / Pro / Lite) via persistent Chrome DevTools Protocol (CDP).

---

## ⚡ Key Features

- **Autonomous Agent Integration (`generate-assistant.js`)**: Pass prompts directly to generate videos and images and auto-download them locally.
- **Character Reference & Consistency (Ingredients)**: Automatically attaches character references (`rakyat`, `kaisar`, `prajurit`, `barbar`, `jenderal`, `remaja`, or custom image paths) to keep character visuals 100% consistent across shots.
- **YouTube Project Batch Automation (`generate-youtube-batch.js`)**: Directly parses `prompts-siap-pakai.md`, manages character ingredients, switches between Image (Nano Banana 2.1) and Video (Veo 3.1 4s), and organizes downloads per scene (`adeganX/shot_XXX`).
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

### 2. Autonomous Prompt Generation (with Character Consistency)
```bash
# Generate image with a character reference
node generate-assistant.js --type image --ingredients "rakyat" --prompt "A stickman teacher pointing at a Roman map"

# Generate video with multiple character references
node generate-assistant.js --type video --ingredients "remaja, jenderal" --prompt "A young stickman emperor being dethroned by a general"
```

### 3. YouTube Batch Generator (`roma-runtuh`)
```bash
# Dry run check (preview parsed shots, characters & models)
node generate-youtube-batch.js --dry-run --shots 1-5

# Generate a specific shot
node generate-youtube-batch.js --shot 4

# Generate an entire scene (Adegan 1)
node generate-youtube-batch.js --adegan 1
```

### 4. CLI Commands
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

# ⬡ Claude Artifact Sorter (CAS)

Why does Claude's artifact list have no semblence of order, I want to cry after long sessions because its so confusing looking at the list of artifacts with memory loss issues that'd make Claude blush, so I started off with a simple sorting tool in the DOM and it turned into a project-artifact viewing system because keeping track of artifacts is bonkers cray cray doo doo bananas before.

This is an autonomous Chrome Extension for enhancing the **Claude.ai** experience. This tool provides advanced artifact management, real-time sorting, and AI-powered summarization, all while preserving the integrity of your original chat flow.

This project exists because the native experience is fundamentally broken for power users. What started as a simple fix for a disorganized list has been built out into a comprehensive **Project-Artifact Viewing System**. This extension treats your artifacts as an indexed database rather than a pile of discarded drafts. It’s about taking control of the "cray cray doo doo bananas" chaos and turning it into a searchable archive that actually remembers what you did—even when you (and Claude) have reached the limits of your memory.

---

## 🚀 Installation Guide

### 1. Download the Extension
- Click the green **Code** button on GitHub and select **Download ZIP**.
- Extract the ZIP file to a folder on your computer (e.g., `Documents/Claude-Artifact-Sort`).

### 2. Open Extensions Page
In most Chromium-based browsers, typing `chrome://extensions` will automatically redirect you to the correct internal page.

**Compatible Browsers:**
- **Chrome**: `chrome://extensions`
- **Edge**: `edge://extensions`
- **Brave**: `brave://extensions`
- **Vivaldi / Opera / Sidekick / Arc / Orion**: (Any Chromium-based browser)

### 3. Enable Developer Mode
- In your browser's Extensions page, toggle the **Developer mode** switch (usually in the top-right or sidebar) to **ON**.

### 4. Load the Extension
- Click the **Load unpacked** button.
- In the file picker, select the folder containing `manifest.json`.
- The **Claude Artifact Sorter** should now appear in your list of extensions.

---

## 📖 How to Use

### 1. Indexing Your Chats
To "document" a chat and its artifacts into the **Project Review** system, simply navigate to that chat. CAS will automatically scan the messages and sidebars to build its local database for that specific conversation.

### 2. Live Artifact Generation
Once you are inside a chat, CAS remains active. Any new artifacts Claude generates will be automatically detected, indexed, and added to the Sorter Panel and Sidebar in real-time.

### 3. Troubleshooting & Refreshing
If the UI becomes "stuck" or you don't see a newly generated file immediately, simply click the **↺ (Rescan)** button in the floating panel. This forcibly re-synchronizes the extension with Claude's current DOM.

---

## ✨ Features

### 🖱️ Advanced Sorter Panel
- **Tabbed Interface**: Switch between **This Chat** (current context) and **Project Review** (your entire project history).
- **Hybrid Recognition**: Detects artifacts in real-time as they generate, whether the sidebar is open or closed.
- **Quick Interactions**: 
    - **Single-Click**: Jump to and highlight the artifact (Gold Pulse highlight in chat).
    - **Double-Click**: Open the artifact content directly in the main view.
- **Multidimensional Sorting**: Sort by Filename (A-Z/Z-A), File Size, File Type, or "First Seen" Timestamp.

### 📂 Project-Wide Browser
- **Persistent Index**: CAS archives every chat it scans within a project (via UUID extraction).
- **Archive Stats**: View artifact counts, last-seen timestamps, and chat names for everything you've worked on in one view.
- **Lazy-Rendered Previews**: Expand any past chat in the list to view its artifacts and AI summaries without leaving the current chat.
- **Deep Navigation**: ↗ icons allow for instant navigation to past chats in new tabs with a single middle-click.

### 🧠 Smart AI Summaries
- **Targeted Prompting**: CAS intelligently ignores already-summarised files, generating prompts **only for new/unsummarised artifacts**, saving context and tokens.
- **Inline Sidebar Injection**: Inject summaries directly into the Sidebar metadata area for a frictionless overview of your file history.
- **Summarise Badge**: A smart badge (`N new — summarise?`) pulses gold when new files need attention.

### 🛡️ Chat Space Protection
- **Immutable Chat Flow**: CAS is strictly non-intrusive. It **never** injects structural DOM elements into the main chat flow, protecting your exports and screenshots from clutter.
- **Sidebar Scoping**: Sorting controls and summary badges are strictly scoped to the Artifacts Sidebar.

---

## 🛠️ Usage Tips
- **The Gold Pulse**: The `⬡` toggle button in the header will pulse gold when a new artifact is caught by the background scanner.
- **JSON Formatting**: When summarising, Claude provides a JSON object which CAS automatically parses and maps back to your files.
- **Manual Scan**: Click **↺** in the Sorter Panel or Sidebar to force a full re-index of the current view.

---

*Note: This extension is designed for personal use and is not affiliated with Anthropic.*

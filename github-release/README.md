# IDeV Advanced — Local-First Autonomous AI Desktop Platform

<p align="center">
  <img src="https://raw.githubusercontent.com/musawir-13/IDeV-Advanced/main/assets/logo.png" alt="IDeV Advanced Logo" width="120" />
</p>

<p align="center">
  <strong>Autonomous Software Engineering · 21-Role Specialist Team · Real-Time S2S Voice AI · Model Context Protocol (MCP)</strong>
</p>

<p align="center">
  <a href="https://github.com/musawir-13/IDeV-Advanced/releases/latest/download/IDeV-Setup-0.3.8.exe">
    <img src="https://img.shields.io/badge/Download%20for%20Windows-v0.3.8%20(64--bit)-2563eb?style=for-the-badge&logo=windows&logoColor=white" alt="Download for Windows" />
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%2010%20%2F%2011%20(x64)-0078d4?style=flat-square&logo=windows" alt="Windows Support" />
  <img src="https://img.shields.io/badge/Version-0.3.8-success?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/Inference-Local%20Ollama-3aa675?style=flat-square" alt="Local Inference" />
  <img src="https://img.shields.io/badge/License-Proprietary%20%2F%20IDeV-blue?style=flat-square" alt="License" />
</p>

---

## Overview

**IDeV Advanced** is an original, local-first artificial intelligence desktop application for Windows. Founded and engineered by **Ubaid** (Founder, Developer, and CEO of IDeV), it unifies fluid conversational chat, autonomous multi-agent software engineering, real-time speech-to-speech voice interaction, and native extensible tooling into a private, high-performance desktop experience.

Unlike cloud-dependent coding tools that transmit your source code to external servers, IDeV Advanced runs locally on your machine via Ollama, executing file creation, syntax analysis, tests, and command execution within strict authorized workspace boundaries.

---

## Key Features

### 1. Build Mode 2.0: Autonomous Software Engineering
- **Structured Task Timeline:** Replaces unreadable log dumps with an interactive directed acyclic graph (DAG) tracking 21 specialist roles from analysis to deployment.
- **Live Current Activity:** Real-time visibility into the active specialist role, model tag, character streaming ticker, and elapsed time.
- **Real File Operations:** Automatic path normalization, traversal rejection, and atomic file creation/editing within your selected folder.
- **In-App Code Preview:** Instant code modal with syntax highlighting and one-click clipboard copying.
- **Self-Healing Code Fixer:** Automatic static syntax validation (JSON, JavaScript, Python) with single-pass patch loops.
- **Isolated Diagnostics Console:** Collapsible `<details>` console keeping raw stdout/stderr and exit codes separate from user chat.

### 2. 21-Role Multi-Agent Orchestration Team
IDeV Advanced maintains 21 distinct specialist roles mapped exclusively to local Ollama models:
1. **Head Developer & Chief Architect** (`qwen3.5:9b`)
2. **Prompt Engineer & Task Contract Designer** (`gemma4:12b`)
3. **Product Requirements Analyst** (`qwen3.5:4b`)
4. **UI/UX Designer** (`qwen3.5:2b`)
5. **Frontend Web Developer** (`qwen2.5:7b`)
6. **Backend Developer** (`qwen2.5-coder:14b`)
7. **Native Android Developer** (`deepseek-coder:6.7b`)
8. **Desktop Application Developer** (`codegemma:7b`)
9. **Database Specialist** (`qwen2.5:14b`)
10. **Code Fixer & Debugger** (`qwen2.5-coder:7b`)
11. **Unit Test Engineer** (`deepseek-r1:7b`)
12. **Integration & QA Tester** (`qwen3:8b`)
13. **Security Auditor** (`deepseek-r1:8b`)
14. **Performance Optimizer** (`qwen3:4b`)
15. **Visual QA Inspector** (`gemma4:e4b`)
16. **OCR Specialist** (`glm-ocr:latest`)
17. **Documentation Writer** (`qwen2.5:3b`)
18. **Build & Release Engineer** (`qwen3:1.7b`)
19. **Code Quality Reviewer** (`gemma3:4b`)
20. **Final Product Acceptance Analyzer** (`deepseek-r1:14b`)
21. **Project Knowledge Retrieval** (`qwen3-embedding:8b`)

### 3. S2S Gemini Live Voice AI
- Real-time, continuous, low-latency conversational speech powered by Google Gemini Live API.
- Full-duplex bidirectional audio streaming via WebSockets with instant barge-in interruption.
- Microphone input framed as 16 kHz 16-bit PCM; native audio output at 24 kHz.
- Zero local key leakage: API keys are masked in memory and redacted from diagnostics.

### 4. Integrations Marketplace & Unified Composer Actions
- **Native Marketplace:** Manage connectors, MCP tools, semantic memory, and snapshot checkpoints from a clean tabbed view.
- **Intelligent Composer `+` Menu:** Attach code, images, workspace trees, run DuckDuckGo web searches, grep code, or create snapshot checkpoints with a single click.

### 5. Checkpoints & Safe Workspace Snapshots
- Instant pre-build snapshot created automatically before any file write operations.
- Stored locally inside `.idev-checkpoints` in the workspace directory.
- 1-click atomic rollback to restore any previous project state.

---

## System Requirements

| Specification | Requirement | Recommended |
| :--- | :--- | :--- |
| **Operating System** | Windows 10 (64-bit) / Windows 11 | Windows 11 (64-bit) |
| **Processor** | 64-bit Intel / AMD (AVX2 support) | 8+ Cores modern CPU |
| **Memory (RAM)** | 8 GB RAM | 16 GB or 32 GB RAM |
| **Storage** | 500 MB for app + space for models | NVMe SSD |
| **Inference Engine** | [Ollama for Windows](https://ollama.com/download/windows) | Latest Ollama running locally |

---

## Installation Guide

### Step 1: Download
Click the [Download for Windows](https://github.com/musawir-13/IDeV-Advanced/releases/latest/download/IDeV-Setup-0.3.8.exe) button above or get the installer from the [Releases page](https://github.com/musawir-13/IDeV-Advanced/releases).

### Step 2: Run the Setup Wizard
1. Open the downloaded `IDeV-Setup-0.3.8.exe` file.
2. The installer runs in user mode (`asInvoker`) and installs cleanly into `%LocalAppData%\Programs\IDeV Advanced`.
3. Choose your preferred destination folder and shortcut options.
4. Click **Install** and launch IDeV Advanced upon completion.

### Step 3: Configure Ollama (Local Models)
1. Ensure [Ollama](https://ollama.com) is installed and running on your PC (`http://127.0.0.1:11434`).
2. Pull your preferred base model in your terminal:
   ```powershell
   ollama pull qwen3.5:9b
   ```
3. Open IDeV Advanced. The status indicator will verify the connection and display installed models.

### Step 4: First Launch Setup
- Every new installation opens into a fresh, empty conversation.
- Click the **Folder** icon in the message composer to choose your project workspace.
- Toggle **Build Mode** whenever you want the 21-role team to generate or modify workspace code.

---

## Documentation

- [Windows Installation Guide](docs/installation.md)
- [First-Launch Walkthrough](docs/first-launch.md)
- [Configuration & Settings](docs/configuration.md)
- [Troubleshooting & FAQ](docs/troubleshooting.md)
- [Privacy & Security Architecture](docs/privacy.md)
- [Contributing Guidelines](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)

---

## Release Verification & Integrity

Every official release artifact includes cryptographic SHA-256 checksums to ensure file integrity.

| Artifact | Version | SHA-256 Checksum |
| :--- | :---: | :--- |
| `IDeV-Setup-0.3.8.exe` | 0.3.8 | `3b470a2b86593c2addd806d63571cd6bb60f0a8cce3fd18479b95326b9534318` |

Verify checksum in PowerShell:
```powershell
Get-FileHash -Algorithm SHA256 "IDeV-Setup-0.3.8.exe"
```

---

## Privacy Policy

IDeV Advanced is designed local-first:
- **Local Model Execution:** Prompt evaluations, embeddings, and code generation execute exclusively on your machine via Ollama.
- **Zero Telemetry:** No user prompts, chat history, code snippets, or workspace paths are collected or sent to telemetry servers.
- **Workspace Security:** Canonical path normalization prevents filesystem access outside the folder you select.
- **Optional Cloud Features:** Google Gemini Live S2S voice connections communicate directly from your device to Google's official endpoints using your own API key. Keys are never sent to IDeV.

Read the complete [Privacy Statement](PRIVACY.md).

---

## License & Attribution

- **Founder, Developer & CEO:** Ubaid — IDeV Platform
- **License:** Proprietary / All Rights Reserved. See [LICENSE](LICENSE) for terms.

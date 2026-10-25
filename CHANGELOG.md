# Changelog — IDeV Advanced

All notable changes to **IDeV Advanced** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.3.8] - 2026-10-25

### Added
- **Build Mode 2.0:** Complete architectural overhaul of autonomous software development. Replaced unreadable logs with an interactive Directed Acyclic Graph (DAG) task timeline tracking 21 specialist roles from analysis to deployment.
- **In-App File Change & Code Preview:** Added interactive code preview modal with syntax formatting, file status badges, and single-click clipboard copying.
- **Self-Healing Code Fixer Pipeline:** Added automated single-pass syntax repair (JSON, JS, Python) with role-targeted remediation.
- **S2S Gemini Live Voice AI:** Full-duplex speech-to-speech interaction powered by Google Gemini Live WebSockets API with live animated orb indicator and instant voice interruption (barge-in).
- **Native Integrations Marketplace:** Central hub for managing MCP tools, local Connectors (Local Git, File Search, Web Search), semantic memory, and snapshot checkpoints.
- **Unified Composer Actions Menu (`+`):** Multi-category popover menu for attaching files, images, workspace trees, triggering web searches, code grep, and snapshot checkpoints.
- **Checkpoint & Rollback System:** Automated workspace snapshots before write operations with one-click atomic restore.
- **Automated Verification Suite:** 191 automated acceptance tests (`tests/run_all_tests.js`) and button audit utility (`scripts/audit_buttons.js`).

### Changed
- **Windows Packaging & Antivirus Hardening:** Configured `asInvoker` execution level in NSIS installer, removed `elevate.exe` packaging dependency, injected official Windows PE version metadata, and eliminated unnecessary administrator elevation prompts.
- **UI Simplification:** Streamlined sidebar navigation to focus purely on active chat and project workflow, cleaned history header, and removed obsolete debug bars.
- **Privacy Hardening:** Relocated all user data to `%APPDATA%\IDeV Advanced`, stripped machine-specific paths from distribution bundles, sanitized hardcoded keys, and added `.env.example`.

### Fixed
- Fixed unhandled exceptions in workspace connector child processes.
- Fixed stream truncation and model routing errors during high-speed Ollama token emission.
- Fixed NSIS electron-builder configuration warning regarding timestamps and signing options.

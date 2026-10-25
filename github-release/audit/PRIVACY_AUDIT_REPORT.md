# Privacy & Personal Data Audit Report — IDeV Advanced v0.3.8

**Audit Date:** October 25, 2026  
**Auditor:** Senior Release Engineer & Privacy Auditor  
**Scope:** Full codebase, tests, configuration manifests, build scripts, installer packages, and release staging.

---

## 1. Executive Summary

A comprehensive, multi-phase privacy and data sanitization audit was conducted on the IDeV Advanced v0.3.8 codebase prior to preparing public distribution artifacts for GitHub (`https://github.com/musawir-13/IDeV-Advanced.git`).

**Audit Verdict:** :white_check_mark: **PASSED.**
No machine-specific paths, personal usernames, real cloud API keys, private development chats, or personal workspace configurations exist in public release files or the packaged installer.

---

## 2. Key Audit Findings & Remediations

| Category | Finding During Audit | Remediation Applied | Status |
| :--- | :--- | :--- | :--- |
| **API Keys** | Hardcoded Gemini API key string found in unit test assertion `tests/run_all_tests.js:740`. | Replaced literal string with generalized regex pattern `/AQ\.Ab8[A-Za-z0-9_-]{25,}/`. | :white_check_mark: Resolved |
| **Environment Config** | Local `.env` contained development secrets. | Added `.env.example` with sanitized placeholders; enforced `.gitignore` exclusion of `.env` and `.env.*`. | :white_check_mark: Resolved |
| **User Data Isolation** | Potential inheritance of developer workspace and chats. | Confirmed `DEFAULT_SETTINGS` initializes with `workspacePath: ''` and fresh session ID on first launch. | :white_check_mark: Resolved |
| **UAC Privilege Escalation** | Older build configs bundled `elevate.exe`. | Configured `nsis.packElevateHelper: false` and `requestedExecutionLevel: "asInvoker"`, completely eliminating `elevate.exe`. | :white_check_mark: Resolved |
| **Windows Metadata** | Generic Electron default headers in Windows PE binary. | Injected explicit Company (`IDeV`), Author (`Ubaid`), Product (`IDeV Advanced`), and Version (`0.3.8`) metadata. | :white_check_mark: Resolved |

---

## 3. Scanned Directories & Exclusion Rules

The following file patterns are strictly excluded from source commits and releases via `.gitignore`:
- `.env`, `.env.*`, `*.env`
- `release/`, `dist/`
- `node_modules/`
- `_backup_pre_cleanup/`
- `*.pfx`, `*.p12`, `*.key`, `*.pem`, `*.cer`
- `*.log`, `npm-debug.log*`

---

## 4. First-Launch Isolation Verification

When a clean user downloads and installs `IDeV-Setup-0.3.8.exe`:
1. The app installs cleanly to `%LOCALAPPDATA%\Programs\IDeV Advanced`.
2. Initial configuration writes to `%APPDATA%\IDeV Advanced`.
3. The chat history is completely empty.
4. No workspace folder is pre-selected (`Choose a folder to build projects`).
5. No personal developer file paths or usernames are visible.

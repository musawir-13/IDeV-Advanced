# Public Release Verification Checklist — IDeV Advanced v0.3.8

This checklist must be executed and confirmed prior to publishing any public GitHub release or distribution binary.

## 1. Privacy & Secret Sanitization
- [x] No personal API keys or access tokens hardcoded in source files or tests.
- [x] `.env.example` contains only placeholder values (`GEMINI_API_KEY=your_gemini_api_key_here`).
- [x] `.gitignore` strictly ignores `.env`, `.env.*`, `*.pfx`, `*.key`, `release/`, and temporary directories.
- [x] No personal file paths (e.g. `C:\Users\...`, `JARVIS Uploads`) exist in committed code or default settings.
- [x] Default application settings initialize with empty strings for `workspacePath` and `chatMessages`.

## 2. Windows Installer & Binary Integrity
- [x] Executable: `release/IDeV-Setup-0.3.8.exe` generated cleanly by `npm run dist`.
- [x] Windows PE resource metadata verified:
  - ProductName: `IDeV Advanced`
  - CompanyName: `IDeV`
  - LegalCopyright: `Copyright © 2026 Ubaid, IDeV. All rights reserved.`
  - FileVersion / ProductVersion: `0.3.8`
- [x] SHA-256 checksum recorded in `SHA256SUMS.txt`:
  `3b470a2b86593c2addd806d63571cd6bb60f0a8cce3fd18479b95326b9534318`
- [x] `requestedExecutionLevel` configured as `"asInvoker"` (no unnecessary administrator elevation prompt).
- [x] `packElevateHelper: false` avoids deploying third-party `elevate.exe`.

## 3. Automated Test Verification
- [x] Full automated acceptance test suite: `node tests/run_all_tests.js` passes all tests (191 passing, 0 failing).
- [x] Interactive UI button audit: `node scripts/audit_buttons.js` confirms 0 unreferenced or broken buttons.
- [x] Syntax check across all JavaScript and JSON files passes without errors.

## 4. Documentation & Repository Artifacts
- [x] `README.md` features prominent Windows download button pointing to the official release URL.
- [x] `LICENSE` clearly attributes authorship to Founder, Developer, and CEO Ubaid (IDeV).
- [x] `SECURITY.md`, `CONTRIBUTING.md`, `PRIVACY.md`, and `CHANGELOG.md` included.
- [x] GitHub Actions automated release workflow configured at `.github/workflows/release.yml`.
- [x] Dedicated `github-release/` artifact directory fully populated.

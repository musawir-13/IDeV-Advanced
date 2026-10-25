# Contributing to IDeV Advanced

Thank you for your interest in contributing to **IDeV Advanced**!

## Development Setup

### Prerequisites
- Node.js (v18 or higher recommended; v20+ supported)
- npm (v9+)
- Windows 10 or 11 (64-bit)
- Local [Ollama](https://ollama.com/) instance

### Getting Started

1. **Clone the repository:**
   ```bash
   git clone https://github.com/musawir-13/IDeV-Advanced.git
   cd IDeV-Advanced
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   Add any optional development tokens (e.g., `GEMINI_API_KEY`) to `.env`. Never commit `.env`!

4. **Launch the development app:**
   ```bash
   npm start
   ```

---

## Code Quality & Testing Standards

All pull requests and contributions must pass our comprehensive automated test suite and UI integrity audits:

1. **Run full automated test suite:**
   ```bash
   node tests/run_all_tests.js
   ```
   All tests (Tests A through Y) must pass cleanly with 0 failures.

2. **Run interactive UI button audit:**
   ```bash
   node scripts/audit_buttons.js
   ```
   Must report 0 unreferenced buttons or broken bindings.

3. **Verify distribution packaging:**
   ```bash
   npm run dist
   node scripts/verify_distribution.js
   ```

---

## Code Style Guidelines

- Maintain vanilla JavaScript simplicity in the renderer without unnecessary bulky frontend frameworks.
- Preserve explicit error handling, sandboxing, and workspace path verification.
- Always redact sensitive API keys and system paths in log output.
- Follow Git conventional commit messages (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`).

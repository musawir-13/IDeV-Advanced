# Security Policy — IDeV Advanced

## Reporting a Vulnerability

The IDeV team takes application security seriously. If you discover a security vulnerability, please report it responsibly:

1. **Email:** Report privately to the repository maintainer or open a private advisory at [https://github.com/musawir-13/IDeV-Advanced/security/advisories](https://github.com/musawir-13/IDeV-Advanced/security/advisories).
2. **Details:** Include detailed reproduction steps, the affected platform/version (Windows 10/11 x64), and potential impact.
3. **Response Time:** We aim to acknowledge receipt within 48 hours and provide remediation updates.

Do not submit vulnerability reports via public issue trackers.

---

## Supported Versions

| Version | Supported |
| :--- | :--- |
| **0.3.8** | :white_check_mark: Supported |
| < 0.3.8 | :x: Out of support |

---

## Architecture & Security Boundaries

### 1. Local-First Isolation
- All chat reasoning and autonomous multi-agent software engineering run strictly on your local machine via Ollama HTTP loopback (`127.0.0.1:11434`).
- Prompts, internal agent thoughts, and workspace files are never transmitted to external cloud servers.

### 2. Workspace Containment
- Autonomous builds are restricted to the user-selected workspace directory.
- Directory traversal attacks (e.g. `../`, absolute drives, system root folders) are explicitly intercepted and blocked prior to any file writes.
- Hidden system files (`.git`, system configs) are protected from destructive modification.

### 3. API Credential Safety
- External services (such as optional Google Gemini Live Speech-to-Speech) require user-supplied API keys stored in local application configuration.
- Real API tokens are never written into source code, git repositories, or distributed installers.
- Runtime logs and error dialogs sanitize and redact API keys before display.

### 4. Code Execution Boundaries
- Command execution (such as test runners or linters) requires explicit user confirmation or workspace-level activation.
- Dangerous shell invocations that attempt privilege elevation or system tampering are rejected.

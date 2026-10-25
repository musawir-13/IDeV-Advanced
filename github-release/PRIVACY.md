# Privacy Statement — IDeV Advanced

**IDeV Advanced** is designed from the ground up as a **local-first, privacy-respecting artificial intelligence platform**.

## Core Privacy Principles

### 1. 100% Local Processing by Default
- The primary inference engine for IDeV Advanced is local **Ollama**.
- When you chat, brainstorm, plan, or execute software builds in Build Mode 2.0, all model weights execute on your own hardware via local loopback (`http://127.0.0.1:11434`).
- **Zero user prompts, code snippets, project structures, or internal chain-of-thought logs are sent to external cloud servers.**

### 2. Isolated User Data Profile
- User data, conversation histories, persistent memories, and custom MCP settings are stored strictly in the standard operating system user profile:
  `%APPDATA%\IDeV Advanced`
- The application binary and distributed installers are completely decoupled from developer machines, development file paths, or private repositories.
- Every new user installation begins with a clean, empty state without inheriting prior chats, workspace selections, or credentials.

### 3. Transparent Third-Party Integrations
- Optional cloud features (such as **S2S Gemini Live Voice**) connect directly and solely to Google's official Gemini Live WebSockets API when explicitly enabled by the user.
- Any API key entered by the user is stored locally in client-side storage, masked in memory, and never transmitted to IDeV or any telemetry collector.
- DuckDuckGo web searches executed via the Composer Actions menu query public search endpoints without tracking cookies.

### 4. Zero Spyware, Telemetry, or Analytics
- IDeV Advanced contains **no hidden trackers**, analytics SDKs, Google Analytics, telemetry beacons, or crash reporters that transmit data outside your machine.
- Diagnostic logs remain entirely on your local disk within the application's dev tools or log files.

---

For questions or security concerns, please refer to [SECURITY.md](SECURITY.md).

# Data Privacy Architecture — IDeV Advanced

This document provides technical details on how IDeV Advanced guarantees user privacy and data security.

## 1. Storage Layout

IDeV Advanced maintains strict isolation between the application binaries, development workspaces, and user state:

- **Application Binaries:** Installed into `%LOCALAPPDATA%\Programs\IDeV Advanced`. Read-only at runtime.
- **User Data Directory:** Placed in `%APPDATA%\IDeV Advanced`. Contains:
  - `config.json`: Local user preferences (theme, default model, masked API key).
  - `chats.json`: Encrypted/sanitized local conversation records.
  - `idev-mcp-servers.json`: Custom MCP server configurations.
  - `memory.json`: Local semantic memory store.
- **Workspace Directories:** Completely external. User-designated project folders where code is generated. Checkpoint snapshots are saved in `.idev-checkpoints` directly within each respective workspace.

## 2. In-Memory Sanitization

- API keys entered in the settings panel are kept in memory only when establishing active Live sessions.
- In-memory regex patterns redact API keys matching `AQ.Ab8...` and standard key shapes before logging or writing to disk.

## 3. Sandboxing & Access Boundaries

- Renderer processes run with Node integration disabled and Context Isolation enabled via Electron `preload.js`.
- File system access is exposed strictly via vetted IPC channels (`nexus.workspace`, `nexus.checkpoints`, `nexus.files`).
- File write operations enforce `path.resolve` containment checks preventing path traversal attacks.

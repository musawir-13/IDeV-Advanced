# Troubleshooting Guide — IDeV Advanced

## Frequently Encountered Issues & Solutions

### 1. Ollama Connection Error ("Cannot connect to Ollama")
- **Cause:** Ollama service is not running or is blocked by local firewall.
- **Solution:**
  1. Open Command Prompt and run `ollama list`. If it fails, start the Ollama application from the Start Menu or run `ollama serve`.
  2. Verify that `http://127.0.0.1:11434` responds in your web browser.

### 2. Windows SmartScreen Warning on First Install
- **Cause:** IDeV Advanced is a newly released independent open/community binary without historical cloud telemetry downloads registered with Microsoft SmartScreen.
- **Solution:**
  1. Click **"More info"** on the Windows SmartScreen dialog.
  2. Click **"Run anyway"**.
  3. Verify the installer hash against the published SHA-256 hash in `SHA256SUMS.txt` to guarantee tamper-free binary authenticity.

### 3. Voice Orb Fails to Connect
- **Cause:** Missing or invalid Gemini API key, or network firewall blocking WebSockets (`wss://`).
- **Solution:**
  1. Open Settings and verify your Gemini API key has access to the Live multimodal API.
  2. Ensure your local network allows outbound HTTPS/WSS connections to `generativelanguage.googleapis.com`.

### 4. Build Mode Rejects File Operations
- **Cause:** Workspace folder is not selected, or an agent attempted an out-of-bounds write path.
- **Solution:**
  1. Click "New project" or "Choose a folder" under the composer to set an explicit authorized directory.
  2. IDeV Advanced strictly forbids writes outside the selected workspace.

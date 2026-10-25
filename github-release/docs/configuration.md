# Configuration Guide — IDeV Advanced

## Settings Management

Click the **Settings** button (gear icon) at the bottom of the sidebar to access application preferences.

### 1. General & System Settings
- **Workspace Directory:** Set the default working folder for builds and source inspection.
- **Theme:** Default dark theme optimized for coding productivity.
- **Default Model:** Choose between automatic 21-role specialist team routing or a specific pinned Ollama model.

### 2. S2S Gemini Live Voice Setup
IDeV Advanced features real-time Speech-to-Speech (S2S) voice interaction powered by Google Gemini Live:
1. Open **Settings** or right-click the voice orb button.
2. Enter your Gemini API Key in the designated field.
3. Select your preferred voice model (e.g. `Aoede`, `Charon`, `Fenrir`, `Kore`, `Puck`).
4. Select your language preference (English, Hindi, Hinglish).
5. Click **Save Settings**.
Your API key is saved locally in encrypted application storage and never logged or leaked.

### 3. Model Context Protocol (MCP) Configuration
IDeV Advanced natively supports the Model Context Protocol:
- Open the **Integrations Marketplace** from the composer `+` button.
- Select the **MCP Tools** tab to view connected stdio tools.
- Add custom MCP servers by specifying executable paths and environment arguments.
- Server configurations persist in `%APPDATA%\IDeV Advanced\idev-mcp-servers.json`.

# First Launch & Quickstart — IDeV Advanced

Welcome to **IDeV Advanced**! This guide walks you through your first session.

## 1. Ensure Ollama is Running

IDeV Advanced connects to your local Ollama instance over HTTP loopback (`127.0.0.1:11434`).

1. Open a terminal or verify that Ollama is active in your Windows system tray.
2. If not running, start it:
   ```bash
   ollama serve
   ```
3. Ensure you have pulled at least one capable model:
   ```bash
   ollama run qwen3:1.7b
   ```

## 2. Launch IDeV Advanced

Launch the application via the Desktop shortcut or Start Menu.
On startup, IDeV Advanced initializes with a clean, empty state:
- An empty conversation history.
- An unselected workspace folder.
- A connection indicator under the composer (`Ollama · localhost:11434`).

## 3. Selecting a Workspace Folder

To enable Build Mode 2.0 and allow the 21-role specialist team to write files:
1. Click the **"New project"** button in the sidebar or the **"Choose a folder to build projects"** text below the message composer.
2. Pick an empty folder or your project repository.
3. The selected path will appear in the composer footnote.

## 4. Starting a Build

1. Click the **Build** pill button beside the message composer (it highlights with an active accent).
2. Describe your desired application or website (for example: *"Create a modern responsive calculator with dark mode and unit tests"*).
3. Press **Enter** or click the send button.
4. Watch the **Build Mode 2.0 Directed Acyclic Graph (DAG)** timeline execute:
   - Analysis & Architecture
   - File manifest generation
   - Source code emission
   - Self-healing code repair
   - In-app file previews

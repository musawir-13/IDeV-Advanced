# Installation Guide — IDeV Advanced

## System Requirements

- **Operating System:** Windows 10 (64-bit) or Windows 11 (64-bit)
- **Processor:** 64-bit x86-64 processor with AVX2 instruction support
- **Memory (RAM):** 8 GB minimum (16 GB or 32 GB strongly recommended for larger local models)
- **Storage:** 500 MB for IDeV Advanced, plus required disk space for Ollama models (typically 2 GB–8 GB per model)
- **Local AI Engine:** [Ollama for Windows](https://ollama.com/download/windows)

---

## Step-by-Step Installation

### 1. Download Installer
Download the latest Windows setup wizard directly from the official release:
- Direct Download: [IDeV-Setup-0.3.8.exe](https://github.com/musawir-13/IDeV-Advanced/releases/latest/download/IDeV-Setup-0.3.8.exe)
- Release Page: [GitHub Releases](https://github.com/musawir-13/IDeV-Advanced/releases)

### 2. Verify Checksum (Recommended)
Open PowerShell in the folder where you downloaded the setup file and verify the SHA-256 hash:

```powershell
Get-FileHash -Algorithm SHA256 .\IDeV-Setup-0.3.8.exe
```

Verify that the output hash matches:
```
3b470a2b86593c2addd806d63571cd6bb60f0a8cce3fd18479b95326b9534318
```

### 3. Run Setup Wizard
1. Double-click `IDeV-Setup-0.3.8.exe`.
2. Follow the on-screen installation prompts.
3. The wizard installs IDeV Advanced per-user into:
   `%LOCALAPPDATA%\Programs\IDeV Advanced`
4. No administrator privileges or UAC elevation are required (`asInvoker`).
5. A Desktop shortcut and Start Menu launcher will be created automatically.

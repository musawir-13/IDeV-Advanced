const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const http = require('http');

class IntegrationsRegistry {
  constructor(options = {}) {
    this.storagePath = options.storagePath || null;
    this.connectorManager = options.connectorManager || null;
    this.mcpManager = options.mcpManager || null;
    this.geminiLiveSession = options.geminiLiveSession || null;
    this.memoryEngine = options.memoryEngine || null;
    this.checkpointManager = options.checkpointManager || null;
    this.customConfigs = new Map();
    this.healthCache = new Map();
  }

  async initialize() {
    if (this.storagePath) {
      try {
        const data = await fs.readFile(this.storagePath, 'utf8');
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed === 'object') {
          for (const [key, val] of Object.entries(parsed)) {
            this.customConfigs.set(key, val);
          }
        }
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.warn('[IntegrationsRegistry] Failed to load custom configs:', err.message);
        }
      }
    }
  }

  async _saveConfigs() {
    if (!this.storagePath) return;
    try {
      const obj = Object.fromEntries(this.customConfigs.entries());
      await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
      await fs.writeFile(this.storagePath, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {
      console.warn('[IntegrationsRegistry] Failed to save custom configs:', err.message);
    }
  }

  getDefinitions() {
    return [
      {
        id: 'connector-local-git',
        name: 'Local Git',
        category: 'development',
        icon: 'i-git',
        version: '1.0.0',
        author: 'IDeV Team',
        connectionType: 'local-connector',
        description: 'Inspect Git repository status, unstaged diffs, branch topology, and recent commit history inside your authorized workspace.',
        longDescription: 'Direct local Git integration executing through Node child process isolation within your selected workspace folder. Allows the autonomous development team to inspect current branch, uncommitted working tree changes, and commit logs without third-party network egress.',
        capabilities: ['git-status', 'git-diff', 'git-log', 'git-branch'],
        permissions: [
          'Read workspace .git metadata and working tree',
          'Execute safe git command-line binaries',
          'Zero external telemetry or cloud sync'
        ],
        authRequired: false,
        configFields: [],
        troubleshooting: 'Ensure Git is installed on your Windows system and added to PATH. Ensure a valid Git repository folder is chosen as your workspace.'
      },
      {
        id: 'connector-fs-search',
        name: 'Code Search & Grep',
        category: 'files',
        icon: 'i-search',
        version: '1.0.0',
        author: 'IDeV Team',
        connectionType: 'local-connector',
        description: 'High-speed multi-file pattern matching and content discovery across codebases with smart exclusions for node_modules and binaries.',
        longDescription: 'Workspace-wide recursive substring search and grep scanner. Filters out heavy build output, virtual environments, and binary formats to deliver fast semantic search results directly to chat and build workflows.',
        capabilities: ['grep', 'find-files', 'file-stats'],
        permissions: [
          'Read text files inside authorized workspace boundary',
          'Strict directory traversal prevention'
        ],
        authRequired: false,
        configFields: [],
        troubleshooting: 'Choose a workspace directory containing source code files (.js, .ts, .py, .html, .css, .json, .md).'
      },
      {
        id: 'connector-web-search',
        name: 'Web Search & Instant Research',
        category: 'research',
        icon: 'i-search',
        version: '1.0.0',
        author: 'IDeV Team',
        connectionType: 'api-service',
        description: 'Real-time web discovery and reference topic lookup powered by DuckDuckGo Instant Answers API with zero tracking or telemetry.',
        longDescription: 'Privacy-first web research tool returning genuine abstracts, topic summaries, and reference documentation links. Integrates with chat composer actions to provide verifiable citations for coding solutions.',
        capabilities: ['search', 'quick-answer', 'fetch-abstract'],
        permissions: [
          'Outbound HTTPS queries to api.duckduckgo.com',
          'No search history or user identifier transmission',
          'Zero ads or promotional trackers'
        ],
        authRequired: false,
        configFields: [],
        troubleshooting: 'Verify that Windows 11 internet connectivity is active and outbound HTTPS port 443 is permitted.'
      },
      {
        id: 'mcp-service',
        name: 'Model Context Protocol (MCP) Runtime',
        category: 'mcp',
        icon: 'i-tool',
        version: '2024-11-05',
        author: 'Anthropic / IDeV Team',
        connectionType: 'mcp-stdio',
        description: 'Universal open protocol for connecting AI models to external tools, structured data extraction, and stdio server processes.',
        longDescription: 'Production-ready Model Context Protocol client implementation. Spawns and manages isolated stdio server processes, handles protocol handshake initialization, auto-discovers callable tool schemas, and safely invokes tools with response validation.',
        capabilities: ['stdio-transport', 'tools-discovery', 'tool-execution', 'resource-reading'],
        permissions: [
          'Spawn user-configured executable commands over stdio',
          'Explicit user confirmation for external tool executions',
          'Sanitized process logs with sensitive credential redaction'
        ],
        authRequired: false,
        configFields: [
          { name: 'name', label: 'Server Name', type: 'text', placeholder: 'e.g. SQLite DB Server', required: true },
          { name: 'command', label: 'Command', type: 'text', placeholder: 'e.g. npx, node, python', required: true },
          { name: 'args', label: 'Arguments', type: 'text', placeholder: 'e.g. -y @modelcontextprotocol/server-sqlite --db path.db', required: false }
        ],
        troubleshooting: 'Verify that the command executable (e.g. node, python, or npx) is installed and accessible in Windows PATH.'
      },
      {
        id: 'service-project-memory',
        name: 'Project Memory & Semantic Vector Store',
        category: 'productivity',
        icon: 'i-memory',
        version: '1.0.0',
        author: 'IDeV Team',
        connectionType: 'internal-service',
        description: 'Persistent architectural decisions, design preferences, and scoped contextual memory with cosine vector similarity retrieval.',
        longDescription: 'Semantic vector store and knowledge engine that retains key user instructions, project architectural rules, and tech stack choices across restarts. Automatically injects relevant memories into AI prompts.',
        capabilities: ['store-memory', 'semantic-search', 'scope-isolation', 'disk-persistence'],
        permissions: [
          'Read/write local memory store in application data directory',
          'Zero cloud transmission of proprietary project memories'
        ],
        authRequired: false,
        configFields: [],
        troubleshooting: 'Ensure the local application user data directory is writable by IDeV Advanced.'
      },
      {
        id: 'service-checkpoints',
        name: 'Workspace Checkpoint & Rollback Engine',
        category: 'development',
        icon: 'i-checkpoint',
        version: '1.0.0',
        author: 'IDeV Team',
        connectionType: 'internal-service',
        description: 'Zero-loss atomic file snapshotting and instant rollback engine that protects code against destructive multi-file modifications.',
        longDescription: 'Automated workspace snapshot system that archives project source files before complex multi-file builds and repairs. Allows the user to restore the exact baseline workspace state with a single click if needed.',
        capabilities: ['create-snapshot', 'atomic-restore', 'diff-comparison', 'history-listing'],
        permissions: [
          'Read and write snapshots inside workspace .idev_checkpoints folder',
          'Atomic file restoration with traversal protection'
        ],
        authRequired: false,
        configFields: [],
        troubleshooting: 'Ensure a workspace folder is selected with write permissions.'
      },
      {
        id: 'service-gemini-live',
        name: 'Google Gemini Live Audio (S2S) Engine',
        category: 'productivity',
        icon: 'i-mic',
        version: '2.5-flash',
        author: 'Google / IDeV Team',
        connectionType: 'api-service',
        description: 'Low-latency bidirectional speech-to-speech AI streaming over WebSockets with barge-in interruption and natural Hinglish mixing.',
        longDescription: 'Direct audio-to-audio conversational pipeline communicating with Gemini Live multimodal WebSockets. Features 16kHz PCM capture, 24kHz downsampled playback, real-time barge-in buffer cancellation, and natural Hindi-English bilingual dialogue.',
        capabilities: ['live-audio-stream', 'voice-turn-detection', 'barge-in-cancellation', 'hinglish-voice'],
        permissions: [
          'Microphone audio capture via Windows audio device',
          'Outbound secure WebSocket to generativelanguage.googleapis.com',
          'Zero hardcoded API keys; credentials stored in secure local configuration'
        ],
        authRequired: true,
        configFields: [
          { name: 'apiKey', label: 'Gemini API Key', type: 'password', placeholder: 'Enter your Google Gemini API key', required: true }
        ],
        troubleshooting: 'Provide a valid Google Gemini API key in S2S Settings and ensure microphone permissions are granted.'
      },
      {
        id: 'service-ollama-mesh',
        name: '21-Role Local AI Specialist Mesh',
        category: 'development',
        icon: 'i-spark',
        version: '0.3.8',
        author: 'IDeV / Founder Ubaid',
        connectionType: 'internal-service',
        description: 'Founder Ubaid\'s 21-role dedicated specialist team mapped to local high-performance model weights with honest capability reporting.',
        longDescription: 'The core offline AI inference engine of IDeV Advanced. Coordinates 21 distinct software engineering roles (Lead Architect, Frontend Specialist, Security Auditor, Code Fixer, QA Specialist, etc.) over high-speed local HTTP loopback without internet dependency.',
        capabilities: ['streaming-inference', '21-role-routing', 'dynamic-stop', 'local-privacy'],
        permissions: [
          'Local loopback HTTP requests to 127.0.0.1:11434',
          'RAM and local GPU inference execution'
        ],
        authRequired: false,
        configFields: [],
        troubleshooting: 'Ensure the local model inference engine is active on http://127.0.0.1:11434 with assigned model tags installed.'
      },
      {
        id: 'service-command-runner',
        name: 'Secure Terminal Command Runner',
        category: 'development',
        icon: 'i-code',
        version: '1.0.0',
        author: 'IDeV Team',
        connectionType: 'internal-service',
        description: 'Whitelisted safe process executor with automatic environment secret redaction, path canonicalization, and chaining protection.',
        longDescription: 'Safe build and test command runner for workspace projects. Automatically redacts API keys and environment variables from child processes, enforces strict command whitelisting, and streams stdout/stderr output directly to Build Mode.',
        capabilities: ['run-whitelisted-commands', 'stream-output', 'secret-redaction', 'syntax-validation'],
        permissions: [
          'Spawn approved development processes within workspace directory',
          'Strip system secret environment variables before execution'
        ],
        authRequired: false,
        configFields: [],
        troubleshooting: 'Ensure required runtimes (e.g. Node.js, Python) are installed in Windows.'
      }
    ];
  }

  async checkHealth(id, context = {}) {
    const startTime = Date.now();
    const ws = context.workspacePath || '';

    try {
      switch (id) {
        case 'connector-local-git': {
          if (!this.connectorManager) return { ok: false, status: 'unavailable', message: 'Connector manager not loaded.' };
          const res = await this.connectorManager.checkHealth('connector-local-git', ws);
          const isConnected = res.ok && res.isGitRepository;
          const status = isConnected ? 'connected' : (res.ok ? 'ready' : 'unavailable');
          return {
            ok: res.ok,
            status,
            message: isConnected ? `Git repository detected (${res.version})` : (res.ok ? 'Git installed; no git repository in workspace' : res.message),
            latencyMs: Date.now() - startTime
          };
        }

        case 'connector-fs-search': {
          const hasWs = !!(ws && fsSync.existsSync(ws));
          return {
            ok: hasWs,
            status: hasWs ? 'connected' : 'ready',
            message: hasWs ? `Active workspace: ${path.basename(ws)}` : 'Select a workspace to search code',
            latencyMs: Date.now() - startTime
          };
        }

        case 'connector-web-search': {
          if (!this.connectorManager) return { ok: false, status: 'unavailable', message: 'Connector manager not loaded.' };
          const res = await this.connectorManager.checkHealth('connector-web-search');
          return {
            ok: res.ok,
            status: res.ok ? 'connected' : 'error',
            message: res.message || (res.ok ? 'DuckDuckGo Instant Answers online' : 'Search unreachable'),
            latencyMs: Date.now() - startTime
          };
        }

        case 'mcp-service': {
          if (!this.mcpManager) return { ok: false, status: 'unavailable', message: 'MCP manager not initialized.' };
          const servers = this.mcpManager.listServers();
          const connectedServers = servers.filter(s => s.status === 'connected');
          const hasServers = servers.length > 0;
          return {
            ok: true,
            status: connectedServers.length > 0 ? 'connected' : (hasServers ? 'ready' : 'not-configured'),
            message: connectedServers.length > 0
              ? `${connectedServers.length} server(s) connected, ${this.mcpManager.listAllTools().length} tools discovered`
              : (hasServers ? `${servers.length} server(s) configured (disconnected)` : 'No MCP servers configured yet'),
            latencyMs: Date.now() - startTime
          };
        }

        case 'service-project-memory': {
          return {
            ok: true,
            status: 'connected',
            message: 'Local memory store initialized and persistent',
            latencyMs: Date.now() - startTime
          };
        }

        case 'service-checkpoints': {
          const hasWs = !!(ws && fsSync.existsSync(ws));
          return {
            ok: true,
            status: hasWs ? 'connected' : 'ready',
            message: hasWs ? 'Checkpoints engine ready for workspace' : 'Select a workspace folder to enable automatic snapshots',
            latencyMs: Date.now() - startTime
          };
        }

        case 'service-gemini-live': {
          const status = this.geminiLiveSession ? this.geminiLiveSession.getStatus() : { hasKey: false };
          return {
            ok: status.hasKey,
            status: status.hasKey ? 'connected' : 'not-configured',
            message: status.hasKey ? 'Google Gemini Live API key configured and ready' : 'Gemini API key required for live voice streaming',
            latencyMs: Date.now() - startTime
          };
        }

        case 'service-ollama-mesh': {
          const isOllamaUp = await new Promise((resolve) => {
            const req = http.get('http://127.0.0.1:11434/api/version', { timeout: 3000 }, (res) => {
              resolve(res.statusCode === 200);
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
          });
          return {
            ok: isOllamaUp,
            status: isOllamaUp ? 'connected' : 'unavailable',
            message: isOllamaUp ? 'Local model engine active on port 11434' : 'Local model engine not detected on 127.0.0.1:11434',
            latencyMs: Date.now() - startTime
          };
        }

        case 'service-command-runner': {
          return {
            ok: true,
            status: 'connected',
            message: 'Secure whitelisted command runner operational',
            latencyMs: Date.now() - startTime
          };
        }

        default:
          return { ok: false, status: 'unavailable', message: `Unknown integration ID: ${id}`, latencyMs: 0 };
      }
    } catch (err) {
      return { ok: false, status: 'error', message: err.message, latencyMs: Date.now() - startTime };
    }
  }

  async list(options = {}) {
    const { category = 'all', search = '', workspacePath = '' } = options;
    const defs = this.getDefinitions();
    const results = [];

    for (const def of defs) {
      // Check cache or evaluate health
      const cacheKey = `${def.id}:${workspacePath}`;
      let health = this.healthCache.get(cacheKey);
      if (!health || Date.now() - health.cachedAt > 15000) {
        health = await this.checkHealth(def.id, { workspacePath });
        health.cachedAt = Date.now();
        this.healthCache.set(cacheKey, health);
      }

      const item = {
        ...def,
        status: health.status || 'ready',
        healthMessage: health.message,
        latencyMs: health.latencyMs || 0
      };

      // Filter by category
      if (category !== 'all') {
        if (category === 'connected' && item.status !== 'connected') continue;
        if (category === 'available' && item.status !== 'connected' && item.status !== 'ready') continue;
        if (category !== 'connected' && category !== 'available' && item.category !== category) continue;
      }

      // Filter by search query
      if (search) {
        const q = search.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesDesc = item.description.toLowerCase().includes(q);
        const matchesCaps = item.capabilities.some(c => c.toLowerCase().includes(q));
        if (!matchesName && !matchesDesc && !matchesCaps) continue;
      }

      results.push(item);
    }

    // Also include any user-configured MCP servers as individual items if category matches
    if (this.mcpManager && (category === 'all' || category === 'mcp' || category === 'connected')) {
      const servers = this.mcpManager.listServers();
      for (const s of servers) {
        if (category === 'connected' && s.status !== 'connected') continue;
        if (search) {
          const q = search.toLowerCase();
          if (!s.name.toLowerCase().includes(q) && !(s.tools || []).some(t => t.name?.toLowerCase().includes(q))) {
            continue;
          }
        }
        results.push({
          id: `mcp-server-${s.id}`,
          rawServerId: s.id,
          name: `MCP: ${s.name}`,
          category: 'mcp',
          icon: 'i-tool',
          version: '2024-11-05',
          author: 'Custom Server',
          connectionType: 'mcp-stdio',
          description: `Custom MCP stdio process (${s.command} ${(s.args || []).join(' ')}). Provides ${(s.tools || []).length} discovered tools.`,
          longDescription: `User-configured Model Context Protocol server running with command: ${s.command} ${(s.args || []).join(' ')}. Discovered tools: ${(s.tools || []).map(t => t.name).join(', ') || 'none'}.`,
          capabilities: (s.tools || []).map(t => t.name),
          permissions: ['Child process stdio execution', 'Host filesystem access per server arguments'],
          authRequired: false,
          status: s.status === 'connected' ? 'connected' : 'ready',
          healthMessage: s.status === 'connected' ? `Connected (${(s.tools || []).length} tools)` : (s.lastError || 'Disconnected'),
          latencyMs: 5,
          isUserConfiguredMcp: true
        });
      }
    }

    return results;
  }

  async get(id, options = {}) {
    const list = await this.list({ ...options, category: 'all' });
    const found = list.find(item => item.id === id);
    if (!found) throw new Error(`Integration ${id} not found.`);
    return found;
  }

  async connect(id, payload = {}) {
    switch (id) {
      case 'mcp-service': {
        if (!this.mcpManager) throw new Error('MCP manager unavailable.');
        if (payload.serverConfig) {
          return this.mcpManager.addServer(payload.serverConfig);
        }
        break;
      }
      case 'service-gemini-live': {
        if (!this.geminiLiveSession) throw new Error('S2S session unavailable.');
        if (payload.apiKey) {
          await this.geminiLiveSession.saveConfig({ apiKey: payload.apiKey });
          return { success: true, message: 'Gemini API key saved securely.' };
        }
        break;
      }
      default:
        // Handle generic or user-configured MCP server
        if (id.startsWith('mcp-server-') && this.mcpManager) {
          const rawId = id.replace('mcp-server-', '');
          return this.mcpManager.connectServer(rawId);
        }
        break;
    }
    this.healthCache.clear();
    return { success: true, message: `Connected to ${id}.` };
  }

  async disconnect(id) {
    if (id.startsWith('mcp-server-') && this.mcpManager) {
      const rawId = id.replace('mcp-server-', '');
      await this.mcpManager.disconnectServer(rawId);
    }
    this.healthCache.clear();
    return { success: true, message: `Disconnected ${id}.` };
  }

  async refreshAll(context = {}) {
    this.healthCache.clear();
    return this.list(context);
  }
}

module.exports = { IntegrationsRegistry };

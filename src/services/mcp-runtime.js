const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const EventEmitter = require('events');

class McpServerSession extends EventEmitter {
  constructor(config) {
    super();
    this.id = config.id || `mcp-${Date.now()}`;
    this.name = config.name || 'Unnamed MCP Server';
    this.transport = config.transport || 'stdio'; // 'stdio' or 'sse'
    this.command = config.command || '';
    this.args = Array.isArray(config.args) ? config.args : [];
    this.env = config.env || {};
    this.url = config.url || '';
    this.cwd = config.cwd || '';
    this.status = 'disconnected';
    this.process = null;
    this.tools = [];
    this.resources = [];
    this.prompts = [];
    this.requestId = 1;
    this.pendingRequests = new Map();
    this.buffer = '';
    this.lastError = null;
    this.callLog = [];
  }

  async connect() {
    if (this.status === 'connected' || this.status === 'connecting') return;
    this.status = 'connecting';
    this.lastError = null;
    this.emit('status', this.status);

    if (this.transport === 'stdio') {
      try {
        if (!this.command) throw new Error('No executable command configured for stdio MCP server.');
        
        const childEnv = { ...process.env, ...this.env };
        this.process = spawn(this.command, this.args, {
          cwd: this.cwd && fsSync.existsSync(this.cwd) ? this.cwd : process.cwd(),
          env: childEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true
        });

        this.process.stdout.on('data', (chunk) => this._handleData(chunk));
        this.process.stderr.on('data', (chunk) => {
          const err = chunk.toString();
          this.emit('log', { type: 'stderr', text: err });
        });

        this.process.on('error', (err) => {
          this.lastError = err.message;
          this.status = 'error';
          this.emit('status', this.status, err);
          this._rejectAllPending(err);
        });

        this.process.on('close', (code) => {
          this.status = 'disconnected';
          this.process = null;
          this.emit('status', this.status, `Process exited with code ${code}`);
          this._rejectAllPending(new Error(`MCP server process closed with code ${code}`));
        });

        // Initialize MCP session
        const initResult = await this._sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'IDeV-Advanced', version: '0.3.8' }
        }, 15000);

        this._sendNotification('notifications/initialized', {});
        this.status = 'connected';
        this.emit('status', this.status);

        // Discover tools and resources
        await this.refreshCapabilities();
      } catch (err) {
        this.status = 'error';
        this.lastError = err.message;
        if (this.process) {
          try { this.process.kill(); } catch {}
          this.process = null;
        }
        this.emit('status', this.status, err);
        throw err;
      }
    } else {
      throw new Error(`Transport ${this.transport} is not supported directly in this environment.`);
    }
  }

  async disconnect() {
    if (this.process) {
      try { this.process.kill(); } catch {}
      this.process = null;
    }
    this.status = 'disconnected';
    this.tools = [];
    this.resources = [];
    this._rejectAllPending(new Error('Server disconnected'));
    this.emit('status', this.status);
  }

  async refreshCapabilities() {
    if (this.status !== 'connected') return;
    try {
      const toolRes = await this._sendRequest('tools/list', {}, 8000).catch(() => ({ tools: [] }));
      this.tools = Array.isArray(toolRes?.tools) ? toolRes.tools : [];
      
      const resRes = await this._sendRequest('resources/list', {}, 8000).catch(() => ({ resources: [] }));
      this.resources = Array.isArray(resRes?.resources) ? resRes.resources : [];

      this.emit('capabilities', { tools: this.tools, resources: this.resources });
    } catch (e) {
      this.emit('log', { type: 'warn', text: `Failed to refresh capabilities: ${e.message}` });
    }
  }

  async callTool(name, args = {}, timeoutMs = 30000) {
    if (this.status !== 'connected') throw new Error(`MCP Server ${this.name} is not connected.`);
    const callRecord = {
      timestamp: new Date().toISOString(),
      tool: name,
      args,
      status: 'running',
      result: null,
      error: null
    };
    this.callLog.unshift(callRecord);
    if (this.callLog.length > 50) this.callLog.pop();

    try {
      const response = await this._sendRequest('tools/call', { name, arguments: args }, timeoutMs);
      callRecord.status = 'completed';
      callRecord.result = response;
      return response;
    } catch (error) {
      callRecord.status = 'failed';
      callRecord.error = error.message || String(error);
      throw error;
    }
  }

  _sendNotification(method, params = {}) {
    if (!this.process || !this.process.stdin.writable) return;
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    this.process.stdin.write(msg, 'utf8');
  }

  _sendRequest(method, params = {}, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin.writable) {
        return reject(new Error('MCP server stdin is not writable.'));
      }
      const id = this.requestId++;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP request '${method}' timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer, method });
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      this.process.stdin.write(msg, 'utf8');
    });
  }

  _handleData(chunk) {
    this.buffer += chunk.toString('utf8');
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const message = JSON.parse(trimmed);
        this._handleMessage(message);
      } catch (err) {
        this.emit('log', { type: 'json-error', line: trimmed, error: err.message });
      }
    }
  }

  _handleMessage(message) {
    if (message.id !== undefined && this.pendingRequests.has(message.id)) {
      const { resolve, reject, timer } = this.pendingRequests.get(message.id);
      clearTimeout(timer);
      this.pendingRequests.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message || `MCP Error ${message.error.code}`));
      } else {
        resolve(message.result);
      }
    } else if (message.method) {
      this.emit('notification', message);
    }
  }

  _rejectAllPending(error) {
    for (const [id, req] of this.pendingRequests.entries()) {
      clearTimeout(req.timer);
      req.reject(error);
    }
    this.pendingRequests.clear();
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      transport: this.transport,
      command: this.command,
      args: this.args,
      cwd: this.cwd,
      status: this.status,
      lastError: this.lastError,
      tools: this.tools,
      resources: this.resources,
      callLog: this.callLog.slice(0, 10)
    };
  }
}

class McpManager {
  constructor(storagePath) {
    this.storagePath = storagePath;
    this.servers = new Map();
  }

  async initialize() {
    try {
      const data = await fs.readFile(this.storagePath, 'utf8');
      const list = JSON.parse(data);
      if (Array.isArray(list)) {
        for (const config of list) {
          const session = new McpServerSession(config);
          this.servers.set(session.id, session);
        }
      }
    } catch (e) {
      if (e.code === 'ENOENT') {
        // Initialize default empty or sample config
        await this._saveConfig();
      }
    }
  }

  async _saveConfig() {
    const list = Array.from(this.servers.values()).map(s => ({
      id: s.id,
      name: s.name,
      transport: s.transport,
      command: s.command,
      args: s.args,
      cwd: s.cwd,
      env: s.env
    }));
    await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
    await fs.writeFile(this.storagePath, JSON.stringify(list, null, 2), 'utf8');
  }

  listServers() {
    return Array.from(this.servers.values()).map(s => s.toJSON());
  }

  async addServer(config) {
    const id = config.id || `mcp-${Date.now()}`;
    const session = new McpServerSession({ ...config, id });
    this.servers.set(id, session);
    await this._saveConfig();
    return session.toJSON();
  }

  async removeServer(id) {
    const session = this.servers.get(id);
    if (!session) return false;
    await session.disconnect();
    this.servers.delete(id);
    await this._saveConfig();
    return true;
  }

  async connectServer(id) {
    const session = this.servers.get(id);
    if (!session) throw new Error(`MCP server ${id} not found.`);
    await session.connect();
    return session.toJSON();
  }

  async disconnectServer(id) {
    const session = this.servers.get(id);
    if (!session) throw new Error(`MCP server ${id} not found.`);
    await session.disconnect();
    return session.toJSON();
  }

  async callTool(serverId, toolName, args) {
    const session = this.servers.get(serverId);
    if (!session) throw new Error(`MCP server ${serverId} not found.`);
    return session.callTool(toolName, args);
  }

  listAllTools() {
    const all = [];
    for (const s of this.servers.values()) {
      for (const t of s.tools) {
        all.push({
          serverId: s.id,
          serverName: s.name,
          status: s.status,
          tool: t
        });
      }
    }
    return all;
  }

  async shutdownAll() {
    for (const session of this.servers.values()) {
      await session.disconnect().catch(() => {});
    }
  }
}

module.exports = { McpManager, McpServerSession };

const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const execFileAsync = promisify(execFile);

class LocalGitConnector {
  constructor() {
    this.id = 'connector-local-git';
    this.name = 'Local Git';
    this.type = 'vcs';
    this.version = '1.0.0';
    this.capabilities = ['status', 'diff', 'log', 'commit', 'branch'];
    this.status = 'ready';
  }

  async healthCheck(workspacePath) {
    if (!workspacePath || !fsSync.existsSync(workspacePath)) {
      return { ok: false, message: 'Workspace directory does not exist.' };
    }
    try {
      const { stdout } = await execFileAsync('git', ['--version'], { timeout: 5000, windowsHide: true });
      const isRepo = fsSync.existsSync(path.join(workspacePath, '.git'));
      return { ok: true, version: stdout.trim(), isGitRepository: isRepo };
    } catch (e) {
      return { ok: false, message: 'Git command-line utility is not available on this system.' };
    }
  }

  async execute(action, params = {}, workspacePath) {
    if (!workspacePath) throw new Error('A valid workspace path is required for Local Git operations.');
    switch (action) {
      case 'status': {
        const { stdout, stderr } = await execFileAsync('git', ['status', '--short'], { cwd: workspacePath, timeout: 10000, windowsHide: true });
        return { status: stdout.trim(), stderr: stderr.trim() };
      }
      case 'diff': {
        const file = params.file ? [params.file] : [];
        const { stdout } = await execFileAsync('git', ['diff', ...file], { cwd: workspacePath, timeout: 15000, windowsHide: true });
        return { diff: stdout };
      }
      case 'log': {
        const max = String(params.max || 10);
        const { stdout } = await execFileAsync('git', ['log', `-${max}`, '--oneline'], { cwd: workspacePath, timeout: 10000, windowsHide: true });
        return { commits: stdout.trim().split('\n').filter(Boolean) };
      }
      case 'branch': {
        const { stdout } = await execFileAsync('git', ['branch', '--show-current'], { cwd: workspacePath, timeout: 5000, windowsHide: true });
        return { currentBranch: stdout.trim() };
      }
      default:
        throw new Error(`Unsupported Local Git action: ${action}`);
    }
  }
}

class FileSystemSearchConnector {
  constructor() {
    this.id = 'connector-fs-search';
    this.name = 'Code Search & Grep';
    this.type = 'filesystem';
    this.version = '1.0.0';
    this.capabilities = ['grep', 'find-files', 'file-stats'];
    this.status = 'ready';
  }

  async healthCheck(workspacePath) {
    return { ok: !!(workspacePath && fsSync.existsSync(workspacePath)) };
  }

  async execute(action, params = {}, workspacePath) {
    if (!workspacePath) throw new Error('Workspace path is required.');
    if (action === 'grep') {
      const query = String(params.query || '').trim();
      if (!query) throw new Error('Search query is required.');
      const results = [];
      const ignored = new Set(['node_modules', '.git', '.venv', 'dist', 'build', '.next']);
      
      async function walk(dir, rel = '') {
        if (results.length >= 50) return;
        let entries;
        try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
          if (results.length >= 50) break;
          if (entry.isDirectory()) {
            if (!ignored.has(entry.name)) await walk(path.join(dir, entry.name), path.posix.join(rel, entry.name));
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (['.js','.ts','.jsx','.tsx','.html','.css','.py','.json','.md','.txt'].includes(ext)) {
              try {
                const full = path.join(dir, entry.name);
                const content = await fs.readFile(full, 'utf8');
                const lines = content.split('\n');
                lines.forEach((line, idx) => {
                  if (line.toLowerCase().includes(query.toLowerCase()) && results.length < 50) {
                    results.push({
                      file: path.posix.join(rel, entry.name),
                      line: idx + 1,
                      text: line.trim().slice(0, 200)
                    });
                  }
                });
              } catch {}
            }
          }
        }
      }
      await walk(workspacePath);
      return { matches: results, total: results.length };
    }
    throw new Error(`Unsupported action ${action}`);
  }
}

const https = require('https');

class WebSearchConnector {
  constructor() {
    this.id = 'connector-web-search';
    this.name = 'Web Search & Instant Research';
    this.type = 'research';
    this.version = '1.0.0';
    this.capabilities = ['search', 'quick-answer', 'fetch-abstract'];
    this.status = 'ready';
  }

  async healthCheck() {
    return new Promise((resolve) => {
      const req = https.get('https://api.duckduckgo.com/?q=duckduckgo&format=json', {
        headers: { 'User-Agent': 'IDeV-Advanced/0.3.8' }
      }, (res) => {
        resolve({ ok: res.statusCode === 200, status: res.statusCode === 200 ? 'ready' : 'error', message: `DuckDuckGo HTTP status ${res.statusCode}` });
      });
      req.on('error', (err) => resolve({ ok: false, status: 'error', message: `Network error: ${err.message}` }));
      req.setTimeout(5000, () => {
        req.destroy();
        resolve({ ok: false, status: 'unavailable', message: 'Connection timed out' });
      });
    });
  }

  async execute(action, params = {}) {
    if (action === 'search' || action === 'quick-answer') {
      const query = String(params.query || '').trim();
      if (!query) throw new Error('Search query is required.');
      return new Promise((resolve, reject) => {
        const encoded = encodeURIComponent(query);
        const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`;
        const req = https.get(url, { headers: { 'User-Agent': 'IDeV-Advanced/0.3.8' } }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              const data = JSON.parse(body);
              const results = [];
              if (data.Heading && (data.AbstractText || data.Abstract)) {
                results.push({
                  title: data.Heading,
                  snippet: data.AbstractText || data.Abstract,
                  url: data.AbstractURL || data.HeadingURL || ''
                });
              }
              if (Array.isArray(data.RelatedTopics)) {
                for (const item of data.RelatedTopics) {
                  if (item.Text && item.FirstURL) {
                    results.push({
                      title: item.Text.split(' - ')[0] || item.Text.slice(0, 60),
                      snippet: item.Text,
                      url: item.FirstURL
                    });
                  } else if (Array.isArray(item.Topics)) {
                    for (const sub of item.Topics) {
                      if (sub.Text && sub.FirstURL) {
                        results.push({
                          title: sub.Text.split(' - ')[0] || sub.Text.slice(0, 60),
                          snippet: sub.Text,
                          url: sub.FirstURL
                        });
                      }
                    }
                  }
                }
              }
              resolve({
                query,
                results: results.slice(0, 8),
                total: results.length,
                source: 'DuckDuckGo Instant Answers'
              });
            } catch (err) {
              reject(new Error(`Failed to parse web search response: ${err.message}`));
            }
          });
        });
        req.on('error', (err) => reject(new Error(`Web search network error: ${err.message}`)));
        req.setTimeout(8000, () => {
          req.destroy();
          reject(new Error('Web search request timed out after 8s'));
        });
      });
    }
    throw new Error(`Unsupported WebSearch action: ${action}`);
  }
}

class ConnectorManager {
  constructor() {
    this.connectors = new Map();
    this.register(new LocalGitConnector());
    this.register(new FileSystemSearchConnector());
    this.register(new WebSearchConnector());
  }

  register(connector) {
    this.connectors.set(connector.id, connector);
  }

  listConnectors() {
    return Array.from(this.connectors.values()).map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      version: c.version,
      capabilities: c.capabilities,
      status: c.status
    }));
  }

  async executeConnector(connectorId, action, params, workspacePath) {
    const connector = this.connectors.get(connectorId);
    if (!connector) throw new Error(`Connector ${connectorId} not found.`);
    return connector.execute(action, params, workspacePath);
  }

  async checkHealth(connectorId, workspacePath) {
    const connector = this.connectors.get(connectorId);
    if (!connector) throw new Error(`Connector ${connectorId} not found.`);
    return connector.healthCheck(workspacePath);
  }
}

module.exports = { ConnectorManager, LocalGitConnector, FileSystemSearchConnector, WebSearchConnector };

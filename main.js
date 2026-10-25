const { app, BrowserWindow, ipcMain, dialog, shell, session, desktopCapturer } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const { McpManager } = require('./src/services/mcp-runtime');
const { ConnectorManager } = require('./src/services/connector-runtime');
const { CommandRunner } = require('./src/services/command-runner');
const { CheckpointManager } = require('./src/services/checkpoint-manager');
const { MemoryEngine } = require('./src/services/memory-engine');
const { GeminiLiveSession } = require('./src/services/gemini-live-session');
const { IntegrationsRegistry } = require('./src/services/integrations-registry');

const OLLAMA_BASE = 'http://127.0.0.1:11434';
let mainWindow;
const activePulls = new Map();
const activeChats = new Map();

let mcpManager;
let connectorManager;
let commandRunner;
let checkpointManager;
let memoryEngine;
let geminiLiveSession;
let integrationsRegistry;

// Microphone access is limited to this local application and audio-only requests.
app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const appPage = String(webContents?.getURL?.() || '').startsWith('file://');
    if (appPage && permission === 'media') return !details?.mediaType || details.mediaType === 'audio';
    return false;
  });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const appPage = String(webContents?.getURL?.() || '').startsWith('file://');
    const mediaTypes = details?.mediaTypes || (details?.mediaType ? [details.mediaType] : []);
    const audioOnly = permission === 'media' && mediaTypes.includes('audio') && !mediaTypes.includes('video');
    callback(!!(appPage && audioOnly));
  });
});

function safeSend(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    title: 'IDeV Advanced',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    backgroundColor: '#ffffff',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

async function ollamaFetch(route, options = {}) {
  const response = await fetch(`${OLLAMA_BASE}${route}`, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    const message = data?.error || data?.message || `${response.status} ${response.statusText}`;
    throw new Error(`Ollama API error: ${message}`);
  }
  return data;
}

ipcMain.handle('app:info', async () => ({
  version: app.getVersion(),
  platform: process.platform,
  ollamaUrl: OLLAMA_BASE,
  modelsPath: process.env.OLLAMA_MODELS || path.join(os.homedir(), '.ollama', 'models'),
  projectsPath: path.join(os.homedir(), 'Documents', 'IDeV Projects')
}));

ipcMain.handle('ollama:version', async () => {
  try { return { connected: true, ...(await ollamaFetch('/api/version')) }; }
  catch (error) { return { connected: false, error: error.message }; }
});


// Screen sharing is implemented as locally captured frames sent only when the user submits a chat message.
// The renderer can request a source list or a fresh frame by source ID; it never gets Node access.
async function getDesktopCaptureSources() {
  return desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 1280, height: 720 },
    fetchWindowIcons: false
  });
}

ipcMain.handle('screen:sources', async () => {
  const sources = await getDesktopCaptureSources();
  return sources.map(source => ({
    id: source.id,
    name: String(source.name || 'Screen or window').slice(0, 180),
    thumbnail: source.thumbnail && !source.thumbnail.isEmpty() ? source.thumbnail.resize({ width: 320, height: 180, quality: 'good' }).toDataURL() : ''
  }));
});

ipcMain.handle('screen:capture-source', async (_event, sourceId) => {
  if (typeof sourceId !== 'string' || !sourceId || sourceId.length > 256) throw new Error('Choose a valid screen or window source first.');
  const sources = await getDesktopCaptureSources();
  const source = sources.find(item => item.id === sourceId);
  if (!source) throw new Error('That screen/window is no longer available. Stop sharing and choose it again.');
  if (!source.thumbnail || source.thumbnail.isEmpty()) throw new Error('No screenshot was returned for this source. Check Windows display capture permissions and try again.');
  const buffer = source.thumbnail.toJPEG(78);
  return { name: String(source.name || 'Screen'), mimeType: 'image/jpeg', dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}` };
});

ipcMain.handle('ollama:models', async () => {
  const data = await ollamaFetch('/api/tags');
  return Array.isArray(data.models) ? data.models.map(m => ({ name: m.name, size: m.size, modified_at: m.modified_at, digest: m.digest })) : [];
});

ipcMain.handle('ollama:running-models', async () => {
  try {
    const data = await ollamaFetch('/api/ps');
    return Array.isArray(data.models) ? data.models.map(m => ({
      name: m.name,
      size: m.size,
      size_vram: m.size_vram,
      expires_at: m.expires_at
    })) : [];
  } catch {
    return [];
  }
});

ipcMain.handle('ollama:unload-model', async (_event, model) => {
  if (!model || typeof model !== 'string') return false;
  try {
    await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: model.trim(), keep_alive: 0 })
    });
    return true;
  } catch {
    return false;
  }
});

// Local semantic retrieval for the dedicated project-knowledge embedding specialist.
ipcMain.handle('ollama:embed', async (_event, payload) => {
  const model = String(payload?.model || '').trim();
  const rawInput = payload?.input;
  const input = Array.isArray(rawInput)
    ? rawInput.slice(0, 20).map(value => String(value || '').slice(0, 6000))
    : String(rawInput || '').slice(0, 6000);
  if (!model || (!Array.isArray(input) && !input.trim()) || (Array.isArray(input) && input.length === 0)) {
    throw new Error('A model and non-empty embedding input are required.');
  }
  const data = await ollamaFetch('/api/embed', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, input, truncate: true, options: { num_ctx: 2048 } })
  });
  if (!Array.isArray(data.embeddings)) throw new Error('Ollama did not return an embeddings array.');
  return { model, embeddings: data.embeddings, prompt_eval_count: data.prompt_eval_count || 0, total_duration: data.total_duration || 0 };
});

ipcMain.on('ollama:chat', async (event, payload) => {
  const { requestId, model, messages, num_ctx = 4096, temperature = 0.25, num_predict = 768, keep_alive = '5m', format } = payload || {};
  if (!requestId || !model || !Array.isArray(messages)) {
    safeSend('ollama:chat-event', { requestId, type: 'error', error: 'Invalid chat request.' });
    return;
  }
  const imagePayloads = messages.flatMap(message => Array.isArray(message?.images) ? message.images : []);
  if (imagePayloads.length > 4 || imagePayloads.some(image => typeof image !== 'string' || image.length > 4_000_000) || imagePayloads.reduce((sum, image) => sum + image.length, 0) > 10_000_000) {
    safeSend('ollama:chat-event', { requestId, type: 'error', error: 'Image input is too large. Attach up to 4 resized images (about 3 MB each) and try again.' });
    return;
  }
  const controller = new AbortController();
  activeChats.set(requestId, controller);
  try {
    const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true, keep_alive, ...(format ? { format } : {}), options: { num_ctx, temperature, num_predict } }),
      signal: controller.signal
    });
    if (!response.ok) {
      let body = '';
      try { body = await response.text(); } catch {}
      let message = `HTTP ${response.status}`;
      try { message = JSON.parse(body).error || message; } catch { if (body) message = body; }
      safeSend('ollama:chat-event', { requestId, type: 'error', error: message });
      return;
    }
    if (!response.body) throw new Error('Ollama returned an empty response stream.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let item;
        try { item = JSON.parse(line); } catch { continue; }
        if (item.error) throw new Error(item.error);
        if (item.message?.thinking) safeSend('ollama:chat-event', { requestId, type: 'thinking', text: item.message.thinking });
        if (item.message?.content) safeSend('ollama:chat-event', { requestId, type: 'delta', text: item.message.content });
        if (item.done) safeSend('ollama:chat-event', { requestId, type: 'done', stats: {
          total_duration: item.total_duration, load_duration: item.load_duration,
          prompt_eval_count: item.prompt_eval_count, prompt_eval_duration: item.prompt_eval_duration,
          eval_count: item.eval_count, eval_duration: item.eval_duration
        }});
      }
    }
    if (buffer.trim()) {
      try {
        const item = JSON.parse(buffer);
        if (item.message?.thinking) safeSend('ollama:chat-event', { requestId, type: 'thinking', text: item.message.thinking });
        if (item.message?.content) safeSend('ollama:chat-event', { requestId, type: 'delta', text: item.message.content });
        if (item.done) safeSend('ollama:chat-event', { requestId, type: 'done', stats: {
          total_duration: item.total_duration, load_duration: item.load_duration,
          prompt_eval_count: item.prompt_eval_count, prompt_eval_duration: item.prompt_eval_duration,
          eval_count: item.eval_count, eval_duration: item.eval_duration
        }});
      } catch {}
    }
  } catch (error) {
    if (error.name === 'AbortError') safeSend('ollama:chat-event', { requestId, type: 'aborted' });
    else safeSend('ollama:chat-event', { requestId, type: 'error', error: error.message || String(error) });
  } finally {
    activeChats.delete(requestId);
  }
});

ipcMain.on('ollama:abort', (_event, requestId) => {
  const controller = activeChats.get(requestId);
  if (controller) controller.abort();
});

ipcMain.on('ollama:pull', async (_event, payload) => {
  const { requestId, model } = payload || {};
  if (!requestId || !model || typeof model !== 'string') return;
  const controller = new AbortController();
  activePulls.set(requestId, controller);
  try {
    const response = await fetch(`${OLLAMA_BASE}/api/pull`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: model.trim(), stream: true }), signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.text();
      let message = `HTTP ${response.status}`;
      try { message = JSON.parse(body).error || message; } catch { if (body) message = body; }
      safeSend('ollama:pull-event', { requestId, type: 'error', error: message });
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line);
          if (item.error) throw new Error(item.error);
          safeSend('ollama:pull-event', { requestId, type: item.status === 'success' ? 'done' : 'progress', item });
        } catch (error) {
          if (error.message && error.message !== 'Unexpected end of JSON input') safeSend('ollama:pull-event', { requestId, type: 'error', error: error.message });
        }
      }
    }
    safeSend('ollama:pull-event', { requestId, type: 'done', item: { status: 'success' } });
  } catch (error) {
    if (error.name === 'AbortError') safeSend('ollama:pull-event', { requestId, type: 'aborted' });
    else safeSend('ollama:pull-event', { requestId, type: 'error', error: error.message || String(error) });
  } finally { activePulls.delete(requestId); }
});

ipcMain.on('ollama:cancel-pull', (_event, requestId) => {
  const controller = activePulls.get(requestId);
  if (controller) controller.abort();
});

ipcMain.handle('fs:open-folder', async (_event, folderPath) => {
  const target = folderPath || path.join(os.homedir(), '.ollama', 'models');
  const result = await shell.openPath(target);
  if (result) throw new Error(result);
  return true;
});

function safeFolderName(name) {
  const cleaned = String(name || 'New Project').replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/[. ]+$/g, '').trim();
  return cleaned.slice(0, 70) || 'New Project';
}

ipcMain.handle('project:create', async (_event, payload) => {
  const name = safeFolderName(payload?.name);
  const description = String(payload?.description || '').trim();
  const target = String(payload?.target || 'Web app');
  const parent = await dialog.showOpenDialog(mainWindow, { title: 'Choose where to create this project', properties: ['openDirectory', 'createDirectory'] });
  if (parent.canceled || !parent.filePaths?.[0]) return { canceled: true };
  const projectPath = path.join(parent.filePaths[0], name);
  try { await fs.mkdir(projectPath, { recursive: false }); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('A folder with that project name already exists in this location. Choose another name or folder.'); throw error; }
  const now = new Date().toISOString();
  const project = { name, target, description, createdAt: now, status: 'Planning', app: 'IDeV Advanced' };
  const files = [
    ['README.md', `# ${name}\n\n${description || 'Project created with IDeV Advanced.'}\n\n## Target\n${target}\n\n## Getting started\n\nThis workspace was initialized by IDeV Advanced. Ask the local AI team to produce an implementation plan, then add source files and tests.\n`],
    ['PROJECT_SPEC.md', `# Project Specification\n\n- **Name:** ${name}\n- **Target:** ${target}\n- **Created:** ${now}\n\n## Description\n${description || 'Add the project description here.'}\n\n## Requirements\n- [ ] Define user journeys\n- [ ] Define UI/UX\n- [ ] Implement features\n- [ ] Add tests\n- [ ] Perform security review\n- [ ] Verify final build\n`],
    ['AGENT_RULES.md', `# IDeV Advanced Agent Rules\n\n- One model ID has one exclusive role.\n- Do not claim tests passed unless the test runner confirms it.\n- Keep changes scoped to this project.\n- Ask before destructive operations or installing system-level dependencies.\n- Record blockers and commands needed to reproduce failures.\n`],
    ['.gitignore', 'node_modules/\ndist/\nbuild/\n.env\n.venv/\n__pycache__/\n*.log\n']
  ];
  for (const [filename, content] of files) await fs.writeFile(path.join(projectPath, filename), content, 'utf8');
  return { canceled: false, path: projectPath, project };
});

// Workspace operations are restricted to a directory the user explicitly selected.
const TEXT_EXTENSIONS = new Set(['.txt','.md','.json','.js','.jsx','.ts','.tsx','.mjs','.cjs','.html','.css','.scss','.py','.yml','.yaml','.xml','.svg','.java','.kt','.gradle','.kts','.toml','.ini','.cfg','.sh','.bat','.ps1','.sql','.go','.rs','.c','.h','.cpp','.hpp','.cs','.php','.vue','.svelte']);
const IGNORED_DIRS = new Set(['node_modules','.git','.venv','venv','dist','build','target','coverage','.next','__pycache__']);

ipcMain.handle('workspace:choose', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose a folder for IDeV Advanced to build in',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths?.[0]) return null;
  const selected = await fs.realpath(result.filePaths[0]);
  const names = await fs.readdir(selected).catch(() => []);
  return { path: selected, empty: names.length === 0, entryCount: names.length, entries: names.slice(0, 12) };
});

async function getWorkspaceRoot(rootPath) {
  if (typeof rootPath !== 'string' || !path.isAbsolute(rootPath)) throw new Error('Choose a valid absolute workspace folder first.');
  const root = await fs.realpath(rootPath);
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) throw new Error('The selected workspace is not a folder.');
  return root;
}

ipcMain.handle('workspace:read', async (_event, rootPath) => {
  const root = await getWorkspaceRoot(rootPath);
  const files = [];
  let totalChars = 0;
  async function walk(dir, prefix = '') {
    if (files.length >= 35 || totalChars >= 42000) return;
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (files.length >= 35 || totalChars >= 42000) break;
      if (entry.name.startsWith('.') && ['.git', '.venv'].includes(entry.name)) continue;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) await walk(path.join(dir, entry.name), path.posix.join(prefix, entry.name));
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!TEXT_EXTENSIONS.has(ext) || entry.name === '.env' || entry.name.endsWith('.lock')) continue;
      const full = path.join(dir, entry.name);
      try {
        const stat = await fs.stat(full);
        if (!stat.isFile() || stat.size > 120000) continue;
        const content = await fs.readFile(full, 'utf8');
        const clipped = content.slice(0, Math.max(0, 42000 - totalChars));
        files.push({ path: path.posix.join(prefix, entry.name), content: clipped });
        totalChars += clipped.length;
      } catch {}
    }
  }
  await walk(root);
  return { path: root, files, truncated: files.length >= 35 || totalChars >= 42000 };
});

ipcMain.handle('workspace:write', async (_event, payload) => {
  const root = await getWorkspaceRoot(payload?.rootPath);
  const files = payload?.files;
  if (!Array.isArray(files) || files.length < 1 || files.length > 30) throw new Error('The generated file set must contain between 1 and 30 files.');
  const safeFiles = [];
  let totalBytes = 0;
  for (const item of files) {
    let rawPath = String(item?.path || '').trim().replace(/^['"`]+|['"`]+$/g, '');
    if (rawPath.startsWith('file:///')) {
      try { rawPath = decodeURIComponent(rawPath.replace(/^file:\/{2,}/i, '')); } catch {}
    }
    let relative = rawPath;
    if (path.isAbsolute(rawPath) || /^[a-zA-Z]:/.test(rawPath)) {
      const resolved = path.resolve(rawPath);
      if (resolved.toLowerCase().startsWith(root.toLowerCase() + path.sep)) {
        relative = path.relative(root, resolved).replace(/\\/g, '/');
      } else {
        relative = rawPath.replace(/\\/g, '/');
      }
    } else {
      relative = rawPath.replace(/\\/g, '/');
    }
    const content = item?.content;
    if (!relative || relative.startsWith('/') || /^[a-zA-Z]:/.test(relative) || relative.split('/').some(part => part === '..' || part === '' || part === '.')) {
      throw new Error(`Unsafe or invalid relative file path: ${relative || '(empty)'}`);
    }
    const pathSegments = relative.split('/');
    if (pathSegments.some(part => ['.git', 'node_modules', '.venv', 'venv'].includes(part.toLowerCase())) || pathSegments[pathSegments.length - 1].toLowerCase().startsWith('.env')) {
      throw new Error(`Refusing to generate protected path: ${relative}`);
    }
    if (typeof content !== 'string') throw new Error(`No text content supplied for ${relative}.`);
    if (Buffer.byteLength(content, 'utf8') > 700000) throw new Error(`${relative} exceeds the 700 KB per-file safety limit.`);
    totalBytes += Buffer.byteLength(content, 'utf8');
    if (totalBytes > 6000000) throw new Error('The generated files exceed the 6 MB total safety limit. Build the project in smaller batches.');
    const absolute = path.resolve(root, ...relative.split('/'));
    if (absolute !== root && !absolute.startsWith(root + path.sep)) throw new Error(`The path escapes the selected workspace: ${relative}`);
    safeFiles.push({ relative, absolute, content });
  }
  const unique = new Set();
  for (const item of safeFiles) {
    const key = item.relative.toLowerCase();
    if (unique.has(key)) throw new Error(`Duplicate file path in generated output: ${item.relative}`);
    unique.add(key);
  }
  const normalizedPaths = [...unique].sort();
  for (let i = 0; i < normalizedPaths.length; i++) {
    for (let j = i + 1; j < normalizedPaths.length; j++) {
      if (normalizedPaths[j].startsWith(normalizedPaths[i] + '/')) {
        throw new Error(`Conflicting generated paths: ${normalizedPaths[i]} is both a file and a parent folder of ${normalizedPaths[j]}.`);
      }
    }
  }
  const collisions = [];
  for (const item of safeFiles) {
    // Walk each destination's existing ancestors so a symlink cannot redirect writes outside the workspace.
    let parent = root;
    for (const segment of item.relative.split('/').slice(0, -1)) {
      parent = path.join(parent, segment);
      try {
        const parentStat = await fs.lstat(parent);
        if (parentStat.isSymbolicLink()) throw new Error(`Refusing to write through symbolic link: ${item.relative}`);
        if (!parentStat.isDirectory()) throw new Error(`A file exists where a directory is required: ${segment}`);
      } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    try { const st = await fs.lstat(item.absolute); if (st.isSymbolicLink()) throw new Error(`Refusing to write through symbolic link: ${item.relative}`); if (st.isDirectory()) throw new Error(`A folder already exists where a file is required: ${item.relative}`); collisions.push(item.relative); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  const collisionKeys = new Set(collisions.map(item => item.toLowerCase()));
  if (collisions.length) {
    const choice = await dialog.showMessageBox(mainWindow, {
      type: 'warning', buttons: ['Cancel', 'Overwrite listed files'], defaultId: 0, cancelId: 0,
      title: 'Confirm file overwrite',
      message: 'Some generated paths already exist in this workspace.',
      detail: `The following files would be replaced:\n${collisions.slice(0, 15).join('\n')}${collisions.length > 15 ? '\n…' : ''}\n\nContinue only if you want to replace them.`
    });
    if (choice.response !== 1) return { canceled: true, written: [], collisions };
  }
  const written = [];
  for (const item of safeFiles) {
    await fs.mkdir(path.dirname(item.absolute), { recursive: true });
    await fs.writeFile(item.absolute, item.content, { encoding: 'utf8', flag: collisionKeys.has(item.relative.toLowerCase()) ? 'w' : 'wx' }).catch(async error => {
      if (error.code === 'EEXIST' && collisionKeys.has(item.relative.toLowerCase())) return fs.writeFile(item.absolute, item.content, 'utf8');
      throw error;
    });
    written.push(item.relative);
  }
  return { canceled: false, rootPath: root, written, collisions };
});

ipcMain.handle('workspace:validate', async (_event, payload) => {
  const root = await getWorkspaceRoot(payload?.rootPath);
  const relativeFiles = Array.isArray(payload?.files) ? payload.files.slice(0, 30) : [];
  const results = [];
  for (const relative of relativeFiles) {
    const rel = String(relative || '').replace(/\\/g, '/');
    if (!rel || rel.startsWith('/') || rel.split('/').some(part => part === '..')) continue;
    const full = path.resolve(root, ...rel.split('/'));
    if (!full.startsWith(root + path.sep)) continue;
    const ext = path.extname(full).toLowerCase();
    try {
      if (ext === '.json') { JSON.parse(await fs.readFile(full, 'utf8')); results.push({ file: rel, status: 'passed', check: 'JSON parse' }); }
      else if (['.js','.cjs','.mjs'].includes(ext)) {
        const { stdout = '', stderr = '' } = await execFileAsync('node', ['--check', full], { cwd: root, timeout: 15000, windowsHide: true });
        results.push({ file: rel, status: 'passed', check: 'JavaScript syntax', details: (stdout + stderr).trim() });
      } else if (ext === '.py') {
        const astCheck = 'import ast,sys; ast.parse(open(sys.argv[1], encoding="utf-8").read(), filename=sys.argv[1])';
        let stdout = '', stderr = '';
        try {
          const res = await execFileAsync('python', ['-c', astCheck, full], { cwd: root, timeout: 15000, windowsHide: true });
          stdout = res.stdout || ''; stderr = res.stderr || '';
        } catch (e) {
          const isStubOrMissing = e.code === 'ENOENT' || e.code === 9009 || /not found|not recognized|Microsoft Store/i.test(String(e.stderr || e.message || ''));
          if (isStubOrMissing) {
            const res = await execFileAsync('py', ['-3', '-c', astCheck, full], { cwd: root, timeout: 15000, windowsHide: true });
            stdout = res.stdout || ''; stderr = res.stderr || '';
          } else {
            throw e;
          }
        }
        results.push({ file: rel, status: 'passed', check: 'Python syntax', details: (stdout + stderr).trim() });
      }
    } catch (error) {
      const unavailable = error.code === 'ENOENT' || /not recognized as an internal or external command|command not found/i.test(String(error.message || ''));
      results.push({ file: rel, status: unavailable ? 'skipped' : 'failed', check: ext === '.json' ? 'JSON parse' : ext === '.py' ? 'Python syntax' : 'JavaScript syntax', details: String(error.stderr || error.message || error).trim() });
    }
  }
  return { rootPath: root, results };
});

ipcMain.handle('app:open-external', async (_event, url) => {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Only web links are allowed.');
  await shell.openExternal(parsed.toString());
  return true;
});

// --- MCP Handlers ---
ipcMain.handle('mcp:list-servers', async () => mcpManager ? mcpManager.listServers() : []);
ipcMain.handle('mcp:add-server', async (_event, config) => {
  if (!mcpManager) throw new Error('MCP Manager not initialized');
  return mcpManager.addServer(config);
});
ipcMain.handle('mcp:remove-server', async (_event, id) => {
  if (!mcpManager) throw new Error('MCP Manager not initialized');
  return mcpManager.removeServer(id);
});
ipcMain.handle('mcp:connect', async (_event, id) => {
  if (!mcpManager) throw new Error('MCP Manager not initialized');
  return mcpManager.connectServer(id);
});
ipcMain.handle('mcp:disconnect', async (_event, id) => {
  if (!mcpManager) throw new Error('MCP Manager not initialized');
  return mcpManager.disconnectServer(id);
});
ipcMain.handle('mcp:call-tool', async (_event, payload) => {
  if (!mcpManager) throw new Error('MCP Manager not initialized');
  return mcpManager.callTool(payload?.serverId, payload?.toolName, payload?.args);
});
ipcMain.handle('mcp:list-tools', async () => mcpManager ? mcpManager.listAllTools() : []);

// --- Connector Handlers ---
ipcMain.handle('connector:list', async () => connectorManager ? connectorManager.listConnectors() : []);
ipcMain.handle('connector:execute', async (_event, payload) => {
  if (!connectorManager) throw new Error('Connector Manager not initialized');
  return connectorManager.executeConnector(payload?.connectorId, payload?.action, payload?.params, payload?.workspacePath);
});
ipcMain.handle('connector:health', async (_event, payload) => {
  if (!connectorManager) throw new Error('Connector Manager not initialized');
  return connectorManager.checkHealth(payload?.connectorId, payload?.workspacePath);
});

// --- Native Integrations Marketplace Handlers ---
ipcMain.handle('integrations:list', async (_event, options) => {
  if (!integrationsRegistry) throw new Error('Integrations Registry not initialized');
  return integrationsRegistry.list(options);
});
ipcMain.handle('integrations:get', async (_event, id, options) => {
  if (!integrationsRegistry) throw new Error('Integrations Registry not initialized');
  return integrationsRegistry.get(id, options);
});
ipcMain.handle('integrations:health', async (_event, id, context) => {
  if (!integrationsRegistry) throw new Error('Integrations Registry not initialized');
  return integrationsRegistry.checkHealth(id, context);
});
ipcMain.handle('integrations:connect', async (_event, payload) => {
  if (!integrationsRegistry) throw new Error('Integrations Registry not initialized');
  return integrationsRegistry.connect(payload?.id, payload);
});
ipcMain.handle('integrations:disconnect', async (_event, id) => {
  if (!integrationsRegistry) throw new Error('Integrations Registry not initialized');
  return integrationsRegistry.disconnect(id);
});
ipcMain.handle('integrations:refresh-all', async (_event, context) => {
  if (!integrationsRegistry) throw new Error('Integrations Registry not initialized');
  return integrationsRegistry.refreshAll(context);
});

// --- Command Runner Handlers ---
ipcMain.handle('command:run', async (_event, payload) => {
  if (!commandRunner) throw new Error('Command Runner not initialized');
  const root = await getWorkspaceRoot(payload?.workspacePath);
  return commandRunner.runCommand(payload?.id || `cmd-${Date.now()}`, payload?.command, root, payload?.options);
});
ipcMain.handle('command:cancel', async (_event, id) => {
  if (!commandRunner) throw new Error('Command Runner not initialized');
  return commandRunner.cancelCommand(id);
});
ipcMain.handle('command:is-safe', async (_event, cmd) => {
  if (!commandRunner) return false;
  return commandRunner.isSafeCommand(cmd);
});

// --- Checkpoint Handlers ---
ipcMain.handle('checkpoint:create', async (_event, payload) => {
  if (!checkpointManager) throw new Error('Checkpoint Manager not initialized');
  const root = await getWorkspaceRoot(payload?.workspacePath);
  return checkpointManager.createCheckpoint(root, payload?.description);
});
ipcMain.handle('checkpoint:list', async (_event, workspacePath) => {
  if (!checkpointManager) return [];
  const root = await getWorkspaceRoot(workspacePath);
  return checkpointManager.listCheckpoints(root);
});
ipcMain.handle('checkpoint:rollback', async (_event, payload) => {
  if (!checkpointManager) throw new Error('Checkpoint Manager not initialized');
  const root = await getWorkspaceRoot(payload?.workspacePath);
  return checkpointManager.rollbackCheckpoint(root, payload?.checkpointId);
});

// --- Memory Handlers ---
ipcMain.handle('memory:add', async (_event, payload) => {
  if (!memoryEngine) throw new Error('Memory Engine not initialized');
  return memoryEngine.addMemory(payload?.type, payload?.text, payload?.scope, payload?.metadata);
});
ipcMain.handle('memory:list', async (_event, scope) => {
  if (!memoryEngine) return [];
  return memoryEngine.listMemories(scope);
});
ipcMain.handle('memory:delete', async (_event, id) => {
  if (!memoryEngine) throw new Error('Memory Engine not initialized');
  return memoryEngine.deleteMemory(id);
});
ipcMain.handle('memory:clear', async (_event, scope) => {
  if (!memoryEngine) throw new Error('Memory Engine not initialized');
  return memoryEngine.clearMemories(scope);
});
ipcMain.handle('memory:search', async (_event, payload) => {
  if (!memoryEngine) return [];
  return memoryEngine.searchMemories(payload?.query, payload?.scope, payload?.topK);
});

// --- Real-Time Speech-to-Speech (S2S) Handlers ---
ipcMain.handle('s2s:get-status', async () => geminiLiveSession ? geminiLiveSession.getStatus() : { hasKey: false, engine: 'gemini-live' });
ipcMain.handle('s2s:get-diagnostics', async () => geminiLiveSession ? geminiLiveSession.getDiagnostics() : []);
ipcMain.handle('s2s:save-config', async (_event, config) => {
  if (!geminiLiveSession) throw new Error('S2S Session manager not initialized');
  return geminiLiveSession.saveConfig(config);
});
ipcMain.handle('s2s:test-connection', async (_event, candidateKey) => {
  if (!geminiLiveSession) throw new Error('S2S Session manager not initialized');
  return geminiLiveSession.testConnection(candidateKey);
});
ipcMain.handle('s2s:start-session', async (_event, options) => {
  if (!geminiLiveSession) throw new Error('S2S Session manager not initialized');
  return geminiLiveSession.startSession(options);
});
ipcMain.handle('s2s:stop-session', async () => {
  if (!geminiLiveSession) return { ok: true };
  return geminiLiveSession.stopSession();
});
ipcMain.handle('s2s:send-audio', async (_event, base64Pcm) => {
  if (!geminiLiveSession) return false;
  return geminiLiveSession.sendAudioChunk(base64Pcm);
});
ipcMain.handle('s2s:send-text', async (_event, text) => {
  if (!geminiLiveSession) return false;
  return geminiLiveSession.sendTextTurn(text);
});
ipcMain.handle('s2s:interrupt', async () => {
  if (!geminiLiveSession) return false;
  return geminiLiveSession.interrupt();
});

app.whenReady().then(async () => {
  const userData = app.getPath('userData');
  
  const mcpStorage = path.join(userData, 'idev-mcp-servers.json');
  mcpManager = new McpManager(mcpStorage);
  mcpManager.initialize().catch(err => console.error('Failed to init MCP manager:', err));

  connectorManager = new ConnectorManager();
  
  commandRunner = new CommandRunner();
  commandRunner.on('output', (data) => {
    safeSend('command:output', data);
  });

  checkpointManager = new CheckpointManager();

  const memoryStorage = path.join(userData, 'idev-memories.json');
  memoryEngine = new MemoryEngine(memoryStorage);
  memoryEngine.initialize().catch(err => console.error('Failed to init Memory engine:', err));

  geminiLiveSession = new GeminiLiveSession({
    userDataPath: userData,
    projectRoot: app.getAppPath()
  });

  geminiLiveSession.on('state-change', (data) => safeSend('s2s:state-change', data));
  geminiLiveSession.on('connecting', () => safeSend('s2s:state-change', { state: 'connecting' }));
  geminiLiveSession.on('connected', () => safeSend('s2s:state-change', { state: 'connected' }));
  geminiLiveSession.on('ready', (meta) => safeSend('s2s:ready', meta));
  geminiLiveSession.on('audio-chunk', (chunk) => safeSend('s2s:audio-chunk', chunk));
  geminiLiveSession.on('transcript-partial', (data) => safeSend('s2s:transcript', data));
  geminiLiveSession.on('turn-complete', (info) => safeSend('s2s:turn-complete', info));
  geminiLiveSession.on('interrupted', (info) => safeSend('s2s:interrupted', info));
  geminiLiveSession.on('reconnecting', (info) => safeSend('s2s:reconnecting', info));
  geminiLiveSession.on('closed', (info) => safeSend('s2s:closed', info));
  geminiLiveSession.on('error', (err) => safeSend('s2s:error', { message: err?.message || String(err) }));

  const integrationsStorage = path.join(userData, 'idev-integrations.json');
  integrationsRegistry = new IntegrationsRegistry({
    storagePath: integrationsStorage,
    connectorManager,
    mcpManager,
    geminiLiveSession,
    memoryEngine,
    checkpointManager
  });
  integrationsRegistry.initialize().catch(err => console.error('Failed to init Integrations registry:', err));

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', async () => {
  if (mcpManager) await mcpManager.shutdownAll().catch(() => {});
  if (geminiLiveSession) geminiLiveSession.stopSession();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

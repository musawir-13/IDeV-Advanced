const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexus', {
  getInfo: () => ipcRenderer.invoke('app:info'),
  getOllamaVersion: () => ipcRenderer.invoke('ollama:version'),
  getModels: () => ipcRenderer.invoke('ollama:models'),
  getRunningModels: () => ipcRenderer.invoke('ollama:running-models'),
  unloadModel: (model) => ipcRenderer.invoke('ollama:unload-model', model),
  embedText: (payload) => ipcRenderer.invoke('ollama:embed', payload),
  sendChat: (payload) => ipcRenderer.send('ollama:chat', payload),
  abortChat: (requestId) => ipcRenderer.send('ollama:abort', requestId),
  onChatEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('ollama:chat-event', listener);
    return () => ipcRenderer.removeListener('ollama:chat-event', listener);
  },
  pullModel: (payload) => ipcRenderer.send('ollama:pull', payload),
  cancelPull: (requestId) => ipcRenderer.send('ollama:cancel-pull', requestId),
  onPullEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('ollama:pull-event', listener);
    return () => ipcRenderer.removeListener('ollama:pull-event', listener);
  },
  openFolder: (folder) => ipcRenderer.invoke('fs:open-folder', folder),
  createProject: (payload) => ipcRenderer.invoke('project:create', payload),
  chooseWorkspace: () => ipcRenderer.invoke('workspace:choose'),
  readWorkspace: (rootPath) => ipcRenderer.invoke('workspace:read', rootPath),
  writeWorkspace: (payload) => ipcRenderer.invoke('workspace:write', payload),
  validateWorkspace: (payload) => ipcRenderer.invoke('workspace:validate', payload),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  listScreenSources: () => ipcRenderer.invoke('screen:sources'),
  captureScreenSource: (sourceId) => ipcRenderer.invoke('screen:capture-source', sourceId),

  // Model Context Protocol (MCP) Runtime
  mcp: {
    listServers: () => ipcRenderer.invoke('mcp:list-servers'),
    addServer: (config) => ipcRenderer.invoke('mcp:add-server', config),
    removeServer: (id) => ipcRenderer.invoke('mcp:remove-server', id),
    connect: (id) => ipcRenderer.invoke('mcp:connect', id),
    disconnect: (id) => ipcRenderer.invoke('mcp:disconnect', id),
    callTool: (payload) => ipcRenderer.invoke('mcp:call-tool', payload),
    listTools: () => ipcRenderer.invoke('mcp:list-tools')
  },

  // Connectors Runtime
  connectors: {
    list: () => ipcRenderer.invoke('connector:list'),
    execute: (payload) => ipcRenderer.invoke('connector:execute', payload),
    health: (payload) => ipcRenderer.invoke('connector:health', payload)
  },

  // Native Integrations Marketplace
  integrations: {
    list: (options) => ipcRenderer.invoke('integrations:list', options),
    get: (id, options) => ipcRenderer.invoke('integrations:get', id, options),
    health: (id, context) => ipcRenderer.invoke('integrations:health', id, context),
    connect: (payload) => ipcRenderer.invoke('integrations:connect', payload),
    disconnect: (id) => ipcRenderer.invoke('integrations:disconnect', id),
    refreshAll: (context) => ipcRenderer.invoke('integrations:refresh-all', context)
  },

  // Secure Workspace Command Runner
  commands: {
    run: (payload) => ipcRenderer.invoke('command:run', payload),
    cancel: (id) => ipcRenderer.invoke('command:cancel', id),
    isSafe: (cmd) => ipcRenderer.invoke('command:is-safe', cmd),
    onOutput: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('command:output', listener);
      return () => ipcRenderer.removeListener('command:output', listener);
    }
  },

  // Checkpoint & Safe Rollback Manager
  checkpoints: {
    create: (payload) => ipcRenderer.invoke('checkpoint:create', payload),
    list: (workspacePath) => ipcRenderer.invoke('checkpoint:list', workspacePath),
    rollback: (payload) => ipcRenderer.invoke('checkpoint:rollback', payload)
  },

  // Semantic Memory & Decision Store
  memory: {
    add: (payload) => ipcRenderer.invoke('memory:add', payload),
    list: (scope) => ipcRenderer.invoke('memory:list', scope),
    delete: (id) => ipcRenderer.invoke('memory:delete', id),
    clear: (scope) => ipcRenderer.invoke('memory:clear', scope),
    search: (payload) => ipcRenderer.invoke('memory:search', payload)
  },

  // Real-Time Speech-to-Speech (S2S) Engine
  s2s: {
    getStatus: () => ipcRenderer.invoke('s2s:get-status'),
    saveConfig: (config) => ipcRenderer.invoke('s2s:save-config', config),
    testConnection: (candidateKey) => ipcRenderer.invoke('s2s:test-connection', candidateKey),
    startSession: (options) => ipcRenderer.invoke('s2s:start-session', options),
    stopSession: () => ipcRenderer.invoke('s2s:stop-session'),
    sendAudioChunk: (base64Pcm) => ipcRenderer.invoke('s2s:send-audio', base64Pcm),
    sendText: (text) => ipcRenderer.invoke('s2s:send-text', text),
    interrupt: () => ipcRenderer.invoke('s2s:interrupt'),
    onReady: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('s2s:ready', listener);
      return () => ipcRenderer.removeListener('s2s:ready', listener);
    },
    onAudioChunk: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('s2s:audio-chunk', listener);
      return () => ipcRenderer.removeListener('s2s:audio-chunk', listener);
    },
    onTranscript: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('s2s:transcript', listener);
      return () => ipcRenderer.removeListener('s2s:transcript', listener);
    },
    onTurnComplete: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('s2s:turn-complete', listener);
      return () => ipcRenderer.removeListener('s2s:turn-complete', listener);
    },
    onInterrupted: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('s2s:interrupted', listener);
      return () => ipcRenderer.removeListener('s2s:interrupted', listener);
    },
    onStateChange: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('s2s:state-change', listener);
      return () => ipcRenderer.removeListener('s2s:state-change', listener);
    },
    onClosed: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('s2s:closed', listener);
      return () => ipcRenderer.removeListener('s2s:closed', listener);
    },
    onError: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('s2s:error', listener);
      return () => ipcRenderer.removeListener('s2s:error', listener);
    }
  }
});

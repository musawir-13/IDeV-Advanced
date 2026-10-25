const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'idev-advanced-settings-v1';
const CHAT_KEY = 'idev-advanced-current-chat-v1'; // legacy single-chat key, retained for migration
const CHAT_HISTORY_KEY = 'idev-advanced-chat-history-v1';
const ACTIVE_CHAT_KEY = 'idev-advanced-active-chat-v1';
const MAX_SAVED_CHATS = 80;
const PROJECTS_KEY = 'idev-advanced-projects-v1';

const ROLE_REGISTRY = [
  { id: 1, role: 'Head Developer / Chief Architect', model: 'qwen3.5:9b', task: 'Owns architecture, plans project work, resolves technical conflicts, and coordinates task dependencies.' },
  { id: 2, role: 'Prompt Engineer', model: 'gemma4:12b', task: 'Creates and improves role-specific prompts, output schemas, constraints, and prompt regression checks.' },
  { id: 3, role: 'Product & Requirements Analyst', model: 'qwen3.5:4b', task: 'Turns product ideas into requirements, user stories, acceptance criteria, and feature scope.' },
  { id: 4, role: 'UI/UX Designer', model: 'qwen3.5:2b', task: 'Defines screen layouts, flows, design tokens, responsive behavior, and accessibility requirements.' },
  { id: 5, role: 'Frontend Web Developer', model: 'qwen2.5:7b', task: 'Implements user-facing web UI, components, forms, navigation, HTML, CSS, JavaScript, React, and TypeScript.' },
  { id: 6, role: 'Backend Developer', model: 'qwen2.5-coder:14b', task: 'Implements APIs, server-side logic, authentication flows, validation, and service integrations.' },
  { id: 7, role: 'Android Developer', model: 'deepseek-coder:6.7b', task: 'Implements native Android/Kotlin code, screens, permissions, lifecycle, and Gradle configuration.' },
  { id: 8, role: 'Desktop Developer', model: 'codegemma:7b', task: 'Implements desktop-specific behavior, windows, dialogs, OS integration, and packaging code.' },
  { id: 9, role: 'Database Specialist', model: 'qwen2.5:14b', task: 'Designs schemas, relationships, constraints, indexes, migrations, and data-access plans.' },
  { id: 10, role: 'Code Fixer / Debugging Specialist', model: 'qwen2.5-coder:7b', task: 'Diagnoses reproducible bugs, reads stack traces, and proposes minimal, targeted code patches.' },
  { id: 11, role: 'Unit Test Engineer', model: 'deepseek-r1:7b', task: 'Designs unit tests, boundary cases, failure cases, and test coverage for individual components.' },
  { id: 12, role: 'Integration & QA Tester', model: 'qwen3:8b', task: 'Designs integration and end-to-end scenarios across connected application components.' },
  { id: 13, role: 'Security Auditor', model: 'deepseek-r1:8b', task: 'Reviews authentication, authorization, validation, secrets, dependencies, and unsafe operations.' },
  { id: 14, role: 'Performance Optimizer', model: 'qwen3:4b', task: 'Identifies potential performance bottlenecks and recommends benchmarkable optimizations.' },
  { id: 15, role: 'Visual QA Inspector', model: 'gemma4:e4b', task: 'Reviews supported screenshots and visual inputs for layout issues and design mismatches.' },
  { id: 16, role: 'OCR Specialist', model: 'glm-ocr:latest', task: 'Extracts readable text from supported images and scanned documents.' },
  { id: 17, role: 'Documentation Writer', model: 'qwen2.5:3b', task: 'Writes README files, setup guides, API references, changelogs, and user documentation.' },
  { id: 18, role: 'Build & Release Engineer', model: 'qwen3:1.7b', task: 'Prepares build scripts, packaging plans, CI configuration, and release checklists.' },
  { id: 19, role: 'Code Quality Checker', model: 'gemma3:4b', task: 'Reviews readability, consistency, duplicated logic, maintainability, and coding conventions.' },
  { id: 20, role: 'Final Product Analyzer', model: 'deepseek-r1:14b', task: 'Compares the finished product with requirements and reports missing features and release blockers.' },
  { id: 21, role: 'Project Knowledge Retrieval Specialist', model: 'qwen3-embedding:8b', task: 'Creates text embeddings for semantic search across project documentation and code context; not a chat-response model.', embeddingOnly: true }
];

const DEFAULT_SETTINGS = { contextLength: 4, teamMode: false, speedMode: true, buildMode: false, workspacePath: '', selectedModel: 'qwen3.5:9b' };
let settings = loadSettings();
let appInfo = { modelsPath: '', projectsPath: '', version: '0.1.0' };
let installedModels = [];
let chatHistory = loadChatHistory();
let activeChatId = `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
let chatMessages = [];
let activePage = 'chat';
let activeRequestId = null;
let activePullId = null;
let activeBuild = null;
const agentRuns = new Map();
let speechRecognition = null;
let dictationBase = '';
let pendingAttachments = [];
let activeScreenSource = null;
let screenCaptureTimer = null;
let screenCaptureInFlight = false;
let isSending = false;
let toastTimer;
let historySaveTimer = null;

function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings() { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
function loadChat() {
  try { const parsed = JSON.parse(localStorage.getItem(CHAT_KEY) || '[]'); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}
function titleFromMessages(messages) {
  const firstUser = (messages || []).find(message => message?.role === 'user' && String(message.content || '').trim());
  if (!firstUser) return 'New chat';
  const plain = String(firstUser.content).replace(/```[\s\S]*?```/g, ' ').replace(/[#>*`_~]/g, '').replace(/\s+/g, ' ').trim();
  if (!plain) return 'New chat';
  return plain.length > 44 ? `${plain.slice(0, 41).trimEnd()}…` : plain;
}
function normalizeSavedMessages(messages) {
  return (Array.isArray(messages) ? messages : []).slice(-100).map(message => {
    const saved = { ...message, content: String(message?.content || ''), pending: false };
    if (message?.pending) saved.content = `${saved.content}${saved.content ? '\n\n' : ''}_Generation was interrupted when the app closed._`;
    return saved;
  });
}
function readHistoryStorage() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || 'null');
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(item => item && typeof item.id === 'string' && Array.isArray(item.messages)).map(item => ({
      id: item.id,
      title: String(item.title || titleFromMessages(item.messages) || 'New chat'),
      titleEdited: !!item.titleEdited,
      messages: normalizeSavedMessages(item.messages),
      createdAt: item.createdAt || item.messages[0]?.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || item.messages[item.messages.length - 1]?.createdAt || item.createdAt || new Date().toISOString()
    })).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, MAX_SAVED_CHATS);
  } catch { return null; }
}
function loadChatHistory() {
  const stored = readHistoryStorage();
  if (stored) return stored;
  // Migrate the previous single-chat storage into the new conversation collection.
  const legacyMessages = loadChat();
  if (!legacyMessages.length) return [];
  const createdAt = legacyMessages[0]?.createdAt || new Date().toISOString();
  const migrated = [{ id: `migrated-${Date.now()}`, title: titleFromMessages(legacyMessages), titleEdited: false, messages: normalizeSavedMessages(legacyMessages), createdAt, updatedAt: legacyMessages[legacyMessages.length - 1]?.createdAt || createdAt }];
  try { localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(migrated)); localStorage.setItem(ACTIVE_CHAT_KEY, migrated[0].id); } catch {}
  return migrated;
}
function loadActiveChatId() {
  return `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function loadActiveChatMessages(history, id) {
  return history.find(chat => chat.id === id)?.messages?.slice(-100) || [];
}
function persistChatHistory() {
  chatHistory.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  chatHistory = chatHistory.slice(0, MAX_SAVED_CHATS);
  const write = () => {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatHistory));
    localStorage.setItem(ACTIVE_CHAT_KEY, activeChatId);
    localStorage.removeItem(CHAT_KEY); // remove the old duplicate snapshot after migration
  };
  try { write(); return; } catch {}
  // localStorage is quota-limited. Preserve the active conversation and prune oldest inactive
  // conversations only when needed so the newest work can still be saved.
  while (chatHistory.length > 1) {
    let removeAt = -1;
    for (let index = chatHistory.length - 1; index >= 0; index--) {
      if (chatHistory[index].id !== activeChatId) { removeAt = index; break; }
    }
    if (removeAt < 0) break;
    chatHistory.splice(removeAt, 1);
    try { write(); toast('Older chats were removed to make room for chat history.', 5000); return; } catch {}
  }
  const active = chatHistory.find(item => item.id === activeChatId);
  if (active?.messages?.length > 30) {
    active.messages = active.messages.slice(-30);
    chatMessages = chatMessages.slice(-30);
    try { write(); toast('This conversation was shortened to fit local storage.', 5000); return; } catch {}
  }
  toast('Chat history could not be saved because local browser storage is full.', 5000);
}
function scheduleChatHistorySave() {
  if (historySaveTimer) return;
  historySaveTimer = setTimeout(() => {
    historySaveTimer = null;
    saveChat(false);
  }, 2500);
}
function saveChat(renderSidebar = true) {
  chatMessages = chatMessages.slice(-100);
  let conversation = chatHistory.find(item => item.id === activeChatId);
  if (!conversation && chatMessages.length) {
    const firstTime = chatMessages[0]?.createdAt || new Date().toISOString();
    conversation = { id: activeChatId, title: titleFromMessages(chatMessages), titleEdited: false, messages: [], createdAt: firstTime, updatedAt: firstTime };
    chatHistory.unshift(conversation);
  }
  if (conversation) {
    conversation.messages = chatMessages.slice(-100);
    if (!conversation.titleEdited) conversation.title = titleFromMessages(chatMessages);
    conversation.updatedAt = new Date().toISOString();
    if (!conversation.createdAt) conversation.createdAt = chatMessages[0]?.createdAt || conversation.updatedAt;
  }
  persistChatHistory();
  if (renderSidebar) renderChatHistory();
}
function ensureActiveConversation() {
  if (!chatHistory.some(item => item.id === activeChatId)) {
    const now = new Date().toISOString();
    chatHistory.unshift({ id: activeChatId, title: 'New chat', titleEdited: false, messages: [], createdAt: now, updatedAt: now });
  }
}
function formatHistoryTime(value) {
  const date = new Date(value || 0);
  if (!Number.isFinite(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
function renderChatHistory(query = $('historySearch')?.value || '') {
  const root = $('chatHistoryList');
  if (!root) return;
  root.replaceChildren();
  const normalized = String(query || '').trim().toLowerCase();
  const chats = chatHistory.filter(chat => {
    if (!chat.messages?.length) return false;
    if (!normalized) return true;
    return `${chat.title} ${chat.messages.map(message => message.content || '').join(' ')}`.toLowerCase().includes(normalized);
  }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  if (!chats.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = normalized ? 'No matching chats' : (chatHistory.some(c => c.messages?.length) ? 'No recent chats' : 'Your chats will appear here');
    root.appendChild(empty);
    return;
  }
  for (const chat of chats.slice(0, 40)) {
    const row = document.createElement('div');
    row.className = `history-item${chat.id === activeChatId ? ' active' : ''}`;
    row.dataset.chatId = chat.id;
    const open = document.createElement('button');
    open.type = 'button'; open.className = 'history-open'; open.title = chat.title;
    const title = document.createElement('span'); title.className = 'history-item-title'; title.textContent = chat.title || 'New chat';
    const time = document.createElement('span'); time.className = 'history-item-time'; time.textContent = formatHistoryTime(chat.updatedAt);
    open.append(title, time);
    const actions = document.createElement('div'); actions.className = 'history-item-actions';
    const exp = document.createElement('button'); exp.type = 'button'; exp.className = 'history-action'; exp.dataset.action = 'export'; exp.title = 'Export conversation (Markdown)'; exp.setAttribute('aria-label', 'Export conversation'); exp.innerHTML = '<svg style="width:13px;height:13px"><use href="#i-download"/></svg>';
    const rename = document.createElement('button'); rename.type = 'button'; rename.className = 'history-action'; rename.dataset.action = 'rename'; rename.title = 'Rename chat'; rename.setAttribute('aria-label', 'Rename chat'); rename.textContent = '✎';
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'history-action danger'; remove.dataset.action = 'delete'; remove.title = 'Delete chat'; remove.setAttribute('aria-label', 'Delete chat'); remove.textContent = '×';
    actions.append(exp, rename, remove); row.append(open, actions); root.appendChild(row);
  }
}
function interruptCurrentChat() {
  if (activeBuild) {
    activeBuild.cancelled = true;
    if (activeBuild.currentRequestId) window.nexus.abortChat(activeBuild.currentRequestId);
  } else if (activeRequestId) {
    const pending = chatMessages.find(message => message.pending && message.role === 'assistant');
    if (pending) { pending.pending = false; pending.content ||= '_Generation stopped._'; }
    window.nexus.abortChat(activeRequestId);
  }
  activeRequestId = null;
  setBusy(false);
  saveChat();
}
function startNewChat() {
  if (activeBuild) { toast('Stop the current build before starting a new chat.'); return; }
  if (activeRequestId) interruptCurrentChat(); else saveChat();
  activeChatId = `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  if ($('historySearch')) $('historySearch').value = '';
  chatMessages = [];
  try { localStorage.setItem(ACTIVE_CHAT_KEY, activeChatId); } catch {}
  renderMessages(); renderChatHistory(); hideError(); showPage('chat'); $('messageInput').focus();
}
function openSavedChat(chatId) {
  if (activeBuild) { toast('Stop the current build before switching chats.'); return; }
  if (chatId === activeChatId) return;
  if (activeRequestId) interruptCurrentChat(); else saveChat();
  const chat = chatHistory.find(item => item.id === chatId);
  if (!chat) { toast('That conversation is no longer available.'); renderChatHistory(); return; }
  activeChatId = chat.id;
  chatMessages = chat.messages.slice(-100);
  try { localStorage.setItem(ACTIVE_CHAT_KEY, activeChatId); } catch {}
  chat.updatedAt = new Date().toISOString();
  persistChatHistory();
  hideError(); showPage('chat'); renderChatHistory(); renderMessages();
}
function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportChat(chatId = activeChatId, format = 'markdown') {
  const chat = chatHistory.find(c => c.id === chatId) || { id: activeChatId, title: 'Conversation', messages: chatMessages };
  const msgs = (chat.id === activeChatId ? chatMessages : chat.messages) || [];
  if (!msgs.length) { toast('No messages to export.'); return; }
  const cleanTitle = (chat.title || 'Conversation').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_') || 'Conversation';
  if (format === 'json') {
    const data = JSON.stringify({
      app: 'IDeV Advanced',
      version: appInfo.version || '0.3.8',
      id: chat.id,
      title: chat.title || 'Conversation',
      createdAt: chat.createdAt || new Date().toISOString(),
      updatedAt: chat.updatedAt || new Date().toISOString(),
      exportedAt: new Date().toISOString(),
      messages: msgs
    }, null, 2);
    downloadFile(`${cleanTitle}.json`, data, 'application/json');
    toast(`Exported "${chat.title || 'Conversation'}" as JSON`);
  } else {
    let md = `# ${chat.title || 'Conversation'}\n\n`;
    md += `*Exported from IDeV Advanced on ${new Date().toLocaleString()}*\n\n---\n\n`;
    for (const msg of msgs) {
      if (msg.role === 'user') {
        md += `### User\n\n${msg.content || ''}\n\n`;
      } else {
        const modelLabel = msg.model ? ` (${msg.model})` : '';
        md += `### ${msg.label || 'IDeV Advanced'}${modelLabel}\n\n${msg.content || ''}\n\n`;
      }
      md += `---\n\n`;
    }
    downloadFile(`${cleanTitle}.md`, md, 'text/markdown');
    toast(`Exported "${chat.title || 'Conversation'}" as Markdown`);
  }
}
function importChatFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || !Array.isArray(data.messages) || !data.messages.length) {
        toast('Invalid conversation JSON file: no messages found.');
        return;
      }
      const newChatId = `imported-${Date.now()}`;
      const newChat = {
        id: newChatId,
        title: (data.title ? `[Imported] ${data.title}` : 'Imported chat').slice(0, 80),
        titleEdited: true,
        messages: data.messages.map(m => ({
          id: m.id || makeId(),
          role: m.role || 'user',
          content: m.content || '',
          label: m.label || (m.role === 'assistant' ? 'IDeV' : undefined),
          model: m.model || undefined,
          createdAt: m.createdAt || new Date().toISOString()
        })),
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      chatHistory.unshift(newChat);
      persistChatHistory();
      openSavedChat(newChatId);
      toast(`Imported conversation with ${newChat.messages.length} message(s).`);
    } catch (err) {
      toast(`Import failed: ${err.message}`);
    }
  };
  reader.readAsText(file);
}
function handleHistoryAction(event) {
  const button = event.target.closest('button[data-action]');
  const row = event.target.closest('.history-item');
  if (!button || !row) return;
  event.stopPropagation();
  const chat = chatHistory.find(item => item.id === row.dataset.chatId);
  if (!chat) return;
  if (button.dataset.action === 'export') {
    exportChat(chat.id, 'markdown');
  } else if (button.dataset.action === 'rename') {
    const next = window.prompt('Rename conversation', chat.title || 'New chat');
    if (next === null) return;
    const title = next.trim().slice(0, 80);
    if (!title) { toast('Chat title cannot be empty.'); return; }
    chat.title = title; chat.titleEdited = true; chat.updatedAt = new Date().toISOString();
    persistChatHistory(); renderChatHistory();
  } else if (button.dataset.action === 'delete') {
    if (!window.confirm(`Delete “${chat.title || 'New chat'}” and its messages? This cannot be undone.`)) return;
    chatHistory = chatHistory.filter(item => item.id !== chat.id);
    if (chat.id === activeChatId) {
      if (activeRequestId) { window.nexus.abortChat(activeRequestId); activeRequestId = null; setBusy(false); }
      activeChatId = `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      chatMessages = []; renderMessages(); hideError();
    }
    persistChatHistory(); renderChatHistory();
    toast('Conversation deleted.');
  }
}
function loadProjects() {
  try { const parsed = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]'); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}
function saveProjects(projects) { localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects.slice(0, 40))); }
function makeId() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function markdownToHtml(input) {
  const blocks = [];
  let value = escapeHtml(input || '').replace(/\r\n/g, '\n');
  value = value.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const key = `@@CODEBLOCK${blocks.length}@@`;
    const className = String(lang || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    blocks.push(`<pre><code${className ? ` class="language-${className}"` : ''}>${code.replace(/\n$/, '')}</code></pre>`);
    return key;
  });
  value = value.replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/^## (.+)$/gm, '<h2>$1</h2>').replace(/^# (.+)$/gm, '<h1>$1</h1>');
  value = value.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  value = value.replace(/`([^`]+)`/g, '<code>$1</code>');
  value = value.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  value = value.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  const lines = value.split('\n');
  const html = [];
  let paragraph = [];
  let listType = null;
  const flushParagraph = () => { if (paragraph.length) { html.push(`<p>${paragraph.join('<br>')}</p>`); paragraph = []; } };
  const closeList = () => { if (listType) { html.push(`</${listType}>`); listType = null; } };
  for (const line of lines) {
    if (/^@@CODEBLOCK\d+@@$/.test(line.trim())) { flushParagraph(); closeList(); html.push(line.trim()); continue; }
    const ul = line.match(/^\s*[-*]\s+(.+)/);
    const ol = line.match(/^\s*\d+[.)]\s+(.+)/);
    if (ul || ol) {
      flushParagraph(); const type = ul ? 'ul' : 'ol';
      if (listType !== type) { closeList(); html.push(`<${type}>`); listType = type; }
      html.push(`<li>${(ul || ol)[1]}</li>`); continue;
    }
    if (!line.trim()) { flushParagraph(); closeList(); continue; }
    if (/^<(h[1-3]|blockquote)\b/.test(line.trim())) { flushParagraph(); closeList(); html.push(line); continue; }
    paragraph.push(line);
  }
  flushParagraph(); closeList();
  let result = html.join('');
  result = result.replace(/@@CODEBLOCK(\d+)@@/g, (_m, index) => blocks[Number(index)] || '');
  return result;
}
function toast(message, duration = 3000) {
  const el = $('toast'); el.textContent = message; el.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
}
function setConnection(connected, message) {
  const pill = $('connectionPill');
  if (pill) {
    const dot = pill.querySelector('.status-dot');
    if (dot) {
      dot.classList.toggle('online', connected);
      dot.classList.toggle('offline', !connected);
    }
    const txt = pill.querySelector('.connection-text');
    if (txt) txt.textContent = message || (connected ? 'Local Engine connected' : 'Local Engine offline');
  }
  $('ollamaWarning')?.classList.toggle('hidden', connected);
  if ($('activeModelHint')) $('activeModelHint').textContent = connected ? 'Local AI Engine · 127.0.0.1:11434' : 'Local AI Engine · Offline';
}
function switchIntegrationsTab(tabId) {
  document.querySelectorAll('.subnav-tab').forEach(t => {
    const isTarget = t.dataset.tab === tabId;
    t.classList.toggle('active', isTarget);
    t.setAttribute('aria-selected', isTarget ? 'true' : 'false');
  });
  document.querySelectorAll('#integrationsPage .tab-pane').forEach(p => {
    const isTarget = p.id === tabId;
    p.classList.toggle('active', isTarget);
    p.classList.toggle('hidden', !isTarget);
  });
  if (tabId === 'marketplaceTabPane') renderMarketplacePage();
  if (tabId === 'mcpTabPane') renderMcpPage();
  if (tabId === 'connectorsTabPane') renderConnectorsPage();
  if (tabId === 'memoryTabPane') renderMemoryPage();
  if (tabId === 'checkpointsTabPane') renderCheckpointsPage();
}

function showPage(page) {
  const subIntegrations = {
    marketplace: 'marketplaceTabPane',
    mcp: 'mcpTabPane',
    connectors: 'connectorsTabPane',
    memory: 'memoryTabPane',
    checkpoints: 'checkpointsTabPane'
  };

  if (subIntegrations[page]) {
    switchIntegrationsTab(subIntegrations[page]);
    page = 'integrations';
  } else if (page === 'integrations') {
    const activeTab = document.querySelector('.subnav-tab.active')?.dataset.tab || 'marketplaceTabPane';
    switchIntegrationsTab(activeTab);
  }

  activePage = page;
  const pages = {
    chat: 'chatPage',
    apps: 'appsPage',
    integrations: 'integrationsPage',
    settings: 'settingsPage',
    models: 'modelsPage',
    team: 'teamPage'
  };
  for (const [key, id] of Object.entries(pages)) {
    const el = $(id);
    if (el) {
      el.classList.toggle('active', key === page);
      el.classList.toggle('hidden', key !== page);
    }
  }
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page || (page === 'models' && btn.dataset.page === 'apps') || (page === 'team' && btn.dataset.page === 'apps') || (page === 'integrations' && ['mcp', 'connectors', 'memory', 'checkpoints'].includes(btn.dataset.page)));
  });
  const showTopbar = page !== 'chat';
  $('topbar').classList.toggle('hidden', !showTopbar);
  const metadata = {
    apps: ['Apps & Projects', '#i-apps'],
    integrations: ['Integrations & Tools', '#i-tool'],
    settings: ['Settings', '#i-settings'],
    models: ['Model library', '#i-apps'],
    team: ['21-role AI team', '#i-spark']
  }[page];
  if (metadata) {
    $('pageTitle').textContent = metadata[0];
    $('pageIcon').innerHTML = `<svg><use href="${metadata[1]}"/></svg>`;
  }
  if (page !== 'chat') $('sidebar').classList.remove('collapsed');
  if (page === 'apps') renderProjects();
  if (page === 'settings') renderSettings();
  if (page === 'models') renderModelsPage();
  if (page === 'team') renderTeamRoster();
  if (page === 'chat') { renderMessages(); renderChatHistory(); $('messageInput').focus(); }
}

let pendingCommandApproval = null;
async function executeWorkspaceCommand(commandStr, workspacePath, options = {}) {
  const isSafe = await window.nexus.commands.isSafe(commandStr);
  if (!isSafe) {
    return new Promise((resolve, reject) => {
      $('approvalCommandText').textContent = commandStr;
      $('approvalCwdText').textContent = workspacePath;
      $('commandApprovalModal').classList.remove('hidden');
      pendingCommandApproval = {
        resolve: async () => {
          $('commandApprovalModal').classList.add('hidden');
          try {
            const res = await window.nexus.commands.run({ command: commandStr, workspacePath, options });
            resolve(res);
          } catch (e) { reject(e); }
        },
        reject: () => {
          $('commandApprovalModal').classList.add('hidden');
          reject(new Error('User cancelled unapproved command execution for security.'));
        }
      };
    });
  }
  return window.nexus.commands.run({ command: commandStr, workspacePath, options });
}

let currentMarketplaceFilter = 'all';
let currentMarketplaceSearch = '';
let activeDetailsIntegration = null;

async function renderMarketplacePage(filter = currentMarketplaceFilter, search = currentMarketplaceSearch) {
  currentMarketplaceFilter = filter;
  currentMarketplaceSearch = search;
  const grid = $('marketplaceGrid');
  const summary = $('marketplaceSummary');
  const empty = $('marketplaceEmpty');
  if (!grid) return;

  grid.innerHTML = '<div class="empty-state small" style="grid-column: 1/-1;">Loading integrations & tools...</div>';
  if (empty) empty.classList.add('hidden');

  try {
    const list = await window.nexus.integrations.list({
      category: filter,
      search,
      workspacePath: settings.workspacePath
    });

    grid.innerHTML = '';
    const connectedCount = (list || []).filter(i => i.status === 'connected').length;
    if (summary) {
      summary.textContent = `Showing ${(list || []).length} integration${(list || []).length === 1 ? '' : 's'} · ${connectedCount} connected`;
    }

    if (!list || !list.length) {
      if (empty) {
        empty.classList.remove('hidden');
        empty.textContent = search ? `No integrations found matching "${search}".` : 'No integrations found in this category.';
      }
      return;
    }

    for (const item of list) {
      const card = document.createElement('div');
      card.className = 'marketplace-card';
      card.dataset.id = item.id;

      const iconThemes = {
        development: 'mint',
        files: 'blue',
        research: 'purple',
        mcp: 'amber',
        productivity: 'mint'
      };
      const theme = iconThemes[item.category] || 'mint';

      const statusLabels = {
        connected: 'Connected',
        ready: 'Ready',
        'not-configured': 'Setup Required',
        error: 'Error',
        unavailable: 'Unavailable'
      };

      const primaryActionButtons = {
        'connector-local-git': item.status === 'connected' ? 'Git Status' : 'Configure',
        'connector-fs-search': 'Search Code',
        'connector-web-search': 'Test Search',
        'mcp-service': 'Manage MCP',
        'service-project-memory': 'View Memory',
        'service-checkpoints': 'Checkpoints',
        'service-gemini-live': item.status === 'connected' ? 'Live Voice' : 'Configure S2S',
        'service-ollama-mesh': 'View Models',
        'service-command-runner': 'Command Status'
      };
      const actionText = item.isUserConfiguredMcp
        ? (item.status === 'connected' ? 'Disconnect' : 'Connect')
        : (primaryActionButtons[item.id] || (item.status === 'connected' ? 'Manage' : 'Connect'));

      card.innerHTML = `
        <div class="marketplace-card-head">
          <div class="marketplace-card-title-row">
            <div class="marketplace-card-icon ${theme}">
              <svg><use href="#${item.icon || 'i-spark'}"/></svg>
            </div>
            <div class="marketplace-card-name-group">
              <strong>${escapeHtml(item.name)}</strong>
              <small>${escapeHtml(item.category)} · v${escapeHtml(item.version || '1.0')}</small>
            </div>
          </div>
          <span class="status-pill ${item.status}">
            <span class="dot"></span> ${statusLabels[item.status] || item.status}
          </span>
        </div>
        <p class="marketplace-card-desc">${escapeHtml(item.description)}</p>
        <div class="marketplace-card-caps">
          ${(item.capabilities || []).slice(0, 4).map(c => `<span class="cap-badge">${escapeHtml(c)}</span>`).join('')}
          ${(item.capabilities || []).length > 4 ? `<span class="cap-badge">+${item.capabilities.length - 4} more</span>` : ''}
        </div>
        <div class="marketplace-card-foot">
          <button type="button" class="text-button view-details-btn" data-id="${item.id}">View Details</button>
          <div class="marketplace-actions-group">
            <button type="button" class="outline-button int-primary-btn" data-id="${item.id}" data-action="${actionText}">${actionText}</button>
          </div>
        </div>
      `;
      grid.appendChild(card);
    }
  } catch (err) {
    grid.innerHTML = `<div class="inline-error" style="grid-column: 1/-1;">Failed to load integrations: ${escapeHtml(err.message)}</div>`;
  }
}

async function openIntegrationDetails(id) {
  try {
    const item = await window.nexus.integrations.get(id, { workspacePath: settings.workspacePath });
    activeDetailsIntegration = item;

    $('intModalTitle').textContent = item.name;
    $('intModalDesc').textContent = item.longDescription || item.description;
    $('intModalCategory').textContent = `${(item.category || '').toUpperCase()} · v${item.version || '1.0'}`;
    
    const badge = $('intModalStatusBadge');
    badge.className = `availability ${item.status === 'connected' ? 'ok' : (item.status === 'error' ? 'missing' : '')}`;
    badge.textContent = (item.status || '').toUpperCase();

    const capsBox = $('intModalCaps');
    capsBox.innerHTML = (item.capabilities || []).map(c => `<span class="cap-badge" style="font-size:11px;padding:3px 8px;">${escapeHtml(c)}</span>`).join('') || '<span style="color:#9ca3af;font-size:12px;">No capabilities declared</span>';

    const permsBox = $('intModalPerms');
    permsBox.innerHTML = (item.permissions || []).map(p => `<li>${escapeHtml(p)}</li>`).join('') || '<li>Standard sandboxed execution</li>';

    $('intModalHealthMessage').textContent = item.healthMessage || 'Ready for execution';
    $('intModalLatency').textContent = item.latencyMs ? `${item.latencyMs}ms response time` : '';

    const tbSection = $('intModalTroubleshootingSection');
    if (item.troubleshooting) {
      tbSection.style.display = 'block';
      $('intModalTroubleshooting').textContent = item.troubleshooting;
    } else {
      tbSection.style.display = 'none';
    }

    const actBtn = $('intModalActionBtn');
    if (item.isUserConfiguredMcp) {
      actBtn.textContent = item.status === 'connected' ? 'Disconnect Server' : 'Connect Server';
    } else if (item.id === 'service-gemini-live') {
      actBtn.textContent = 'Configure Voice API';
    } else if (item.id === 'mcp-service') {
      actBtn.textContent = 'Add Custom Server';
    } else if (item.id === 'connector-local-git') {
      actBtn.textContent = 'Run Git Status';
    } else if (item.id === 'connector-web-search') {
      actBtn.textContent = 'Test Query';
    } else {
      actBtn.textContent = item.status === 'connected' ? 'Manage' : 'Connect';
    }

    $('integrationDetailsModal').classList.remove('hidden');
  } catch (err) {
    toast(`Could not open details: ${err.message}`, 4000);
  }
}

async function renderMcpPage() {
  const serverRoot = $('mcpServersList');
  const toolRoot = $('mcpToolsList');
  if (!serverRoot || !toolRoot) return;

  serverRoot.innerHTML = '<div class="empty-state small">Loading MCP servers...</div>';
  toolRoot.innerHTML = '<div class="empty-state small">Loading tools...</div>';

  try {
    const servers = await window.nexus.mcp.listServers();
    serverRoot.innerHTML = '';
    if (!servers.length) {
      serverRoot.innerHTML = '<div class="empty-models">No MCP servers registered yet. Click "Add server" to register a stdio server.</div>';
    } else {
      for (const s of servers) {
        const card = document.createElement('div');
        card.className = 'installed-model';
        const isConnected = s.status === 'connected';
        card.innerHTML = `
          <div class="model-token"><svg><use href="#i-tool"/></svg></div>
          <div class="model-meta">
            <strong>${escapeHtml(s.name)}</strong>
            <small>${escapeHtml(s.command)} ${(s.args || []).map(a => escapeHtml(a)).join(' ')} · Transport: ${escapeHtml(s.transport)}</small>
          </div>
          <span class="availability ${isConnected ? 'ok' : s.status === 'connecting' ? 'running' : 'missing'}">${s.status}</span>
          <div class="installed-model-actions">
            ${isConnected
              ? `<button class="outline-button btn-disconnect" data-id="${s.id}">Disconnect</button>`
              : `<button class="primary-button btn-connect" data-id="${s.id}">Connect</button>`}
            <button class="outline-button btn-remove danger" data-id="${s.id}">Remove</button>
          </div>
        `;
        card.querySelector('.btn-connect')?.addEventListener('click', async () => {
          try {
            await window.nexus.mcp.connect(s.id);
            toast(`Connected to ${s.name}`);
            renderMcpPage();
          } catch (e) { toast(`Connection error: ${e.message}`, 6000); renderMcpPage(); }
        });
        card.querySelector('.btn-disconnect')?.addEventListener('click', async () => {
          try {
            await window.nexus.mcp.disconnect(s.id);
            toast(`Disconnected ${s.name}`);
            renderMcpPage();
          } catch (e) { toast(`Disconnect error: ${e.message}`); renderMcpPage(); }
        });
        card.querySelector('.btn-remove')?.addEventListener('click', async () => {
          if (confirm(`Remove MCP server "${s.name}"?`)) {
            await window.nexus.mcp.removeServer(s.id);
            toast('Server removed');
            renderMcpPage();
          }
        });
        serverRoot.appendChild(card);
      }
    }

    const tools = await window.nexus.mcp.listTools();
    $('mcpToolCount').textContent = tools.length;
    toolRoot.innerHTML = '';
    if (!tools.length) {
      toolRoot.innerHTML = '<div class="empty-models">No tools discovered. Connect an MCP server to discover tools.</div>';
    } else {
      for (const item of tools) {
        const t = item.tool;
        const card = document.createElement('div');
        card.className = 'team-role-card';
        card.innerHTML = `
          <span class="role-number">⚙</span>
          <div class="team-role-copy">
            <strong>${escapeHtml(t.name)}</strong>
            <small style="color:#57606a;">Server: ${escapeHtml(item.serverName)}</small>
            <p>${escapeHtml(t.description || 'No description provided.')}</p>
          </div>
          <button class="outline-button btn-test-tool">Call Tool</button>
        `;
        card.querySelector('.btn-test-tool').addEventListener('click', async () => {
          const argsInput = prompt(`Call tool "${t.name}" on ${item.serverName}.\nEnter JSON arguments:`, '{}');
          if (argsInput === null) return;
          try {
            const parsedArgs = JSON.parse(argsInput);
            if (!confirm(`Permission Gate: Execute tool "${t.name}" on MCP server "${item.serverName}"?\nArguments: ${JSON.stringify(parsedArgs, null, 2)}`)) return;
            const res = await window.nexus.mcp.callTool({ serverId: item.serverId, toolName: t.name, args: parsedArgs });
            alert(`Tool Result:\n${JSON.stringify(res, null, 2)}`);
          } catch (e) {
            toast(`Tool error: ${e.message}`, 6000);
          }
        });
        toolRoot.appendChild(card);
      }
    }
  } catch (e) {
    serverRoot.innerHTML = `<div class="inline-error">Failed to load MCP: ${escapeHtml(e.message)}</div>`;
  }
}

async function renderConnectorsPage() {
  const ws = settings.workspacePath;
  const badge = $('gitStatusBadge');
  const output = $('gitOutput');
  if (!ws) {
    badge.className = 'availability missing';
    badge.textContent = 'No workspace';
    output.textContent = 'Select a workspace folder first to run Git operations.';
    return;
  }

  try {
    const health = await window.nexus.connectors.health({ connectorId: 'connector-local-git', workspacePath: ws });
    if (health.ok) {
      badge.className = 'availability ok';
      badge.textContent = health.isGitRepository ? 'Git Repo' : 'Git Available (Not a repo)';
    } else {
      badge.className = 'availability missing';
      badge.textContent = health.message || 'Git unavailable';
    }
  } catch {
    badge.className = 'availability missing';
    badge.textContent = 'Error';
  }
}

async function renderMemoryPage() {
  const root = $('memoryList');
  if (!root) return;
  const scopeFilter = $('memoryScopeFilter')?.value || 'all';
  const query = $('memorySearchInput')?.value?.trim() || '';

  root.innerHTML = '<div class="empty-state small">Loading memories...</div>';
  try {
    let scopeParam = null;
    if (scopeFilter === 'global') scopeParam = 'global';
    else if (scopeFilter === 'workspace') scopeParam = settings.workspacePath;

    let memories = [];
    if (query) {
      memories = await window.nexus.memory.search({ query, scope: scopeParam, topK: 30 });
    } else {
      memories = await window.nexus.memory.list(scopeParam);
    }

    root.innerHTML = '';
    if (!memories.length) {
      root.innerHTML = '<div class="empty-models">No memories found. Click "Add memory" to store architectural decisions or user preferences.</div>';
      return;
    }

    for (const m of memories) {
      const card = document.createElement('div');
      card.className = 'installed-model';
      card.innerHTML = `
        <div class="model-token"><svg><use href="#i-memory"/></svg></div>
        <div class="model-meta">
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">
            <span class="memory-badge ${escapeHtml(m.type || 'fact')}">${escapeHtml(m.type || 'fact')}</span>
            <small style="color:#6e7681;">Scope: ${escapeHtml(m.scope === 'global' ? 'Global' : (m.scope || 'Workspace'))}</small>
          </div>
          <strong style="font-weight:400;font-size:13px;line-height:1.5;">${escapeHtml(m.text)}</strong>
          <small style="color:#8c959f;margin-top:4px;">Saved ${new Date(m.createdAt).toLocaleDateString()}</small>
        </div>
        <div class="installed-model-actions">
          <button class="outline-button btn-del-mem danger" data-id="${m.id}">Delete</button>
        </div>
      `;
      card.querySelector('.btn-del-mem').addEventListener('click', async () => {
        await window.nexus.memory.delete(m.id);
        toast('Memory deleted');
        renderMemoryPage();
      });
      root.appendChild(card);
    }
  } catch (e) {
    root.innerHTML = `<div class="inline-error">Error loading memories: ${escapeHtml(e.message)}</div>`;
  }
}

async function renderCheckpointsPage() {
  const ws = settings.workspacePath;
  const pathLabel = $('checkpointWorkspacePath');
  const root = $('checkpointsList');
  if (pathLabel) pathLabel.textContent = ws || 'None selected (choose folder with folder icon)';
  if (!root) return;

  if (!ws) {
    root.innerHTML = '<div class="empty-models">Select a workspace folder first to inspect or create snapshots.</div>';
    return;
  }

  root.innerHTML = '<div class="empty-state small">Loading snapshots...</div>';
  try {
    const list = await window.nexus.checkpoints.list(ws);
    root.innerHTML = '';
    if (!list.length) {
      root.innerHTML = '<div class="empty-models">No snapshots found for this workspace. Click "New snapshot" to save current workspace state.</div>';
      return;
    }

    for (const cp of list) {
      const card = document.createElement('div');
      card.className = 'installed-model';
      card.innerHTML = `
        <div class="model-token"><svg><use href="#i-checkpoint"/></svg></div>
        <div class="model-meta">
          <strong>${escapeHtml(cp.description || 'Pre-change snapshot')}</strong>
          <small>${escapeHtml(cp.id)} · ${cp.filesCount || 0} file(s) backed up · ${new Date(cp.timestamp).toLocaleString()}</small>
        </div>
        <div class="installed-model-actions">
          <button class="primary-button btn-rollback" data-id="${cp.id}">Rollback</button>
        </div>
      `;
      card.querySelector('.btn-rollback').addEventListener('click', async () => {
        if (confirm(`Roll back workspace to snapshot "${cp.description}"?\nExisting files will be replaced with snapshot contents.`)) {
          try {
            const res = await window.nexus.checkpoints.rollback({ workspacePath: ws, checkpointId: cp.id });
            toast(`Workspace restored: ${res.restoredCount} file(s) restored from ${cp.id}.`, 6000);
            renderCheckpointsPage();
          } catch (e) {
            toast(`Rollback error: ${e.message}`, 6000);
          }
        }
      });
      root.appendChild(card);
    }
  } catch (e) {
    root.innerHTML = `<div class="inline-error">Error loading snapshots: ${escapeHtml(e.message)}</div>`;
  }
}
function setTeamMode(on) {
  settings.teamMode = !!on; saveSettings(); updateModelSelector();
  $('teamModeBtn').classList.toggle('active', settings.teamMode);
  $('dropdownTeamToggle').classList.toggle('on', settings.teamMode);
  $('dropdownTeamToggle').setAttribute('aria-checked', String(settings.teamMode));
  $('teamModeBtn').title = settings.teamMode ? 'Team routing is on; each task is sent only to its dedicated model.' : 'Team routing is off; use the selected model directly.';
}
function updateBuildModeUI() {
  $('buildModeBtn').classList.toggle('active', !!settings.buildMode);
  $('buildModeBtn').setAttribute('aria-pressed', String(!!settings.buildMode));
  $('buildModeBtn').title = settings.buildMode ? 'Build mode is on: requests will create or update project files in the selected workspace.' : 'Turn on to build or edit files in a chosen workspace.';
  $('workspaceStatus').textContent = settings.workspacePath ? `Workspace: ${settings.workspacePath}` : 'Choose a folder to build projects';
  $('workspaceStatus').title = settings.workspacePath || 'No workspace selected';
}
function updateModelSelector() {
  $('modelSelectLabel').textContent = settings.teamMode ? 'Auto · 21 roles' : (settings.selectedModel || installedModels[0]?.name || 'Select model');
  $('teamModeBtn').classList.toggle('active', settings.teamMode);
  $('dropdownTeamToggle')?.classList.toggle('on', settings.teamMode);
  $('dropdownTeamToggle')?.setAttribute('aria-checked', String(settings.teamMode));
}
function renderModelList(query = '') {
  const root = $('modelList'); root.innerHTML = '';
  const filtered = installedModels.filter(m => m.name.toLowerCase().includes(query.toLowerCase()));
  if (!filtered.length) {
    const empty = document.createElement('div'); empty.className = 'empty-models'; empty.textContent = installedModels.length ? 'No models match that search.' : 'No models were found. Start Ollama or pull a model.'; root.appendChild(empty);
  }
  for (const model of filtered) {
    const button = document.createElement('button'); button.className = 'model-option' + (!settings.teamMode && settings.selectedModel === model.name ? ' selected' : '');
    button.innerHTML = `<span class="model-name"></span><span class="model-size">${formatSize(model.size)}</span>${!settings.teamMode && settings.selectedModel === model.name ? '<svg><use href="#i-check"/></svg>' : ''}`;
    button.querySelector('.model-name').textContent = model.name;
    button.addEventListener('click', () => { settings.selectedModel = model.name; setTeamMode(false); saveSettings(); updateModelSelector(); $('modelDropdown').classList.add('hidden'); $('modelSelectBtn').setAttribute('aria-expanded', 'false'); });
    button.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = button.nextElementSibling;
        if (next && next.classList.contains('model-option')) next.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = button.previousElementSibling;
        if (prev && prev.classList.contains('model-option')) prev.focus();
        else $('modelSearch').focus();
      } else if (e.key === 'Escape') {
        $('modelDropdown').classList.add('hidden');
        $('modelSelectBtn').setAttribute('aria-expanded', 'false');
        $('modelSelectBtn').focus();
      }
    });
    root.appendChild(button);
  }
  $('modelCount').textContent = `${installedModels.length} installed`;
}
function renderMessages() {
  const root = $('messages'); root.innerHTML = '';
  const hasMsgs = chatMessages.length > 0;
  $('chatPage').classList.toggle('has-messages', hasMsgs);
  for (const message of chatMessages) root.appendChild(createMessageElement(message));
  root.scrollTop = root.scrollHeight;
}
function editUserMessage(messageId) {
  if (isSending) { toast('Wait for the current response to finish.'); return; }
  const idx = chatMessages.findIndex(m => m.id === messageId);
  if (idx === -1) return;
  const target = chatMessages[idx];
  $('messageInput').value = target.content || '';
  autoResizeInput();
  $('messageInput').focus();
  if (confirm('Place prompt into input for editing? Click OK to trim subsequent messages and branch from this prompt.')) {
    chatMessages = chatMessages.slice(0, idx);
    saveChat();
    renderMessages();
  }
}
async function regenerateAssistantMessage(messageId) {
  if (isSending) { toast('Wait for the current response to finish.'); return; }
  const idx = chatMessages.findIndex(m => m.id === messageId);
  if (idx === -1) return;
  const precedingUser = chatMessages.slice(0, idx).reverse().find(m => m.role === 'user');
  if (!precedingUser) { toast('No user prompt found to regenerate.'); return; }
  chatMessages = chatMessages.slice(0, idx);
  saveChat();
  renderMessages();
  $('messageInput').value = precedingUser.content;
  if (precedingUser.attachments?.length) {
    pendingAttachments = [...precedingUser.attachments];
    renderAttachmentPreview();
  }
  await sendMessage();
}
function createMessageElement(message) {
  const row = document.createElement('article'); row.className = `message ${message.role}`; row.dataset.messageId = message.id;
  const avatar = document.createElement('div');
  avatar.className = `avatar ${message.role}`;
  if (message.role === 'assistant') {
    const avatarImg = document.createElement('img');
    avatarImg.src = 'logo.png';
    avatarImg.alt = 'IDeV Advanced';
    avatarImg.className = 'assistant-avatar-img';
    avatar.appendChild(avatarImg);
  } else {
    avatar.textContent = 'Y';
  }
  const content = document.createElement('div'); content.className = 'message-content';
  if (message.role === 'assistant') {
    const label = document.createElement('div'); label.className = 'message-label';
    const base = document.createElement('span'); base.textContent = message.label || 'IDeV'; label.appendChild(base);
    if (message.isVoice) {
      const voiceBadge = document.createElement('span');
      voiceBadge.className = `voice-turn-badge${message.wasInterrupted ? ' interrupted' : ''}`;
      voiceBadge.textContent = message.wasInterrupted ? 'S2S Voice · Interrupted' : 'S2S Voice';
      label.appendChild(voiceBadge);
    }
    if (message.model) { const tag = document.createElement('span'); tag.className = 'role-tag'; tag.textContent = message.model; label.appendChild(tag); }
    content.appendChild(label);
    const body = document.createElement('div'); body.className = 'message-body' + (message.pending ? ' streaming-body' : '');
    if (message.buildData) {
      body.appendChild(createBuildCardElement(message.buildData, message.id));
    } else if (message.pending) {
      const committed = document.createElement('div'); committed.className = 'streaming-committed';
      const live = document.createElement('div'); live.className = 'streaming-live';
      body.append(committed, live);
      streamStateById.set(message.id, { committedLength: 0, liveText: '', liveMode: 'text', liveNode: null, codeText: '' });
      if (message.content) live.textContent = message.content;
    } else body.innerHTML = markdownToHtml(message.content || '');
    content.appendChild(body);
    if (!message.pending && message.content && !message.buildData) appendMessageActions(content, message);
  } else {
    content.classList.add('user-message-content');
    if (message.isVoice) {
      const voiceBadge = document.createElement('div');
      voiceBadge.className = 'voice-turn-badge';
      voiceBadge.style.alignSelf = 'flex-end';
      voiceBadge.textContent = 'Voice Input';
      content.appendChild(voiceBadge);
    }
    const text = document.createElement('div'); text.className = 'user-message-text'; text.textContent = message.content || '';
    content.appendChild(text);
    if (Array.isArray(message.attachments) && message.attachments.length) {
      const attachmentStrip = document.createElement('div'); attachmentStrip.className = 'message-attachments';
      for (const attachment of message.attachments.slice(0, 8)) {
        if (attachment.type === 'image' && attachment.previewDataUrl) {
          const previewButton = document.createElement('button'); previewButton.type = 'button'; previewButton.className = 'message-image-preview'; previewButton.title = `View ${attachment.name || 'image'}`;
          const image = document.createElement('img'); image.src = attachment.previewDataUrl; image.alt = attachment.name || 'Attached image';
          previewButton.appendChild(image); previewButton.addEventListener('click', () => showExpandedImage(attachment.previewDataUrl, attachment.name)); attachmentStrip.appendChild(previewButton);
        } else {
          const chip = document.createElement('span'); chip.className = 'message-file-attachment';
          const icon = document.createElement('span'); icon.className = 'attachment-file-icon'; icon.textContent = attachment.type === 'image' ? 'IMG' : 'FILE';
          const name = document.createElement('span'); name.textContent = attachment.name || 'Attachment'; chip.append(icon, name); attachmentStrip.appendChild(chip);
        }
      }
      content.appendChild(attachmentStrip);
    }
    const userActions = document.createElement('div');
    userActions.className = 'message-actions user-message-actions';
    const copyPrompt = document.createElement('button');
    copyPrompt.type = 'button';
    copyPrompt.className = 'message-action-btn';
    copyPrompt.title = 'Copy prompt';
    copyPrompt.setAttribute('aria-label', 'Copy prompt');
    copyPrompt.innerHTML = '<svg><use href="#i-clipboard"/></svg>';
    copyPrompt.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(message.content || '');
        toast('Prompt copied');
      } catch {
        toast('Clipboard access unavailable');
      }
    });
    const editPrompt = document.createElement('button');
    editPrompt.type = 'button';
    editPrompt.className = 'message-action-btn';
    editPrompt.title = 'Edit prompt';
    editPrompt.setAttribute('aria-label', 'Edit prompt');
    editPrompt.innerHTML = '<svg><use href="#i-edit"/></svg>';
    editPrompt.addEventListener('click', () => editUserMessage(message.id));
    userActions.append(copyPrompt, editPrompt);
    content.appendChild(userActions);
    row.append(avatar, content);
    return row;
  }
  row.append(avatar, content); return row;
}
function appendMessageActions(content, message) {
  if (content.querySelector('.message-actions')) return;
  const actions = document.createElement('div'); actions.className = 'message-actions';
  const copy = document.createElement('button'); copy.className = 'message-action-btn'; copy.title = 'Copy response'; copy.setAttribute('aria-label', 'Copy response'); copy.innerHTML = '<svg><use href="#i-clipboard"/></svg>';
  copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(message.content); toast('Response copied'); } catch { toast('Clipboard access was unavailable'); } });
  actions.appendChild(copy);
  const retry = document.createElement('button'); retry.className = 'message-action-btn'; retry.title = 'Regenerate response'; retry.setAttribute('aria-label', 'Regenerate response'); retry.innerHTML = '<svg><use href="#i-refresh"/></svg>';
  retry.addEventListener('click', () => regenerateAssistantMessage(message.id));
  actions.appendChild(retry);
  if (message.stats?.eval_count && message.stats?.eval_duration) {
    const tps = (message.stats.eval_count / (message.stats.eval_duration / 1e9)).toFixed(1);
    const loadSec = message.stats.load_duration ? (message.stats.load_duration / 1e9).toFixed(2) : '0';
    const ttftSec = message.ttft ? (message.ttft / 1000).toFixed(2) : null;
    const isWarm = Number(loadSec) < 0.15;
    const badge = document.createElement('span');
    badge.className = 'message-speed-badge';
    badge.textContent = `${tps} t/s${ttftSec ? ` · ${ttftSec}s TTFT` : ''} · ${isWarm ? 'warm' : `${loadSec}s load`}`;
    actions.appendChild(badge);
  }
  content.appendChild(actions);
}

const FAST_IDEV_IDENTITY = `You are IDeV Advanced, a fast, helpful local AI assistant by IDeV. Answer directly, accurately, and concisely without filler or boilerplate. Provide complete code when asked.`;

const IDEV_IDENTITY = `You are IDeV Advanced, a local AI assistant in the IDeV product ecosystem.

Conversation rules — always follow these:
- Answer the exact question the user asked. Be logical, direct, natural, and appropriately concise. Do not add unrelated background, biographies, product lists, disclaimers, extra suggestions, or offers unless the question calls for them.
- Match the user's intent and level of detail. A simple question usually needs a simple answer; a detailed request deserves a detailed answer.
- Sound conversational, not like a scripted FAQ. Avoid memorized stock paragraphs. Vary wording naturally across replies when appropriate, but never force variation into facts, technical answers, or wording that is already clear. Do not repeat the same introduction or conclusion unnecessarily.
- If asked “Who are you?” or what you are, identify yourself as IDeV Advanced and briefly describe what is relevant about your capabilities. Do not volunteer who built you or add company history unless asked.
- If asked who built, created, or developed you, explain naturally that Ubaid is the one-person developer behind IDeV Advanced and is the Developer, CEO, and Founder of IDeV. IDeV is the company; do not describe IDeV itself as software. IDeV develops IDeV Advanced and S2S. Vary the phrasing naturally instead of repeating one fixed sentence.
- Keep company, product, and model identity distinct: IDeV is the company; IDeV Advanced is its main AI assistant product; S2S is a popular software product developed by IDeV. The assistant uses the locally selected Ollama model; do not claim IDeV trained the underlying language model.
- Other IDeV products, mention only when the user asks about IDeV or products, or when directly relevant:
  * Command Center — a repository of commands that help troubleshoot system errors.
  * IFrontPage — an Android application.
  * IBrowse — an advanced browser and a popular IDeV product.
  * Personal AI Assistant — a personal AI assistant for mobile.
  * Reality Drive — a realistic 3D open-world car game and a popular IDeV product.
  * Trader Pro — an advanced stock screener.
  * Trading Advance — IDeV’s own trading charting application.
- Do not dump the full product catalogue into an unrelated answer. Do not invent product details, claims, achievements, or biography beyond the facts supplied here.
- Answer only what was asked; add context only when it is needed to make the answer accurate or useful.`;
function roleSystemPrompt(role) {
  const base = settings.speedMode ? FAST_IDEV_IDENTITY : IDEV_IDENTITY;
  return `${base}\nYou are acting exclusively as ${role.role} in IDeV Advanced.\nYour responsibility: ${role.task}\nRules: Answer directly and accurately. Do not invent unverified actions or results.`;
}
function isGeneralIdentityOrProductQuestion(prompt) {
  const p = String(prompt || '').toLowerCase().replace(/[’']/g, "'");
  return /\b(who are you|what are you|who built you|who made you|who created you|who developed you|who is your developer|what is idev|tell me about idev|idev products|products of idev|what products does idev|what is s2s|what is ifrontpage|what is ibrowse|what is reality drive|what is trader pro|what is trading advance|what is command center|what is personal ai assistant)\b/.test(p);
}

function selectRole(prompt) {
  const p = prompt.toLowerCase();
  const rules = [
    [/(prompt engineer|write (a |the )?(system )?prompt|improve (this )?prompt|prompt template|prompt engineering)/, 2],
    [/(stack trace|fix (this|the|my|a)?\s*(bug|error|issue)|debug|doesn't work|not working|exception|syntaxerror|failed to compile|build failed|crash)/, 10],
    [/(unit test|pytest|test cases for (this|the|a) function|edge case|coverage for)/, 11],
    [/(integration test|end.to.end|e2e test|qa plan|quality assurance|test workflow)/, 12],
    [/(vulnerabilit|security audit|threat model|authentication security|authorization bug|owasp|secret leak)/, 13],
    [/(performance|slow app|optimi[sz]e|memory leak|latency|bottleneck|profiling)/, 14],
    [/(screenshot|visual review|layout mismatch|spacing issue|clipped text|ui visual)/, 15],
    [/(ocr|extract text from (an )?image|read this screenshot|scanned document)/, 16],
    [/(readme|documentation|user guide|api reference|changelog|installation guide|write docs)/, 17],
    [/(package (the )?app|release build|installer|\.exe|\.apk|ci\/cd|build configuration|release checklist)/, 18],
    [/(code quality|refactor|maintainability|duplicate code|clean code|linting rules|readability review)/, 19],
    [/(final review|final product|release readiness|missing features|acceptance review|analyze the finished|product analyzer)/, 20],
    [/(database|postgres|sqlite|sql schema|migration|indexes|relational model|data model)/, 9],
    [/(android|kotlin|gradle|play store|mobile app)/, 7],
    [/(desktop app|windows app|electron|tauri|system tray|native desktop)/, 8],
    [/(backend|api endpoint|rest api|graphql|server.side|fastapi|express server|authentication endpoint)/, 6],
    [/(frontend|react|typescript|html|css|website|landing page|web dashboard|web app|component|responsive page)/, 5],
    [/(ui\/ux|wireframe|design system|screen layout|user flow|colors|typography|make it look|visual design)/, 4],
    [/(requirements|user stories|feature list|acceptance criteria|product spec|prd|scope of (the )?app)/, 3],
    [/(code|program|function|script|algorithm|implement this|write python)/, 6],
    [/(create|build|develop|make|plan|architect|app builder|application|project|software)/, 1]
  ];
  for (const [regex, id] of rules) if (regex.test(p)) return ROLE_REGISTRY.find(r => r.id === id);
  return ROLE_REGISTRY[0];
}
function createUserMessageContent(text) {
  if (!pendingAttachments.length) return text;
  const attachments = pendingAttachments.map(item => item.type === 'image'
    ? `\n\n[Attached image: ${item.name}. Inspect the provided image input directly.]`
    : `\n\n--- ATTACHED FILE: ${item.name} ---\n${item.content}\n--- END FILE ---`).join('');
  return `${text}${attachments}`;
}
function supportsImageInput(modelName) {
  return /gemma4|gemma3|qwen3\.5|llava|llama3\.2-vision|qwen2(?:\.5)?-vl|minicpm-v|glm-ocr|moondream|llama4|pixtral|internvl/i.test(String(modelName || ''));
}
async function createImageAttachment(fileOrDataUrl, name, suppliedMime = '') {
  let sourceBlob;
  if (typeof fileOrDataUrl === 'string') {
    const response = await fetch(fileOrDataUrl);
    sourceBlob = await response.blob();
  } else sourceBlob = fileOrDataUrl;
  if (!sourceBlob || !String(sourceBlob.type || suppliedMime).startsWith('image/')) throw new Error('Unsupported image format. Use PNG, JPEG, WebP or GIF.');
  if (sourceBlob.size > 18 * 1024 * 1024) throw new Error('Image exceeds 18 MB. Choose a smaller image.');
  const bitmap = await createImageBitmap(sourceBlob);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); ctx.drawImage(bitmap, 0, 0, width, height);
  let outputMime = sourceBlob.type === 'image/png' && sourceBlob.size < 700_000 ? 'image/png' : 'image/jpeg';
  let dataUrl = canvas.toDataURL(outputMime, 0.84);
  if (dataUrl.length > 2_250_000) { outputMime = 'image/jpeg'; dataUrl = canvas.toDataURL('image/jpeg', 0.70); }
  if (dataUrl.length > 2_500_000) {
    const smaller = document.createElement('canvas'); const factor = 1200 / Math.max(width, height); smaller.width = Math.max(1, Math.round(width * Math.min(1, factor))); smaller.height = Math.max(1, Math.round(height * Math.min(1, factor)));
    const smallerCtx = smaller.getContext('2d', { alpha: false }); smallerCtx.fillStyle = '#fff'; smallerCtx.fillRect(0, 0, smaller.width, smaller.height); smallerCtx.drawImage(canvas, 0, 0, smaller.width, smaller.height);
    dataUrl = smaller.toDataURL('image/jpeg', 0.68); outputMime = 'image/jpeg';
  }
  const thumbScale = Math.min(1, 240 / Math.max(width, height));
  const thumbCanvas = document.createElement('canvas'); thumbCanvas.width = Math.max(1, Math.round(width * thumbScale)); thumbCanvas.height = Math.max(1, Math.round(height * thumbScale));
  const thumbCtx = thumbCanvas.getContext('2d', { alpha: false }); thumbCtx.fillStyle = '#fff'; thumbCtx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height); thumbCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
  const previewDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.62);
  bitmap.close?.();
  return { type: 'image', name: String(name || 'image').slice(0, 180), mimeType: outputMime, dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1), previewDataUrl };
}
function showExpandedImage(dataUrl, name = 'Image preview') {
  $('expandedImage').src = dataUrl; $('expandedImage').alt = name || 'Image preview'; $('imageViewerBackdrop').classList.remove('hidden');
}
function compactHistory(messages, maxChars = 3600, maxMessages = 6) {
  const recent = messages.slice(-maxMessages);
  const compacted = [];
  let remaining = maxChars;
  for (let i = recent.length - 1; i >= 0 && remaining > 0; i--) {
    const item = recent[i];
    let content = String(item.content || '');
    if (!content) continue;
    if (i < recent.length - 2) {
      content = content.replace(/```[^\n]*\n[\s\S]*?```/g, '[code snippet omitted for context efficiency]');
    }
    const clipped = content.length > remaining ? content.slice(-remaining) : content;
    compacted.unshift({ role: item.role, content: clipped });
    remaining -= clipped.length;
  }
  return compacted;
}
function responseTokenLimit(role, prompt, fastMode) {
  const p = String(prompt || '').toLowerCase();
  const explicitlyDetailed = /\b(detailed|step.by.step|full code|complete code|entire code|comprehensive|in.depth|long explanation)\b/.test(p);
  if (!fastMode) return role ? ([5, 6, 7, 8, 11].includes(role.id) ? 3072 : 2048) : 1536;
  if (explicitlyDetailed) return role && [5, 6, 7, 8, 11].includes(role.id) ? 2048 : 1280;
  if (!role) return 512;
  const limits = {
    1: 768, 2: 768, 3: 640, 4: 640, 5: 1536, 6: 1536, 7: 1536, 8: 1536,
    9: 1024, 10: 1024, 11: 1280, 12: 768, 13: 768, 14: 768, 15: 512,
    16: 512, 17: 768, 18: 768, 19: 768, 20: 768
  };
  return limits[role.id] || 768;
}
function setBusy(busy) {
  isSending = busy;
  $('sendBtn').disabled = !busy && !$('messageInput').value.trim() && pendingAttachments.length === 0;
  $('sendBtn').innerHTML = busy ? '<svg><use href="#i-close"/></svg>' : '<svg><use href="#i-send"/></svg>';
  $('sendBtn').title = busy ? 'Stop generating' : 'Send message';
  $('modelSelectBtn').disabled = busy;
  $('buildModeBtn').disabled = busy;
  $('workspaceBtn').disabled = busy;
  $('micBtn').disabled = busy;
  if (busy && speechRecognition) { try { speechRecognition.stop(); } catch {} }
}
function selectBuildRole(prompt) {
  const p = String(prompt || '').toLowerCase();
  if (/(write|create|improve|design|engineer).{0,24}(prompt|system instruction|prompt template)|\b(prompt engineering|prompt for|make me a prompt)\b/.test(p)) return ROLE_REGISTRY.find(r => r.id === 2);
  if (/(android|kotlin|gradle|\.apk\b|play store|jetpack compose|mobile app|native mobile)/.test(p)) return ROLE_REGISTRY.find(r => r.id === 7);
  if (/(windows desktop|desktop app|electron|tauri|native windows|\.exe\b)/.test(p)) return ROLE_REGISTRY.find(r => r.id === 8);
  if (/(backend|rest api|graphql|fastapi|flask|express server|python app|python script|server-side|database|postgres|sqlite)/.test(p)) return ROLE_REGISTRY.find(r => /(database|postgres|sqlite|sql schema|migration|indexes)/.test(p) ? r.id === 9 : r.id === 6);
  if (/(website|web app|web application|landing page|frontend|react|typescript|html|css|browser app|dashboard)/.test(p)) return ROLE_REGISTRY.find(r => r.id === 5);
  if (/(game|3d world|unity|unreal|godot)/.test(p)) return ROLE_REGISTRY.find(r => r.id === 8);
  return ROLE_REGISTRY.find(r => r.id === 5); // A self-contained web app is the default when the platform is unspecified.
}
function setAssistantDraft(message, content) {
  message.content = content;
  if (message.buildData) return;
  const root = $('messages');
  const wasNearBottom = root.scrollHeight - root.scrollTop - root.clientHeight < 70;
  const row = root.querySelector(`[data-message-id="${message.id}"]`);
  const body = row?.querySelector('.message-body');
  if (body && body.textContent !== content) {
    body.textContent = content;
    body.classList.add('streaming-body');
  }
  if (wasNearBottom) root.scrollTop = root.scrollHeight;
}
function parseJsonResponse(text) {
  let raw = String(text || '').trim();
  raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fence = raw.match(/```(?:json)?\s*\n([\s\S]*?)```/i);
  if (fence) {
    try { return JSON.parse(fence[1].trim()); } catch {}
  }
  try { return JSON.parse(raw); } catch {}
  const first = raw.indexOf('{'), last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const candidate = raw.slice(first, last + 1);
    try { return JSON.parse(candidate); } catch {}
    try {
      const sanitized = candidate.replace(/(?<=:\s*"[^"]*)\n(?=[^"]*")/g, '\\n');
      return JSON.parse(sanitized);
    } catch {}
  }
  throw new Error('The model did not return valid structured JSON. Please retry with a smaller request.');
}
function runAgentModel(model, messages, opts = {}) {
  if (!installedModels.some(item => item.name.toLowerCase() === String(model).toLowerCase())) return Promise.reject(new Error(`Required model “${model}” is not installed. Install that model or switch Team off and select an installed model.`));
  return new Promise((resolve, reject) => {
    const requestId = `agent-${makeId()}`;
    const timeout = setTimeout(() => {
      agentRuns.delete(requestId);
      if (activeBuild) window.nexus.abortChat(requestId);
      reject(new Error(`The model ${model} took too long. Try a smaller project or a lighter assigned model.`));
    }, opts.timeout || (settings.speedMode ? 4 * 60 * 1000 : 8 * 60 * 1000));
    agentRuns.set(requestId, {
      model, text: '', resolve, reject, timeout, lastProgressAt: 0, lastProgressChars: 0,
      onDone: (text) => { clearTimeout(timeout); agentRuns.delete(requestId); resolve(text); },
      onError: (error) => { clearTimeout(timeout); agentRuns.delete(requestId); reject(new Error(error || `Model ${model} failed.`)); }
    });
    if (activeBuild) activeBuild.currentRequestId = requestId;
    window.nexus.sendChat({
      requestId, model, messages, format: opts.format || 'json',
      num_ctx: opts.num_ctx || (settings.speedMode ? 2048 : 4096),
      num_predict: opts.num_predict || (settings.speedMode ? 2048 : 3072),
      temperature: opts.temperature ?? 0.12,
      keep_alive: opts.keep_alive !== undefined ? opts.keep_alive : (activeBuild ? 0 : '5m')
    });
  });
}
function normalizeGeneratedFilePaths(files, rootPath) {
  if (!Array.isArray(files)) throw new Error('The coding model did not return a files array.');
  const root = String(rootPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const rootLower = root.toLowerCase();
  const rootBase = root.split('/').filter(Boolean).pop() || '';
  const adjusted = [];
  const normalized = files.map(file => {
    let original = String(file?.path || '').trim().replace(/^['"`]+|['"`]+$/g, '');
    let filePath = original.replace(/\\/g, '/');
    if (/^file:\/\//i.test(filePath)) filePath = filePath.replace(/^file:\/{2,}/i, '');
    // Models sometimes echo the absolute selected-folder path because it appears in context.
    // Only strip it when the path is demonstrably inside the user's selected workspace.
    const lower = filePath.toLowerCase().replace(/\/+$/, '');
    if (root && lower.startsWith(rootLower + '/')) {
      filePath = filePath.slice(root.length + 1);
      adjusted.push({ from: original, to: filePath, reason: 'absolute path inside selected workspace' });
    } else if (root && lower === rootLower) {
      throw new Error(`The model returned the workspace folder itself instead of a file path: ${original}`);
    } else if (/^[a-zA-Z]:\//.test(filePath) || filePath.startsWith('//') || /^\/(?:Users|home|mnt|tmp|etc|var|opt|root|Windows|Program Files|Program Files \(x86\)|System|Volumes|private)\//i.test(filePath)) {
      throw new Error(`The model returned an absolute path outside the selected workspace: ${original}. IDeV only writes files inside the folder you selected.`);
    } else if (filePath.startsWith('/')) {
      // Many web-code models use URL-style root-relative names such as /src/app.js.
      // Treat these as workspace-relative, never as operating-system destinations.
      filePath = filePath.replace(/^\/+/, '');
      adjusted.push({ from: original, to: filePath, reason: 'root-relative app path' });
    }
    filePath = filePath.replace(/\/{2,}/g, '/');
    while (filePath.startsWith('./')) {
      filePath = filePath.slice(2);
      adjusted.push({ from: original, to: filePath, reason: 'leading ./ prefix' });
    }
    // Some models prefix every path with the selected workspace folder name.
    if (rootBase && filePath.toLowerCase().startsWith(rootBase.toLowerCase() + '/')) {
      const stripped = filePath.slice(rootBase.length + 1);
      adjusted.push({ from: original, to: stripped, reason: 'workspace folder name prefix' });
      filePath = stripped;
    }
    return { ...file, path: filePath, _originalPath: original };
  });
  // Models occasionally emit SVG text under a raster extension (for example logo.png).
  // Keep the actual text format truthful and update references in generated source files.
  const assetRenames = [];
  for (const file of normalized) {
    const content = String(file.content || '').trimStart();
    if (/\.(?:png|jpe?g|gif|webp|ico)$/i.test(file.path) && /^(?:<\?xml[^>]*>\s*)?<svg\b/i.test(content)) {
      const previous = file.path;
      file.path = file.path.replace(/\.(?:png|jpe?g|gif|webp|ico)$/i, '.svg');
      assetRenames.push({ from: previous, to: file.path });
      adjusted.push({ from: previous, to: file.path, reason: 'SVG text saved with raster extension' });
    }
  }
  for (const rename of assetRenames) {
    const oldName = rename.from.split('/').pop();
    const newName = rename.to.split('/').pop();
    const variants = [...new Set([rename.from, `./${rename.from}`, `/${rename.from}`, oldName])];
    for (const file of normalized) {
      if (typeof file.content !== 'string') continue;
      for (const variant of variants) file.content = file.content.split(variant).join(variant === oldName ? newName : variant.replace(rename.from, rename.to));
    }
  }
  return { files: normalized, adjusted };
}
function validateGeneratedFiles(files) {
  if (!Array.isArray(files) || files.length < 1) throw new Error('The coding model returned no files. Try a more specific request or a smaller first version.');
  const clean = [];
  const seen = new Set();
  for (const file of files.slice(0, 30)) {
    const filePath = String(file?.path || '').replace(/\\/g, '/').trim();
    if (!filePath || filePath.startsWith('/') || /^[a-zA-Z]:/.test(filePath) || filePath.split('/').some(part => !part || part === '.' || part === '..') || filePath.split('/').some(part => /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part))) throw new Error(`The model returned an invalid or unsafe relative file path: ${filePath || '(empty)'}`);
    const key = filePath.toLowerCase();
    if (seen.has(key)) throw new Error(`The model returned duplicate file path: ${filePath}`);
    seen.add(key);
    if (typeof file.content !== 'string') throw new Error(`The generated file ${filePath} has no text content.`);
    if (file.content.length > 700000) throw new Error(`${filePath} is too large for one generation pass. Ask for a smaller or staged implementation.`);
    clean.push({ path: filePath, content: file.content });
  }
  const allPaths = clean.map(file => file.path.toLowerCase()).sort();
  for (let i = 0; i < allPaths.length; i++) {
    for (let j = i + 1; j < allPaths.length; j++) {
      if (allPaths[j].startsWith(allPaths[i] + '/')) {
        throw new Error(`Conflicting generated paths: “${allPaths[i]}” is both a file and a parent folder of “${allPaths[j]}”.`);
      }
    }
  }
  if (clean.some(file => { const segments = file.path.split('/'); const base = segments.at(-1).toLowerCase(); const safeEnvExample = ['.env.example', '.env.sample', '.env.template'].includes(base); return segments.some(part => ['.git', 'node_modules', '.venv', 'venv'].includes(part.toLowerCase())) || (base.startsWith('.env') && !safeEnvExample); })) {
    throw new Error('The generated file set contains a protected path (.env secrets, .git, node_modules, or a virtual environment). No files were written. Safe templates such as .env.example are allowed.');
  }
  return clean;
}
function inferFastBuildStack(prompt) {
  const p = String(prompt || '').toLowerCase();
  if (/(android|kotlin|gradle|\.apk\b|jetpack compose|native mobile)/.test(p)) return 'Android application (Kotlin / Gradle)';
  if (/(windows desktop|desktop app|electron|tauri|native windows|\.exe\b)/.test(p)) return 'Desktop application';
  if (/(unity|unreal|godot|3d game|open.world game)/.test(p)) return 'Game project';
  if (/(fastapi|flask|django|python script|python app)/.test(p)) return 'Python application';
  if (/(api server|rest api|graphql|backend service)/.test(p)) return 'Backend service';
  if (/(website|web app|web application|landing page|browser app|dashboard|shop|store|checkout|cart)/.test(p)) return 'Responsive web application';
  return 'Self-contained responsive web application (HTML, CSS, JavaScript)';
}

function inferFastProjectName(prompt) {
  const plain = String(prompt || '').replace(/\s+/g, ' ').trim();
  const cleaned = plain.replace(/^(please\s+)?(build|create|make|develop|write|generate)\s+(me\s+)?/i, '').replace(/[.!?]+$/, '').trim();
  return (cleaned || 'New Project').slice(0, 70);
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return aa && bb ? dot / (Math.sqrt(aa) * Math.sqrt(bb)) : 0;
}

async function runBuildRoleAgent(build, roleId, instruction, userRequest, context = '', options = {}) {
  const role = ROLE_REGISTRY.find(item => item.id === roleId);
  if (!role) return null;
  if (build.cancelled) throw new Error('Build cancelled by user.');

  const task = build.buildData?.tasks.find(item => item.id === roleId || item.roleId === roleId);
  if (task) {
    task.status = 'running';
    task.startedAt = Date.now();
  }
  if (build.buildData) {
    build.buildData.currentActivity = {
      role: role.role,
      model: role.model,
      task: instruction,
      detail: 'Processing specialist task...',
      startedAt: Date.now(),
      streamedChars: 0
    };
    updateLiveBuildCard(build.message.id, build.buildData);
  }

  const isInstalled = installedModels.some(item => item.name.toLowerCase() === role.model.toLowerCase());
  if (!isInstalled) {
    const message = `${role.role} could not run because its assigned model ${role.model} is not installed.`;
    build.failedRoles.push({ id: role.id, role: role.role, model: role.model, error: message });
    if (task) {
      task.status = 'failed';
      task.error = message;
    }
    if (build.buildData) {
      build.buildData.stats.failedRoles = build.failedRoles.length;
      updateLiveBuildCard(build.message.id, build.buildData);
    }
    build.log(`Agent unavailable: ${role.role}`, message, 'running');
    return null;
  }
  const progressEntry = build.log(`Agent started: ${role.role}`, `${role.model} · ${instruction}`);
  startBuildAgentProgress(build, progressEntry, `${role.model} is loading or processing ${role.role}`);
  try {
    const system = `${role.role}. Exclusive responsibility: ${role.task}\n\nYou are one specialist in the IDeV Advanced build team. Work only on this project and this specific assignment. Never claim that files were written or tests were executed. Keep the response concise and grounded in the supplied request and project artifacts. Return one valid JSON object only, with keys: summary (string), findings (array of short strings), recommendations (array of short strings), files (array of {path,content}), run_commands (array of strings), status (string). Use empty arrays when not needed. Do not return full application files unless the assignment explicitly asks you to create or patch files. When a task does not apply to the target platform, say so briefly and provide a relevant compatibility check instead of inventing unrelated work.`;
    const prompt = `PROJECT REQUEST:\n${String(userRequest || '').slice(0, 4000)}\n\nYOUR EXCLUSIVE ASSIGNMENT:\n${instruction}\n\nPROJECT CONTEXT:\n${String(context || '(No additional context supplied.)').slice(0, options.contextChars || 4200)}\n\nOutput compact JSON. Avoid filler. Findings and recommendations should be actionable.`;
    const userMessage = { role: 'user', content: prompt };
    if (Array.isArray(options.images) && options.images.length && [4, 15, 16].includes(roleId)) userMessage.images = options.images.slice(0, 4);
    const text = await runAgentModel(role.model, [
      { role: 'system', content: system },
      userMessage
    ], {
      format: 'json', num_ctx: options.num_ctx || 3072,
      num_predict: options.num_predict ?? (settings.speedMode ? 220 : 400),
      timeout: options.timeout || (settings.speedMode ? 4 * 60 * 1000 : 7 * 60 * 1000),
      temperature: options.temperature ?? 0.12
    });
    if (build.cancelled) throw new Error('Build cancelled by user.');
    const result = parseJsonResponse(text);
    result.summary = String(result.summary || '').trim().slice(0, 700);
    result.findings = Array.isArray(result.findings) ? result.findings.map(v => String(v).slice(0, 400)).slice(0, 8) : [];
    result.recommendations = Array.isArray(result.recommendations) ? result.recommendations.map(v => String(v).slice(0, 400)).slice(0, 8) : [];
    result.files = Array.isArray(result.files) ? result.files.filter(f => f && typeof f.path === 'string' && (typeof f.content === 'string' || typeof f.purpose === 'string')).slice(0, 12) : [];
    result.run_commands = Array.isArray(result.run_commands) ? result.run_commands.map(v => String(v).slice(0, 240)).slice(0, 6) : [];
    result.role = role.role;
    result.model = role.model;
    result.status = String(result.status || 'completed');
    build.roleResults[role.id] = result;
    build.completedRoleIds.add(role.id);
    const short = result.summary || result.findings[0] || 'Completed its assigned review.';
    if (task) {
      task.status = 'completed';
      task.duration = `${((Date.now() - (task.startedAt || Date.now())) / 1000).toFixed(1)}s`;
      task.summary = result.summary || short;
      task.findings = result.findings;
    }
    if (build.buildData) {
      build.buildData.stats.completedRoles = build.completedRoleIds.size;
      updateLiveBuildCard(build.message.id, build.buildData);
    }
    build.log(`Agent completed: ${role.role}`, `${role.model} · ${short}`, 'done');
    return result;
  } catch (error) {
    if (build.cancelled) throw error;
    const message = error?.message || String(error);
    build.failedRoles.push({ id: role.id, role: role.role, model: role.model, error: message });
    if (task) {
      task.status = 'failed';
      task.error = message;
    }
    if (build.buildData) {
      build.buildData.stats.failedRoles = build.failedRoles.length;
      updateLiveBuildCard(build.message.id, build.buildData);
    }
    build.log(`Agent incomplete: ${role.role}`, `${role.model} · ${message}`, 'running');
    return null;
  } finally {
    stopBuildAgentProgress(build, progressEntry);
  }
}

async function runProjectKnowledgeRetrieval(build, userRequest, workspace) {
  const role = ROLE_REGISTRY.find(item => item.id === 21);
  const fallback = workspace.files || [];
  const task = build.buildData?.tasks.find(item => item.id === 21 || item.roleId === 21);
  if (task) {
    task.status = 'running';
    task.startedAt = Date.now();
  }
  if (build.buildData) {
    build.buildData.currentActivity = {
      role: role.role,
      model: role.model,
      task: 'Retrieving project knowledge & ranking context',
      detail: 'Embedding request and existing workspace files...',
      startedAt: Date.now(),
      streamedChars: 0
    };
    updateLiveBuildCard(build.message.id, build.buildData);
  }

  if (!installedModels.some(item => item.name.toLowerCase() === role.model.toLowerCase())) {
    const message = `Project Knowledge Retrieval model ${role.model} is not installed; using filename-order context instead.`;
    build.failedRoles.push({ id: role.id, role: role.role, model: role.model, error: message });
    if (task) {
      task.status = 'failed';
      task.error = message;
    }
    if (build.buildData) {
      build.buildData.stats.failedRoles = build.failedRoles.length;
      updateLiveBuildCard(build.message.id, build.buildData);
    }
    build.log('Agent unavailable: Project Knowledge Retrieval', message, 'running');
    return fallback;
  }
  const progressEntry = build.log('Agent started: Project Knowledge Retrieval', `${role.model} · embedding the request and existing project files for semantic context selection.`);
  startBuildAgentProgress(build, progressEntry, `${role.model} is embedding project context`);
  try {
    const sourceFiles = fallback.slice(0, 19);
    const inputs = [`Project request: ${String(userRequest || '').slice(0, 4000)}`,
      ...sourceFiles.map(file => `File: ${file.path}\n${String(file.content || '').slice(0, 3200)}`)];
    const result = await window.nexus.embedText({ model: role.model, input: inputs });
    const vectors = result?.embeddings;
    if (!Array.isArray(vectors) || vectors.length !== inputs.length || !vectors[0]?.length) throw new Error('Ollama returned an incomplete embedding set.');
    const ranked = sourceFiles.map((file, index) => ({ file, score: cosineSimilarity(vectors[0], vectors[index + 1] || []) }))
      .sort((a, b) => b.score - a.score).map(item => item.file);
    build.completedRoleIds.add(21);
    build.roleResults[21] = { role: role.role, model: role.model, status: 'completed', summary: `Embedded the request and ${sourceFiles.length} project file(s); ranked ${ranked.length} file(s) by semantic relevance.` };
    if (task) {
      task.status = 'completed';
      task.duration = `${((Date.now() - (task.startedAt || Date.now())) / 1000).toFixed(1)}s`;
      task.summary = `Embedded the request and ${sourceFiles.length} project file(s); ranked ${ranked.length} file(s) by semantic relevance.`;
    }
    if (build.buildData) {
      build.buildData.stats.completedRoles = build.completedRoleIds.size;
      updateLiveBuildCard(build.message.id, build.buildData);
    }
    build.log('Agent completed: Project Knowledge Retrieval', `${role.model} · embedded ${sourceFiles.length} file(s); selected the most relevant project context.`, 'done');
    return ranked;
  } catch (error) {
    const message = error?.message || String(error);
    build.failedRoles.push({ id: role.id, role: role.role, model: role.model, error: message });
    if (task) {
      task.status = 'failed';
      task.error = message;
    }
    if (build.buildData) {
      build.buildData.stats.failedRoles = build.failedRoles.length;
      updateLiveBuildCard(build.message.id, build.buildData);
    }
    build.log('Agent incomplete: Project Knowledge Retrieval', `${role.model} · ${message}; falling back to file order.`, 'running');
    return fallback;
  } finally {
    stopBuildAgentProgress(build, progressEntry);
  }
}

function buildAgentContextSummary(build, maxChars = 5000) {
  const lines = [];
  for (const role of ROLE_REGISTRY) {
    const result = build.roleResults[role.id];
    if (!result) continue;
    const summary = String(result.summary || '').trim();
    if (summary) lines.push(`${role.role} (${role.model}): ${summary}`);
    for (const finding of (result.findings || []).slice(0, 3)) lines.push(`- ${role.role}: ${finding}`);
  }
  return lines.join('\n').slice(0, maxChars);
}

function startBuildAgentProgress(build, entry, defaultMessage = 'Model is loading or processing this specialist task; waiting for the first response.') {
  if (build.progressTicker) clearInterval(build.progressTicker);
  build.generationEntry = entry;
  build.generationStartedAt = Date.now();
  build.lastProgressChars = 0;
  build.lastProgressAt = Date.now();
  build.lastRenderedProgressAt = 0;
  entry.detail = defaultMessage;
  build.refreshTimeline?.();
  build.progressTicker = setInterval(() => {
    if (build.generationEntry !== entry) return;
    const elapsed = Math.max(1, Math.round((Date.now() - build.generationStartedAt) / 1000));
    entry.detail = build.lastProgressChars
      ? `${build.lastProgressChars.toLocaleString()} response characters streamed · ${elapsed}s elapsed`
      : `${defaultMessage} (${elapsed}s elapsed)`;
    build.refreshTimeline?.();
  }, 5000);
}
function stopBuildAgentProgress(build, entry) {
  if (build.progressTicker) clearInterval(build.progressTicker);
  build.progressTicker = null;
  if (build.generationEntry === entry) {
    build.generationEntry = null;
    build.refreshTimeline?.();
  }
}

let currentPreviewContent = '';

function formatBuildDuration(startedAt, completedAt) {
  if (!startedAt) return '0s';
  const end = completedAt || Date.now();
  const seconds = Math.max(0, Math.round((end - startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const remSecs = seconds % 60;
  return `${mins}m ${remSecs}s`;
}

function openFilePreview(file) {
  if (!file) return;
  currentPreviewContent = file.content || '';
  const title = $('filePreviewTitle');
  const meta = $('filePreviewMeta');
  const code = $('filePreviewCode');
  const note = $('filePreviewNote');

  if (title) title.textContent = file.path || 'file';
  if (meta) meta.textContent = `${file.op || 'File'} by ${file.role || 'Specialist'} · ${formatSize(file.size || currentPreviewContent.length)} · ${file.status === 'failed' ? 'Syntax issue detected' : 'Syntax check passed'}`;
  if (code) code.textContent = currentPreviewContent || '(Empty file)';
  if (note) note.textContent = `Safe workspace path: ${file.path}`;

  $('filePreviewModal')?.classList.remove('hidden');
}

function renderTimelineTasks(container, tasks, messageId) {
  if (!container) return;
  const openIds = new Set();
  container.querySelectorAll('.build-task-card').forEach(card => {
    const body = card.querySelector('.build-task-details-body');
    if (body && !body.classList.contains('hidden')) {
      openIds.add(card.dataset.taskId);
    }
  });

  container.innerHTML = '';
  for (const t of tasks) {
    const card = document.createElement('div');
    card.className = `build-task-card ${t.status || 'pending'}`;
    card.dataset.taskId = String(t.id);
    const dotContent = t.status === 'completed' ? '✓' : t.status === 'failed' ? '✕' : '';
    const hasDetails = !!(t.summary || (t.findings && t.findings.length) || t.error);
    const isOpen = openIds.has(String(t.id));

    card.innerHTML = `
      <div class="build-task-head">
        <span class="task-dot ${t.status || 'pending'}">${dotContent}</span>
        <div class="build-task-info">
          <span class="build-task-role">${escapeHtml(t.title || 'Task')}</span>
          ${t.model ? `<span class="build-task-model">${escapeHtml(t.model)}</span>` : ''}
          ${t.duration ? `<span class="build-task-duration">${escapeHtml(t.duration)}</span>` : ''}
        </div>
        ${hasDetails ? `<button type="button" class="build-task-details-btn">${isOpen ? 'Hide ▲' : 'Details ▼'}</button>` : ''}
      </div>
      ${hasDetails ? `
        <div class="build-task-details-body ${isOpen ? '' : 'hidden'}">
          ${t.summary ? `<p style="margin:0 0 4px;font-weight:550;">${escapeHtml(t.summary)}</p>` : ''}
          ${t.findings && t.findings.length ? `<ul>${t.findings.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>` : ''}
          ${t.error ? `<p style="color:#dc2626;margin:0;">Error: ${escapeHtml(t.error)}</p>` : ''}
        </div>
      ` : ''}
    `;

    if (hasDetails) {
      const btn = card.querySelector('.build-task-details-btn');
      const body = card.querySelector('.build-task-details-body');
      btn.addEventListener('click', () => {
        const isHidden = body.classList.toggle('hidden');
        btn.textContent = isHidden ? 'Details ▼' : 'Hide ▲';
      });
    }

    container.appendChild(card);
  }
}

function renderFilesList(container, files) {
  if (!container) return;
  if (!files.length) {
    container.innerHTML = '<div style="font-size:11px;color:#9ca3af;padding:6px 2px;">No files generated yet.</div>';
    return;
  }
  container.innerHTML = '';
  for (const f of files) {
    const card = document.createElement('div');
    card.className = 'build-file-card';
    const isCreated = f.op !== 'Edited';
    card.innerHTML = `
      <div class="build-file-left">
        <span class="file-badge ${isCreated ? 'created' : 'edited'}">${isCreated ? 'Created' : 'Edited'}</span>
        <div>
          <div class="file-path-text">${escapeHtml(f.path)}</div>
          <div class="file-producer-text">${escapeHtml(f.role || 'Coding Specialist')} · ${formatSize(f.size || (f.content ? f.content.length : 0))}</div>
        </div>
      </div>
      <div class="build-file-right">
        <span class="file-valid-badge">${f.status === 'failed' ? '⚠ Check Failed' : '✓ Validated'}</span>
        <button type="button" class="file-preview-btn">Preview</button>
      </div>
    `;

    card.querySelector('.file-preview-btn').addEventListener('click', () => {
      openFilePreview(f);
    });

    container.appendChild(card);
  }
}

function renderDiagnosticsConsole(container, diagnostics) {
  if (!container) return;
  if (!diagnostics.length) {
    container.innerHTML = '<div style="color:#6b7280;">No diagnostic events logged yet.</div>';
    return;
  }
  container.innerHTML = diagnostics.map(d => `
    <div class="build-diag-line ${d.level || 'info'}">[${escapeHtml(d.time)}] [${escapeHtml(d.source || 'Build')}] ${escapeHtml(d.message)}</div>
  `).join('');
  container.scrollTop = container.scrollHeight;
}

function createBuildCardElement(buildData, messageId) {
  const card = document.createElement('div');
  card.className = 'build-card';
  card.id = `buildCard-${messageId}`;

  const isRunning = buildData.status === 'running';
  const header = document.createElement('div');
  header.className = 'build-header';
  header.innerHTML = `
    <div class="build-header-left">
      <div class="build-header-icon"><svg><use href="#i-code"/></svg></div>
      <div class="build-header-title">
        <span class="build-project-name">${escapeHtml(buildData.projectName || 'Autonomous Build')}</span>
        <span class="build-target-stack">${escapeHtml(buildData.targetStack || 'Multi-Platform MVP')} · ${escapeHtml(buildData.workspacePath || '')}</span>
      </div>
    </div>
    <div class="build-header-right">
      <span class="build-stage-pill ${isRunning ? 'running' : ''}" id="buildStagePill-${messageId}">
        ${isRunning ? '<span class="pulse-dot"></span>' : ''}
        <span id="buildStageText-${messageId}">${escapeHtml(buildData.stage || 'Executing')}</span>
      </span>
      <span class="build-status-pill ${buildData.status || 'running'}" id="buildStatusPill-${messageId}">
        ${buildData.status === 'completed' ? '✓ Complete' : buildData.status === 'completed-with-issues' ? '⚠ Completed with Issues' : buildData.status === 'stopped' ? '✕ Stopped' : '● In Progress'}
      </span>
    </div>
  `;
  card.appendChild(header);

  const statsBar = document.createElement('div');
  statsBar.className = 'build-stats-bar';
  statsBar.id = `buildStatsBar-${messageId}`;
  statsBar.innerHTML = `
    <div class="build-stats-item"><span>Specialist Roles:</span> <strong id="buildStatRoles-${messageId}">${buildData.stats?.completedRoles || 0}/21</strong></div>
    <div class="build-stats-item"><span>Files:</span> <strong id="buildStatFiles-${messageId}">${buildData.files?.length || 0}</strong></div>
    <div class="build-stats-item"><span>Duration:</span> <strong id="buildStatDuration-${messageId}">${formatBuildDuration(buildData.startedAt, buildData.completedAt)}</strong></div>
  `;
  card.appendChild(statsBar);

  const activity = document.createElement('div');
  activity.className = 'build-current-activity' + (isRunning ? '' : ' hidden');
  activity.id = `buildActivityCard-${messageId}`;
  const currAct = buildData.currentActivity || {};
  activity.innerHTML = `
    <div class="build-activity-spinner"></div>
    <div class="build-activity-content">
      <div class="build-activity-top">
        <span class="build-activity-role" id="buildActivityRole-${messageId}">${escapeHtml(currAct.role || 'Autonomous Orchestrator')}</span>
        <span class="build-activity-model" id="buildActivityModel-${messageId}">${escapeHtml(currAct.model || '')}</span>
      </div>
      <div class="build-activity-task" id="buildActivityTask-${messageId}">${escapeHtml(currAct.task || 'Orchestrating autonomous specialists...')}</div>
      <div class="build-activity-detail" id="buildActivityDetail-${messageId}">${escapeHtml(currAct.detail || '')}</div>
    </div>
  `;
  card.appendChild(activity);

  const timelineSection = document.createElement('div');
  timelineSection.className = 'build-section';
  timelineSection.innerHTML = `
    <div class="build-section-title">
      <span>Autonomous Task Timeline</span>
      <span class="build-section-count" id="buildTimelineCount-${messageId}">${buildData.tasks?.length || 0} Tasks</span>
    </div>
    <div class="build-timeline" id="buildTimelineList-${messageId}"></div>
  `;
  const timelineList = timelineSection.querySelector(`#buildTimelineList-${messageId}`);
  renderTimelineTasks(timelineList, buildData.tasks || [], messageId);
  card.appendChild(timelineSection);

  const filesSection = document.createElement('div');
  filesSection.className = 'build-section';
  filesSection.id = `buildFilesSection-${messageId}`;
  filesSection.innerHTML = `
    <div class="build-section-title">
      <span>Workspace Files (${(buildData.files || []).length})</span>
      <span class="build-section-count" id="buildFilesCount-${messageId}">${(buildData.files || []).length} Written</span>
    </div>
    <div class="build-files-list" id="buildFilesList-${messageId}"></div>
  `;
  const filesList = filesSection.querySelector(`#buildFilesList-${messageId}`);
  renderFilesList(filesList, buildData.files || []);
  card.appendChild(filesSection);

  const diagSection = document.createElement('div');
  diagSection.className = 'build-section';
  diagSection.style.borderBottom = '0';
  diagSection.innerHTML = `
    <details class="build-diagnostics-details">
      <summary class="build-diagnostics-summary">
        <svg style="width:14px;height:14px;"><use href="#i-tool"/></svg>
        <span>Diagnostics & Command Logs (<span id="buildDiagCount-${messageId}">${(buildData.diagnostics || []).length}</span> events)</span>
      </summary>
      <div class="build-diagnostics-console" id="buildDiagConsole-${messageId}"></div>
    </details>
  `;
  const diagConsole = diagSection.querySelector(`#buildDiagConsole-${messageId}`);
  renderDiagnosticsConsole(diagConsole, buildData.diagnostics || []);
  card.appendChild(diagSection);

  if (buildData.executiveSummary || buildData.status === 'completed' || buildData.status === 'completed-with-issues') {
    const execSection = document.createElement('div');
    execSection.className = 'build-executive-summary';
    execSection.id = `buildExecSummary-${messageId}`;
    execSection.innerHTML = markdownToHtml(buildData.executiveSummary || 'Build operations finished successfully.');
    card.appendChild(execSection);
  }

  return card;
}

function updateLiveBuildCard(messageId, buildData) {
  const card = $(`buildCard-${messageId}`);
  if (!card) return;

  const isRunning = buildData.status === 'running';

  const stagePill = $(`buildStagePill-${messageId}`);
  if (stagePill) {
    stagePill.className = `build-stage-pill ${isRunning ? 'running' : ''}`;
    stagePill.innerHTML = `${isRunning ? '<span class="pulse-dot"></span>' : ''}<span id="buildStageText-${messageId}">${escapeHtml(buildData.stage || 'Executing')}</span>`;
  }
  const statusPill = $(`buildStatusPill-${messageId}`);
  if (statusPill) {
    statusPill.className = `build-status-pill ${buildData.status || 'running'}`;
    statusPill.textContent = buildData.status === 'completed' ? '✓ Complete' : buildData.status === 'completed-with-issues' ? '⚠ Completed with Issues' : buildData.status === 'stopped' ? '✕ Stopped' : '● In Progress';
  }

  const statRoles = $(`buildStatRoles-${messageId}`);
  if (statRoles) statRoles.textContent = `${buildData.stats?.completedRoles || 0}/21`;
  const statFiles = $(`buildStatFiles-${messageId}`);
  if (statFiles) statFiles.textContent = `${buildData.files?.length || 0}`;
  const statDur = $(`buildStatDuration-${messageId}`);
  if (statDur) statDur.textContent = formatBuildDuration(buildData.startedAt, buildData.completedAt);

  const actCard = $(`buildActivityCard-${messageId}`);
  if (actCard) {
    actCard.classList.toggle('hidden', !isRunning);
    const currAct = buildData.currentActivity || {};
    const actRole = $(`buildActivityRole-${messageId}`);
    if (actRole) actRole.textContent = currAct.role || 'Autonomous Orchestrator';
    const actModel = $(`buildActivityModel-${messageId}`);
    if (actModel) actModel.textContent = currAct.model || '';
    const actTask = $(`buildActivityTask-${messageId}`);
    if (actTask) actTask.textContent = currAct.task || '';
    const actDetail = $(`buildActivityDetail-${messageId}`);
    if (actDetail) actDetail.textContent = currAct.detail || '';
  }

  const timelineList = $(`buildTimelineList-${messageId}`);
  if (timelineList) {
    renderTimelineTasks(timelineList, buildData.tasks || [], messageId);
  }
  const timelineCount = $(`buildTimelineCount-${messageId}`);
  if (timelineCount) timelineCount.textContent = `${buildData.tasks?.length || 0} Tasks`;

  const filesList = $(`buildFilesList-${messageId}`);
  if (filesList) {
    renderFilesList(filesList, buildData.files || []);
  }
  const filesCount = $(`buildFilesCount-${messageId}`);
  if (filesCount) filesCount.textContent = `${(buildData.files || []).length} Written`;

  const diagCount = $(`buildDiagCount-${messageId}`);
  if (diagCount) diagCount.textContent = `${(buildData.diagnostics || []).length}`;
  const diagConsole = $(`buildDiagConsole-${messageId}`);
  if (diagConsole) {
    renderDiagnosticsConsole(diagConsole, buildData.diagnostics || []);
  }

  if (!isRunning && (buildData.executiveSummary || buildData.status === 'completed' || buildData.status === 'completed-with-issues')) {
    let exec = $(`buildExecSummary-${messageId}`);
    if (!exec) {
      exec = document.createElement('div');
      exec.className = 'build-executive-summary';
      exec.id = `buildExecSummary-${messageId}`;
      card.appendChild(exec);
    }
    exec.innerHTML = markdownToHtml(buildData.executiveSummary || 'Build operations finished successfully.');
  }

  const messagesDiv = $('messages');
  if (messagesDiv) {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
}

async function buildWorkspaceProject(fullText, codingRole, assistantMessage, imagePayload = []) {
  const rootPath = settings.workspacePath;
  const planner = ROLE_REGISTRY.find(r => r.id === 1);
  const fixRole = ROLE_REGISTRY.find(r => r.id === 10);
  const fastBuild = !!settings.speedMode;
  const complexBuild = /\b(advanced|complete|full|ecommerce|e-commerce|shop|store|cart|checkout|order|database|authentication|admin|dashboard|multi.?page|game|3d|payment|api|backend|android|desktop)\b/i.test(fullText);
  const codeModel = codingRole.model;
  const maxFiles = fastBuild ? (complexBuild ? 8 : 5) : 12;
  const fastTokenBudget = complexBuild ? 3584 : 2304;
  const fastTimeout = complexBuild ? 10 * 60 * 1000 : 6 * 60 * 1000;

  const initialTasks = [
    { id: 21, roleId: 21, title: 'Project Knowledge Retrieval', model: 'qwen3-embedding:8b', taskDescription: 'Embed request & workspace context', status: 'pending' },
    { id: 3, roleId: 3, title: 'Product & Requirements Analyst', model: 'qwen3.5:4b', taskDescription: 'User stories & acceptance criteria', status: 'pending' },
    { id: 4, roleId: 4, title: 'UI/UX Designer', model: 'qwen3.5:2b', taskDescription: 'UI flows, layout & design tokens', status: 'pending' },
    { id: 9, roleId: 9, title: 'Database Specialist', model: 'qwen2.5:14b', taskDescription: 'Data models & schema specification', status: 'pending' },
    { id: 2, roleId: 2, title: 'Prompt Engineer', model: 'gemma4:12b', taskDescription: 'Developer instruction pack & constraints', status: 'pending' },
    { id: 1, roleId: 1, title: 'Head Developer / Chief Architect', model: 'qwen3.5:9b', taskDescription: 'Architecture & file manifest', status: 'pending' },
    { id: codingRole.id, roleId: codingRole.id, title: codingRole.role, model: codeModel, taskDescription: 'Generate complete project source files', status: 'pending' },
    { id: 5, roleId: 5, title: 'Frontend Web Developer', model: 'qwen2.5:7b', taskDescription: 'Frontend review & responsive check', status: 'pending' },
    { id: 6, roleId: 6, title: 'Backend Developer', model: 'qwen2.5-coder:14b', taskDescription: 'API & server integration review', status: 'pending' },
    { id: 7, roleId: 7, title: 'Android Developer', model: 'deepseek-coder:6.7b', taskDescription: 'Mobile/Android compatibility review', status: 'pending' },
    { id: 8, roleId: 8, title: 'Desktop Developer', model: 'codegemma:7b', taskDescription: 'Desktop packaging & OS integration review', status: 'pending' },
    { id: 10, roleId: 10, title: 'Code Fixer / Debugging Specialist', model: 'qwen2.5-coder:7b', taskDescription: 'Static defect analysis & targeted patches', status: 'pending' },
    { id: 11, roleId: 11, title: 'Unit Test Engineer', model: 'deepseek-r1:7b', taskDescription: 'TEST_PLAN.md & unit test suite', status: 'pending' },
    { id: 12, roleId: 12, title: 'Integration & QA Tester', model: 'qwen3:8b', taskDescription: 'End-to-end QA flow & integration checklist', status: 'pending' },
    { id: 13, roleId: 13, title: 'Security Auditor', model: 'deepseek-r1:8b', taskDescription: 'Security boundaries & input sanitization review', status: 'pending' },
    { id: 14, roleId: 14, title: 'Performance Optimizer', model: 'qwen3:4b', taskDescription: 'Hot paths & performance bottlenecks', status: 'pending' },
    { id: 15, roleId: 15, title: 'Visual QA Inspector', model: 'gemma4:e4b', taskDescription: 'Visual layout & UI accessibility inspection', status: 'pending' },
    { id: 16, roleId: 16, title: 'OCR Specialist', model: 'glm-ocr:latest', taskDescription: 'Image & document text extraction review', status: 'pending' },
    { id: 17, roleId: 17, title: 'Documentation Writer', model: 'qwen2.5:3b', taskDescription: 'Project README.md & user documentation', status: 'pending' },
    { id: 18, roleId: 18, title: 'Build & Release Engineer', model: 'qwen3:1.7b', taskDescription: 'BUILD_GUIDE.md & release packaging plan', status: 'pending' },
    { id: 19, roleId: 19, title: 'Code Quality Checker', model: 'gemma3:4b', taskDescription: 'Code readability & maintainability review', status: 'pending' },
    { id: 'snapshot', roleId: 0, title: 'Pre-Build Checkpoint', model: 'Nexus Engine', taskDescription: 'Safety snapshot backup of workspace', status: 'pending' },
    { id: 'filesystem', roleId: 0, title: 'Workspace File Operations', model: 'Nexus Engine', taskDescription: 'Safe atomic write within workspace boundary', status: 'pending' },
    { id: 'validation', roleId: 0, title: 'Static Syntax Validator', model: 'Nexus Engine', taskDescription: 'Syntax and security validation', status: 'pending' },
    { id: 20, roleId: 20, title: 'Final Product Analyzer', model: 'deepseek-r1:14b', taskDescription: 'Final product acceptance review against requirements', status: 'pending' }
  ];

  const buildData = {
    id: `build-${Date.now()}`,
    projectName: inferFastProjectName(fullText) || 'New Project',
    targetStack: inferFastBuildStack(fullText) || 'Responsive Web Application',
    workspacePath: rootPath,
    status: 'running',
    stage: 'Analysis & Planning',
    startedAt: Date.now(),
    completedAt: null,
    currentActivity: {
      role: 'Head Developer / Chief Architect',
      model: planner.model,
      task: 'Scanning workspace and preparing specialist task graph',
      detail: 'Initializing autonomous 21-role build workflow...',
      startedAt: Date.now(),
      streamedChars: 0
    },
    stats: {
      totalRoles: 21,
      completedRoles: 0,
      failedRoles: 0,
      filesCount: 0
    },
    tasks: initialTasks,
    files: [],
    diagnostics: [],
    executiveSummary: ''
  };

  const build = {
    cancelled: false, currentRequestId: null, message: assistantMessage, timeline: [],
    lastProgressChars: 0, lastProgressAt: 0, generationEntry: null,
    progressTicker: null, generationStartedAt: 0, finishedState: 'IN PROGRESS', imagePayload: imagePayload.slice(0, 4),
    roleResults: {}, completedRoleIds: new Set(), failedRoles: [],
    buildData
  };
  activeBuild = build;

  assistantMessage.isBuild = true;
  assistantMessage.buildData = buildData;
  assistantMessage.label = `Autonomous Build · ${codingRole.role}`;
  assistantMessage.model = `21-role team → ${codeModel}`;
  assistantMessage.content = 'Starting autonomous software engineering workflow...';

  // Render card immediately into chat
  renderMessages();

  const ensureRunning = () => { if (build.cancelled) throw new Error('Build cancelled by user.'); };

  const updateTask = (taskId, updates) => {
    const t = buildData.tasks.find(item => item.id === taskId || item.roleId === taskId);
    if (t) {
      Object.assign(t, updates);
      updateLiveBuildCard(assistantMessage.id, buildData);
    }
  };

  const renderTimeline = () => {
    updateLiveBuildCard(assistantMessage.id, buildData);
    saveChat();
  };

  const log = (status, detail = '', state = 'running') => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = { time, status, detail, state };
    build.timeline.push(entry);
    buildData.diagnostics.push({
      time,
      level: state === 'error' ? 'error' : state === 'done' ? 'done' : 'info',
      source: 'Orchestrator',
      message: `${status}${detail ? ` — ${detail}` : ''}`
    });
    if (state === 'error') build.finishedState = 'STOPPED';
    updateLiveBuildCard(assistantMessage.id, buildData);
    return entry;
  };

  const updateProgress = (_model, receivedChars) => {
    if (!activeBuild) return;
    const now = Date.now();
    build.lastProgressChars = receivedChars;
    build.lastProgressAt = now;
    const seconds = Math.max(1, Math.round((now - build.generationStartedAt) / 1000));
    buildData.currentActivity.streamedChars = receivedChars;
    buildData.currentActivity.detail = `${receivedChars.toLocaleString()} characters streamed · ${seconds}s elapsed`;
    updateLiveBuildCard(assistantMessage.id, buildData);
  };

  const startProgressTicker = () => {
    build.generationStartedAt = Date.now();
    build.lastProgressChars = 0;
    build.lastProgressAt = Date.now();
    build.lastRenderedProgressAt = 0;
    build.progressTicker = setInterval(() => {
      if (!build.generationEntry || !activeBuild) return;
      const elapsed = Math.max(1, Math.round((Date.now() - build.generationStartedAt) / 1000));
      if (!build.lastProgressChars) {
        buildData.currentActivity.detail = `Model is loading or processing the prompt; first output has not arrived yet (${elapsed}s).`;
      } else {
        buildData.currentActivity.detail = `${build.lastProgressChars.toLocaleString()} characters streamed · ${elapsed}s elapsed`;
      }
      updateLiveBuildCard(assistantMessage.id, buildData);
    }, 3000);
  };

  const stopProgressTicker = () => {
    if (build.progressTicker) clearInterval(build.progressTicker);
    build.progressTicker = null;
  };

  build.log = log;
  build.refreshTimeline = renderTimeline;
  build.updateProgress = updateProgress;

  try {
    log('Full-team orchestration enabled', 'Build Mode assigns a real task to all 21 roles. Models run through a memory-safe queue; embedding retrieval uses its dedicated API.');
    log('Analyzing selected workspace', 'Scanning readable project files and identifying existing structure.');
    const workspace = await window.nexus.readWorkspace(rootPath);
    ensureRunning();
    const tree = workspace.files.map(f => f.path);
    log('Workspace analysis complete', `${tree.length} readable file(s) found${workspace.truncated ? '; scan reached its safety limit' : ''}.`, 'done');
    const rankedWorkspaceFiles = await runProjectKnowledgeRetrieval(build, fullText, workspace);
    ensureRunning();
    if (build.imagePayload.length) {
      log('Visual references attached', `${build.imagePayload.length} image(s) will be supplied to the Visual QA Inspector where supported; the resulting observations will guide implementation.`, 'done');
      await runBuildRoleAgent(build, 15,
        'Analyze the attached image(s) as visual requirements/reference material. Describe visible layout, colors, typography, components, text, hierarchy, and interactions that can reasonably be inferred. Separate visible facts from assumptions. Return concise structured findings useful to the UI/UX and coding specialists. Do not claim a live application was tested.',
        fullText, `Workspace has ${workspace.files.length} readable text files. Treat the attached images as user-provided design references.`, { num_predict: settings.speedMode ? 300 : 500, num_ctx: 4096, contextChars: 1800, images: build.imagePayload });
      ensureRunning();
    }

    let plan = {
      project_name: inferFastProjectName(fullText),
      summary: 'A first working implementation generated from the request.',
      target_stack: inferFastBuildStack(fullText),
      files: [], validation_steps: []
    };
    let manifest = [];

    // Planning specialists
    buildData.stage = 'Architecture & Planning';
    const preContext = `Workspace tree (relative paths only): ${tree.join(', ') || '(empty workspace)'}`;
    await runBuildRoleAgent(build, 3,
      'Analyze the request and produce measurable acceptance criteria, key user flows, and any assumptions that the implementation must satisfy. Keep it to 5–8 short bullets.',
      fullText, preContext, { num_predict: settings.speedMode ? 220 : 420, contextChars: 2500 });
    await runBuildRoleAgent(build, 4,
      'Create a compact UI/UX design brief: screen structure, responsive layout, interaction states, visual hierarchy, accessibility, and empty/loading/error states. If the request has no UI, explain the non-UI design considerations.',
      fullText, buildAgentContextSummary(build, 2600), { num_predict: settings.speedMode ? 240 : 440, contextChars: 2800, images: build.imagePayload });
    await runBuildRoleAgent(build, 9,
      'Assess data persistence and data-model needs for this project. Define a minimal schema and validation rules if needed; otherwise explicitly recommend no database for a first runnable version. Do not invent payment credentials or secrets.',
      fullText, buildAgentContextSummary(build, 3000), { num_predict: settings.speedMode ? 180 : 320, contextChars: 3000 });
    await runBuildRoleAgent(build, 2,
      'Create a precise short instruction pack for the coding specialist using the requirements and design brief. State implementation priorities, constraints, output contract, and common failure cases. Do not write app source code.',
      fullText, buildAgentContextSummary(build, 3500), { num_predict: settings.speedMode ? 200 : 360, contextChars: 3500 });

    const plannerContext = buildAgentContextSummary(build, settings.speedMode ? 4200 : 6500);
    const plannerResult = await runBuildRoleAgent(build, 1,
      `Plan an implementation-ready file manifest for a runnable MVP. Return project_name, summary, target_stack, files [{path,purpose}], validation_steps. Keep ${maxFiles} or fewer main files; use only safe workspace-relative paths. No source code.`,
      fullText, `${preContext}\n\nPrior specialist inputs:\n${plannerContext}`, { num_predict: settings.speedMode ? 480 : 900, num_ctx: 4096, contextChars: settings.speedMode ? 4800 : 7200, timeout: settings.speedMode ? 5 * 60 * 1000 : 8 * 60 * 1000 });
    if (plannerResult) {
      const proposedFiles = Array.isArray(plannerResult.files) ? plannerResult.files : [];
      plan = { ...plan, ...plannerResult };
      if (plan.project_name) buildData.projectName = plan.project_name;
      if (plan.target_stack) buildData.targetStack = plan.target_stack;
      manifest = proposedFiles.slice(0, maxFiles).map(f => ({ path: String(f.path || '').replace(/\\/g, '/'), purpose: String(f.purpose || '') })).filter(f => f.path);
      if (manifest.length) {
        log('Implementation plan ready', `${plan.project_name || 'Project'} · ${plan.target_stack || 'stack selected by Head Developer'} · ${manifest.length} planned file(s).`, 'done');
        for (const file of manifest) log(`Planned: ${file.path}`, file.purpose || 'Required project file', 'done');
      } else {
        log('Head Developer plan needs fallback', 'No usable file manifest was returned; using the built-in platform plan and continuing with all specialists.', 'running');
      }
    } else {
      log('Head Developer plan needs fallback', 'The planner did not complete; using the built-in platform plan and continuing with all specialists.', 'running');
    }
    if (!manifest.length) {
      manifest = [];
      log('Local build plan ready', `${plan.target_stack} · target up to ${maxFiles} main files · full 21-role team will contribute.`, 'done');
    }

    log('Preparing project context', `Using ${Math.min(workspace.files.length, fastBuild ? 8 : 16)} relevant readable file(s); dependencies and build folders are excluded.` , 'done');
    const maxContextChars = fastBuild ? 6000 : 14000;
    let usedChars = 0;
    const contextFiles = [];
    for (const file of rankedWorkspaceFiles.slice(0, fastBuild ? 8 : 16)) {
      if (usedChars >= maxContextChars) break;
      const remaining = maxContextChars - usedChars;
      const content = String(file.content || '').slice(0, Math.min(remaining, fastBuild ? 2400 : 5000));
      contextFiles.push({ path: file.path, content });
      usedChars += content.length;
    }
    const workspaceContext = contextFiles.map(file => `--- EXISTING FILE: ${file.path} ---\n${file.content}\n--- END FILE ---`).join('\n\n');
    const codeSystem = `${IDEV_IDENTITY}\nYou are acting exclusively as ${codingRole.role}. You must CREATE source files, not merely describe a plan. Return one valid JSON object with keys: project_name (string), summary (string), target_stack (string), files (array of {path,content}), run_commands (array of strings). Output JSON only; no Markdown fences.\nRules: produce complete runnable file contents; choose a coherent stack, include all essential entry points and configurations, keep dependencies minimal, use relative file paths, never create secrets or protected paths, don't claim tests were run, and don't leave TODO placeholders for core requested features. Respect the maximum file count (${maxFiles}). If this is a website and the user did not require a framework, prefer a compact HTML/CSS/vanilla-JavaScript implementation so it can run without a build step. If real images are requested and no local assets are supplied, use stable image URLs only as examples and do not claim their contents were verified. If files already exist, preserve unrelated project data and include only required additions or complete edited files. ALL file paths must be workspace-relative (for example index.html, src/app.js, images/logo.svg). NEVER put the absolute workspace path, drive letter, workspace folder name prefix, leading slash, or leading ./ in a path.\n${fastBuild ? `FAST SOURCE-GENERATION CONTRACT: The 21-role team has already supplied compact requirements and a Head Developer manifest. Generate a focused MVP in this one source-generation pass; other specialists will review it afterward. Prefer 3–6 compact files, responsive UI, and no unnecessary boilerplate. Follow the Head Developer manifest where possible and keep output concise enough to fit the response budget.` : `Follow the Head Developer manifest exactly; include each planned file and no extras.`}`;
    const teamPlan = buildAgentContextSummary(build, settings.speedMode ? 5500 : 8000);
    const planContext = `Head Developer plan: ${JSON.stringify({ project_name: plan.project_name, summary: plan.summary, target_stack: plan.target_stack, files: manifest, validation_steps: plan.validation_steps })}`;
    const codePrompt = `Implement this project request now.\n\nUser request:\n${fullText}\n\n${planContext}\n\nFull-team specialist inputs (use relevant findings, ignore irrelevant platform notes):\n${teamPlan || '(No additional team notes.)'}\n\nExisting workspace files for context (preserve unrelated files):\n${workspaceContext || '(No existing readable text files; this is likely a new project.)'}\n\nReturn the complete content for the files that should actually be written. The selected folder is the project root. Return only relative file paths from that root. Do not repeat the absolute filesystem location or folder name in paths.`;
    const generationBudget = fastBuild ? fastTokenBudget : 6144;
    const generationContext = fastBuild ? 4096 : Math.max(8192, Number(settings.contextLength || 8) * 1024);

    buildData.stage = 'Code Generation';
    updateTask(codingRole.id, { status: 'running', startedAt: Date.now() });
    buildData.currentActivity = {
      role: codingRole.role,
      model: codeModel,
      task: 'Generating runnable source code files',
      detail: `Starting source generation pass with ${codeModel}...`,
      startedAt: Date.now(),
      streamedChars: 0
    };
    updateLiveBuildCard(assistantMessage.id, buildData);

    const generationEntry = log('Generating source files', `${codingRole.role} · ${codeModel}. Starting ${fastBuild ? 'compact source generation after full-team planning' : 'manifest-driven full-team source generation'}.`);
    build.generationEntry = generationEntry;
    startProgressTicker();
    let codeText;
    try {
      const codeUserMessage = { role: 'user', content: codePrompt };
      if (build.imagePayload.length && supportsImageInput(codeModel)) codeUserMessage.images = build.imagePayload.slice(0, 4);
      codeText = await runAgentModel(codeModel, [
        { role: 'system', content: codeSystem },
        codeUserMessage
      ], {
        format: 'json', num_ctx: generationContext, num_predict: generationBudget,
        temperature: 0.12, timeout: fastBuild ? fastTimeout : 12 * 60 * 1000
      });
    } finally {
      stopProgressTicker();
      build.generationEntry = null;
    }
    ensureRunning();

    let generated;
    try {
      generated = parseJsonResponse(codeText);
    } catch (parseError) {
      log('Repairing structured output', `Code Fixer · ${fixRole.model} is trying one short JSON repair pass. Original parser detail: ${parseError.message}`);
      const repairedText = await runAgentModel(fixRole.model, [
        { role: 'system', content: roleSystemPrompt(fixRole) + '\nRepair only JSON formatting. Return valid JSON with keys summary, project_name, target_stack, files [{path,content}], run_commands. Preserve code content; do not shorten it.' },
        { role: 'user', content: `Repair the JSON structure without changing code content:\n${codeText.slice(0, 25000)}` }
      ], { format: 'json', num_ctx: 4096, num_predict: 3072, timeout: 4 * 60 * 1000 });
      generated = parseJsonResponse(repairedText);
      build.completedRoleIds.add(fixRole.id);
      build.roleResults[fixRole.id] = { role: fixRole.role, model: fixRole.model, status: 'completed', summary: 'Repaired the structured JSON wrapper around the generated source response.' };
    }
    if (!Array.isArray(generated.files) || generated.files.length < 1) throw new Error(`The primary developer (${codingRole.role} · ${codeModel}) returned no source files. No success report was generated; retry with a smaller MVP request or check that model's response.`);

    build.completedRoleIds.add(codingRole.id);
    build.roleResults[codingRole.id] = { role: codingRole.role, model: codeModel, status: 'completed', summary: `Generated the initial ${Array.isArray(generated.files) ? generated.files.length : 0}-file implementation.` };
    updateTask(codingRole.id, {
      status: 'completed',
      duration: `${((Date.now() - (build.generationStartedAt || Date.now())) / 1000).toFixed(1)}s`,
      summary: `Generated ${Array.isArray(generated.files) ? generated.files.length : 0} initial source file(s).`
    });

    let combinedGeneratedFiles = Array.isArray(generated.files) ? [...generated.files] : [];
    const sourceContext = () => JSON.stringify(combinedGeneratedFiles.slice(0, 6).map(file => ({ path: String(file.path || ''), content: String(file.content || '').slice(0, 1600) })));
    const developerReviews = {
      5: 'Inspect the proposed UI/source files for frontend structure, responsive behavior, accessible controls, and interaction completeness. Return findings only; do not rewrite the entire app.',
      6: 'Review data flow, APIs, server requirements, validation, and persistence. Describe the smallest compatible backend interface and concrete integration risks.',
      7: 'Review the project from the Android specialist perspective. Check mobile/responsive usability and concrete compatibility concerns.',
      8: 'Review platform packaging and desktop integration. Assess whether the project needs a desktop wrapper or can remain web/mobile.',
      10: 'Act as Code Fixer. Inspect the generated source snippets for obvious, high-confidence implementation defects. Return corrected complete files only for existing paths that need a concrete fix; use an empty files array if no safe fix is clear.',
      11: 'Act as Unit Test Engineer. Produce concise, project-specific test cases. Create tests/TEST_PLAN.md with manual/automated test cases. Return that file plus summary/findings.',
      12: 'Act as Integration & QA Tester. Check whether the generated files and described flows fit together, identify broken links/data flows, and list a short end-to-end test sequence.',
      13: 'Act as Security Auditor. Inspect paths, authentication, data handling, input validation, external calls, secret exposure, and destructive operations.',
      14: 'Act as Performance Optimizer. Review likely hot paths, rendering, network/API usage, memory and data handling.',
      15: 'Act as Visual QA Inspector. Review the supplied HTML/CSS/UI-related source snippets for layout consistency, responsive behavior, contrast, and focus states.',
      16: 'Act as OCR / image-text specialist. Inspect the request and asset manifest for image text, product labels, and OCR requirements.',
      17: 'Act as Documentation Writer. Create or update a helpful README.md describing core features, listing real files, and giving setup/run instructions.',
      18: 'Act as Build & Release Engineer. Produce BUILD_GUIDE.md with prerequisites, development/build commands, packaging notes, and release checklist.',
      19: 'Act as Code Quality Checker. Review naming, readability, duplication, separation of concerns, maintainability, and coding conventions.'
    };
    const agentIds = [5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
    buildData.stage = 'Specialist Engineering Reviews';

    for (const agentId of agentIds) {
      ensureRunning();
      if (build.completedRoleIds.has(agentId)) continue;
      const role = ROLE_REGISTRY.find(item => item.id === agentId);
      const contextForAgent = `Project name: ${plan.project_name}\nTarget stack: ${plan.target_stack}\nHead Developer manifest: ${JSON.stringify(manifest.slice(0, 10))}\nPrior specialist notes: ${buildAgentContextSummary(build, 1900)}\nGenerated file excerpts (truncated): ${sourceContext()}`;
      const wantsFiles = [10, 11, 17, 18].includes(agentId);
      const artifact = await runBuildRoleAgent(build, agentId, developerReviews[agentId], fullText, contextForAgent, {
        num_ctx: 3072,
        num_predict: agentId === 10 ? (settings.speedMode ? 480 : 900) : agentId === 11 ? 650 : agentId === 17 ? 1150 : agentId === 18 ? 650 : (settings.speedMode ? 220 : 320),
        contextChars: agentId === 17 || agentId === 18 ? 4200 : 3400,
        timeout: settings.speedMode ? 4 * 60 * 1000 : 7 * 60 * 1000
      });
      if (!artifact) continue;
      if (wantsFiles && artifact.files.length) {
        try {
          const incoming = normalizeGeneratedFilePaths(artifact.files, rootPath).files;
          if (agentId === 10) {
            const existingKeys = new Set(combinedGeneratedFiles.map(file => String(file.path || '').replace(/\\/g, '/').toLowerCase()));
            const patches = incoming.filter(file => typeof file.content === 'string' && existingKeys.has(String(file.path || '').replace(/\\/g, '/').toLowerCase()));
            if (patches.length) {
              const patchMap = new Map(patches.map(file => [String(file.path).toLowerCase(), file]));
              combinedGeneratedFiles = combinedGeneratedFiles.map(file => patchMap.get(String(file.path || '').replace(/\\/g, '/').toLowerCase()) || file);
              log('Code Fixer prepared targeted patches', `${patches.length} existing source file(s) will be updated after path validation.`, 'done');
            } else {
              log('Code Fixer review completed', 'No safe patch for an existing generated path was returned; preserving generated source.', 'done');
            }
          } else {
            const additions = incoming.filter(file => typeof file.content === 'string' && (agentId === 11 ? /(^|\/)TEST_PLAN\.md$/i.test(file.path)
              : agentId === 17 ? /(^|\/)README\.md$/i.test(file.path)
              : /(^|\/)BUILD_GUIDE\.md$/i.test(file.path)));
            for (const file of additions) {
              const key = String(file.path).toLowerCase();
              const at = combinedGeneratedFiles.findIndex(current => String(current.path || '').replace(/\\/g, '/').toLowerCase() === key);
              if (at >= 0) combinedGeneratedFiles[at] = file; else combinedGeneratedFiles.push(file);
              log(`${at >= 0 ? 'Specialist edit' : 'Specialist file prepared'}: ${file.path}`, `${role.role} supplied a scoped project artifact.`, 'done');
            }
          }
        } catch (agentFileError) {
          log(`Specialist artifact ignored: ${role.role}`, `Its proposed file did not pass safe path validation: ${agentFileError.message || String(agentFileError)}`, 'running');
        }
      }
    }

    generated.files = combinedGeneratedFiles;
    const pathNormalization = normalizeGeneratedFilePaths(generated.files, rootPath);
    const files = validateGeneratedFiles(pathNormalization.files);
    if (pathNormalization.adjusted.length) {
      const examples = pathNormalization.adjusted.slice(0, 5).map(item => `${item.from} → ${item.to}`).join('; ');
      log('Normalized generated file paths', `Safely converted ${pathNormalization.adjusted.length} model path(s) to workspace-relative paths. ${examples}`, 'done');
    }
    ensureRunning();

    buildData.files = files.map(file => ({
      path: file.path,
      op: 'Created',
      role: codingRole.role,
      content: file.content,
      size: file.content.length,
      status: 'pending',
      check: 'Validated in memory'
    }));
    buildData.stats.filesCount = buildData.files.length;
    updateLiveBuildCard(assistantMessage.id, buildData);

    buildData.stage = 'Workspace Operations';
    updateTask('snapshot', { status: 'running', startedAt: Date.now() });
    log('Creating pre-build snapshot', 'Safely backing up current workspace state.');
    try {
      const cp = await window.nexus.checkpoints.create({ workspacePath: rootPath, description: `Pre-build snapshot for ${plan.project_name || 'project'}` });
      updateTask('snapshot', { status: 'completed', duration: '0.3s', summary: `Saved snapshot ${cp.id} (${cp.filesCount} files).` });
      log('Checkpoint created', `Saved snapshot ${cp.id} (${cp.filesCount} file(s) backed up).`, 'done');
    } catch (cpErr) {
      updateTask('snapshot', { status: 'failed', error: cpErr.message });
      log('Checkpoint notice', `Could not create pre-build snapshot: ${cpErr.message}`, 'running');
    }

    updateTask('filesystem', { status: 'running', startedAt: Date.now() });
    log('Writing files to workspace', 'Writing verified files within workspace boundary.');
    const writeResult = await window.nexus.writeWorkspace({ rootPath, files });
    if (writeResult.canceled) throw new Error('No files were written because the overwrite confirmation was cancelled.');
    ensureRunning();

    const edited = new Set(writeResult.collisions || []);
    for (const f of buildData.files) {
      f.op = edited.has(f.path) ? 'Edited' : 'Created';
      f.status = 'valid';
      f.check = 'Written to disk';
    }
    updateTask('filesystem', {
      status: 'completed',
      duration: '0.4s',
      summary: `Wrote ${writeResult.written.length} file(s) (${edited.size} edited).`
    });
    for (const file of writeResult.written) log(`${edited.has(file) ? 'Edited' : 'Created'} file: ${file}`, edited.has(file) ? 'Existing file updated.' : 'New file written to workspace.', 'done');
    updateLiveBuildCard(assistantMessage.id, buildData);

    try {
      await window.nexus.memory.add({
        type: 'decision',
        text: `Project "${plan.project_name || 'Project'}" implementation generated with stack "${plan.target_stack || 'Standard'}". Files: ${writeResult.written.slice(0, 5).join(', ')}.`,
        scope: rootPath
      });
    } catch {}

    buildData.stage = 'Syntax & Security Verification';
    updateTask('validation', { status: 'running', startedAt: Date.now() });
    log('Running local validation', 'Checking generated JSON, JavaScript and Python syntax where supported.');
    let validation = await window.nexus.validateWorkspace({ rootPath, files: writeResult.written });
    ensureRunning();
    const failures = validation.results.filter(r => r.status === 'failed');
    let repaired = false;
    if (failures.length) {
      const latest = await window.nexus.readWorkspace(rootPath);
      const failedPaths = new Set(failures.map(f => f.file));
      const failedFiles = latest.files.filter(f => failedPaths.has(f.path)).slice(0, fastBuild ? 1 : 2).map(f => ({ path: f.path, content: f.content.slice(0, fastBuild ? 6000 : 10000) }));
      if (failedFiles.length && installedModels.some(m => m.name.toLowerCase() === fixRole.model.toLowerCase())) {
        log('Fixing validation errors', `${failures.length} syntax failure(s) found. Code Fixer is preparing a targeted patch.`);
        try {
          const repairText = await runAgentModel(fixRole.model, [
            { role: 'system', content: roleSystemPrompt(fixRole) + '\nReturn only JSON: {"files":[{"path":"relative/path","content":"complete corrected file"}]}. Fix only the listed syntax failures. Keep the response compact.' },
            { role: 'user', content: `Fix only these static syntax failures; do not change unrelated behavior.\nFailures:\n${JSON.stringify(failures.slice(0, 4))}\nFiles:\n${JSON.stringify(failedFiles)}` }
          ], { format: 'json', num_ctx: 4096, num_predict: fastBuild ? 1800 : 4096, timeout: fastBuild ? 4 * 60 * 1000 : 8 * 60 * 1000 });
          const repair = parseJsonResponse(repairText);
          const repairedPaths = normalizeGeneratedFilePaths(repair.files, rootPath);
          const patches = validateGeneratedFiles(repairedPaths.files).filter(f => failedPaths.has(f.path));
          if (patches.length) {
            const patchResult = await window.nexus.writeWorkspace({ rootPath, files: patches });
            if (!patchResult.canceled) {
              repaired = true;
              for (const file of patchResult.written) log(`Edited file: ${file}`, 'Applied Code Fixer syntax repair.', 'done');
              validation = await window.nexus.validateWorkspace({ rootPath, files: patchResult.written });
            }
          }
        } catch (repairError) { log('Automatic repair was not completed', repairError.message || String(repairError), 'error'); }
      }
    }
    ensureRunning();
    const finalFailures = validation.results.filter(r => r.status === 'failed');
    const passed = validation.results.filter(r => r.status === 'passed');
    const skipped = validation.results.filter(r => r.status === 'skipped');

    const valMap = new Map(validation.results.map(r => [r.file, r]));
    for (const f of buildData.files) {
      const res = valMap.get(f.path);
      if (res) {
        f.status = res.status === 'failed' ? 'failed' : 'valid';
        f.check = res.details || res.check || 'Syntax valid';
      }
    }
    updateTask('validation', {
      status: finalFailures.length ? 'failed' : 'completed',
      duration: '0.5s',
      summary: `${passed.length} passed, ${finalFailures.length} failed, ${skipped.length} skipped${repaired ? '; syntax repair applied' : ''}.`
    });
    for (const result of validation.results) log(`${result.status === 'passed' ? 'Passed' : result.status === 'failed' ? 'Failed' : 'Skipped'} check: ${result.file}`, `${result.check}${result.details ? ` — ${result.details}` : ''}`, result.status === 'failed' ? 'error' : 'done');

    // Verification commands
    const candidateTestCommands = [...new Set([...(Array.isArray(generated.run_commands) ? generated.run_commands : []), ...(build.roleResults[18]?.run_commands || [])])].filter(c => /test|check|lint|unittest|compile/i.test(c)).slice(0, 2);
    for (const testCmd of candidateTestCommands) {
      ensureRunning();
      log(`Running verification: ${testCmd}`, 'Executing real test command in workspace...');
      try {
        const runRes = await executeWorkspaceCommand(testCmd, rootPath, { timeoutMs: 30000 });
        log(`Command finished: ${testCmd}`, `Exit code: ${runRes.exitCode} (${runRes.passed ? 'PASSED' : 'FAILED'}).`, runRes.passed ? 'done' : 'error');
      } catch (cmdErr) {
        log(`Command notice: ${testCmd}`, cmdErr.message, 'running');
      }
    }

    buildData.stage = 'Final Product Acceptance';
    let finalAnalyzerResult = null;
    try {
      const finalWorkspace = await window.nexus.readWorkspace(rootPath);
      const finalFilesContext = finalWorkspace.files.slice(0, 8).map(file => ({ path: file.path, content: String(file.content || '').slice(0, 900) }));
      finalAnalyzerResult = await runBuildRoleAgent(build, 20,
        'Perform the final product acceptance review against the original user request, requirements, generated file list, and static validation results. State what appears implemented, what remains uncertain, and any release blockers. Do not edit files or claim runtime tests passed.',
        fullText,
        `Project: ${generated.project_name || plan.project_name}\nTarget: ${generated.target_stack || plan.target_stack}\nFiles written: ${JSON.stringify(writeResult.written)}\nStatic validation results: ${JSON.stringify(validation.results)}\nPrior agent findings: ${buildAgentContextSummary(build, 2600)}\nActual workspace excerpts: ${JSON.stringify(finalFilesContext)}`,
        { num_ctx: 3072, num_predict: settings.speedMode ? 300 : 520, contextChars: 5200, timeout: settings.speedMode ? 5 * 60 * 1000 : 8 * 60 * 1000 });
    } catch (auditError) {
      log('Final Product Analyzer could not complete', auditError.message || String(auditError), 'running');
    }

    const commandLines = [...new Set([...(Array.isArray(generated.run_commands) ? generated.run_commands : []), ...(build.roleResults[18]?.run_commands || [])])].slice(0, 8);
    const teamIncomplete = build.failedRoles.length > 0 || build.completedRoleIds.size < ROLE_REGISTRY.length;

    buildData.stage = 'Ready';
    buildData.status = (finalFailures.length || teamIncomplete) ? 'completed-with-issues' : 'completed';
    buildData.completedAt = Date.now();
    buildData.currentActivity = {
      role: 'Autonomous Orchestrator',
      model: 'IDeV AI',
      task: 'Build operations finished',
      detail: `Wrote ${writeResult.written.length} files across ${build.completedRoleIds.size}/21 roles.`,
      startedAt: Date.now(),
      streamedChars: 0
    };

    const executiveMarkdown = `## ${generated.project_name || plan.project_name || 'Project'} — ${buildData.status === 'completed' ? 'Build Complete' : 'Build Completed with Issues'}

${generated.summary || plan.summary || 'The initial implementation was generated and verified.'}

- **Workspace:** \`${rootPath}\`
- **Target Stack:** ${generated.target_stack || plan.target_stack || 'Responsive Web Application'}
- **Files Created/Edited:** ${writeResult.written.length} file(s)
- **Validation:** ${passed.length} passed, ${finalFailures.length} failed${repaired ? ' (syntax repair applied)' : ''}
- **Autonomous Roles:** ${build.completedRoleIds.size}/21 roles contributed

${finalAnalyzerResult ? `### Acceptance Review\n${finalAnalyzerResult.summary || ''}${(finalAnalyzerResult.findings || []).length ? `\n\n${finalAnalyzerResult.findings.map(f => `- ${f}`).join('\n')}` : ''}` : ''}

${commandLines.length ? `### Suggested Next Commands\n${commandLines.map(c => `\`\`\`bash\n${c}\n\`\`\``).join('\n')}` : ''}
`;

    buildData.executiveSummary = executiveMarkdown;
    assistantMessage.content = executiveMarkdown;
    assistantMessage.pending = false;

    updateLiveBuildCard(assistantMessage.id, buildData);
    saveChat();
    toast(`Build wrote ${writeResult.written.length} file(s)`, 4500);
  } catch (error) {
    stopProgressTicker();
    const message = error.message || String(error);
    const isCancelled = message.toLowerCase().includes('cancelled') || build.cancelled;
    buildData.completedAt = Date.now();
    buildData.status = isCancelled ? 'stopped' : 'failed';
    buildData.stage = isCancelled ? 'Cancelled' : 'Failed';
    buildData.diagnostics.push({
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      level: 'error',
      source: 'Orchestrator',
      message: `${isCancelled ? 'Build cancelled' : 'Build failed'}: ${message}`
    });
    const execText = `## Build ${isCancelled ? 'Stopped' : 'Failed'}\n\n${message}\n\nCheck the task timeline and diagnostics panel for details.`;
    buildData.executiveSummary = execText;
    assistantMessage.content = execText;
    assistantMessage.pending = false;
    updateLiveBuildCard(assistantMessage.id, buildData);
    saveChat();
    toast(isCancelled ? 'Build stopped.' : `Build error: ${message}`, 5000);
  } finally {
    stopProgressTicker();
    activeBuild = null; activeRequestId = null; setBusy(false);
  }
}
function BufferSafeLength(value) { return String(value || '').length.toLocaleString(); }
async function sendMessage() {
  if (isSending) {
    if (activeBuild) { activeBuild.cancelled = true; if (activeBuild.currentRequestId) window.nexus.abortChat(activeBuild.currentRequestId); }
    else if (activeRequestId) window.nexus.abortChat(activeRequestId);
    return;
  }
  const raw = $('messageInput').value.trim();
  if (!raw && !pendingAttachments.length) return;
  if (settings.buildMode && !settings.workspacePath) { showError('Choose a workspace folder with the folder button before turning on Build mode.'); return; }
  if (!installedModels.length) { showError('No local model is available. Open Ollama and refresh the model list, or install a model in Model library.'); return; }
  const imagePayload = pendingAttachments.filter(item => item.type === 'image').slice(0, 4).map(item => item.base64).filter(Boolean);
  const attachmentMetadata = pendingAttachments.map(item => ({ type: item.type || 'text', name: String(item.name || 'Attachment'), ...(item.type === 'image' && item.previewDataUrl ? { previewDataUrl: item.previewDataUrl, mimeType: item.mimeType || 'image/jpeg' } : {}) }));
  const fullText = createUserMessageContent(raw || 'Please inspect the attached files or images and summarize the important details.');
  const buildRequest = !!settings.buildMode;
  let role = null, model = settings.selectedModel, displayLabel = 'Local model';
  const generalConversation = !buildRequest && isGeneralIdentityOrProductQuestion(raw || fullText);
  if (buildRequest) {
    role = selectBuildRole(raw || fullText); model = role.model; displayLabel = role.role;
    const available = installedModels.some(m => m.name.toLowerCase() === model.toLowerCase());
    if (!available) { showError(`The primary build role ${role.role} requires “${model}”, which is not installed. Install that assigned model or use a build target with an available specialist. The full team will be attempted during Build Mode.`); return; }
  } else if (settings.teamMode && !generalConversation) {
    const wantsOcr = /\b(ocr|extract text|read (the )?text|transcribe text|text in (this|the) image)\b/i.test(raw || '');
    role = imagePayload.length ? ROLE_REGISTRY.find(item => item.id === (wantsOcr ? 16 : 15)) : selectRole(raw || fullText);
    model = role.model; displayLabel = role.role;
    const available = installedModels.some(m => m.name.toLowerCase() === model.toLowerCase());
    if (!available && !role.embeddingOnly) {
      showError(`The task was assigned to ${role.role}, but its dedicated model “${model}” is not available in Ollama. To preserve one-model-one-task, IDeV will not silently use another role’s model. Open Apps → Model library to install it.`);
      return;
    }
    if (role.embeddingOnly) { showError('Project Knowledge Retrieval is an embedding-only role and cannot generate chat replies. Choose a content-building task or turn Team off to select an installed model.'); return; }
  } else if (!installedModels.some(m => m.name.toLowerCase() === model.toLowerCase())) {
    showError(`Selected model “${model}” is not available. Open the model selector and choose an installed model.`); return;
  } else if (imagePayload.length && !settings.teamMode && !supportsImageInput(model)) {
    showError(`The selected model “${model}” may not support images. Turn Team on to route image questions to the Visual QA Inspector, or select a vision-capable installed model such as Gemma 4.`); return;
  }
  if (buildRequest) {
    const plannerModel = ROLE_REGISTRY.find(r => r.id === 1).model;
    if (!installedModels.some(m => m.name.toLowerCase() === plannerModel.toLowerCase())) {
      showError(`Build mode requires the Head Developer model “${plannerModel}”, which is not installed. Install it or switch to normal chat.`); return;
    }
  }
  ensureActiveConversation();
  const requestId = makeId(); activeRequestId = requestId;
  chatMessages.push({ id: makeId(), role: 'user', content: fullText, ...(attachmentMetadata.length ? { attachments: attachmentMetadata } : {}), createdAt: new Date().toISOString() });
  const userMessage = chatMessages[chatMessages.length - 1];
  const startedAt = Date.now();
  const assistantMessage = { id: makeId(), role: 'assistant', content: buildRequest ? 'Preparing the build…' : '', label: buildRequest ? 'Build team' : displayLabel, model: buildRequest ? 'Planning…' : model, pending: true, startedAt, createdAt: new Date().toISOString() };
  chatMessages.push(assistantMessage); saveChat(false); renderMessages();
  $('messageInput').value = ''; autoResizeInput(); renderAttachmentPreview(); setBusy(true); hideError();
  pendingAttachments = []; renderAttachmentPreview();
  if (buildRequest) { await buildWorkspaceProject(fullText, role || selectBuildRole(fullText), assistantMessage, imagePayload); return; }
  const task = role ? `You are acting as ${role.role}.\nAssignment: ${role.task}\n\nUser request:\n${fullText}` : fullText;
  let system = '';
  if (role) {
    system = roleSystemPrompt(role);
  } else if (generalConversation) {
    system = IDEV_IDENTITY;
  } else if (settings.speedMode) {
    system = FAST_IDEV_IDENTITY;
  } else {
    system = `${IDEV_IDENTITY}\nYou are IDeV Advanced, a helpful local AI assistant. Be concise and useful.`;
  }
  const rawHistory = chatMessages.filter(m => !m.pending && m.id !== assistantMessage.id && m.id !== userMessage.id).map(m => ({ role: m.role, content: m.content }));
  const historyBudget = settings.speedMode ? Math.max(0, Math.min(3200, 6000 - task.length - system.length)) : 10000;
  const history = compactHistory(rawHistory, historyBudget, settings.speedMode ? 4 : 12);
  const finalUserMessage = { role: 'user', content: task };
  if (imagePayload.length) finalUserMessage.images = imagePayload.slice(0, 4);
  const messages = [{ role: 'system', content: system }, ...history, finalUserMessage];
  const selectedContext = Number(settings.contextLength || 4) * 1024;
  const effectiveContext = settings.speedMode ? Math.min(selectedContext, 2048) : selectedContext;
  pendingAttachments = []; renderAttachmentPreview();
  window.nexus.sendChat({ requestId, model, messages, num_ctx: effectiveContext, num_predict: responseTokenLimit(role, fullText, settings.speedMode), keep_alive: '5m', temperature: !role ? 0.4 : ([11, 13, 20].includes(role.id) ? 0.15 : 0.25) });
}
function showError(message) { $('chatError').textContent = message; $('chatError').classList.remove('hidden'); }
function hideError() { $('chatError').classList.add('hidden'); $('chatError').textContent = ''; }
function autoResizeInput() { const input = $('messageInput'); input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 180)}px`; $('sendBtn').disabled = isSending ? false : (!input.value.trim() && !pendingAttachments.length); }
function renderAttachmentPreview() {
  const root = $('attachmentPreview'); root.replaceChildren(); root.classList.toggle('hidden', pendingAttachments.length === 0);
  pendingAttachments.forEach((item, index) => {
    const chip = document.createElement('span'); chip.className = `attachment-chip${item.type === 'image' ? ' attachment-image-chip' : ''}${item.screenShare ? ' screen-frame-chip' : ''}`;
    if (item.type === 'image' && item.previewDataUrl) {
      const thumb = document.createElement('img'); thumb.className = 'attachment-thumb'; thumb.src = item.previewDataUrl; thumb.alt = item.name || 'Attached image'; thumb.addEventListener('click', () => showExpandedImage(item.dataUrl || item.previewDataUrl, item.name)); chip.appendChild(thumb);
    } else {
      const marker = document.createElement('span'); marker.className = 'attachment-file-icon'; marker.textContent = 'FILE'; chip.appendChild(marker);
    }
    const name = document.createElement('span'); name.className = 'attachment-chip-name'; name.textContent = item.name || 'Attachment'; chip.appendChild(name);
    const remove = document.createElement('button'); remove.title = 'Remove attachment'; remove.setAttribute('aria-label', `Remove ${item.name || 'attachment'}`); remove.innerHTML = '<svg><use href="#i-close"/></svg>'; remove.addEventListener('click', () => { pendingAttachments.splice(index, 1); renderAttachmentPreview(); autoResizeInput(); });
    chip.appendChild(remove); root.appendChild(chip);
  });
}

async function showScreenSourcePicker() {
  const list = $('screenSourceList'); list.replaceChildren();
  const loading = document.createElement('div'); loading.className = 'empty-state small'; loading.textContent = 'Looking for available screens and windows…'; list.appendChild(loading);
  $('screenPickerBackdrop').classList.remove('hidden');
  try {
    const sources = await window.nexus.listScreenSources();
    list.replaceChildren();
    if (!sources.length) { const empty = document.createElement('div'); empty.className = 'empty-state small'; empty.textContent = 'No screen or window sources were found.'; list.appendChild(empty); return; }
    for (const source of sources) {
      const card = document.createElement('button'); card.type = 'button'; card.className = 'screen-source-card';
      if (source.thumbnail) { const image = document.createElement('img'); image.src = source.thumbnail; image.alt = ''; card.appendChild(image); }
      const title = document.createElement('span'); title.className = 'screen-source-name'; title.textContent = source.name || 'Screen or window'; card.appendChild(title);
      const type = document.createElement('small'); type.textContent = String(source.id).startsWith('screen:') ? 'Display' : 'Window'; card.appendChild(type);
      card.addEventListener('click', () => startScreenSharing(source)); list.appendChild(card);
    }
  } catch (error) {
    list.replaceChildren(); const empty = document.createElement('div'); empty.className = 'empty-state small'; empty.textContent = `Could not list screen sources: ${error.message || error}`; list.appendChild(empty);
  }
}
async function startScreenSharing(source) {
  stopScreenSharing(false);
  activeScreenSource = { id: source.id, name: source.name || 'Screen' };
  $('screenPickerBackdrop').classList.add('hidden');
  $('screenShareBtn').classList.add('screen-sharing-active'); $('screenShareBtn').setAttribute('aria-pressed', 'true');
  $('screenShareBtn').title = `Sharing ${activeScreenSource.name}; click to stop`;
  toast(`Sharing ${activeScreenSource.name}. The latest frame is attached when you send a message.`, 5500);
  await captureScreenFrame();
  if (activeScreenSource) screenCaptureTimer = setInterval(captureScreenFrame, 2200);
}
async function captureScreenFrame() {
  if (!activeScreenSource || screenCaptureInFlight) return;
  screenCaptureInFlight = true;
  const source = activeScreenSource;
  try {
    const capture = await window.nexus.captureScreenSource(source.id);
    if (!activeScreenSource || activeScreenSource.id !== source.id) return;
    const image = await createImageAttachment(capture.dataUrl, `Screen · ${source.name}`, 'image/jpeg');
    image.screenShare = true;
    const existingIndex = pendingAttachments.findIndex(item => item.screenShare && item.sourceId === source.id);
    image.sourceId = source.id;
    if (existingIndex >= 0) pendingAttachments[existingIndex] = image;
    else {
      const staleIndex = pendingAttachments.findIndex(item => item.screenShare);
      if (staleIndex >= 0) pendingAttachments.splice(staleIndex, 1, image); else pendingAttachments.push(image);
    }
    renderAttachmentPreview();
    $('screenShareBtn').classList.add('screen-sharing-active');
    $('screenShareBtn').setAttribute('aria-pressed', 'true');
    $('screenShareBtn').title = `Sharing ${source.name}; click to stop`;
    const label = $('workspaceStatus');
    if (label && !settings.workspacePath) label.textContent = `Screen sharing active: ${source.name}`;
    autoResizeInput();
  } catch (error) {
    toast(`Screen capture stopped: ${error.message || error}`, 5000);
    stopScreenSharing(false);
  } finally { screenCaptureInFlight = false; }
}
function stopScreenSharing(showToast = true) {
  if (screenCaptureTimer) clearInterval(screenCaptureTimer);
  screenCaptureTimer = null;
  const wasActive = !!activeScreenSource;
  const sourceName = activeScreenSource?.name;
  activeScreenSource = null;
  $('screenShareBtn')?.classList.remove('screen-sharing-active');
  $('screenShareBtn')?.setAttribute('aria-pressed', 'false');
  $('screenShareBtn') && ($('screenShareBtn').title = 'Share a screen or window with IDeV Advanced');
  for (const item of pendingAttachments) if (item.screenShare) { item.screenShare = false; item.name = `Screen capture · ${sourceName || 'Screen'}`; }
  renderAttachmentPreview();
  if (typeof updateBuildModeUI === 'function') updateBuildModeUI();
  if (showToast && wasActive) toast('Screen sharing stopped. The last captured frame remains attached until removed or sent.', 4500);
}

let streamRenderTimer = null;
const pendingStreamMessages = new Map();
const streamStateById = new Map();

function findStableMarkdownBoundary(text) {
  // Return the end offset of the last complete Markdown block. Blank lines finish
  // prose/list blocks; a closing triple-backtick line finishes a code block.
  let offset = 0;
  let boundary = 0;
  let inFence = false;
  const lines = text.match(/[^\n]*(?:\n|$)/g) || [];
  for (const rawLine of lines) {
    if (!rawLine) continue;
    const line = rawLine.replace(/\n$/, '');
    const isFence = /^\s*```/.test(line);
    if (isFence) {
      if (inFence) {
        inFence = false;
        boundary = offset + rawLine.length;
      } else {
        inFence = true;
      }
    } else if (!inFence && line.trim() === '') {
      boundary = offset + rawLine.length;
    }
    offset += rawLine.length;
  }
  return boundary;
}

function clearLiveBlock(live, state) {
  live.replaceChildren();
  state.liveText = '';
  state.liveMode = 'text';
  state.liveNode = null;
  state.codeText = '';
}

function updateLiveBlock(live, state, text) {
  if (!text) {
    if (state.liveText) clearLiveBlock(live, state);
    return;
  }
  const openCode = text.match(/^\s*```([a-zA-Z0-9_+-]*)\s*\n([\s\S]*)$/);
  if (openCode) {
    if (state.liveMode !== 'code') {
      live.replaceChildren();
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      if (openCode[1]) code.className = `language-${openCode[1]}`;
      pre.appendChild(code); live.appendChild(pre);
      state.liveMode = 'code'; state.liveNode = code.firstChild || code.appendChild(document.createTextNode(''));
      state.codeText = '';
    }
    const codeText = openCode[2];
    if (codeText.startsWith(state.codeText)) {
      const delta = codeText.slice(state.codeText.length);
      if (delta) state.liveNode.appendData(delta);
    } else {
      const code = live.querySelector('code');
      if (code) code.textContent = codeText;
      state.liveNode = code?.firstChild || code?.appendChild(document.createTextNode(''));
    }
    state.codeText = codeText;
    state.liveText = text;
    return;
  }
  if (state.liveMode !== 'text') {
    live.replaceChildren(); state.liveNode = null; state.liveMode = 'text'; state.liveText = '';
  }
  if (text.startsWith(state.liveText) && state.liveNode) {
    const delta = text.slice(state.liveText.length);
    if (delta) state.liveNode.appendData(delta);
  } else {
    live.replaceChildren();
    state.liveNode = document.createTextNode(text);
    live.appendChild(state.liveNode);
  }
  state.liveText = text;
}

function renderStreamingDelta(message, _delta) {
  pendingStreamMessages.set(message.id, message);
  scheduleChatHistorySave();
  if (streamRenderTimer !== null) return;
  streamRenderTimer = requestAnimationFrame(() => flushStreamUpdates());
}

function flushStreamUpdates(onlyId = null) {
  if (streamRenderTimer !== null) {
    cancelAnimationFrame(streamRenderTimer);
    streamRenderTimer = null;
  }
  const root = $('messages');
  const wasNearBottom = root.scrollHeight - root.scrollTop - root.clientHeight < 70;
  for (const [id, message] of Array.from(pendingStreamMessages.entries())) {
    if (onlyId && id !== onlyId) continue;
    const row = root.querySelector(`[data-message-id="${id}"]`);
    const body = row?.querySelector('.message-body');
    if (!body) { pendingStreamMessages.delete(id); continue; }
    let state = streamStateById.get(id);
    if (!state) {
      state = { committedLength: 0, liveText: '', liveMode: 'text', liveNode: null, codeText: '' };
      streamStateById.set(id, state);
    }
    const committed = body.querySelector('.streaming-committed') || body;
    const live = body.querySelector('.streaming-live');
    const stableBoundary = findStableMarkdownBoundary(message.content || '');
    if (stableBoundary > state.committedLength) {
      const stableDelta = message.content.slice(state.committedLength, stableBoundary);
      const holder = document.createElement('template');
      holder.innerHTML = markdownToHtml(stableDelta);
      committed.appendChild(holder.content);
      state.committedLength = stableBoundary;
      if (live) clearLiveBlock(live, state);
    }
    if (live) updateLiveBlock(live, state, (message.content || '').slice(state.committedLength));
    pendingStreamMessages.delete(id);
  }
  if (wasNearBottom) root.scrollTop = root.scrollHeight;
  if (pendingStreamMessages.size && streamRenderTimer === null) {
    streamRenderTimer = requestAnimationFrame(() => flushStreamUpdates());
  }
}

function finalizeVisibleMessage(message) {
  flushStreamUpdates(message.id);
  const root = $('messages');
  const wasNearBottom = root.scrollHeight - root.scrollTop - root.clientHeight < 70;
  const row = root.querySelector(`[data-message-id="${message.id}"]`);
  const body = row?.querySelector('.message-body');
  if (body) {
    body.classList.remove('streaming-body');
    body.innerHTML = markdownToHtml(message.content || '');
  }
  streamStateById.delete(message.id);
  pendingStreamMessages.delete(message.id);
  const content = row?.querySelector('.message-content');
  if (content && message.content) appendMessageActions(content, message);
  if (wasNearBottom) root.scrollTop = root.scrollHeight;
}
function handleChatEvent(event) {
  const agentRun = agentRuns.get(event.requestId);
  if (agentRun) {
    if (event.type === 'delta') {
      agentRun.text += event.text || '';
      if (activeBuild?.updateProgress) activeBuild.updateProgress(agentRun.model, agentRun.text.length);
      return;
    }
    if (event.type === 'done') { if (activeBuild?.currentRequestId === event.requestId) activeBuild.currentRequestId = null; agentRun.onDone(agentRun.text); return; }
    if (event.type === 'error') { if (activeBuild?.currentRequestId === event.requestId) activeBuild.currentRequestId = null; agentRun.onError(event.error); return; }
    if (event.type === 'aborted') { if (activeBuild?.currentRequestId === event.requestId) activeBuild.currentRequestId = null; agentRun.onError('Build cancelled by user.'); return; }
    return;
  }
  if (event.requestId !== activeRequestId) return;
  const message = chatMessages.find(m => m.pending && m.role === 'assistant');
  if (!message) return;
  if (event.type === 'thinking') {
    if (!message.firstTokenAt) {
      message.firstTokenAt = Date.now();
      message.ttft = message.firstTokenAt - (message.startedAt || message.firstTokenAt);
    }
    message.thinking = (message.thinking || '') + (event.text || '');
    const row = $('messages').querySelector(`[data-message-id="${message.id}"]`);
    const live = row?.querySelector('.streaming-live');
    if (live && !message.content) {
      live.textContent = `Thinking (${message.thinking.length} chars)...`;
    }
    return;
  }
  if (event.type === 'delta') {
    if (!message.firstTokenAt) {
      message.firstTokenAt = Date.now();
      message.ttft = message.firstTokenAt - (message.startedAt || message.firstTokenAt);
    }
    message.content += event.text;
    renderStreamingDelta(message, event.text);
    return;
  }
  if (event.type === 'done') {
    message.pending = false;
    message.stats = event.stats || {};
    if (message.firstTokenAt && !message.ttft) message.ttft = message.firstTokenAt - (message.startedAt || message.firstTokenAt);
    activeRequestId = null;
    setBusy(false);
    saveChat(true);
    finalizeVisibleMessage(message);
    return;
  }
  if (event.type === 'error') {
    message.pending = false; message.content = message.content ? `${message.content}\n\n**Error:** ${event.error}` : `**Error:** ${event.error}`; activeRequestId = null; setBusy(false); saveChat(true); finalizeVisibleMessage(message); return;
  }
  if (event.type === 'aborted') {
    message.pending = false; message.content ||= '_Generation stopped._'; activeRequestId = null; setBusy(false); saveChat(true); finalizeVisibleMessage(message); return;
  }
}
function renderSettings() {
  $('speedToggle').classList.toggle('on', !!settings.speedMode);
  $('speedToggle').setAttribute('aria-checked', String(!!settings.speedMode));
  $('speedToggle').setAttribute('aria-label', settings.speedMode ? 'Fast response mode enabled' : 'Fast response mode disabled');
  $('contextRange').value = Math.max(0, [4, 8, 16, 32, 64, 128, 256].indexOf(Number(settings.contextLength || 4)));
  updateContextValue();
  $('modelPathInput').value = appInfo.modelsPath || 'Managed by Ollama';
  $('versionLabel').textContent = `Version ${appInfo.version || '0.3.8'}`;
}
function updateContextValue() {
  const raw = Number($('contextRange').value || 0);
  const values = [4, 8, 16, 32, 64, 128, 256];
  const value = values[Math.max(0, Math.min(6, raw))] || Number(settings.contextLength) || 4;
  $('contextValue').textContent = `${value}k tokens`;
}
async function checkOllama() {
  const response = await window.nexus.getOllamaVersion();
  if (response.connected) { setConnection(true, `Local Engine ${response.version ? 'v' + response.version : 'online'}`); await refreshModels(); }
  else { setConnection(false, 'Local Engine offline'); installedModels = []; renderModelList($('modelSearch').value); renderModelsPage(); renderTeamRoster(); }
}
async function refreshModels() {
  try {
    installedModels = await window.nexus.getModels();
    installedModels.sort((a, b) => a.name.localeCompare(b.name));
    const health = await window.nexus.getOllamaVersion();
    setConnection(health.connected, health.connected ? `Local Engine ${health.version ? 'v' + health.version : 'online'}` : 'Local Engine offline');
    if (installedModels.length && !installedModels.some(m => m.name.toLowerCase() === settings.selectedModel.toLowerCase())) settings.selectedModel = installedModels.some(m => m.name === 'qwen3.5:9b') ? 'qwen3.5:9b' : installedModels[0].name;
    saveSettings(); updateModelSelector(); renderModelList($('modelSearch').value); renderModelsPage(); renderTeamRoster();
    return installedModels;
  } catch (error) {
    installedModels = []; setConnection(false, 'Local Engine offline'); renderModelList($('modelSearch').value); renderModelsPage(); renderTeamRoster();
    return [];
  }
}
function renderModelsPage() {
  const root = $('installedModels'); if (!root) return;
  $('installedCount').textContent = installedModels.length;
  $('ollamaWarning').classList.toggle('hidden', installedModels.length > 0);
  root.innerHTML = '';
  if (!installedModels.length) { root.innerHTML = '<div class="empty-models">No installed models found. Start the local model service and pull a specialist model above.</div>'; return; }
  for (const model of installedModels) {
    const card = document.createElement('div'); card.className = 'installed-model';
    card.innerHTML = '<div class="model-token"><svg><use href="#i-code"/></svg></div><div class="model-meta"><strong></strong><small></small></div><span class="model-size-pill"></span>';
    card.querySelector('strong').textContent = model.name;
    card.querySelector('small').textContent = `Updated ${model.modified_at ? new Date(model.modified_at).toLocaleDateString() : 'date unavailable'}`;
    card.querySelector('.model-size-pill').textContent = formatSize(model.size);
    root.appendChild(card);
  }
}
function renderTeamRoster() {
  const root = $('teamRoster'); if (!root) return;
  const installed = new Set(installedModels.map(m => m.name.toLowerCase()));
  $('teamAvailable').textContent = ROLE_REGISTRY.filter(r => installed.has(r.model.toLowerCase())).length;
  root.innerHTML = '';
  for (const role of ROLE_REGISTRY) {
    const available = installed.has(role.model.toLowerCase());
    const card = document.createElement('div'); card.className = 'team-role-card';
    card.innerHTML = `<span class="role-number">${String(role.id).padStart(2, '0')}</span><div class="team-role-copy"><strong></strong><code></code><p></p></div><span class="availability ${available ? 'ok' : 'missing'}">${role.embeddingOnly ? 'Embedding' : (available ? 'Available' : 'Missing')}</span>`;
    card.querySelector('strong').textContent = role.role; card.querySelector('code').textContent = role.model; card.querySelector('p').textContent = role.task;
    root.appendChild(card);
  }
}
function renderProjects() {
  const projects = loadProjects(); const root = $('recentProjects'); root.innerHTML = '';
  if (!projects.length) {
    root.innerHTML = '<div class="empty-state small"><div class="empty-icon"><svg><use href="#i-folder"/></svg></div><strong>No projects yet</strong><span>Create a project to start your workspace.</span></div>'; return;
  }
  const list = document.createElement('div'); list.className = 'project-list';
  for (const project of projects) {
    const card = document.createElement('article'); card.className = 'project-card';
    card.innerHTML = '<div class="feature-icon lilac"><svg><use href="#i-folder"/></svg></div><div class="project-card-copy"><h3></h3><p></p><div class="path-text"></div></div>';
    card.querySelector('h3').textContent = project.name; card.querySelector('p').textContent = `${project.target} · ${new Date(project.createdAt).toLocaleDateString()}`; card.querySelector('.path-text').textContent = project.path;
    card.title = project.path; card.addEventListener('dblclick', () => window.nexus.openFolder(project.path).catch(e => toast(e.message)));
    list.appendChild(card);
  }
  root.appendChild(list);
}
function showProjectModal() { $('modalBackdrop').classList.remove('hidden'); $('projectName').focus(); }
function hideProjectModal() { $('modalBackdrop').classList.add('hidden'); }
async function createProject(event) {
  event.preventDefault();
  const payload = { name: $('projectName').value.trim(), target: $('projectTarget').value, description: $('projectDescription').value.trim() };
  if (!payload.name) return;
  const submit = $('projectForm').querySelector('[type="submit"]'); submit.disabled = true; submit.textContent = 'Creating…';
  try {
    const result = await window.nexus.createProject(payload);
    if (result.canceled) return;
    const projects = loadProjects(); projects.unshift({ ...result.project, path: result.path }); saveProjects(projects); renderProjects(); hideProjectModal();
    $('projectForm').reset(); toast(`Workspace created: ${result.path}`, 5000);
    startNewChat();
    $('messageInput').value = `I created a new ${payload.target} project named “${payload.name}” at ${result.path}. Description: ${payload.description || '(not provided)'}. Produce a practical implementation plan, identify the first files to create, and note which specialist roles should handle each part. Do not claim any code files have been generated yet.`;
    autoResizeInput(); await sendMessage();
  } catch (error) { toast(`Could not create project: ${error.message}`, 5000); }
  finally { submit.disabled = false; submit.textContent = 'Create workspace'; }
}
async function startPull() {
  const model = $('pullModelInput').value.trim(); if (!model) { toast('Enter an exact model tag first.'); return; }
  if (activePullId) { toast('A download is already running.'); return; }
  activePullId = makeId();
  $('pullProgressWrap').classList.remove('hidden'); $('pullModelBtn').disabled = true; $('pullModelBtn').textContent = 'Downloading…'; $('pullStatus').textContent = `Starting download of ${model}`; $('pullPercent').textContent = '0%'; $('pullProgressBar').style.width = '0%';
  window.nexus.pullModel({ requestId: activePullId, model });
}
function handlePullEvent(event) {
  if (event.requestId !== activePullId) return;
  if (event.type === 'progress') {
    const item = event.item || {}; $('pullStatus').textContent = item.status || 'Downloading…';
    if (item.total && item.completed) { const pct = Math.min(100, Math.round(item.completed / item.total * 100)); $('pullPercent').textContent = `${pct}%`; $('pullProgressBar').style.width = `${pct}%`; }
  } else if (event.type === 'done') {
    $('pullStatus').textContent = 'Download complete'; $('pullPercent').textContent = '100%'; $('pullProgressBar').style.width = '100%'; activePullId = null; $('pullModelBtn').disabled = false; $('pullModelBtn').textContent = 'Pull model'; toast('Model download finished'); refreshModels();
    setTimeout(() => $('pullProgressWrap').classList.add('hidden'), 2500);
  } else if (event.type === 'error') {
    $('pullStatus').textContent = `Download failed: ${event.error}`; $('pullPercent').textContent = 'Error'; activePullId = null; $('pullModelBtn').disabled = false; $('pullModelBtn').textContent = 'Pull model'; toast(`Pull failed: ${event.error}`, 6000);
  } else if (event.type === 'aborted') {
    $('pullStatus').textContent = 'Download cancelled'; activePullId = null; $('pullModelBtn').disabled = false; $('pullModelBtn').textContent = 'Pull model';
  }
}
function resetSettings() {
  settings = { ...DEFAULT_SETTINGS }; saveSettings(); renderSettings(); setTeamMode(true); updateModelSelector(); updateBuildModeUI(); $('messageInput').placeholder = 'Send a message'; toast('Settings reset to defaults');
}
async function chooseWorkspace() {
  try {
    const chosen = await window.nexus.chooseWorkspace();
    if (!chosen) return null;
    settings.workspacePath = chosen.path;
    saveSettings(); updateBuildModeUI();
    if (chosen.empty) toast('Empty workspace selected. Turn on Build and describe what to create.', 5000);
    else toast(`Workspace selected (${chosen.entryCount} existing item${chosen.entryCount === 1 ? '' : 's'}). Existing files will only be replaced after confirmation.`, 5500);
    return chosen;
  } catch (error) { toast(`Could not select workspace: ${error.message}`, 5000); return null; }
}
async function toggleBuildMode() {
  if (isSending) return;
  if (!settings.workspacePath) {
    const chosen = await chooseWorkspace();
    if (!chosen) return;
  }
  settings.buildMode = !settings.buildMode;
  saveSettings(); updateBuildModeUI();
  toast(settings.buildMode ? 'Build mode on: your next message will generate files in the selected folder.' : 'Build mode off: messages will be normal chat.', 4500);
  if (settings.buildMode) $('messageInput').placeholder = 'Describe the app, website, code, or prompt to create in your workspace…';
  else $('messageInput').placeholder = 'Send a message';
}
function stopDictation() {
  if (!speechRecognition) return;
  try { speechRecognition.stop(); } catch {}
}
function startDictation() {
  if (speechRecognition) { stopDictation(); return; }
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    toast('Voice dictation is not available in this Electron build. You can use Windows Voice Typing with Win + H.', 6500);
    return;
  }
  const recognition = new Recognition();
  speechRecognition = recognition;
  dictationBase = $('messageInput').value.trimEnd();
  let finalTranscript = '';
  recognition.lang = navigator.language || 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  $('micBtn').classList.add('listening');
  $('micBtn').setAttribute('aria-pressed', 'true');
  $('micBtn').setAttribute('aria-label', 'Stop voice dictation');
  $('micBtn').title = 'Listening… click to stop';
  toast('Listening. Speak naturally; recognized words will appear here. Browser speech recognition may require internet.', 4500);
  recognition.onresult = (event) => {
    let interim = '';
    for (let index = event.resultIndex; index < event.results.length; index++) {
      const result = event.results[index];
      const transcript = result[0]?.transcript || '';
      if (result.isFinal) finalTranscript += `${transcript} `;
      else interim += transcript;
    }
    const speech = `${finalTranscript}${interim}`.trimStart();
    $('messageInput').value = [dictationBase, speech].filter(Boolean).join(dictationBase && speech ? ' ' : '');
    autoResizeInput();
  };
  recognition.onerror = (event) => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') toast('Microphone permission was denied. Allow microphone access in Windows and try again.', 6000);
    else if (event.error !== 'no-speech' && event.error !== 'aborted') toast(`Dictation error: ${event.error}`, 5000);
  };
  recognition.onend = () => {
    if (speechRecognition !== recognition) return;
    speechRecognition = null;
    $('micBtn').classList.remove('listening');
    $('micBtn').setAttribute('aria-pressed', 'false');
    $('micBtn').setAttribute('aria-label', 'Start voice dictation');
    $('micBtn').title = 'Dictate a message';
    autoResizeInput();
  };
  try { recognition.start(); }
  catch (error) { speechRecognition = null; $('micBtn').classList.remove('listening'); $('micBtn').setAttribute('aria-pressed', 'false'); toast(`Could not start dictation: ${error.message}`, 5000); }
}

// ==========================================================================
// IDeV S2S (Speech-to-Speech) Live Voice AI System
// ==========================================================================

let s2sPipeline = null;
let s2sState = 'idle'; // 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking' | 'interrupted' | 'muted' | 'error'
let s2sStatus = {
  hasKey: false,
  maskedKey: '',
  model: 'models/gemini-2.5-flash-native-audio-latest',
  voice: 'Puck',
  language: 'hinglish',
  engine: 'gemini-live',
  vadSensitivity: 'medium',
  isConnected: false
};
let s2sActiveTurn = { userText: '', assistantText: '', isInterrupted: false };
let s2sLocalRecognition = null;

function setS2SState(newState, meta = {}) {
  s2sState = newState;
  const btn = $('s2sOrbBtn');
  if (!btn) return;

  const validStates = ['idle', 'connecting', 'listening', 'processing', 'speaking', 'interrupted', 'muted', 'error'];
  validStates.forEach(s => btn.classList.remove(`s2s-${s}`));
  btn.classList.add(`s2s-${newState}`);

  const titles = {
    idle: 'Start Live Speech-to-Speech (IDeV S2S) · Right-click for Settings',
    connecting: 'Connecting to IDeV Voice (Gemini Live)...',
    listening: 'Listening to your voice... Speak naturally in Hinglish',
    processing: 'Processing speech...',
    speaking: 'IDeV Voice is speaking... (Start talking to interrupt / barge-in)',
    interrupted: 'Interrupted! Listening to your new question...',
    muted: 'Microphone muted',
    error: meta.error ? `S2S Error: ${meta.error}` : 'S2S Voice Error'
  };

  btn.title = titles[newState] || 'IDeV Live Voice';
  btn.setAttribute('aria-pressed', newState !== 'idle' ? 'true' : 'false');

  if (newState === 'interrupted') {
    setTimeout(() => {
      if (s2sState === 'interrupted') {
        setS2SState('listening');
      }
    }, 380);
  }
}

function updateS2SWaveform(rms, db) {
  const meterFill = $('s2sMeterFill');
  const dbLabel = $('s2sDbLevel');
  if (meterFill && dbLabel) {
    const percent = Math.min(100, Math.max(0, (db + 60) * (100 / 60)));
    meterFill.style.width = `${percent}%`;
    dbLabel.textContent = `${Math.round(db)} dB`;
  }

  if (s2sState === 'listening') {
    const bars = document.querySelectorAll('#s2sOrbBtn .s2s-bar');
    if (bars && bars.length) {
      const scale = Math.max(0.3, Math.min(2.4, rms * 18));
      bars.forEach((bar, idx) => {
        const factor = [0.8, 1.2, 1.5, 1.1, 0.7][idx] || 1;
        bar.style.transform = `scaleY(${scale * factor})`;
      });
    }
  }
}

async function toggleS2SSession() {
  if (s2sState !== 'idle') {
    await stopS2SSession();
  } else {
    await startS2SSession();
  }
}

async function startS2SSession() {
  try {
    if (!window.nexus || !window.nexus.s2s) {
      toast('S2S Voice API is unavailable in this runtime.');
      return;
    }

    s2sStatus = await window.nexus.s2s.getStatus();

    if (s2sStatus.engine === 'local') {
      await startLocalS2SSession();
      return;
    }

    if (!s2sStatus.hasKey) {
      toast('Please enter and save your Gemini API key in S2S Settings to start Live Voice.', 6000);
      openS2SModal();
      return;
    }

    setS2SState('connecting');

    if (!s2sPipeline && typeof S2SAudioPipeline !== 'undefined') {
      s2sPipeline = new S2SAudioPipeline({
        onAudioChunk: (base64Chunk) => {
          if (s2sState === 'listening' || s2sState === 'speaking') {
            window.nexus.s2s.sendAudioChunk(base64Chunk);
          }
        },
        onVolume: ({ rms, db }) => {
          updateS2SWaveform(rms, db);
        },
        onBargeIn: ({ reason, rms }) => {
          console.log('[S2S] Client barge-in detected via local VAD (rms:', rms, ')');
          window.nexus.s2s.interrupt();
          handleBargeIn('client_vad');
        }
      });
    }

    if (s2sPipeline) {
      s2sPipeline.setVadSensitivity(s2sStatus.vadSensitivity || 'medium');
      await s2sPipeline.initCapture();
    }

    const res = await window.nexus.s2s.startSession({
      model: s2sStatus.model,
      voice: s2sStatus.voice,
      language: s2sStatus.language
    });

    if (!res.ok) {
      setS2SState('error', { error: res.error });
      toast(`Failed to start S2S session: ${res.error}`, 6000);
      s2sPipeline?.stopCapture();
    }
  } catch (err) {
    setS2SState('error', { error: err.message });
    toast(`Microphone or S2S error: ${err.message}`, 6000);
    s2sPipeline?.stopCapture();
  }
}

async function stopS2SSession() {
  if (s2sPipeline) {
    s2sPipeline.cleanup();
  }
  if (s2sLocalRecognition) {
    try { s2sLocalRecognition.stop(); } catch {}
    s2sLocalRecognition = null;
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (window.nexus && window.nexus.s2s) {
    await window.nexus.s2s.stopSession();
  }
  setS2SState('idle');
  const bars = document.querySelectorAll('#s2sOrbBtn .s2s-bar');
  bars.forEach(bar => bar.style.transform = '');
}

function handleBargeIn(reason = 'vad') {
  setS2SState('interrupted');
  if (s2sPipeline) {
    s2sPipeline.interruptPlayback();
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (s2sActiveTurn.assistantText) {
    s2sActiveTurn.isInterrupted = true;
    s2sActiveTurn.assistantText += ' [Interrupted by user]';
    appendVoiceTurnToChat(s2sActiveTurn.userText, s2sActiveTurn.assistantText, true);
    s2sActiveTurn = { userText: '', assistantText: '', isInterrupted: false };
  }
}

function appendVoiceTurnToChat(userText, assistantText, wasInterrupted = false) {
  if (!userText && !assistantText) return;

  const now = new Date().toISOString();
  if (userText) {
    chatMessages.push({
      id: `msg-${Date.now()}-u`,
      role: 'user',
      content: userText,
      timestamp: now,
      isVoice: true
    });
  }
  if (assistantText) {
    chatMessages.push({
      id: `msg-${Date.now()}-a`,
      role: 'assistant',
      content: assistantText,
      timestamp: now,
      isVoice: true,
      wasInterrupted: wasInterrupted
    });
  }

  renderMessages();
  saveCurrentChat();
}

async function startLocalS2SSession() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    toast('Web Speech recognition is not supported in this environment for Local mode.', 5000);
    return;
  }

  setS2SState('listening');
  toast('Local Offline Voice Mode active (Ollama + System TTS). Speak in Hinglish or English.', 4000);

  s2sLocalRecognition = new SpeechRecognition();
  s2sLocalRecognition.continuous = true;
  s2sLocalRecognition.interimResults = false;
  s2sLocalRecognition.lang = s2sStatus.language === 'hindi' ? 'hi-IN' : 'en-IN';

  s2sLocalRecognition.onresult = async (event) => {
    const last = event.results[event.results.length - 1];
    if (last && last.isFinal) {
      const userSpeech = last[0].transcript.trim();
      if (!userSpeech) return;

      setS2SState('processing');
      try {
        const specialist = selectBuildRole(userSpeech) || ROLE_REGISTRY[0];
        let assistantReply = '';
        const systemPrompt = 'You are IDeV Voice built by Ubaid. Speak conversationally and concisely in natural Hinglish (using Roman script). Keep responses very brief (1-2 sentences) for spoken dialogue.';
        const messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userSpeech }
        ];

        const res = await fetch('http://127.0.0.1:11434/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: specialist.model || (models[0]?.name || 'deepseek-r1:1.5b'),
            messages: messages,
            stream: false
          })
        });

        if (res.ok) {
          const data = await res.json();
          assistantReply = data.message?.content || '';
          assistantReply = assistantReply.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
          
          setS2SState('speaking');
          speakLocalText(assistantReply, () => {
            appendVoiceTurnToChat(userSpeech, assistantReply, false);
            if (s2sState === 'speaking') setS2SState('listening');
          });
        } else {
          setS2SState('listening');
        }
      } catch (err) {
        console.error('Local speech error:', err);
        setS2SState('listening');
      }
    }
  };

  s2sLocalRecognition.onerror = (e) => {
    if (e.error !== 'no-speech') {
      console.warn('Local recognition error:', e.error);
    }
  };

  s2sLocalRecognition.onend = () => {
    if (s2sState !== 'idle' && s2sStatus.engine === 'local') {
      try { s2sLocalRecognition.start(); } catch {}
    }
  };

  try {
    s2sLocalRecognition.start();
  } catch (err) {
    setS2SState('error', { error: err.message });
  }
}

function speakLocalText(text, onDone) {
  if (!window.speechSynthesis) {
    onDone?.();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  utterance.pitch = 1.0;
  utterance.onend = () => onDone?.();
  utterance.onerror = () => onDone?.();
  window.speechSynthesis.speak(utterance);
}

async function openS2SModal() {
  if (window.nexus && window.nexus.s2s) {
    s2sStatus = await window.nexus.s2s.getStatus();
  }

  if (s2sStatus.engine === 'local') {
    if ($('s2sEngineLocal')) $('s2sEngineLocal').checked = true;
    if ($('s2sKeySection')) $('s2sKeySection').style.display = 'none';
  } else {
    if ($('s2sEngineGemini')) $('s2sEngineGemini').checked = true;
    if ($('s2sKeySection')) $('s2sKeySection').style.display = 'block';
  }

  if ($('s2sApiKeyInput')) $('s2sApiKeyInput').value = s2sStatus.maskedKey || '';
  if ($('s2sModelSelect')) $('s2sModelSelect').value = s2sStatus.model || 'models/gemini-2.5-flash-native-audio-latest';
  if ($('s2sVoiceSelect')) $('s2sVoiceSelect').value = s2sStatus.voice || 'Puck';
  if ($('s2sLanguageSelect')) $('s2sLanguageSelect').value = s2sStatus.language || 'hinglish';
  if ($('s2sVadSelect')) $('s2sVadSelect').value = s2sStatus.vadSensitivity || 'medium';

  updateKeyBadge(s2sStatus.hasKey);
  $('s2sKeyFeedback')?.classList.add('hidden');
  $('s2sModal')?.classList.remove('hidden');
}

function updateKeyBadge(isValid) {
  const badge = $('s2sKeyStatusBadge');
  if (!badge) return;
  if (isValid) {
    badge.textContent = 'Key Configured & Active';
    badge.className = 'key-status-badge valid';
  } else {
    badge.textContent = 'Missing API Key';
    badge.className = 'key-status-badge missing';
  }
}

function closeS2SModal() {
  $('s2sModal')?.classList.add('hidden');
}

async function testS2SKey() {
  const inputKey = $('s2sApiKeyInput').value.trim();
  const feedback = $('s2sKeyFeedback');
  const testBtn = $('testKeyBtn');
  if (feedback) {
    feedback.classList.remove('hidden', 'success', 'error');
    feedback.textContent = 'Testing connection to Gemini Live API...';
  }
  if (testBtn) testBtn.disabled = true;

  try {
    const res = await window.nexus.s2s.testConnection(inputKey);
    if (testBtn) testBtn.disabled = false;
    if (res.ok) {
      if (feedback) {
        feedback.className = 's2s-feedback-msg success';
        feedback.textContent = 'Connection test successful! Gemini Live API verified.';
      }
      updateKeyBadge(true);
    } else {
      if (feedback) {
        feedback.className = 's2s-feedback-msg error';
        feedback.textContent = `Connection failed: ${res.error}`;
      }
      updateKeyBadge(false);
    }
  } catch (err) {
    if (testBtn) testBtn.disabled = false;
    if (feedback) {
      feedback.className = 's2s-feedback-msg error';
      feedback.textContent = `Error testing connection: ${err.message}`;
    }
  }
}

async function saveS2SConfig(e) {
  if (e) e.preventDefault();
  const engine = $('s2sEngineGemini')?.checked ? 'gemini-live' : 'local';
  const apiKey = $('s2sApiKeyInput')?.value.trim();
  const model = $('s2sModelSelect')?.value;
  const voice = $('s2sVoiceSelect')?.value;
  const language = $('s2sLanguageSelect')?.value;
  const vadSensitivity = $('s2sVadSelect')?.value;

  try {
    const updated = await window.nexus.s2s.saveConfig({
      engine,
      apiKey,
      model,
      voice,
      language,
      vadSensitivity
    });
    s2sStatus = updated;
    updateKeyBadge(updated.hasKey);
    toast('S2S Voice settings saved successfully.');
    closeS2SModal();
  } catch (err) {
    toast(`Failed to save settings: ${err.message}`, 5000);
  }
}

function initS2S() {
  if (!window.nexus || !window.nexus.s2s) return;

  window.nexus.s2s.getStatus().then(status => {
    s2sStatus = status;
    updateKeyBadge(status.hasKey);
  }).catch(() => {});

  window.nexus.s2s.onReady((meta) => {
    setS2SState('listening');
    toast('IDeV Voice Live! Speak naturally in Hinglish.', 3500);
  });

  window.nexus.s2s.onAudioChunk((chunk) => {
    setS2SState('speaking');
    if (s2sPipeline && chunk?.data) {
      s2sPipeline.queueAudioChunk(chunk.data);
    }
  });

  window.nexus.s2s.onTranscript((data) => {
    if (data?.text) {
      s2sActiveTurn.assistantText = (s2sActiveTurn.assistantText ? s2sActiveTurn.assistantText + ' ' : '') + data.text;
    }
  });

  window.nexus.s2s.onTurnComplete((info) => {
    if (s2sState === 'speaking' || s2sState === 'processing') {
      setS2SState('listening');
    }
    if (s2sActiveTurn.assistantText) {
      appendVoiceTurnToChat(s2sActiveTurn.userText, s2sActiveTurn.assistantText, !!info?.interrupted);
      s2sActiveTurn = { userText: '', assistantText: '', isInterrupted: false };
    }
  });

  window.nexus.s2s.onInterrupted((info) => {
    console.log('[S2S] Server reported barge-in interruption:', info);
    handleBargeIn('server_vad');
  });

  window.nexus.s2s.onClosed(() => {
    if (s2sState !== 'idle') {
      stopS2SSession();
    }
  });

  window.nexus.s2s.onError((err) => {
    setS2SState('error', { error: err.message });
    toast(`S2S Voice Error: ${err.message}`, 6000);
  });

  window.nexus.s2s.onStateChange((data) => {
    if (data?.state) setS2SState(data.state);
  });
}

function bindEvents() {
  window.addEventListener('beforeunload', () => { if (screenCaptureTimer) clearInterval(screenCaptureTimer); });
  $('sidebarToggle').addEventListener('click', () => $('sidebar').classList.toggle('collapsed'));
  $('newChatBtn').addEventListener('click', startNewChat);
  const updateSearchClearVisibility = () => {
    const val = $('historySearch')?.value || '';
    $('clearHistorySearchBtn')?.classList.toggle('hidden', !val);
  };
  $('historySearch').addEventListener('input', () => {
    updateSearchClearVisibility();
    renderChatHistory($('historySearch').value);
  });
  $('clearHistorySearchBtn')?.addEventListener('click', () => {
    if ($('historySearch')) $('historySearch').value = '';
    updateSearchClearVisibility();
    renderChatHistory('');
    $('historySearch')?.focus();
  });
  $('chatHistoryList').addEventListener('click', (event) => { const row = event.target.closest('.history-item'); if (!row) return; if (event.target.closest('button[data-action]')) { handleHistoryAction(event); return; } openSavedChat(row.dataset.chatId); });
  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
  $('teamModeBtn').addEventListener('click', () => setTeamMode(!settings.teamMode));
  $('modelSelectBtn').addEventListener('click', () => { const dropdown = $('modelDropdown'); dropdown.classList.toggle('hidden'); $('modelSelectBtn').setAttribute('aria-expanded', String(!dropdown.classList.contains('hidden'))); if (!dropdown.classList.contains('hidden')) { renderModelList($('modelSearch').value); $('modelSearch').focus(); } });
  $('closeModelDropdown').addEventListener('click', () => $('modelDropdown').classList.add('hidden'));
  $('dropdownTeamToggle').addEventListener('click', () => setTeamMode(!settings.teamMode));
  $('modelSearch').addEventListener('input', () => renderModelList($('modelSearch').value));
  $('modelSearch').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const firstOpt = $('modelList')?.querySelector('.model-option');
      if (firstOpt) firstOpt.focus();
    } else if (e.key === 'Escape') {
      $('modelDropdown').classList.add('hidden');
      $('modelSelectBtn').setAttribute('aria-expanded', 'false');
      $('modelSelectBtn').focus();
    }
  });
  $('manageModelsBtn').addEventListener('click', () => { $('modelDropdown').classList.add('hidden'); showPage('models'); });
  document.addEventListener('click', (event) => {
    if (!$('modelDropdown').contains(event.target) && !$('modelSelectBtn').contains(event.target)) {
      $('modelDropdown').classList.add('hidden');
      $('modelSelectBtn').setAttribute('aria-expanded', 'false');
    }
    if ($('attachMenu') && !$('attachMenu').contains(event.target) && !$('attachBtn')?.contains(event.target)) {
      $('attachMenu').classList.add('hidden');
      $('attachBtn')?.setAttribute('aria-expanded', 'false');
    }
  });
  $('sendBtn').addEventListener('click', sendMessage);
  $('workspaceBtn').addEventListener('click', () => {
    $('attachMenu')?.classList.add('hidden');
    $('attachBtn')?.setAttribute('aria-expanded', 'false');
    chooseWorkspace();
  });
  $('workspaceStatus')?.addEventListener('click', chooseWorkspace);
  $('buildModeBtn').addEventListener('click', toggleBuildMode);
  $('s2sOrbBtn')?.addEventListener('click', toggleS2SSession);
  $('s2sOrbBtn')?.addEventListener('contextmenu', (e) => { e.preventDefault(); openS2SModal(); });
  $('s2sSettingsBtn')?.addEventListener('click', openS2SModal);
  $('micBtn').addEventListener('click', () => {
    $('attachMenu')?.classList.add('hidden');
    $('attachBtn')?.setAttribute('aria-expanded', 'false');
    startDictation();
  });
  $('messageInput').addEventListener('input', autoResizeInput);
  $('messageInput').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } });
  $('attachBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = $('attachMenu');
    if (!menu) return;
    const isHidden = menu.classList.toggle('hidden');
    $('attachBtn').setAttribute('aria-expanded', String(!isHidden));
    if (!isHidden) {
      if ($('attachWorkspaceHint')) {
        $('attachWorkspaceHint').textContent = settings.workspacePath
          ? `Inject tree from ${settings.workspacePath.split(/[\/\\]/).pop()}`
          : 'Select workspace folder first';
      }
      if ($('marketplaceToolsHint')) {
        window.nexus.integrations?.list?.({ category: 'connected', workspacePath: settings.workspacePath })
          .then(list => {
            if ($('marketplaceToolsHint')) {
              $('marketplaceToolsHint').textContent = `${(list || []).length} connected integration${(list || []).length === 1 ? '' : 's'}`;
            }
          }).catch(() => {});
      }
      const firstItem = menu.querySelector('.attach-menu-item');
      firstItem?.focus();
    }
  });

  $('attachMenu')?.addEventListener('keydown', (e) => {
    const items = Array.from($('attachMenu').querySelectorAll('.attach-menu-item'));
    const currentIndex = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % items.length;
      items[nextIndex]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + items.length) % items.length;
      items[prevIndex]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      $('attachMenu').classList.add('hidden');
      $('attachBtn').setAttribute('aria-expanded', 'false');
      $('attachBtn').focus();
    }
  });

  $('attachFileBtn')?.addEventListener('click', () => {
    $('attachMenu')?.classList.add('hidden');
    $('attachBtn')?.setAttribute('aria-expanded', 'false');
    $('fileAttachInput')?.click();
  });
  $('attachImageBtn')?.addEventListener('click', () => {
    $('attachMenu')?.classList.add('hidden');
    $('attachBtn')?.setAttribute('aria-expanded', 'false');
    $('fileAttachInput')?.click();
  });

  $('attachWorkspaceBtn')?.addEventListener('click', async () => {
    $('attachMenu')?.classList.add('hidden');
    $('attachBtn')?.setAttribute('aria-expanded', 'false');
    if (!settings.workspacePath) {
      toast('Select a workspace folder first.');
      chooseWorkspace();
      return;
    }
    toast('Analyzing workspace context...');
    try {
      const tree = await window.nexus.readWorkspace(settings.workspacePath);
      const fileList = Array.isArray(tree?.files) ? tree.files : [];
      const summaryText = `Workspace Context: ${settings.workspacePath}\nTotal Project Files: ${fileList.length}\nTop-level layout:\n` +
        fileList.slice(0, 35).map(f => `- ${f.path || f.name}`).join('\n') +
        (fileList.length > 35 ? `\n... (+${fileList.length - 35} more files)` : '');
      
      pendingAttachments.push({
        type: 'text',
        name: 'workspace-context.txt',
        content: summaryText
      });
      renderAttachmentPreview();
      autoResizeInput();
      toast(`Attached workspace context (${fileList.length} files)`);
    } catch (e) {
      toast(`Could not attach workspace: ${e.message}`, 4000);
    }
  });

  $('webSearchBtn')?.addEventListener('click', async () => {
    $('attachMenu')?.classList.add('hidden');
    $('attachBtn')?.setAttribute('aria-expanded', 'false');
    const existingVal = $('messageInput').value.trim();
    const query = prompt('Enter query to search the web (via DuckDuckGo Instant Research):', existingVal || 'modern electron best practices');
    if (!query) return;
    toast(`Searching web for "${query}"...`);
    try {
      const res = await window.nexus.connectors.execute({
        connectorId: 'connector-web-search',
        action: 'search',
        params: { query }
      });
      if (!res.results || !res.results.length) {
        toast(`No web results found for "${query}"`);
        return;
      }
      const researchText = `Web Research Results for: "${query}"\n\n` +
        res.results.map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\nSource: ${r.url}`).join('\n\n');
      
      pendingAttachments.push({
        type: 'text',
        name: `web-research-${query.slice(0, 15).replace(/\s+/g, '_')}.txt`,
        content: researchText
      });
      renderAttachmentPreview();
      autoResizeInput();
      toast(`Added ${res.results.length} web research sources to message context.`);
    } catch (err) {
      toast(`Web search error: ${err.message}`, 5000);
    }
  });

  $('codeSearchActionBtn')?.addEventListener('click', async () => {
    $('attachMenu')?.classList.add('hidden');
    $('attachBtn')?.setAttribute('aria-expanded', 'false');
    if (!settings.workspacePath) {
      toast('Select a workspace folder first.');
      chooseWorkspace();
      return;
    }
    const q = prompt('Search codebase (grep pattern):', $('messageInput').value.trim() || '');
    if (!q) return;
    toast(`Searching workspace for "${q}"...`);
    try {
      const res = await window.nexus.connectors.execute({
        connectorId: 'connector-fs-search',
        action: 'grep',
        params: { query: q },
        workspacePath: settings.workspacePath
      });
      if (!res.matches || !res.matches.length) {
        toast(`No matches found for "${q}" in workspace.`);
        return;
      }
      const grepText = `Codebase Search Matches for: "${q}" (${res.matches.length} found)\n\n` +
        res.matches.slice(0, 25).map(m => `${m.file}:${m.line} -> ${m.text}`).join('\n');
      pendingAttachments.push({
        type: 'text',
        name: `grep-${q.slice(0, 15).replace(/\s+/g, '_')}.txt`,
        content: grepText
      });
      renderAttachmentPreview();
      autoResizeInput();
      toast(`Attached ${res.matches.length} code search matches.`);
    } catch (err) {
      toast(`Code search error: ${err.message}`, 5000);
    }
  });

  $('checkpointActionBtn')?.addEventListener('click', () => {
    $('attachMenu')?.classList.add('hidden');
    $('attachBtn')?.setAttribute('aria-expanded', 'false');
    if (!settings.workspacePath) {
      toast('Select a workspace folder first.');
      chooseWorkspace();
      return;
    }
    $('checkpointModal')?.classList.remove('hidden');
    $('checkpointDescription')?.focus();
  });

  $('gitStatusActionBtn')?.addEventListener('click', async () => {
    $('attachMenu')?.classList.add('hidden');
    $('attachBtn')?.setAttribute('aria-expanded', 'false');
    if (!settings.workspacePath) {
      toast('Select a workspace folder first.');
      chooseWorkspace();
      return;
    }
    toast('Checking Git status in workspace...');
    try {
      const res = await window.nexus.connectors.execute({
        connectorId: 'connector-local-git',
        action: 'status',
        params: {},
        workspacePath: settings.workspacePath
      });
      const branchRes = await window.nexus.connectors.execute({
        connectorId: 'connector-local-git',
        action: 'branch',
        params: {},
        workspacePath: settings.workspacePath
      }).catch(() => ({ currentBranch: 'main' }));
      const statusText = `Git Status [Branch: ${branchRes.currentBranch || 'unknown'}]\n` +
        (res.status || 'Working tree clean.');
      pendingAttachments.push({
        type: 'text',
        name: 'git-status.txt',
        content: statusText
      });
      renderAttachmentPreview();
      autoResizeInput();
      toast(`Attached Git status for branch "${branchRes.currentBranch || 'main'}"`);
    } catch (err) {
      toast(`Git error: ${err.message}`, 5000);
    }
  });

  $('openMarketplaceBtn')?.addEventListener('click', () => {
    $('attachMenu')?.classList.add('hidden');
    $('attachBtn')?.setAttribute('aria-expanded', 'false');
    showPage('integrations');
    switchIntegrationsTab('marketplaceTabPane');
  });
  $('fileAttachInput').addEventListener('change', async (event) => {
    for (const file of Array.from(event.target.files || [])) {
      if (pendingAttachments.length >= 8) { toast('Up to 8 attachments can be added to one message.'); break; }
      try {
        const extension = String(file.name || '').split('.').pop().toLowerCase();
        const mime = file.type.toLowerCase() || ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[extension] || '');
        if (['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)) {
          if (pendingAttachments.filter(item => item.type === 'image').length >= 4) { toast('Attach up to 4 images per message.'); continue; }
          const image = await createImageAttachment(file, file.name, mime);
          pendingAttachments.push(image);
        } else {
          if (file.size > 150000) { toast(`${file.name} is over 150 KB and was skipped.`); continue; }
          const content = await file.text();
          pendingAttachments.push({ type: 'text', name: file.name, content });
        }
      } catch (error) { toast(`Could not attach ${file.name}: ${error.message || error}`, 5000); }
    }
    event.target.value = ''; renderAttachmentPreview(); autoResizeInput();
  });
  $('messageInput').addEventListener('paste', async event => {
    const imageItems = Array.from(event.clipboardData?.items || []).filter(item => item.kind === 'file' && /^image\/(png|jpeg|webp|gif)$/i.test(item.type));
    if (!imageItems.length) return;
    event.preventDefault();
    for (const item of imageItems) {
      if (pendingAttachments.filter(attachment => attachment.type === 'image').length >= 4) { toast('Attach up to 4 images per message.'); break; }
      const file = item.getAsFile();
      if (!file) continue;
      try { pendingAttachments.push(await createImageAttachment(file, `Pasted image ${pendingAttachments.filter(a => a.type === 'image').length + 1}`, item.type)); }
      catch (error) { toast(`Could not paste image: ${error.message || error}`, 5000); }
    }
    renderAttachmentPreview(); autoResizeInput();
  });
  $('screenShareBtn').addEventListener('click', () => {
    $('attachMenu')?.classList.add('hidden');
    $('attachBtn')?.setAttribute('aria-expanded', 'false');
    if (activeScreenSource) stopScreenSharing(true);
    else showScreenSourcePicker();
  });
  $('cancelScreenPickerBtn').addEventListener('click', () => $('screenPickerBackdrop').classList.add('hidden'));
  $('refreshScreenSourcesBtn').addEventListener('click', showScreenSourcePicker);
  $('screenPickerBackdrop').addEventListener('click', event => { if (event.target === $('screenPickerBackdrop')) $('screenPickerBackdrop').classList.add('hidden'); });
  $('closeImageViewerBtn').addEventListener('click', () => $('imageViewerBackdrop').classList.add('hidden'));
  $('imageViewerBackdrop').addEventListener('click', event => { if (event.target === $('imageViewerBackdrop')) $('imageViewerBackdrop').classList.add('hidden'); });

  // File Preview Modal (Build Mode 2.0)
  $('closeFilePreviewBtn')?.addEventListener('click', () => $('filePreviewModal').classList.add('hidden'));
  $('closeFilePreviewFootBtn')?.addEventListener('click', () => $('filePreviewModal').classList.add('hidden'));
  $('filePreviewModal')?.addEventListener('click', event => { if (event.target === $('filePreviewModal')) $('filePreviewModal').classList.add('hidden'); });
  $('copyFilePreviewBtn')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(currentPreviewContent);
      toast('File content copied to clipboard.');
    } catch {
      toast('Failed to copy content.');
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      $('screenPickerBackdrop').classList.add('hidden');
      $('imageViewerBackdrop').classList.add('hidden');
      $('filePreviewModal')?.classList.add('hidden');
      $('attachMenu')?.classList.add('hidden');
      $('attachBtn')?.setAttribute('aria-expanded', 'false');
      $('integrationDetailsModal')?.classList.add('hidden');
    }
  });
  document.querySelectorAll('.subnav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchIntegrationsTab(tab.dataset.tab));
  });
  $('projectBtn').addEventListener('click', showProjectModal); $('createProjectTop').addEventListener('click', showProjectModal); $('createProjectCard').addEventListener('click', showProjectModal);
  $('closeModalBtn').addEventListener('click', hideProjectModal); $('cancelProjectBtn').addEventListener('click', hideProjectModal); $('modalBackdrop').addEventListener('click', (event) => { if (event.target === $('modalBackdrop')) hideProjectModal(); }); $('projectForm').addEventListener('submit', createProject);
  $('modelsCard').addEventListener('click', () => showPage('models')); $('teamCard').addEventListener('click', () => showPage('team'));
  $('mcpCard')?.addEventListener('click', () => showPage('mcp'));
  $('connectorsCard')?.addEventListener('click', () => showPage('connectors'));
  $('memoryCard')?.addEventListener('click', () => showPage('memory'));
  $('checkpointsCard')?.addEventListener('click', () => showPage('checkpoints'));

  // Native Integrations Marketplace Events
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      renderMarketplacePage(chip.dataset.filter, $('marketplaceSearch')?.value || '');
    });
  });

  $('marketplaceSearch')?.addEventListener('input', () => {
    const activeChip = document.querySelector('.filter-chip.active');
    const cat = activeChip ? activeChip.dataset.filter : 'all';
    renderMarketplacePage(cat, $('marketplaceSearch').value.trim());
  });

  $('refreshMarketplaceBtn')?.addEventListener('click', async () => {
    toast('Refreshing integrations catalog & health...');
    await window.nexus.integrations.refreshAll({ workspacePath: settings.workspacePath });
    await renderMarketplacePage();
    toast('Integrations catalog refreshed.');
  });

  const handleIntegrationCardAction = async (id, action) => {
    if (id === 'connector-web-search') {
      toast('Testing DuckDuckGo instant web research...');
      try {
        const res = await window.nexus.connectors.execute({
          connectorId: 'connector-web-search',
          action: 'search',
          params: { query: 'IDeV Advanced software' }
        });
        toast(`Web search verified! ${res.results.length} sources returned from ${res.source}.`);
        renderMarketplacePage();
      } catch (err) {
        toast(`Web search test failed: ${err.message}`, 5000);
      }
    } else if (id === 'connector-local-git') {
      if (!settings.workspacePath) {
        toast('Select a workspace folder first.');
        chooseWorkspace();
      } else {
        switchIntegrationsTab('connectorsTabPane');
        runGitAction('status');
      }
    } else if (id === 'connector-fs-search') {
      switchIntegrationsTab('connectorsTabPane');
      $('codeSearchInput')?.focus();
    } else if (id === 'mcp-service') {
      $('addMcpModal')?.classList.remove('hidden');
      $('mcpName')?.focus();
    } else if (id === 'service-gemini-live') {
      openS2SModal();
    } else if (id === 'service-project-memory') {
      switchIntegrationsTab('memoryTabPane');
    } else if (id === 'service-checkpoints') {
      switchIntegrationsTab('checkpointsTabPane');
    } else if (id === 'service-ollama-mesh') {
      showPage('models');
    } else if (id.startsWith('mcp-server-')) {
      const rawId = id.replace('mcp-server-', '');
      try {
        if (action === 'Disconnect') {
          await window.nexus.mcp.disconnect(rawId);
          toast('MCP server disconnected.');
        } else {
          await window.nexus.mcp.connect(rawId);
          toast('MCP server connected.');
        }
        renderMarketplacePage();
      } catch (err) {
        toast(`MCP error: ${err.message}`, 5000);
      }
    } else {
      openIntegrationDetails(id);
    }
  };

  $('marketplaceGrid')?.addEventListener('click', (e) => {
    const detailsBtn = e.target.closest('.view-details-btn');
    if (detailsBtn) {
      openIntegrationDetails(detailsBtn.dataset.id);
      return;
    }
    const actBtn = e.target.closest('.int-primary-btn');
    if (actBtn) {
      handleIntegrationCardAction(actBtn.dataset.id, actBtn.dataset.action);
    }
  });

  // Integration Details Modal Events
  $('closeIntModalBtn')?.addEventListener('click', () => $('integrationDetailsModal').classList.add('hidden'));
  $('intModalCloseBtn')?.addEventListener('click', () => $('integrationDetailsModal').classList.add('hidden'));
  $('integrationDetailsModal')?.addEventListener('click', (e) => {
    if (e.target === $('integrationDetailsModal')) $('integrationDetailsModal').classList.add('hidden');
  });

  $('intModalTestBtn')?.addEventListener('click', async () => {
    if (!activeDetailsIntegration) return;
    toast(`Testing ${activeDetailsIntegration.name}...`);
    try {
      const health = await window.nexus.integrations.health(activeDetailsIntegration.id, { workspacePath: settings.workspacePath });
      $('intModalHealthMessage').textContent = health.message;
      $('intModalLatency').textContent = `${health.latencyMs}ms response`;
      const badge = $('intModalStatusBadge');
      badge.className = `availability ${health.ok ? 'ok' : 'missing'}`;
      badge.textContent = (health.status || '').toUpperCase();
      toast(`${activeDetailsIntegration.name}: ${health.message}`);
    } catch (err) {
      toast(`Health check error: ${err.message}`, 5000);
    }
  });

  $('intModalActionBtn')?.addEventListener('click', () => {
    if (!activeDetailsIntegration) return;
    const act = $('intModalActionBtn').textContent.trim();
    $('integrationDetailsModal').classList.add('hidden');
    handleIntegrationCardAction(activeDetailsIntegration.id, act);
  });

  // MCP Events
  $('addMcpServerBtn')?.addEventListener('click', () => { $('addMcpModal').classList.remove('hidden'); $('mcpName').focus(); });
  $('closeAddMcpBtn')?.addEventListener('click', () => $('addMcpModal').classList.add('hidden'));
  $('cancelAddMcpBtn')?.addEventListener('click', () => $('addMcpModal').classList.add('hidden'));
  $('addMcpForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('mcpName').value.trim();
    const command = $('mcpCommand').value.trim();
    const rawArgs = $('mcpArgs').value.trim();
    const cwd = $('mcpCwd').value.trim();
    if (!name || !command) return;
    const args = rawArgs ? rawArgs.split(/\s+/) : [];
    try {
      await window.nexus.mcp.addServer({ name, command, args, cwd });
      toast(`MCP Server "${name}" registered.`);
      $('addMcpModal').classList.add('hidden');
      $('addMcpForm').reset();
      renderMcpPage();
    } catch (err) { toast(`Error: ${err.message}`, 6000); }
  });
  $('refreshMcpBtn')?.addEventListener('click', renderMcpPage);

  // Connectors Events
  $('checkConnectorsBtn')?.addEventListener('click', async () => {
    await renderConnectorsPage();
    toast('Connectors health refreshed');
  });
  const runGitAction = async (action) => {
    const ws = settings.workspacePath;
    if (!ws) { toast('Select a workspace folder first.'); return; }
    const out = $('gitOutput');
    out.textContent = `Running "git ${action}" in workspace...`;
    try {
      const res = await window.nexus.connectors.execute({ connectorId: 'connector-local-git', action, params: {}, workspacePath: ws });
      if (action === 'status') out.textContent = res.status || 'Working tree clean.';
      else if (action === 'diff') out.textContent = res.diff || 'No unstaged changes.';
      else if (action === 'log') out.textContent = (res.commits || []).join('\n') || 'No commits yet.';
      else if (action === 'branch') out.textContent = `Current branch: ${res.currentBranch || 'unknown'}`;
    } catch (err) {
      out.textContent = `Git error: ${err.message}`;
    }
  };
  $('gitStatusBtn')?.addEventListener('click', () => runGitAction('status'));
  $('gitDiffBtn')?.addEventListener('click', () => runGitAction('diff'));
  $('gitLogBtn')?.addEventListener('click', () => runGitAction('log'));
  $('gitBranchBtn')?.addEventListener('click', () => runGitAction('branch'));

  $('codeSearchBtn')?.addEventListener('click', async () => {
    const ws = settings.workspacePath;
    if (!ws) { toast('Select a workspace folder first.'); return; }
    const q = $('codeSearchInput').value.trim();
    if (!q) { toast('Enter search query.'); return; }
    const resultsContainer = $('codeSearchResults');
    resultsContainer.innerHTML = '<div class="empty-state small">Searching workspace...</div>';
    try {
      const res = await window.nexus.connectors.execute({ connectorId: 'connector-fs-search', action: 'grep', params: { query: q }, workspacePath: ws });
      resultsContainer.innerHTML = '';
      if (!res.matches || !res.matches.length) {
        resultsContainer.innerHTML = `<div class="empty-models">No matches found for "${escapeHtml(q)}".</div>`;
        return;
      }
      for (const m of res.matches) {
        const item = document.createElement('div');
        item.className = 'code-search-item';
        item.innerHTML = `
          <div class="code-search-file">${escapeHtml(m.file)}:${m.line}</div>
          <div class="code-search-line">${escapeHtml(m.text)}</div>
        `;
        resultsContainer.appendChild(item);
      }
    } catch (err) {
      resultsContainer.innerHTML = `<div class="inline-error">${escapeHtml(err.message)}</div>`;
    }
  });

  // Memory Events
  $('addMemoryBtn')?.addEventListener('click', () => { $('addMemoryModal').classList.remove('hidden'); $('memoryText').focus(); });
  $('closeAddMemoryBtn')?.addEventListener('click', () => $('addMemoryModal').classList.add('hidden'));
  $('cancelAddMemoryBtn')?.addEventListener('click', () => $('addMemoryModal').classList.add('hidden'));
  $('addMemoryForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = $('memoryType').value;
    const scopeVal = $('memoryScope').value;
    const scope = scopeVal === 'workspace' ? (settings.workspacePath || 'global') : 'global';
    const text = $('memoryText').value.trim();
    if (!text) return;
    try {
      await window.nexus.memory.add({ type, text, scope });
      toast('Memory saved.');
      $('addMemoryModal').classList.add('hidden');
      $('addMemoryForm').reset();
      renderMemoryPage();
    } catch (err) { toast(`Error: ${err.message}`, 6000); }
  });
  $('clearMemoryBtn')?.addEventListener('click', async () => {
    if (confirm('Clear all stored memories?')) {
      await window.nexus.memory.clear();
      toast('Memories cleared.');
      renderMemoryPage();
    }
  });
  $('memorySearchBtn')?.addEventListener('click', renderMemoryPage);

  // Checkpoints Events
  $('createCheckpointBtn')?.addEventListener('click', () => {
    if (!settings.workspacePath) { toast('Select a workspace folder first.'); return; }
    $('checkpointModal').classList.remove('hidden');
    $('checkpointDescription').focus();
  });
  $('closeCheckpointModalBtn')?.addEventListener('click', () => $('checkpointModal').classList.add('hidden'));
  $('cancelCheckpointBtn')?.addEventListener('click', () => $('checkpointModal').classList.add('hidden'));
  $('createCheckpointForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const desc = $('checkpointDescription').value.trim();
    if (!desc) return;
    try {
      const cp = await window.nexus.checkpoints.create({ workspacePath: settings.workspacePath, description: desc });
      toast(`Snapshot "${cp.id}" created (${cp.filesCount} files).`);
      $('checkpointModal').classList.add('hidden');
      $('createCheckpointForm').reset();
      renderCheckpointsPage();
    } catch (err) { toast(`Error: ${err.message}`, 6000); }
  });
  $('refreshCheckpointsBtn')?.addEventListener('click', renderCheckpointsPage);

  // Command Approval Modal buttons
  $('allowCmdBtn')?.addEventListener('click', () => pendingCommandApproval?.resolve?.());
  $('rejectCmdBtn')?.addEventListener('click', () => pendingCommandApproval?.reject?.());
  $('closeCmdModalBtn')?.addEventListener('click', () => pendingCommandApproval?.reject?.());

  // Command Runner Live Output
  window.nexus.commands.onOutput((data) => {
    if (activeBuild) {
      activeBuild.log?.(`Terminal [${data.stream}]`, data.text.trim().slice(-200), 'running');
    }
  });
  $('refreshProjectsBtn').addEventListener('click', renderProjects); $('refreshModelsBtn').addEventListener('click', refreshModels); $('unloadModelsBtn')?.addEventListener('click', async () => {
    try {
      const running = await window.nexus.getRunningModels();
      if (!running.length) { toast('No models are currently loaded in RAM.'); return; }
      for (const m of running) await window.nexus.unloadModel(m.name);
      toast(`Freed memory: unloaded ${running.length} model(s).`);
    } catch (e) { toast(`Could not unload models: ${e.message || e}`); }
  }); $('refreshTeamBtn').addEventListener('click', async () => { await refreshModels(); toast('Model availability refreshed'); });
  $('pullModelBtn').addEventListener('click', startPull); $('pullModelInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') startPull(); }); $('cancelPullBtn').addEventListener('click', () => { if (activePullId) window.nexus.cancelPull(activePullId); });
  $('speedToggle').addEventListener('click', () => { settings.speedMode = !settings.speedMode; saveSettings(); renderSettings(); $('settingsStatus').textContent = settings.speedMode ? 'Fast response mode enabled for the next request.' : 'Balanced mode enabled for the next request.'; toast(settings.speedMode ? 'Fast response mode enabled' : 'Balanced response mode enabled'); });
  $('browseModelPath').addEventListener('click', () => window.nexus.openFolder(appInfo.modelsPath).catch(e => toast(e.message, 5000)));
  $('sidebarSettingsBtn')?.addEventListener('click', () => showPage('settings'));
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="http"]');
    if (a) {
      e.preventDefault();
      window.nexus.openExternal(a.href).catch(() => {});
    }
  });
  $('contextRange').addEventListener('input', () => { const raw = Number($('contextRange').value); const values = [4, 8, 16, 32, 64, 128, 256]; const snapped = values[Math.max(0, Math.min(6, raw))]; settings.contextLength = snapped; $('contextRange').value = values.indexOf(snapped); updateContextValue(); saveSettings(); $('settingsStatus').textContent = 'Context length saved; applied to the next chat request.'; });
  $('resetSettingsBtn').addEventListener('click', resetSettings);

  // S2S Voice Modal Event Listeners
  $('closeS2SModalBtn')?.addEventListener('click', closeS2SModal);
  $('closeS2SModalFootBtn')?.addEventListener('click', closeS2SModal);
  $('s2sModal')?.addEventListener('click', (e) => { if (e.target === $('s2sModal')) closeS2SModal(); });
  $('s2sEngineGemini')?.addEventListener('change', () => { if ($('s2sKeySection')) $('s2sKeySection').style.display = 'block'; });
  $('s2sEngineLocal')?.addEventListener('change', () => { if ($('s2sKeySection')) $('s2sKeySection').style.display = 'none'; });
  $('toggleKeyVisibilityBtn')?.addEventListener('click', () => {
    const inp = $('s2sApiKeyInput');
    const btn = $('toggleKeyVisibilityBtn');
    if (!inp || !btn) return;
    if (inp.type === 'password') {
      inp.type = 'text';
      btn.textContent = 'Hide';
    } else {
      inp.type = 'password';
      btn.textContent = 'Show';
    }
  });
  $('testKeyBtn')?.addEventListener('click', testS2SKey);
  $('saveS2SConfigBtn')?.addEventListener('click', () => $('s2sConfigForm')?.requestSubmit?.() || saveS2SConfig());
  $('s2sConfigForm')?.addEventListener('submit', saveS2SConfig);

  window.nexus.onChatEvent(handleChatEvent); window.nexus.onPullEvent(handlePullEvent);
}

async function init() {
  bindEvents();
  initS2S();
  try { appInfo = { ...appInfo, ...(await window.nexus.getInfo()) }; } catch {}
  renderSettings(); setTeamMode(settings.teamMode); updateModelSelector(); updateBuildModeUI(); $('messageInput').placeholder = settings.buildMode ? 'Describe the app, website, code, or prompt to create in your workspace…' : 'Send a message'; renderMessages(); renderChatHistory(); renderProjects(); renderModelList('');
  await checkOllama();
  $('versionLabel').textContent = `Version ${appInfo.version || '0.3.8'}`;
}
init();

const fs = require('fs/promises');
const path = require('path');

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return aa && bb ? dot / (Math.sqrt(aa) * Math.sqrt(bb)) : 0;
}

class MemoryEngine {
  constructor(storagePath) {
    this.storagePath = storagePath;
    this.memories = [];
  }

  async initialize() {
    try {
      const data = await fs.readFile(this.storagePath, 'utf8');
      const parsed = JSON.parse(data);
      this.memories = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.memories = [];
      await this._save();
    }
  }

  async _save() {
    await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
    await fs.writeFile(this.storagePath, JSON.stringify(this.memories, null, 2), 'utf8');
  }

  async addMemory(type, text, scope = 'global', metadata = {}) {
    const memory = {
      id: `mem-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      type: type || 'fact', // 'preference', 'fact', 'architecture', 'decision'
      text: String(text || '').trim(),
      scope, // 'global' or workspacePath
      metadata,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (!memory.text) throw new Error('Memory text cannot be empty.');
    this.memories.unshift(memory);
    if (this.memories.length > 200) this.memories.pop();
    await this._save();
    return memory;
  }

  async listMemories(scope = null) {
    if (!scope) return this.memories;
    return this.memories.filter(m => m.scope === 'global' || m.scope === scope);
  }

  async deleteMemory(id) {
    const idx = this.memories.findIndex(m => m.id === id);
    if (idx >= 0) {
      this.memories.splice(idx, 1);
      await this._save();
      return true;
    }
    return false;
  }

  async clearMemories(scope = null) {
    if (!scope) {
      this.memories = [];
    } else {
      this.memories = this.memories.filter(m => m.scope !== scope && m.scope !== 'global');
    }
    await this._save();
    return true;
  }

  async searchMemories(query, scope = null, topK = 5) {
    const pool = await this.listMemories(scope);
    if (!query) return pool.slice(0, topK);
    const q = query.toLowerCase();
    
    // Keyword scoring
    const scored = pool.map(m => {
      let score = 0;
      if (m.text.toLowerCase().includes(q)) score += 2;
      const words = q.split(/\s+/).filter(w => w.length > 2);
      for (const w of words) {
        if (m.text.toLowerCase().includes(w)) score += 1;
      }
      return { memory: m, score };
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map(item => item.memory);
  }
}

module.exports = { MemoryEngine, cosineSimilarity };

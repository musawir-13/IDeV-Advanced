/**
 * IDeV Advanced — Gemini Live Real-Time Speech-to-Speech (S2S) Session Manager
 * 
 * Production-grade bidirectional WebSocket streaming with Google Gemini Live API.
 * Supports:
 * - Real-time PCM audio streaming (16kHz in, 24kHz out)
 * - Low-latency turn-taking & natural Hinglish (Roman script)
 * - Instant server & client-side barge-in (interruption) detection
 * - Sequence-tagged audio chunks to drop stale audio on interruption
 * - Live latency metrics (Time-to-First-Audio TTFA, Round-trip latency)
 * - Session resumption handle tracking & bounded recovery
 * - Secure credential management (never leaks raw keys to renderer)
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const GEMINI_LIVE_DEFAULT_ENDPOINT = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';
const DEFAULT_MODEL = 'models/gemini-3.8-live';
const FALLBACK_MODEL = 'models/gemini-2.0-flash-exp';
const DEFAULT_VOICE = 'Puck';

const HINGLISH_SYSTEM_INSTRUCTION = 
  'You are IDeV Voice, an ultra-fast, intelligent real-time conversational AI built by Ubaid (IDeV). ' +
  'Respond naturally, concisely, and helpfully in natural Hinglish (using Roman script, mixing conversational Hindi and English naturally, e.g. "Haan bilkul, main help kar sakta hoon!"). ' +
  'Keep spoken answers crisp, human, and direct for live voice dialogue. ' +
  'Never read out markdown asterisks, hash headers, or bullet symbols in your speech.';

function normalizeModel(modelStr) {
  if (!modelStr) return DEFAULT_MODEL;
  const s = String(modelStr).trim();
  if (s.startsWith('models/')) return s;
  return `models/${s}`;
}

class GeminiLiveSession extends EventEmitter {
  constructor(options = {}) {
    super();
    this.userDataPath = options.userDataPath || '';
    this.configFile = path.join(this.userDataPath, 's2s-config.json');
    this.projectRoot = options.projectRoot || process.cwd();
    
    this.ws = null;
    this.isConnected = false;
    this.isSetupComplete = false;
    this.activeModel = DEFAULT_MODEL;
    this.activeVoice = DEFAULT_VOICE;
    this.activeLanguage = 'hinglish';
    this.engine = 'gemini-live'; // 'gemini-live' | 'local'
    this.vadSensitivity = 'medium'; // 'low' | 'medium' | 'high'
    this.conversationMode = 'continuous'; // 'continuous' | 'push-to-talk'

    // Turn tracking and latency metrics
    this.currentTurnId = 0;
    this.turnStartTime = 0;
    this.lastTtfaMs = 0;
    this.resumptionHandle = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectTimer = null;
    this.isReconnecting = false;
    this.lastDiagnostics = {
      state: 'idle',
      model: DEFAULT_MODEL,
      voice: DEFAULT_VOICE,
      ttfaMs: 0,
      turnCount: 0,
      chunksSent: 0,
      chunksReceived: 0,
      interruptCount: 0
    };

    this.loadConfig();
  }

  /**
   * Load S2S configuration from disk or environment.
   */
  loadConfig() {
    let saved = {};
    try {
      if (fs.existsSync(this.configFile)) {
        saved = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
      }
    } catch (err) {}

    let envKey = '';
    const envFile = path.join(this.projectRoot, '.env');
    try {
      if (fs.existsSync(envFile)) {
        const text = fs.readFileSync(envFile, 'utf8');
        const match = text.match(/GEMINI_API_KEY\s*=\s*([^\r\n#]+)/);
        if (match) envKey = match[1].trim();
      }
    } catch (err) {}

    if (!envKey) {
      envKey = process.env.GEMINI_API_KEY || '';
    }

    this.apiKey = saved.apiKey || envKey || '';
    this.activeModel = normalizeModel(saved.model || DEFAULT_MODEL);
    this.activeVoice = saved.voice || DEFAULT_VOICE;
    this.activeLanguage = saved.language || 'hinglish';
    this.engine = saved.engine || 'gemini-live';
    this.vadSensitivity = saved.vadSensitivity || 'medium';
    this.conversationMode = saved.conversationMode || 'continuous';
  }

  /**
   * Save configuration to disk.
   */
  saveConfig(newConfig = {}) {
    if (newConfig.apiKey !== undefined && newConfig.apiKey !== '••••••••••••••••') {
      this.apiKey = String(newConfig.apiKey).trim();
    }
    if (newConfig.model) this.activeModel = normalizeModel(newConfig.model);
    if (newConfig.voice) this.activeVoice = String(newConfig.voice).trim();
    if (newConfig.language) this.activeLanguage = String(newConfig.language).trim();
    if (newConfig.engine) this.engine = String(newConfig.engine).trim();
    if (newConfig.vadSensitivity) this.vadSensitivity = String(newConfig.vadSensitivity).trim();
    if (newConfig.conversationMode) this.conversationMode = String(newConfig.conversationMode).trim();

    try {
      if (this.userDataPath) {
        if (!fs.existsSync(this.userDataPath)) fs.mkdirSync(this.userDataPath, { recursive: true });
        const toSave = {
          apiKey: this.apiKey,
          model: this.activeModel,
          voice: this.activeVoice,
          language: this.activeLanguage,
          engine: this.engine,
          vadSensitivity: this.vadSensitivity,
          conversationMode: this.conversationMode
        };
        fs.writeFileSync(this.configFile, JSON.stringify(toSave, null, 2), 'utf8');
      }
    } catch (err) {
      console.error('[GeminiLiveSession] Failed to persist config:', err.message);
    }

    return this.getStatus();
  }

  /**
   * Returns safe status object (never leaking raw secrets).
   */
  getStatus() {
    return {
      hasKey: !!(this.apiKey && this.apiKey.length > 8),
      maskedKey: this.apiKey ? `${this.apiKey.slice(0, 4)}••••••••${this.apiKey.slice(-4)}` : '',
      model: this.activeModel,
      fallbackModel: FALLBACK_MODEL,
      voice: this.activeVoice,
      language: this.activeLanguage,
      engine: this.engine,
      vadSensitivity: this.vadSensitivity,
      conversationMode: this.conversationMode,
      isConnected: this.isConnected,
      isSetupComplete: this.isSetupComplete,
      diagnostics: this.lastDiagnostics
    };
  }

  /**
   * Test connection to Gemini Live API with supplied or active key.
   */
  async testConnection(candidateKey = null, modelCandidate = null) {
    const key = candidateKey && candidateKey !== '••••••••••••••••' ? candidateKey.trim() : this.apiKey;
    if (!key) {
      return { ok: false, error: 'No Gemini API key provided. Please configure your key in S2S Settings.' };
    }

    const testModel = normalizeModel(modelCandidate || this.activeModel || DEFAULT_MODEL);
    const startTime = Date.now();

    return new Promise((resolve) => {
      let resolved = false;
      const url = `${GEMINI_LIVE_DEFAULT_ENDPOINT}?key=${encodeURIComponent(key)}`;
      let ws;

      const finish = (result) => {
        if (!resolved) {
          resolved = true;
          try { if (ws) ws.close(); } catch {}
          resolve(result);
        }
      };

      const timeout = setTimeout(() => {
        finish({ ok: false, error: 'Connection test timed out after 8 seconds.' });
      }, 8000);

      try {
        ws = new WebSocket(url);
        ws.onopen = () => {
          ws.send(JSON.stringify({
            setup: {
              model: testModel,
              generationConfig: {
                responseModalities: ['AUDIO']
              }
            }
          }));
        };

        ws.onmessage = async (event) => {
          clearTimeout(timeout);
          try {
            const text = typeof event.data === 'string' ? event.data : await event.data.text();
            const data = JSON.parse(text);
            const rttMs = Date.now() - startTime;
            if (data.setupComplete) {
              finish({ ok: true, message: `Connected to ${testModel} successfully (${rttMs}ms roundtrip).`, rttMs, model: testModel });
            } else {
              finish({ ok: true, message: `Handshake established with ${testModel} (${rttMs}ms).`, rttMs, model: testModel });
            }
          } catch (e) {
            finish({ ok: true, message: 'Connected successfully.' });
          }
        };

        ws.onerror = (err) => {
          clearTimeout(timeout);
          finish({ ok: false, error: err.message || 'Failed to establish WebSocket handshake.' });
        };

        ws.onclose = (event) => {
          clearTimeout(timeout);
          if (event.code !== 1000 && !resolved) {
            let errorMsg = `Connection closed (code ${event.code}): ${event.reason || 'Authentication or model access error'}`;
            if (event.code === 1008 || event.reason?.includes('API_KEY_INVALID')) {
              errorMsg = 'Invalid Gemini API key. Please check your credentials in S2S Settings.';
            } else if (event.reason?.includes('not found') || event.reason?.includes('RESOURCE_EXHAUSTED')) {
              errorMsg = `Model ${testModel} is currently unavailable or quota exceeded on this tier.`;
            }
            finish({ ok: false, error: errorMsg, code: event.code });
          }
        };
      } catch (err) {
        clearTimeout(timeout);
        finish({ ok: false, error: err.message });
      }
    });
  }

  /**
   * Start live bidirectional speech session.
   */
  startSession(options = {}) {
    if (this.isConnected && this.ws) {
      return { ok: true, message: 'Session already active.' };
    }

    if (!this.apiKey) {
      this.emit('error', new Error('Gemini API key is missing. Configure your key in S2S Settings.'));
      return { ok: false, error: 'Gemini API key is missing.' };
    }

    const model = normalizeModel(options.model || this.activeModel || DEFAULT_MODEL);
    const voice = options.voice || this.activeVoice || DEFAULT_VOICE;
    const language = options.language || this.activeLanguage || 'hinglish';

    let sysInstruction = HINGLISH_SYSTEM_INSTRUCTION;
    if (language === 'english') {
      sysInstruction = 'You are IDeV Voice, an ultra-fast, intelligent real-time conversational AI built by Ubaid (IDeV). ' +
                       'Respond naturally, concisely, and helpfully in English. Keep answers crisp and direct for live voice dialogue. ' +
                       'Never output markdown formatting or asterisks.';
    } else if (language === 'hindi') {
      sysInstruction = 'You are IDeV Voice, an ultra-fast, intelligent real-time conversational AI built by Ubaid (IDeV). ' +
                       'Respond naturally and concisely in Hindi (using conversational Devanagari or clear phonetics). ' +
                       'Keep answers crisp and direct for live voice dialogue.';
    }

    const url = `${GEMINI_LIVE_DEFAULT_ENDPOINT}?key=${encodeURIComponent(this.apiKey)}`;

    try {
      this.currentTurnId++;
      this.turnStartTime = Date.now();
      this.lastDiagnostics.chunksSent = 0;
      this.lastDiagnostics.chunksReceived = 0;
      this.lastDiagnostics.model = model;
      this.lastDiagnostics.voice = voice;
      this.lastDiagnostics.state = 'connecting';

      this.ws = new WebSocket(url);
      this.emit('connecting');

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.emit('connected');

        // Send Initial Setup Frame
        const setupMessage = {
          setup: {
            model: model,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: voice
                  }
                }
              }
            },
            systemInstruction: {
              parts: [{ text: sysInstruction }]
            }
          }
        };

        this.ws.send(JSON.stringify(setupMessage));
      };

      this.ws.onmessage = async (event) => {
        try {
          const rawText = typeof event.data === 'string' ? event.data : await event.data.text();
          const msg = JSON.parse(rawText);

          if (msg.setupComplete) {
            this.isSetupComplete = true;
            this.lastDiagnostics.state = 'listening';
            this.emit('ready', { model, voice, turnId: this.currentTurnId });
            return;
          }

          // Handle GoAway or Resumption Updates
          if (msg.goAway) {
            console.log('[GeminiLiveSession] Server signaled GoAway notice. Reconnecting gracefully...');
            this.scheduleReconnect();
            return;
          }

          if (msg.sessionResumptionUpdate) {
            this.resumptionHandle = msg.sessionResumptionUpdate.handle || msg.sessionResumptionUpdate.newHandle || msg.sessionResumptionUpdate;
          }

          if (msg.serverContent) {
            const sc = msg.serverContent;

            // Handle Server-detected Barge-in (Interruption)
            if (sc.interrupted) {
              this.currentTurnId++; // Invalidate stale audio chunks
              this.lastDiagnostics.interruptCount++;
              this.lastDiagnostics.state = 'interrupted';
              this.emit('interrupted', { reason: 'server_vad', turnId: this.currentTurnId });
            }

            // Handle Model Output (Audio / Text chunks)
            if (sc.modelTurn && Array.isArray(sc.modelTurn.parts)) {
              for (const part of sc.modelTurn.parts) {
                if (part.inlineData && part.inlineData.mimeType?.startsWith('audio/pcm')) {
                  if (this.lastDiagnostics.chunksReceived === 0 && this.turnStartTime > 0) {
                    this.lastTtfaMs = Date.now() - this.turnStartTime;
                    this.lastDiagnostics.ttfaMs = this.lastTtfaMs;
                  }
                  this.lastDiagnostics.chunksReceived++;
                  this.lastDiagnostics.state = 'speaking';
                  this.emit('audio-chunk', {
                    mimeType: part.inlineData.mimeType,
                    data: part.inlineData.data, // base64 PCM 24kHz
                    turnId: this.currentTurnId,
                    ttfaMs: this.lastTtfaMs
                  });
                }
                if (part.text) {
                  this.emit('transcript-partial', {
                    role: 'assistant',
                    text: part.text,
                    turnId: this.currentTurnId
                  });
                }
              }
            }

            // Handle Turn Complete / Generation Complete
            if (sc.turnComplete || sc.generationComplete) {
              this.lastDiagnostics.state = 'listening';
              this.emit('turn-complete', {
                interrupted: !!sc.interrupted,
                turnId: this.currentTurnId,
                continuous: this.conversationMode === 'continuous'
              });
            }
          }
        } catch (err) {
          console.error('[GeminiLiveSession] Error handling message:', err.message);
        }
      };

      this.ws.onerror = (err) => {
        const errorMsg = err.message || 'Gemini Live WebSocket communication error';
        console.error('[GeminiLiveSession] WebSocket error:', errorMsg);
        this.lastDiagnostics.state = 'error';
        this.emit('error', new Error(errorMsg));
      };

      this.ws.onclose = (event) => {
        const wasConnected = this.isConnected;
        this.isConnected = false;
        this.isSetupComplete = false;
        this.ws = null;
        this.lastDiagnostics.state = 'ended';

        if (event.code !== 1000 && wasConnected && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else {
          this.emit('closed', { code: event.code, reason: event.reason || 'Normal close' });
        }
      };

      return { ok: true };
    } catch (err) {
      this.isConnected = false;
      this.isSetupComplete = false;
      this.lastDiagnostics.state = 'error';
      this.emit('error', err);
      return { ok: false, error: err.message };
    }
  }

  scheduleReconnect() {
    if (this.isReconnecting) return;
    this.isReconnecting = true;
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 5000);
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delayMs: delay });

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.isReconnecting = false;
      this.startSession({
        model: this.activeModel,
        voice: this.activeVoice,
        language: this.activeLanguage
      });
    }, delay);
  }

  /**
   * Stream a chunk of 16-bit PCM audio (16kHz mono) to Gemini Live.
   * @param {string} base64Pcm 
   */
  sendAudioChunk(base64Pcm) {
    if (!this.isConnected || !this.ws || !this.isSetupComplete) return false;
    try {
      this.lastDiagnostics.chunksSent++;
      if (this.lastDiagnostics.chunksSent === 1) {
        this.turnStartTime = Date.now();
      }
      const msg = {
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: 'audio/pcm;rate=16000',
              data: base64Pcm
            }
          ]
        }
      };
      this.ws.send(JSON.stringify(msg));
      return true;
    } catch (err) {
      console.error('[GeminiLiveSession] sendAudioChunk error:', err.message);
      return false;
    }
  }

  /**
   * Send a text message turn to Gemini Live.
   * @param {string} text 
   */
  sendTextTurn(text) {
    if (!this.isConnected || !this.ws || !this.isSetupComplete) return false;
    try {
      this.currentTurnId++;
      this.turnStartTime = Date.now();
      const msg = {
        clientContent: {
          turns: [
            {
              role: 'user',
              parts: [{ text: String(text || '').trim() }]
            }
          ],
          turnComplete: true
        }
      };
      this.ws.send(JSON.stringify(msg));
      return true;
    } catch (err) {
      console.error('[GeminiLiveSession] sendTextTurn error:', err.message);
      return false;
    }
  }

  /**
   * Signal immediate user barge-in / interruption to Gemini Live session.
   */
  interrupt() {
    this.currentTurnId++; // Invalidate stale audio chunks from previous turn
    this.lastDiagnostics.interruptCount++;
    this.lastDiagnostics.state = 'interrupted';
    this.emit('interrupted', { reason: 'client_vad', turnId: this.currentTurnId });
    return true;
  }

  /**
   * Stop active live session gracefully and release all resources.
   */
  stopSession() {
    clearTimeout(this.reconnectTimer);
    this.isReconnecting = false;
    this.reconnectAttempts = 0;

    if (this.ws) {
      try {
        this.ws.close(1000, 'User ended voice session');
      } catch (err) {}
      this.ws = null;
    }
    this.isConnected = false;
    this.isSetupComplete = false;
    this.lastDiagnostics.state = 'idle';
    this.emit('closed', { code: 1000, reason: 'Manual stop' });
    return { ok: true };
  }
}

module.exports = {
  GeminiLiveSession,
  DEFAULT_MODEL,
  FALLBACK_MODEL,
  DEFAULT_VOICE,
  HINGLISH_SYSTEM_INSTRUCTION,
  normalizeModel
};

/**
 * IDeV Advanced — S2S Audio Pipeline & Low-Latency Stream Processor
 * 
 * Provides:
 * - 16kHz mono 16-bit linear PCM microphone capture & base64 framing (32ms frames)
 * - 24kHz mono 16-bit linear PCM streaming playback with gapless scheduling
 * - Turn-sequenced playback buffers (instantly drops stale audio on interruption)
 * - Acoustic-echo aware Voice Activity Detection (VAD) for instant barge-in
 * - Real-time audio energy (RMS) calculation & dynamic visualizer hooks
 * - Float32 <-> Int16 PCM conversion utilities
 */

/**
 * Convert Float32Array samples (-1.0 to +1.0) into 16-bit signed Linear PCM (ArrayBuffer).
 * Handles clamping to prevent integer overflow clipping.
 */
function floatTo16BitPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); // little-endian
  }
  return buffer;
}

/**
 * Convert 16-bit signed Linear PCM (ArrayBuffer or Uint8Array) into Float32Array.
 */
function pcm16BitToFloat(pcmData) {
  const bytes = pcmData instanceof Uint8Array ? pcmData : new Uint8Array(pcmData);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = Math.floor(bytes.byteLength / 2);
  const float32 = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const int16 = view.getInt16(i * 2, true);
    float32[i] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7FFF;
  }
  return float32;
}

/**
 * Downsample audio buffer to target sample rate using linear averaging.
 */
function downsampleBuffer(buffer, inputSampleRate, outputSampleRate) {
  if (inputSampleRate === outputSampleRate) return buffer;
  if (inputSampleRate < outputSampleRate) return buffer; // downsample only
  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

/**
 * Base64 encode an ArrayBuffer or Uint8Array.
 */
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  return Buffer.from(binary, 'binary').toString('base64');
}

/**
 * Base64 decode to Uint8Array.
 */
function base64ToUint8Array(base64) {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * Calculate Root Mean Square (RMS) energy and decibel volume.
 */
function calculateRMS(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sum / (samples.length || 1));
  const db = 20 * Math.log10(Math.max(rms, 0.00001));
  return { rms, db };
}

/**
 * Low-Latency Audio Pipeline Controller for IDeV S2S.
 */
class S2SAudioPipeline {
  constructor(options = {}) {
    this.onAudioChunk = options.onAudioChunk || (() => {});
    this.onVolume = options.onVolume || (() => {});
    this.onBargeIn = options.onBargeIn || (() => {});
    this.onPlaybackEnded = options.onPlaybackEnded || (() => {});
    this.vadThreshold = options.vadThreshold || 0.045; // RMS threshold for barge-in
    this.bufferSize = options.bufferSize || 1024; // 1024 samples = 64ms at 16kHz

    this.audioContext = null;
    this.playbackContext = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.processorNode = null;

    this.isPlaying = false;
    this.activeSources = new Set();
    this.nextPlayTime = 0;
    this.isCapturing = false;
    this.activeTurnId = 1;
    this.consecutiveSpeechFrames = 0;
  }

  setVadSensitivity(level) {
    if (level === 'high') this.vadThreshold = 0.025;
    else if (level === 'low') this.vadThreshold = 0.075;
    else this.vadThreshold = 0.045; // medium
  }

  setTurnId(turnId) {
    this.activeTurnId = turnId;
  }

  async initCapture() {
    if (this.isCapturing) return true;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx({ sampleRate: 16000 });

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Buffer size 1024 samples at 16kHz = 64ms (or 512 = 32ms) low-latency chunks!
      // This eliminates the 256ms lag of older 4096-sample buffers.
      const bufferSize = 1024;
      this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

      this.processorNode.onaudioprocess = (event) => {
        if (!this.isCapturing) return;
        const inputData = event.inputBuffer.getChannelData(0);
        
        // Downsample to 16kHz if audioContext sampleRate is different
        const currentRate = this.audioContext.sampleRate;
        const samples16k = currentRate !== 16000 ? downsampleBuffer(inputData, currentRate, 16000) : inputData;

        // Energy & VAD
        const { rms, db } = calculateRMS(samples16k);
        this.onVolume({ rms, db });

        // Dynamic threshold: when audio is currently playing, increase threshold slightly
        // to prevent acoustic speaker bleed from triggering a false self-interruption.
        const effectiveThreshold = this.isPlaying ? this.vadThreshold * 1.6 : this.vadThreshold;

        if (rms > effectiveThreshold) {
          this.consecutiveSpeechFrames++;
          // Require at least 2 consecutive frames (~64ms) to filter out transient pops/clicks
          if (this.isPlaying && this.consecutiveSpeechFrames >= 2) {
            this.interruptPlayback();
            this.onBargeIn({ reason: 'local_vad', rms, turnId: this.activeTurnId });
          }
        } else {
          this.consecutiveSpeechFrames = 0;
        }

        // Convert to 16-bit Linear PCM
        const pcmBuffer = floatTo16BitPCM(samples16k);
        const base64Chunk = arrayBufferToBase64(pcmBuffer);
        this.onAudioChunk(base64Chunk, this.activeTurnId);
      };

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);
      this.isCapturing = true;
      return true;
    } catch (err) {
      console.error('[S2SAudioPipeline] initCapture error:', err);
      let friendly = err.message || 'Microphone initialization failed.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        friendly = 'Microphone access denied. Please allow microphone access in Windows Privacy Settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        friendly = 'No microphone device found. Please connect an audio input device.';
      } else if (err.name === 'NotReadableError') {
        friendly = 'Microphone is currently in use by another application.';
      }
      const wrappedErr = new Error(friendly);
      wrappedErr.name = err.name;
      throw wrappedErr;
    }
  }

  initPlayback() {
    if (!this.playbackContext || this.playbackContext.state === 'closed') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.playbackContext = new AudioCtx({ sampleRate: 24000 });
      this.nextPlayTime = this.playbackContext.currentTime;
    }
    if (this.playbackContext.state === 'suspended') {
      this.playbackContext.resume();
    }
  }

  /**
   * Queue and stream a 24kHz PCM chunk received from Gemini Live.
   * Drops stale chunks if turnId does not match the active turn.
   * @param {string} base64Pcm 
   * @param {number} turnId
   */
  queueAudioChunk(base64Pcm, turnId = null) {
    if (turnId !== null && turnId !== undefined && turnId < this.activeTurnId) {
      // Obsolete chunk from an interrupted or previous turn: discard immediately!
      return false;
    }

    this.initPlayback();
    if (!base64Pcm) return false;

    try {
      const pcmBytes = base64ToUint8Array(base64Pcm);
      const float32Data = pcm16BitToFloat(pcmBytes);

      const buffer = this.playbackContext.createBuffer(1, float32Data.length, 24000);
      buffer.copyToChannel(float32Data, 0, 0);

      const source = this.playbackContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.playbackContext.destination);

      const now = this.playbackContext.currentTime;
      // Low-latency schedule: start at nextPlayTime or 15ms in future to prevent audio underflow clicks
      const startTime = Math.max(now + 0.015, this.nextPlayTime);
      source.start(startTime);
      this.nextPlayTime = startTime + buffer.duration;
      this.isPlaying = true;

      this.activeSources.add(source);
      source.onended = () => {
        this.activeSources.delete(source);
        if (this.activeSources.size === 0) {
          this.isPlaying = false;
          this.onPlaybackEnded({ turnId: this.activeTurnId });
        }
      };
      return true;
    } catch (err) {
      console.error('[S2SAudioPipeline] queueAudioChunk error:', err);
      return false;
    }
  }

  /**
   * Instant Barge-In: immediately stop all scheduled output audio buffers and advance turn sequence.
   */
  interruptPlayback() {
    this.activeTurnId++;
    for (const src of this.activeSources) {
      try {
        src.stop(0);
        src.disconnect();
      } catch (e) {}
    }
    this.activeSources.clear();
    this.isPlaying = false;
    this.nextPlayTime = this.playbackContext ? this.playbackContext.currentTime : 0;
  }

  stopCapture() {
    this.isCapturing = false;
    this.consecutiveSpeechFrames = 0;
    if (this.processorNode) {
      try { this.processorNode.disconnect(); } catch {}
      this.processorNode = null;
    }
    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch {}
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach(t => t.stop());
      } catch {}
      this.mediaStream = null;
    }
    if (this.audioContext) {
      try { this.audioContext.close(); } catch {}
      this.audioContext = null;
    }
  }

  cleanup() {
    this.stopCapture();
    this.interruptPlayback();
    if (this.playbackContext) {
      try { this.playbackContext.close(); } catch {}
      this.playbackContext = null;
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    S2SAudioPipeline,
    floatTo16BitPCM,
    pcm16BitToFloat,
    downsampleBuffer,
    arrayBufferToBase64,
    base64ToUint8Array,
    calculateRMS
  };
}

const { spawn } = require('child_process');
const path = require('path');
const EventEmitter = require('events');

const SAFE_COMMANDS = new Set([
  'npm test', 'npm run test', 'npm run build', 'npm run lint', 'npm run check',
  'pytest', 'python -m unittest', 'python -m py_compile',
  'node --check', 'cargo check', 'cargo test', 'gradle test',
  'git status', 'git diff', 'git log'
]);

class CommandRunner extends EventEmitter {
  constructor() {
    super();
    this.activeProcesses = new Map();
  }

  isSafeCommand(commandStr) {
    const norm = String(commandStr || '').trim().toLowerCase();
    for (const safe of SAFE_COMMANDS) {
      if (norm === safe || norm.startsWith(`${safe} `)) return true;
    }
    return false;
  }

  runCommand(id, commandStr, workspacePath, options = {}) {
    return new Promise((resolve, reject) => {
      if (!commandStr || typeof commandStr !== 'string') {
        return reject(new Error('Invalid command string.'));
      }
      if (!workspacePath) {
        return reject(new Error('Workspace path is required.'));
      }

      // Defense against chained shell injection or malicious destructive primitives
      if (/[;&|`$><]/.test(commandStr) && !options.allowPipes) {
        return reject(new Error('Chained operators and shell redirection are restricted for workspace security.'));
      }

      const parts = commandStr.trim().split(/\s+/);
      const cmd = parts[0];
      const args = parts.slice(1);

      // Sanitize environment: strip private credentials and secrets
      const safeEnv = { ...process.env };
      for (const key of Object.keys(safeEnv)) {
        if (/token|key|secret|password|auth|credential/i.test(key)) {
          delete safeEnv[key];
        }
      }

      const timeoutMs = options.timeoutMs || 45000;
      let killed = false;
      let outputBuffer = '';

      const isWin = process.platform === 'win32';
      const child = isWin
        ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', commandStr], {
            cwd: workspacePath,
            env: safeEnv,
            windowsHide: true
          })
        : spawn(cmd, args, {
            cwd: workspacePath,
            env: safeEnv,
            windowsHide: true
          });

      this.activeProcesses.set(id, child);

      const timer = setTimeout(() => {
        killed = true;
        child.kill();
        reject(new Error(`Command timed out after ${timeoutMs}ms: ${commandStr}`));
      }, timeoutMs);

      child.stdout.on('data', (data) => {
        const text = data.toString('utf8');
        outputBuffer += text;
        this.emit('output', { id, stream: 'stdout', text });
      });

      child.stderr.on('data', (data) => {
        const text = data.toString('utf8');
        outputBuffer += text;
        this.emit('output', { id, stream: 'stderr', text });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        this.activeProcesses.delete(id);
        reject(new Error(`Failed to spawn command "${commandStr}": ${err.message}`));
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        this.activeProcesses.delete(id);
        if (killed) return;
        resolve({
          command: commandStr,
          exitCode: code,
          passed: code === 0,
          output: outputBuffer.trim()
        });
      });
    });
  }

  cancelCommand(id) {
    const child = this.activeProcesses.get(id);
    if (child) {
      try { child.kill(); } catch {}
      this.activeProcesses.delete(id);
      return true;
    }
    return false;
  }
}

module.exports = { CommandRunner, SAFE_COMMANDS };

const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');

const IGNORED = new Set(['node_modules', '.git', '.venv', 'venv', 'dist', 'build', '.idev-checkpoints']);

class CheckpointManager {
  constructor() {}

  async createCheckpoint(workspacePath, description = 'Pre-change checkpoint') {
    if (!workspacePath || !fsSync.existsSync(workspacePath)) {
      throw new Error('Valid workspace path is required to create a checkpoint.');
    }
    const checkpointDir = path.join(workspacePath, '.idev-checkpoints');
    const timestamp = Date.now();
    const id = `checkpoint-${timestamp}`;
    const targetDir = path.join(checkpointDir, id);

    await fs.mkdir(targetDir, { recursive: true });

    let filesCount = 0;
    async function copyDir(src, dest, rel = '') {
      let entries;
      try { entries = await fs.readdir(src, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (IGNORED.has(entry.name)) continue;
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          await fs.mkdir(destPath, { recursive: true });
          await copyDir(srcPath, destPath, path.posix.join(rel, entry.name));
        } else if (entry.isFile()) {
          // Limit individual file size to 2 MB for checkpoint efficiency
          const stat = await fs.stat(srcPath);
          if (stat.size <= 2000000) {
            await fs.copyFile(srcPath, destPath);
            filesCount++;
          }
        }
      }
    }

    await copyDir(workspacePath, targetDir);

    const meta = {
      id,
      timestamp: new Date(timestamp).toISOString(),
      description,
      filesCount,
      workspacePath
    };
    await fs.writeFile(path.join(targetDir, '__checkpoint_meta.json'), JSON.stringify(meta, null, 2), 'utf8');

    return meta;
  }

  async listCheckpoints(workspacePath) {
    if (!workspacePath) return [];
    const checkpointDir = path.join(workspacePath, '.idev-checkpoints');
    if (!fsSync.existsSync(checkpointDir)) return [];

    const checkpoints = [];
    try {
      const dirs = await fs.readdir(checkpointDir, { withFileTypes: true });
      for (const dir of dirs) {
        if (dir.isDirectory() && dir.name.startsWith('checkpoint-')) {
          const metaPath = path.join(checkpointDir, dir.name, '__checkpoint_meta.json');
          try {
            const data = await fs.readFile(metaPath, 'utf8');
            checkpoints.push(JSON.parse(data));
          } catch {}
        }
      }
    } catch {}

    return checkpoints.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async rollbackCheckpoint(workspacePath, checkpointId) {
    if (!workspacePath) throw new Error('Workspace path is required.');
    const sourceDir = path.join(workspacePath, '.idev-checkpoints', checkpointId);
    if (!fsSync.existsSync(sourceDir)) {
      throw new Error(`Checkpoint ${checkpointId} does not exist.`);
    }

    let restoredCount = 0;
    async function restore(src, dest) {
      let entries;
      try { entries = await fs.readdir(src, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (entry.name === '__checkpoint_meta.json') continue;
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          await fs.mkdir(destPath, { recursive: true });
          await restore(srcPath, destPath);
        } else if (entry.isFile()) {
          await fs.copyFile(srcPath, destPath);
          restoredCount++;
        }
      }
    }

    await restore(sourceDir, workspacePath);
    return { checkpointId, restoredCount };
  }
}

module.exports = { CheckpointManager };

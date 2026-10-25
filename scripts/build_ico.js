/**
 * build_ico.js — Generates multi-resolution Windows .ico from assets/logo/icon_*.png
 * Output icons contain 16, 24, 32, 48, 64, 128, and 256 resolutions.
 */

const fs = require('fs');
const path = require('path');
const resedit = require('resedit');

const IconFile = resedit.Data.IconFile;
const RawIconItem = resedit.Data.RawIconItem;

const root = path.resolve(__dirname, '..');
const iconFile = new IconFile();
const sizes = [16, 24, 32, 48, 64, 128, 256];

for (const s of sizes) {
  const pngPath = path.join(root, 'assets', 'logo', `icon_${s}.png`);
  if (!fs.existsSync(pngPath)) {
    throw new Error(`Missing expected resized PNG: ${pngPath}`);
  }
  const pngBuf = fs.readFileSync(pngPath);
  const rawItem = RawIconItem.from(pngBuf, s, s, 32);
  iconFile.icons.push({
    width: s === 256 ? 0 : s,
    height: s === 256 ? 0 : s,
    colors: 0,
    planes: 1,
    bitCount: 32,
    data: rawItem
  });
}

const icoBuffer = Buffer.from(iconFile.generate());

// Targets to write .ico
const targetPaths = [
  path.join(root, 'assets', 'icon.ico'),
  path.join(root, 'assets', 'installerIcon.ico'),
  path.join(root, 'assets', 'uninstallerIcon.ico'),
  path.join(root, 'assets', 'logo', 'icon.ico'),
  path.join(root, 'build', 'icon.ico'),
  path.join(root, 'build', 'installerIcon.ico'),
  path.join(root, 'build', 'uninstallerIcon.ico'),
  path.join(root, 'src', 'favicon.ico')
];

for (const t of targetPaths) {
  fs.mkdirSync(path.dirname(t), { recursive: true });
  fs.writeFileSync(t, icoBuffer);
  console.log(`Saved .ico (${icoBuffer.length} bytes) to: ${path.relative(root, t)}`);
}

console.log('Windows .ico files successfully generated for all targets!');

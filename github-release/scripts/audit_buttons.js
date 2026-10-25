const fs = require('fs');

const html = fs.readFileSync('src/index.html', 'utf8');
const js = fs.readFileSync('src/renderer.js', 'utf8');

const buttonIds = [...html.matchAll(/id="([^"]+)"/g)]
  .map(m => m[1])
  .filter(id => id.toLowerCase().includes('btn') || id.toLowerCase().includes('toggle') || id.toLowerCase().includes('switch'));

console.log('Total interactive IDs found in HTML:', buttonIds.length);
const missing = [];
for (const id of buttonIds) {
  if (!js.includes(id)) {
    missing.push(id);
  }
}
console.log('Buttons/switches not referenced in renderer.js:', missing);

// Also check all buttons in HTML without IDs
const buttonsWithoutId = [...html.matchAll(/<button(?![^>]*\bid=)[^>]*>/g)].map(m => m[0]);
console.log('Buttons without ID:', buttonsWithoutId.length);
buttonsWithoutId.forEach((b, i) => console.log(`  [${i + 1}] ${b.slice(0, 80)}`));

'use strict';
const fs = require('fs');
const path = require('path');

function findPublicRoot() {
  const roots = [__dirname, process.cwd()];
  const seen = new Set();
  const queue = [];
  for (const root of roots) if (root && !seen.has(root)) { seen.add(root); queue.push([root, 0]); }
  const skip = new Set(['node_modules', '.git', '.cache', 'data', 'dist', 'dist-desktop']);
  while (queue.length) {
    const [dir, depth] = queue.shift();
    const direct = path.join(dir, 'public', 'index.html');
    if (fs.existsSync(direct)) return path.join(dir, 'public');
    if (depth >= 6) continue;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory() || skip.has(entry.name)) continue;
      const child = path.join(dir, entry.name);
      if (!seen.has(child)) { seen.add(child); queue.push([child, depth + 1]); }
    }
  }
  return null;
}
const pub = findPublicRoot();
if (!pub) {
  console.error('LAYOUT ERROR: public/index.html was not found. Upload the V36 package contents to the repository root.');
  process.exit(1);
}
console.log(`Layout OK: ${path.join(pub, 'index.html')}`);

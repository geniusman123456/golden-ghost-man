'use strict';
const fs = require('fs');
const path = require('path');
const required = [
  'package.json', 'server.js', 'db.js', 'payment-provider.js',
  path.join('public', 'index.html'), path.join('public', 'manifest.webmanifest'),
  path.join('public', 'service-worker.js')
];
const missing = required.filter((p) => !fs.existsSync(path.join(__dirname, p)));
if (missing.length) {
  console.error('DEPLOY PREFLIGHT FAILED');
  for (const item of missing) console.error(`Missing: ${item}`);
  process.exit(1);
}
console.log('Deploy preflight: PASS');

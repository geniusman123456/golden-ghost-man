const fs = require('fs');
const path = require('path');

const root = __dirname;
const requiredPages = [
  'public/index.html','public/login.html','public/signup.html','public/user-dashboard.html',
  'public/wallet.html','public/user-transactions.html','public/user-payments.html',
  'public/discover.html','public/messages.html','public/chat.html','public/communities.html',
  'public/profile.html','public/user-notifications.html','public/user-settings.html',
  'public/admin-login.html','public/manifest.webmanifest','public/service-worker.js','public/icon-192.png','public/icon-512.png','public/dashboard.html','public/admins.html','public/users.html',
  'public/transactions.html','public/payments.html','public/admin-communities.html',
  'public/reports.html','public/notifications.html','public/settings.html',
  'public/security.html','public/system-health.html','public/final-check.html'
];
const requiredRoutes = [
  "'/api/health'", "'/api/user/register'", "'/api/user/login'", "'/api/user/session'",
  "'/api/user/wallet'", "'/api/user/transactions'", "'/api/user/payments'",
  "'/api/user/discover'", "'/api/user/connections'", "'/api/user/messages'",
  "'/api/user/communities'", "'/api/user/community/messages'", "'/api/user/notifications'",
  "'/api/admin/login'", "'/api/admin/session'", "'/api/admin/users'", "'/api/admin/transactions'",
  "'/api/admin/payments'", "'/api/admin/communities'", "'/api/admin/reports/summary'",
  "'/api/admin/security'", "'/api/admin/system-health'"
];
let failed = false;
for (const rel of requiredPages) {
  if (!fs.existsSync(path.join(root, rel))) { console.error('MISSING PAGE:', rel); failed = true; }
}
const server = fs.readFileSync(path.join(root,'server.js'),'utf8');
for (const route of requiredRoutes) {
  if (!server.includes(route)) { console.error('MISSING ROUTE:', route); failed = true; }
}
for (const f of ['server.js','db.js','payment-provider.js','setup.js','create-user.js']) {
  if (!fs.existsSync(path.join(root,f))) { console.error('MISSING FILE:', f); failed = true; }
}
if (failed) process.exit(1);
console.log('Golden Ghost smoke QA: PASS');
console.log(`Checked ${requiredPages.length} pages and ${requiredRoutes.length} core routes.`);

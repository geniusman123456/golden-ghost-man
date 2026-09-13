const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  console.log('.env tayari ipo. Setup haijabadilisha credentials zako.');
  console.log('Endesha: npm start');
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(resolve => rl.question(q, resolve));
(async () => {
  try {
    const adminUsername = (await ask('Initial admin username [admin]: ')).trim() || 'admin';
    const adminPassword = await ask('Initial admin password (min 8 chars): ');
    if (adminPassword.length < 8) throw new Error('Password ya admin lazima iwe angalau characters 8.');

    const userUsername = (await ask('Initial user username [ghost]: ')).trim() || 'ghost';
    const userEmail = (await ask('Initial user email [ghost@goldenghost.local]: ')).trim() || 'ghost@goldenghost.local';
    const userFullName = (await ask('Initial user full name [Golden Ghost User]: ')).trim() || 'Golden Ghost User';
    const userPassword = await ask('Initial user password (min 8 chars): ');
    if (userPassword.length < 8) throw new Error('Password ya user lazima iwe angalau characters 8.');

    const secret = crypto.randomBytes(48).toString('base64url');
    const webhook = crypto.randomBytes(32).toString('base64url');
    const content = `PORT=3000\nNODE_ENV=development\nSESSION_SECRET=${secret}\nADMIN_USERNAME=${adminUsername}\nADMIN_PASSWORD=${adminPassword}\nUSER_USERNAME=${userUsername}\nUSER_EMAIL=${userEmail}\nUSER_FULL_NAME=${userFullName}\nUSER_PASSWORD=${userPassword}\n\n# Payments stay disabled until official provider credentials are configured.\nPAYMENT_PROVIDER=unconfigured\nPAYMENT_WEBHOOK_SECRET=${webhook}\nPAYMENT_CALLBACK_URL=https://YOUR-DOMAIN/api/payments/callback\nPAYMENT_RETURN_URL=https://YOUR-DOMAIN/wallet.html\n\nAZAM_SANDBOX=true\nAZAM_APP_NAME=\nAZAM_CLIENT_ID=\nAZAM_CLIENT_SECRET=\nAZAM_TOKEN_KEY=\nAZAM_VENDOR_ID=\nAZAM_AUTH_URL=https://authenticator-sandbox.azampay.co.tz/AppRegistration/GenerateToken\nAZAM_API_BASE=https://sandbox.azampay.co.tz\nAZAM_MNO_PATH=/azampay/mno/checkout\nAZAM_POST_CHECKOUT_PATH=/api/v1/Partner/PostCheckout\nAZAM_STATUS_PATH=/azampay/gettransactionstatus\n`;
    fs.writeFileSync(envPath, content, { mode: 0o600 });
    console.log('\nSetup imekamilika.');
    console.log('1) npm start');
    console.log('2) Fungua http://localhost:3000/');
    console.log(`3) User login: http://localhost:3000/login.html (username: ${userUsername})`);
    console.log(`4) Admin login: http://localhost:3000/admin-login.html (username: ${adminUsername})`);
  } catch (e) {
    console.error('Setup failed:', e.message);
    process.exitCode = 1;
  } finally { rl.close(); }
})();

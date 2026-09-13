const readline = require('readline');
const { initDatabase, repairUserAccount } = require('./db');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(resolve => rl.question(q, resolve));

(async () => {
  try {
    await initDatabase();
    console.log('\n=== Golden Ghost — Repair Existing User Account ===\n');
    console.log('Hii ni kwa email ambayo tayari ilitumika. Itahifadhi wallet na history ya user.\n');
    const email = (await ask('Email iliyopo tayari: ')).trim().toLowerCase();
    const username = (await ask('Username mpya/uliopo (3-40): ')).trim();
    const full_name = (await ask('Full name: ')).trim();
    const country = (await ask('Country [TZ]: ')).trim() || 'TZ';
    const language = (await ask('Language [sw]: ')).trim() || 'sw';
    const password = await ask('Password mpya (min 8 characters): ');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('EMAIL_INVALID');
    if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(username)) throw new Error('USERNAME_INVALID');
    if (full_name.length < 2 || full_name.length > 100) throw new Error('NAME_INVALID');
    if (password.length < 8 || password.length > 200) throw new Error('PASSWORD_INVALID');

    const user = repairUserAccount({ email, username, full_name, country, language, password });
    console.log('\nAccount imerekebishwa kwa mafanikio.');
    console.log(`Username: ${user.username}`);
    console.log(`Email: ${user.email}`);
    console.log('Status: active');
    console.log('Wallet na transaction history zimehifadhiwa.');
    console.log('Login: http://localhost:3000/login.html\n');
  } catch (e) {
    const messages = {
      EMAIL_NOT_FOUND: 'Email hiyo haipo kwenye database ya mfumo huu.',
      EMAIL_INVALID: 'Email sio sahihi.',
      USERNAME_INVALID: 'Username iwe na herufi, namba, _, . au - (3-40).',
      USERNAME_EXISTS: 'Username hiyo tayari inatumiwa na User mwingine.',
      NAME_INVALID: 'Jina kamili linahitajika.',
      PASSWORD_INVALID: 'Password iwe na characters 8-200.'
    };
    console.error('\nRepair failed:', messages[e.message] || e.message);
    process.exitCode = 1;
  } finally { rl.close(); }
})();

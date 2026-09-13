const readline = require('readline');
const { initDatabase, listUsers, registerUser } = require('./db');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(resolve => rl.question(q, resolve));

(async () => {
  try {
    await initDatabase();
    console.log('\n=== Golden Ghost — Create User Account ===\n');
    const username = (await ask('Username (3-40, letters/numbers/._-): ')).trim();
    const email = (await ask('Email: ')).trim().toLowerCase();
    const full_name = (await ask('Full name: ')).trim();
    const country = (await ask('Country [TZ]: ')).trim() || 'TZ';
    const language = (await ask('Language [sw]: ')).trim() || 'sw';
    const password = await ask('Password (min 8 characters): ');

    if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(username)) throw new Error('Username sio sahihi. Tumia herufi, namba, _, . au - (3-40).');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email sio sahihi.');
    if (full_name.length < 2 || full_name.length > 100) throw new Error('Jina kamili linahitajika.');
    if (password.length < 8 || password.length > 200) throw new Error('Password iwe na characters 8-200.');

    const user = registerUser({ username, email, full_name, country, language, password });
    console.log('\nAccount imetengenezwa kwa mafanikio.');
    console.log(`Username: ${user.username}`);
    console.log(`Email: ${user.email}`);
    console.log('Login: http://localhost:3000/login.html');
    console.log(`Users waliopo sasa: ${listUsers().length}`);
    console.log('\nUsishiriki password yako hapa.\n');
  } catch (e) {
    if (e.message === 'USERNAME_EXISTS') console.error('\nUsername tayari ipo. Chagua username nyingine.');
    else if (e.message === 'EMAIL_EXISTS') console.error('\nEmail tayari imetumika. Tumia email nyingine.');
    else console.error('\nCreate user failed:', e.message);
    process.exitCode = 1;
  } finally { rl.close(); }
})();

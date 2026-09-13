const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'golden-ghost.db');

let SQL;
let db;

function hashPassword(password, salt = crypto.randomBytes(16)) {
  const hash = crypto.scryptSync(password, salt, 64);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

function verifyPassword(password, saltHex, hashHex) {
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function saveDatabase() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
}

function exec(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.run(params);
  } finally {
    stmt.free();
  }
  saveDatabase();
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    return stmt.step() ? stmt.getAsObject() : undefined;
  } finally {
    stmt.free();
  }
}

async function initDatabase() {
  SQL = await initSqlJs({
    locateFile: (file) => path.join(path.dirname(require.resolve('sql.js')), file)
  });

  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    db = new SQL.Database(fs.readFileSync(DB_FILE));
  } else {
    db = new SQL.Database();
  }

  db.run(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'super_admin',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      email TEXT UNIQUE,
      full_name TEXT,
      country TEXT,
      language TEXT,
      password_salt TEXT,
      password_hash TEXT,
      last_login_at TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      email_verified INTEGER NOT NULL DEFAULT 0,
      membership_plan TEXT NOT NULL DEFAULT 'free',
      membership_status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      currency TEXT NOT NULL DEFAULT 'TZS',
      balance_cents INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('deposit','withdrawal')),
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','failed')),
      reference TEXT UNIQUE NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payment_intents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      transaction_id INTEGER,
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      currency TEXT NOT NULL DEFAULT 'TZS',
      method TEXT NOT NULL CHECK(method IN ('visa','mastercard','mpesa','airtel_money','tigo_pesa','bank_transfer')),
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','failed','cancelled','refunded')),
      provider_reference TEXT UNIQUE,
      checkout_url TEXT,
      idempotency_key TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS payment_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_intent_id INTEGER,
      provider TEXT NOT NULL,
      event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      signature_valid INTEGER NOT NULL DEFAULT 0,
      payload TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (payment_intent_id) REFERENCES payment_intents(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER,
      user_id INTEGER,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'info',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS community_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      room TEXT NOT NULL DEFAULT 'global',
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_email_verify_user ON email_verification_tokens(user_id, used_at, expires_at);
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id, used_at, expires_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_admin ON notifications(admin_id,is_read,created_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id,is_read,created_at);

    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_payment_intents_user_id ON payment_intents(user_id);
    CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON payment_intents(status);
    CREATE INDEX IF NOT EXISTS idx_payment_events_intent ON payment_events(payment_intent_id);
    CREATE INDEX IF NOT EXISTS idx_community_messages_room_created ON community_messages(room,created_at);
    CREATE TABLE IF NOT EXISTS user_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_id INTEGER NOT NULL,
      addressee_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(requester_id, addressee_id),
      FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_connections_requester ON user_connections(requester_id,status);
    CREATE INDEX IF NOT EXISTS idx_connections_addressee ON user_connections(addressee_id,status);
    CREATE TABLE IF NOT EXISTS direct_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_direct_messages_pair ON direct_messages(sender_id,receiver_id,id);
    CREATE INDEX IF NOT EXISTS idx_direct_messages_receiver ON direct_messages(receiver_id,id);

    CREATE TABLE IF NOT EXISTS communities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'General',
      country TEXT,
      privacy TEXT NOT NULL DEFAULT 'public',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS community_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      community_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(community_id,user_id),
      FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS community_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      community_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS community_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_communities_category ON communities(category);
    CREATE INDEX IF NOT EXISTS idx_communities_owner ON communities(owner_id);
    CREATE INDEX IF NOT EXISTS idx_community_members_community ON community_members(community_id,status);
    CREATE INDEX IF NOT EXISTS idx_community_members_user ON community_members(user_id,status);
    CREATE INDEX IF NOT EXISTS idx_community_posts_community ON community_posts(community_id,id);
    CREATE INDEX IF NOT EXISTS idx_community_comments_post ON community_comments(post_id,id);
  `);
  const communityMemberColumns = new Set(db.exec("PRAGMA table_info(community_members)")[0]?.values.map(r => r[1]) || []);
  if (!communityMemberColumns.has('updated_at')) db.run("ALTER TABLE community_members ADD COLUMN updated_at TEXT");
  const communityColumns = new Set(db.exec("PRAGMA table_info(communities)")[0]?.values.map(r => r[1]) || []);
  if (!communityColumns.has('is_active')) db.run("ALTER TABLE communities ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1");
  const userColumns = new Set(db.exec("PRAGMA table_info(users)")[0]?.values.map(r => r[1]) || []);
  for (const [name, type] of [['country','TEXT'],['language','TEXT'],['password_salt','TEXT'],['password_hash','TEXT'],['last_login_at','TEXT'],['email_verified','INTEGER NOT NULL DEFAULT 0'],['membership_plan',"TEXT NOT NULL DEFAULT 'free'"],['membership_status',"TEXT NOT NULL DEFAULT 'active'"]]) {
    if (!userColumns.has(name)) db.run(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
  }
  exec("UPDATE users SET email_verified=1 WHERE email_verified IS NULL");
  saveDatabase();

  // First-run bootstrap: create the initial member user from .env when users are empty.
  const userCount = get('SELECT COUNT(*) AS count FROM users');
  if (Number(userCount.count) === 0 && process.env.USER_USERNAME && process.env.USER_PASSWORD) {
    const { salt, hash } = hashPassword(process.env.USER_PASSWORD);
    exec(
      `INSERT INTO users (username, email, full_name, country, language, password_salt, password_hash, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      [process.env.USER_USERNAME, process.env.USER_EMAIL || null, process.env.USER_FULL_NAME || process.env.USER_USERNAME, 'TZ', 'sw', salt, hash]
    );
    const newUserId = Number(get('SELECT last_insert_rowid() AS id').id);
    ensureWallet(newUserId);
    console.log(`Initial user '${process.env.USER_USERNAME}' amewekwa kwenye database.`);
  }

  // First-run bootstrap: create the initial admin from .env only when the database has no admins.
  const adminCount = get('SELECT COUNT(*) AS count FROM admin_users');
  if (Number(adminCount.count) === 0) {
    const username = process.env.ADMIN_USERNAME;
    const password = process.env.ADMIN_PASSWORD;
    if (!username || !password) {
      throw new Error('Database haina admin. Weka ADMIN_USERNAME na ADMIN_PASSWORD kwenye .env kwa first setup.');
    }
    const { salt, hash } = hashPassword(password);
    exec(
      `INSERT INTO admin_users (username, password_salt, password_hash) VALUES (?, ?, ?)`,
      [username, salt, hash]
    );
    console.log(`Initial admin '${username}' amewekwa kwenye database.`);
  }
}

function findActiveAdmin(username) {
  return get(
    `SELECT id, username, password_salt, password_hash, role FROM admin_users WHERE username = ? AND is_active = 1 LIMIT 1`,
    [username]
  );
}

function authenticateAdmin(username, password) {
  const admin = findActiveAdmin(username);
  if (!admin || !verifyPassword(password, admin.password_salt, admin.password_hash)) return null;

  exec('UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [admin.id]);
  return { id: admin.id, username: admin.username, role: admin.role };
}

function getAdminById(id) {
  return get(`SELECT id, username, role, is_active, created_at, updated_at, last_login_at FROM admin_users WHERE id = ? LIMIT 1`, [id]);
}

function listAdmins() {
  const stmt = db.prepare(`SELECT id, username, role, is_active, created_at, updated_at, last_login_at FROM admin_users ORDER BY id DESC`);
  try {
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally { stmt.free(); }
}

function createAdmin({ username, password, role = 'admin' }) {
  const existing = get('SELECT id FROM admin_users WHERE username = ? LIMIT 1', [username]);
  if (existing) throw new Error('USERNAME_EXISTS');
  const { salt, hash } = hashPassword(password);
  exec(`INSERT INTO admin_users (username, password_salt, password_hash, role) VALUES (?, ?, ?, ?)`, [username, salt, hash, role]);
  return getAdminById(db.exec(`SELECT last_insert_rowid() AS id`)[0].values[0][0]);
}

function updateAdmin(id, { username, role, is_active }) {
  const current = get('SELECT id FROM admin_users WHERE id = ? LIMIT 1', [id]);
  if (!current) throw new Error('ADMIN_NOT_FOUND');
  if (username) {
    const duplicate = get('SELECT id FROM admin_users WHERE username = ? AND id != ? LIMIT 1', [username, id]);
    if (duplicate) throw new Error('USERNAME_EXISTS');
  }
  exec(`UPDATE admin_users SET username = COALESCE(?, username), role = COALESCE(?, role), is_active = COALESCE(?, is_active), updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [username || null, role || null, typeof is_active === 'number' ? is_active : null, id]);
  return getAdminById(id);
}

function changeAdminPassword(id, password) {
  const current = get('SELECT id FROM admin_users WHERE id = ? LIMIT 1', [id]);
  if (!current) throw new Error('ADMIN_NOT_FOUND');
  const { salt, hash } = hashPassword(password);
  exec(`UPDATE admin_users SET password_salt = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [salt, hash, id]);
}

function countActiveSuperAdmins() {
  const row = get(`SELECT COUNT(*) AS count FROM admin_users WHERE role = 'super_admin' AND is_active = 1`);
  return Number(row.count);
}

function logAdminActivity(adminId, action, details = null) {
  exec(
    'INSERT INTO activity_logs (admin_id, action, details) VALUES (?, ?, ?)',
    [adminId || null, action, details]
  );
}

function listUsers({ search = '', status = '' } = {}) {
  const q = String(search || '').trim();
  const st = String(status || '').trim();
  const clauses = [];
  const params = [];
  if (q) {
    clauses.push(`(username LIKE ? OR email LIKE ? OR full_name LIKE ?)`);
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (st && ['active','inactive','suspended'].includes(st)) {
    clauses.push('status = ?');
    params.push(st);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const stmt = db.prepare(`SELECT id, username, email, full_name, status, created_at, updated_at FROM users ${where} ORDER BY id DESC`);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally { stmt.free(); }
}

function getUserById(id) {
  return get(`SELECT id, username, email, full_name, status, created_at, updated_at FROM users WHERE id = ? LIMIT 1`, [id]);
}

function createUser({ username, email, full_name }) {
  const existingUsername = username ? get('SELECT id FROM users WHERE username = ? LIMIT 1', [username]) : null;
  if (existingUsername) throw new Error('USERNAME_EXISTS');
  const existingEmail = email ? get('SELECT id FROM users WHERE email = ? LIMIT 1', [email]) : null;
  if (existingEmail) throw new Error('EMAIL_EXISTS');
  exec(`INSERT INTO users (username, email, full_name) VALUES (?, ?, ?)`, [username || null, email || null, full_name || null]);
  const row = get('SELECT last_insert_rowid() AS id');
  return getUserById(Number(row.id));
}

function updateUser(id, { username, email, full_name, status }) {
  const current = get('SELECT id FROM users WHERE id = ? LIMIT 1', [id]);
  if (!current) throw new Error('USER_NOT_FOUND');
  if (username !== undefined && username) {
    const duplicate = get('SELECT id FROM users WHERE username = ? AND id != ? LIMIT 1', [username, id]);
    if (duplicate) throw new Error('USERNAME_EXISTS');
  }
  if (email !== undefined && email) {
    const duplicate = get('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1', [email, id]);
    if (duplicate) throw new Error('EMAIL_EXISTS');
  }
  exec(`UPDATE users SET username = COALESCE(?, username), email = COALESCE(?, email), full_name = COALESCE(?, full_name), status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [username === undefined ? null : (username || null), email === undefined ? null : (email || null), full_name === undefined ? null : (full_name || null), status === undefined ? null : status, id]);
  return getUserById(id);
}


function findUserForLogin(identifier) {
  return get(`SELECT id, username, email, full_name, country, language, password_salt, password_hash, status FROM users WHERE username = ? OR email = ? LIMIT 1`, [identifier, identifier.toLowerCase()]);
}
function authenticateUser(identifier, password) {
  const user = findUserForLogin(identifier);
  if (!user || !user.password_hash || !user.password_salt) return null;
  if (user.status !== 'active') return { blocked: true, status: user.status };
  if (!verifyPassword(password, user.password_salt, user.password_hash)) return null;
  exec('UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
  return getUserAccountById(user.id);
}
function registerUser({ username, email, full_name, country, language, password }) {
  if (get('SELECT id FROM users WHERE username = ? LIMIT 1', [username])) throw new Error('USERNAME_EXISTS');
  if (get('SELECT id FROM users WHERE email = ? LIMIT 1', [email])) throw new Error('EMAIL_EXISTS');
  const { salt, hash } = hashPassword(password);
  exec(`INSERT INTO users (username,email,full_name,country,language,password_salt,password_hash,status,email_verified,membership_plan,membership_status) VALUES (?,?,?,?,?,?,?,'active',0,'free','active')`, [username,email,full_name,country,language,salt,hash]);
  const id = Number(get('SELECT last_insert_rowid() AS id').id);
  ensureWallet(id);
  return getUserAccountById(id);
}

function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }
function hashToken(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }
function issueEmailVerificationToken(userId, ttlMs = 1000 * 60 * 60 * 24) {
  const token = crypto.randomBytes(32).toString('hex');
  exec('UPDATE email_verification_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND used_at IS NULL',[userId]);
  exec('INSERT INTO email_verification_tokens(user_id,token_hash,expires_at) VALUES(?,?,?)',[userId,hashToken(token),new Date(Date.now()+ttlMs).toISOString()]);
  return token;
}
function verifyEmailToken(token) {
  const row=get(`SELECT * FROM email_verification_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>? ORDER BY id DESC LIMIT 1`,[hashToken(token),new Date().toISOString()]);
  if(!row) throw new Error('INVALID_VERIFICATION_TOKEN');
  exec('UPDATE users SET email_verified=1, updated_at=CURRENT_TIMESTAMP WHERE id=?',[row.user_id]);
  exec('UPDATE email_verification_tokens SET used_at=CURRENT_TIMESTAMP WHERE id=?',[row.id]);
  return getUserAccountById(row.user_id);
}
function getUserVerificationStatus(userId) { const r=get('SELECT id,email,email_verified FROM users WHERE id=?',[userId]); return r ? {id:r.id,email:r.email,email_verified:Number(r.email_verified)===1} : null; }
function issuePasswordResetToken(userId, ttlMs = 1000 * 60 * 30) {
  const token=crypto.randomBytes(32).toString('hex');
  exec('UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND used_at IS NULL',[userId]);
  exec('INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES(?,?,?)',[userId,hashToken(token),new Date(Date.now()+ttlMs).toISOString()]);
  return token;
}
function resetPasswordWithToken(token,password) {
  const row=get(`SELECT * FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>? ORDER BY id DESC LIMIT 1`,[hashToken(token),new Date().toISOString()]);
  if(!row) throw new Error('INVALID_RESET_TOKEN');
  const {salt,hash}=hashPassword(password);
  exec('UPDATE users SET password_salt=?,password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[salt,hash,row.user_id]);
  exec('UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE id=?',[row.id]);
  return getUserAccountById(row.user_id);
}
function getUserByEmail(email) { return get('SELECT id,username,email,full_name,status,email_verified FROM users WHERE email=? LIMIT 1',[normalizeEmail(email)]); }
function updateMembership(userId, plan, status='active') {
  const allowed=['free','plus','premium']; if(!allowed.includes(plan)) throw new Error('INVALID_PLAN');
  exec('UPDATE users SET membership_plan=?,membership_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[plan,status,userId]);
  return getUserAccountById(userId);
}
function getUserAccountById(id) { return get(`SELECT id,username,email,full_name,country,language,status,email_verified,membership_plan,membership_status,created_at,updated_at,last_login_at FROM users WHERE id = ? LIMIT 1`, [id]); }
function updateUserProfile(id, {username,email,full_name,country,language}) {
  const current=get('SELECT id FROM users WHERE id=? LIMIT 1',[id]); if(!current) throw new Error('USER_NOT_FOUND');
  if(username){const d=get('SELECT id FROM users WHERE username=? AND id!=? LIMIT 1',[username,id]);if(d)throw new Error('USERNAME_EXISTS');}
  if(email){const d=get('SELECT id FROM users WHERE email=? AND id!=? LIMIT 1',[email,id]);if(d)throw new Error('EMAIL_EXISTS');}
  exec(`UPDATE users SET username=COALESCE(?,username),email=COALESCE(?,email),full_name=COALESCE(?,full_name),country=COALESCE(?,country),language=COALESCE(?,language),updated_at=CURRENT_TIMESTAMP WHERE id=?`,[username||null,email||null,full_name||null,country||null,language||null,id]);
  return getUserAccountById(id);
}
function updateUserPassword(id, password) {
  if (!get('SELECT id FROM users WHERE id = ? LIMIT 1', [id])) throw new Error('USER_NOT_FOUND');
  const { salt, hash } = hashPassword(password);
  exec('UPDATE users SET password_salt=?, password_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [salt,hash,id]);
}

// Pre-launch account repair: reuses an existing email/user record without deleting wallet or history.
function repairUserAccount({ email, username, full_name, country, language, password }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const current = get('SELECT id FROM users WHERE email = ? LIMIT 1', [normalizedEmail]);
  if (!current) throw new Error('EMAIL_NOT_FOUND');
  const duplicate = get('SELECT id FROM users WHERE username = ? AND id != ? LIMIT 1', [username, current.id]);
  if (duplicate) throw new Error('USERNAME_EXISTS');
  const { salt, hash } = hashPassword(password);
  exec(`UPDATE users SET username=?, email=?, full_name=?, country=?, language=?, password_salt=?, password_hash=?, status='active', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [username, normalizedEmail, full_name, country, language, salt, hash, current.id]);
  ensureWallet(current.id);
  return getUserAccountById(current.id);
}


function ensureWallet(userId) {
  let w = get('SELECT id, user_id, currency, balance_cents, updated_at FROM wallets WHERE user_id = ? LIMIT 1', [userId]);
  if (!w) {
    exec("INSERT INTO wallets (user_id) VALUES (?)", [userId]);
    w = get('SELECT id, user_id, currency, balance_cents, updated_at FROM wallets WHERE user_id = ? LIMIT 1', [userId]);
  }
  return w;
}
function getWallet(userId) { return ensureWallet(userId); }
function listTransactions(userId, limit=100) {
  const stmt=db.prepare(`SELECT id,type,amount_cents,status,reference,note,created_at,updated_at FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT ?`);
  try { stmt.bind([userId, Math.min(Math.max(Number(limit)||100,1),500)]); const rows=[]; while(stmt.step()) rows.push(stmt.getAsObject()); return rows; } finally { stmt.free(); }
}
function createTransaction(userId,type,amountCents,note=null) {
  if (!['deposit','withdrawal'].includes(type)) throw new Error('INVALID_TYPE');
  const amount=Number(amountCents); if (!Number.isInteger(amount)||amount<=0) throw new Error('INVALID_AMOUNT');
  const user=get('SELECT id,status FROM users WHERE id=? LIMIT 1',[userId]); if(!user) throw new Error('USER_NOT_FOUND');
  if(user.status!=='active') throw new Error('USER_INACTIVE');
  const wallet=ensureWallet(userId);
  if(type==='withdrawal'){
    const pending=get("SELECT COALESCE(SUM(amount_cents),0) AS reserved FROM transactions WHERE user_id=? AND type='withdrawal' AND status='pending'",[userId]);
    const available=Number(wallet.balance_cents)-Number(pending.reserved||0);
    if(available<amount) throw new Error('INSUFFICIENT_FUNDS');
  }
  const ref='GG-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomBytes(4).toString('hex').toUpperCase();
  exec("INSERT INTO transactions (user_id,type,amount_cents,status,reference,note) VALUES (?,?,?,?,?,?)",[userId,type,amount,'pending',ref,note]);
  return get('SELECT id,type,amount_cents,status,reference,note,created_at,updated_at FROM transactions WHERE reference=?',[ref]);
}
function listAllTransactions({search='',status='',type=''}={}) {
  const clauses=[],params=[]; const q=String(search).trim();
  if(q){clauses.push('(t.reference LIKE ? OR u.username LIKE ? OR u.email LIKE ?)');const like='%'+q+'%';params.push(like,like,like);}
  if(['pending','completed','failed'].includes(status)){clauses.push('t.status=?');params.push(status);}
  if(['deposit','withdrawal'].includes(type)){clauses.push('t.type=?');params.push(type);}
  const where=clauses.length?'WHERE '+clauses.join(' AND '):'';
  const stmt=db.prepare(`SELECT t.id,t.user_id,t.type,t.amount_cents,t.status,t.reference,t.note,t.created_at,t.updated_at,u.username,u.email FROM transactions t LEFT JOIN users u ON u.id=t.user_id ${where} ORDER BY t.id DESC LIMIT 500`);
  try{stmt.bind(params);const rows=[];while(stmt.step())rows.push(stmt.getAsObject());return rows;}finally{stmt.free();}
}
function updateTransactionStatus(id,status){ if(!['pending','completed','failed'].includes(status)) throw new Error('INVALID_STATUS'); const t=get('SELECT * FROM transactions WHERE id=?',[id]); if(!t)throw new Error('NOT_FOUND'); if(t.status===status)return t; if(t.status!=='pending')throw new Error('FINALIZED'); db.run('BEGIN TRANSACTION'); try { if(status==='completed'){const w=ensureWallet(t.user_id); if(t.type==='withdrawal'&&Number(w.balance_cents)<Number(t.amount_cents))throw new Error('INSUFFICIENT_FUNDS'); const signed=t.type==='deposit'?Number(t.amount_cents):-Number(t.amount_cents); db.run('UPDATE wallets SET balance_cents=balance_cents+?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?',[signed,t.user_id]); } db.run('UPDATE transactions SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[status,id]); db.run('COMMIT');saveDatabase(); }catch(e){try{db.run('ROLLBACK')}catch(_){}throw e;} return get('SELECT * FROM transactions WHERE id=?',[id]); }


function createPaymentIntent({userId, amountCents, currency='TZS', method, provider='unconfigured', idempotencyKey, checkoutUrl=null}) {
  const methods=['visa','mastercard','mpesa','airtel_money','tigo_pesa','bank_transfer'];
  if(!methods.includes(method)) throw new Error('INVALID_METHOD');
  if(!Number.isInteger(Number(amountCents)) || Number(amountCents)<=0) throw new Error('INVALID_AMOUNT');
  if(!idempotencyKey || String(idempotencyKey).length<8 || String(idempotencyKey).length>120) throw new Error('INVALID_IDEMPOTENCY');
  const user=get('SELECT id,status FROM users WHERE id=?',[userId]);
  if(!user) throw new Error('USER_NOT_FOUND');
  if(user.status!=='active') throw new Error('USER_INACTIVE');
  const existing=get('SELECT * FROM payment_intents WHERE idempotency_key=? LIMIT 1',[String(idempotencyKey)]);
  if(existing) return existing;
  ensureWallet(userId);
  const ref='GG-PAY-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomBytes(4).toString('hex').toUpperCase();
  exec(`INSERT INTO transactions (user_id,type,amount_cents,status,reference,note) VALUES (?,?,?,?,?,?)`,[userId,'deposit',Number(amountCents),'pending',ref,`Payment ${method}`]);
  const txId=Number(get('SELECT last_insert_rowid() AS id').id);
  exec(`INSERT INTO payment_intents (user_id,transaction_id,amount_cents,currency,method,provider,status,provider_reference,checkout_url,idempotency_key) VALUES (?,?,?,?,?,?,?,?,?,?)`,[userId,txId,Number(amountCents),currency,method,provider,'pending',null,checkoutUrl,String(idempotencyKey)]);
  const id=Number(get('SELECT last_insert_rowid() AS id').id);
  return get('SELECT * FROM payment_intents WHERE id=?',[id]);
}
function getPaymentIntent(id){ return get('SELECT * FROM payment_intents WHERE id=? LIMIT 1',[id]); }
function updatePaymentProviderData(id,{providerReference=null,checkoutUrl=null}={}) { exec('UPDATE payment_intents SET provider_reference=COALESCE(?,provider_reference),checkout_url=COALESCE(?,checkout_url),updated_at=CURRENT_TIMESTAMP WHERE id=?',[providerReference,checkoutUrl,id]); return getPaymentIntent(id); }
function listPaymentIntents({userId=null,status='',method='',search=''}={}){
  const clauses=[],params=[]; if(userId!==null){clauses.push('p.user_id=?');params.push(userId)}
  if(['pending','processing','completed','failed','cancelled','refunded'].includes(status)){clauses.push('p.status=?');params.push(status)}
  if(['visa','mastercard','mpesa','airtel_money','tigo_pesa','bank_transfer'].includes(method)){clauses.push('p.method=?');params.push(method)}
  const q=String(search||'').trim(); if(q){clauses.push('(p.id=CAST(? AS INTEGER) OR p.provider_reference LIKE ? OR t.reference LIKE ? OR u.username LIKE ? OR u.email LIKE ?)');params.push(q,'%'+q+'%','%'+q+'%','%'+q+'%','%'+q+'%')}
  const where=clauses.length?'WHERE '+clauses.join(' AND '):'';
  const stmt=db.prepare(`SELECT p.*,t.reference transaction_reference,u.username,u.email FROM payment_intents p LEFT JOIN transactions t ON t.id=p.transaction_id LEFT JOIN users u ON u.id=p.user_id ${where} ORDER BY p.id DESC LIMIT 500`);
  try{stmt.bind(params);const rows=[];while(stmt.step())rows.push(stmt.getAsObject());return rows}finally{stmt.free()}
}
function setPaymentProcessing(id, providerReference=null){ const p=getPaymentIntent(id); if(!p)throw new Error('NOT_FOUND'); if(p.status!=='pending')return p; exec('UPDATE payment_intents SET status=?,provider_reference=COALESCE(?,provider_reference),updated_at=CURRENT_TIMESTAMP WHERE id=?',['processing',providerReference,id]); return getPaymentIntent(id); }
function recordPaymentEvent({paymentIntentId=null,provider,eventId,eventType,signatureValid=false,payload=null}){
  const exists=get('SELECT id FROM payment_events WHERE event_id=?',[eventId]); if(exists) return {duplicate:true,event:get('SELECT * FROM payment_events WHERE id=?',[exists.id])};
  exec('INSERT INTO payment_events (payment_intent_id,provider,event_id,event_type,signature_valid,payload) VALUES (?,?,?,?,?,?)',[paymentIntentId,provider,eventId,eventType,signatureValid?1:0,payload?JSON.stringify(payload):null]);
  return {duplicate:false,event:get('SELECT * FROM payment_events WHERE event_id=?',[eventId])};
}
function completePayment(id, providerReference=null){
  const p=getPaymentIntent(id); if(!p)throw new Error('NOT_FOUND'); if(p.status==='completed')return p; if(['failed','cancelled','refunded'].includes(p.status))throw new Error('FINALIZED');
  const tx=get('SELECT * FROM transactions WHERE id=?',[p.transaction_id]); if(!tx)throw new Error('TRANSACTION_NOT_FOUND');
  if(tx.status!=='pending') throw new Error('TRANSACTION_NOT_PENDING');
  db.run('BEGIN TRANSACTION'); try {
    const freshTx=get('SELECT status FROM transactions WHERE id=?',[p.transaction_id]);
    const freshPayment=get('SELECT status FROM payment_intents WHERE id=?',[id]);
    if(!freshTx || freshTx.status!=='pending' || !freshPayment || freshPayment.status==='completed') throw new Error('ALREADY_PROCESSED');
    db.run(`UPDATE wallets SET balance_cents=balance_cents+?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?`,[Number(p.amount_cents),p.user_id]);
    db.run(`UPDATE transactions SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'`,[p.transaction_id]);
    db.run(`UPDATE payment_intents SET status='completed',provider_reference=COALESCE(?,provider_reference),completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status!='completed'`,[providerReference,id]);
    db.run('COMMIT'); saveDatabase();
  } catch(e){try{db.run('ROLLBACK')}catch(_){} throw e;}
  return getPaymentIntent(id);
}
function failPayment(id){ const p=getPaymentIntent(id); if(!p)throw new Error('NOT_FOUND'); if(p.status==='completed')throw new Error('FINALIZED'); if(p.status==='failed')return p; exec(`UPDATE payment_intents SET status='failed',updated_at=CURRENT_TIMESTAMP WHERE id=?`,[id]); if(p.transaction_id)exec(`UPDATE transactions SET status='failed',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'`,[p.transaction_id]); return getPaymentIntent(id); }

function getDashboardSummary() {
  const users = get("SELECT COUNT(*) AS count FROM users");
  const transactions = get("SELECT COUNT(*) AS count FROM transactions");
  const pending = get("SELECT COUNT(*) AS count FROM transactions WHERE status = 'pending'");
  const activities = get("SELECT COUNT(*) AS count FROM activity_logs");
  const volume = get("SELECT COALESCE(SUM(amount_cents),0) AS amount FROM transactions WHERE status = 'completed' AND type='deposit'");

  return {
    users: Number(users.count),
    transactions: Number(transactions.count),
    pendingTransactions: Number(pending.count),
    activities: Number(activities.count),
    completedDepositsCents: Number(volume.amount || 0)
  };
}

function listActivityLogs({limit=200}={}){
  const stmt=db.prepare(`SELECT a.*, au.username AS admin_username FROM activity_logs a LEFT JOIN admin_users au ON au.id=a.admin_id ORDER BY a.id DESC LIMIT ?`);
  try{stmt.bind([Math.min(500,Math.max(1,Number(limit)||200))]);const rows=[];while(stmt.step())rows.push(stmt.getAsObject());return rows}finally{stmt.free()}
}
function createNotification({adminId=null,userId=null,title,message,type='info'}){exec('INSERT INTO notifications (admin_id,user_id,title,message,type) VALUES (?,?,?,?,?)',[adminId,userId,title,message,type]);return get('SELECT * FROM notifications WHERE id=last_insert_rowid()')}
function listNotifications({adminId=null,userId=null,unreadOnly=false,limit=100}={}){const clauses=[],params=[];if(adminId!==null){clauses.push('admin_id=?');params.push(adminId)}if(userId!==null){clauses.push('user_id=?');params.push(userId)}if(unreadOnly){clauses.push('is_read=0')}const where=clauses.length?'WHERE '+clauses.join(' AND '):'';params.push(Math.min(200,Math.max(1,Number(limit)||100)));const st=db.prepare(`SELECT * FROM notifications ${where} ORDER BY id DESC LIMIT ?`);try{st.bind(params);const rows=[];while(st.step())rows.push(st.getAsObject());return rows}finally{st.free()}}
function markNotificationRead(id,{adminId=null,userId=null}={}){const clauses=['id=?'],params=[id];if(adminId!==null){clauses.push('admin_id=?');params.push(adminId)}if(userId!==null){clauses.push('user_id=?');params.push(userId)}exec(`UPDATE notifications SET is_read=1 WHERE ${clauses.join(' AND ')}`,params);return get('SELECT * FROM notifications WHERE id=?',[id])}
function markAllNotificationsRead({adminId=null,userId=null}={}){const clauses=[],params=[];if(adminId!==null){clauses.push('admin_id=?');params.push(adminId)}if(userId!==null){clauses.push('user_id=?');params.push(userId)}if(!clauses.length)return;exec(`UPDATE notifications SET is_read=1 WHERE ${clauses.join(' AND ')}`,params)}
function listSettings(){const st=db.prepare('SELECT * FROM settings ORDER BY key');try{const rows=[];while(st.step())rows.push(st.getAsObject());return rows}finally{st.free()}}
function getSetting(key){return get('SELECT * FROM settings WHERE key=?',[key])}
function setSetting(key,value){exec(`INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`,[key,String(value??'')]);return getSetting(key)}
function getReportsSummary(){return {users:get('SELECT COUNT(*) count FROM users'),activeUsers:get("SELECT COUNT(*) count FROM users WHERE status='active'"),admins:get('SELECT COUNT(*) count FROM admin_users'),walletBalance:get('SELECT COALESCE(SUM(balance_cents),0) amount FROM wallets'),depositCompleted:get("SELECT COALESCE(SUM(amount_cents),0) amount FROM transactions WHERE type='deposit' AND status='completed'"),withdrawalCompleted:get("SELECT COALESCE(SUM(amount_cents),0) amount FROM transactions WHERE type='withdrawal' AND status='completed'"),pending:get("SELECT COUNT(*) count FROM transactions WHERE status='pending'"),failed:get("SELECT COUNT(*) count FROM transactions WHERE status='failed'")}}
function getDailyReport(days=30){const n=Math.min(90,Math.max(1,Number(days)||30));const st=db.prepare(`SELECT substr(created_at,1,10) day, type, status, COUNT(*) count, COALESCE(SUM(amount_cents),0) amount_cents FROM transactions WHERE date(created_at)>=date('now', '-' || ? || ' days') GROUP BY day,type,status ORDER BY day ASC`);try{st.bind([n]);const rows=[];while(st.step())rows.push(st.getAsObject());return rows}finally{st.free()}}
function listCommunityPeople({limit=24, search=null}={}){
  const n=Math.min(100,Math.max(1,Number(limit)||24));
  const params=[]; let where="WHERE status='active'";
  if(search && String(search).trim()){
    where += " AND (LOWER(COALESCE(full_name,'')) LIKE ? OR LOWER(COALESCE(username,'')) LIKE ? OR LOWER(COALESCE(country,'')) LIKE ?)";
    const q='%'+String(search).trim().toLowerCase()+'%'; params.push(q,q,q);
  }
  params.push(n);
  const st=db.prepare(`SELECT id,username,email,full_name,country,language,created_at FROM users ${where} ORDER BY id DESC LIMIT ?`);
  try{const rows=[];st.bind(params);while(st.step())rows.push(st.getAsObject());return rows}finally{st.free()}
}
function countCommunityPeople(){return Number(get("SELECT COUNT(*) AS count FROM users WHERE status='active'").count||0)}
function createCommunityMessage({userId,message,room='global'}){
  const text=typeof message==='string'?message.trim():'';
  if(!text)throw new Error('EMPTY_MESSAGE');
  if(text.length>1000)throw new Error('MESSAGE_TOO_LONG');
  const user=get('SELECT id,status FROM users WHERE id=?',[userId]);
  if(!user)throw new Error('USER_NOT_FOUND');
  if(user.status!=='active')throw new Error('USER_INACTIVE');
  const safeRoom=(typeof room==='string'&&room.trim())?room.trim().slice(0,50):'global';
  exec('INSERT INTO community_messages(user_id,room,message) VALUES(?,?,?)',[userId,safeRoom,text]);
  saveDatabase();
  return get(`SELECT m.*,u.username,u.full_name,u.country,u.language FROM community_messages m JOIN users u ON u.id=m.user_id WHERE m.id=last_insert_rowid()`);
}
function listCommunityMessages({room='global',limit=60,beforeId=null}={}){
  const n=Math.min(100,Math.max(1,Number(limit)||60)); const params=[String(room||'global')];
  let where='m.room=?';
  if(beforeId!==null && Number.isFinite(Number(beforeId))){where+=' AND m.id<?';params.push(Number(beforeId));}
  params.push(n);
  const st=db.prepare(`SELECT m.*,u.username,u.full_name,u.country,u.language FROM community_messages m JOIN users u ON u.id=m.user_id WHERE ${where} ORDER BY m.id DESC LIMIT ?`);
  try{st.bind(params);const rows=[];while(st.step())rows.push(st.getAsObject());return rows.reverse()}finally{st.free()}
}
function getSecuritySummary(){return {admins:listAdmins().map(a=>({id:a.id,username:a.username,role:a.role,is_active:a.is_active,last_login_at:a.last_login_at})),activityCount:Number(get('SELECT COUNT(*) count FROM activity_logs').count),recentActivity:listActivityLogs({limit:50})}}


function slugifyCommunity(name){return String(name||'').trim().toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,70)}
function listCommunities({userId=null,search=null,category=null,limit=50}={}){
  const n=Math.min(100,Math.max(1,Number(limit)||50)); const params=userId?[userId]:[]; let where='WHERE c.is_active=1';
  if(search&&String(search).trim()){where+=" AND (LOWER(c.name) LIKE ? OR LOWER(c.description) LIKE ? OR LOWER(c.category) LIKE ?)";const q='%'+String(search).trim().toLowerCase()+'%';params.push(q,q,q)}
  if(category&&String(category).trim()){where+=' AND LOWER(c.category)=LOWER(?)';params.push(String(category).trim())}
  const membership=userId?`COALESCE((SELECT status FROM community_members cm WHERE cm.community_id=c.id AND cm.user_id=? LIMIT 1),'none')`:`'none'`;
  params.push(n);
  const st=db.prepare(`SELECT c.*,u.username owner_username,u.full_name owner_name,(SELECT COUNT(*) FROM community_members cm2 WHERE cm2.community_id=c.id AND cm2.status='active') member_count,${membership} membership_status FROM communities c JOIN users u ON u.id=c.owner_id ${where} ORDER BY c.id DESC LIMIT ?`);
  try{st.bind(params);const rows=[];while(st.step())rows.push(st.getAsObject());return rows}finally{st.free()}
}
function getCommunity(communityId,userId=null){
  const c=get(`SELECT c.*,u.username owner_username,u.full_name owner_name,(SELECT COUNT(*) FROM community_members cm WHERE cm.community_id=c.id AND cm.status='active') member_count FROM communities c JOIN users u ON u.id=c.owner_id WHERE c.id=?`,[communityId]);
  if(!c)return null;
  c.membership_status=userId?((get('SELECT status FROM community_members WHERE community_id=? AND user_id=?',[communityId,userId])||{}).status||'none'):'none';
  return c;
}
function createCommunity({ownerId,name,description='',category='General',country='',privacy='public'}){
  const cleanName=String(name||'').trim(); if(cleanName.length<3||cleanName.length>80)throw new Error('INVALID_NAME');
  const cleanDesc=String(description||'').trim().slice(0,1000); const cleanCat=String(category||'General').trim().slice(0,60)||'General';
  const cleanPrivacy=['public','private'].includes(String(privacy))?String(privacy):'public';
  const owner=get('SELECT id,status FROM users WHERE id=?',[ownerId]);if(!owner||owner.status!=='active')throw new Error('USER_NOT_FOUND');
  let slug=slugifyCommunity(cleanName)||('community-'+Date.now()); let i=2; while(get('SELECT id FROM communities WHERE slug=?',[slug])){slug=slugifyCommunity(cleanName)+'-'+i++;}
  exec('INSERT INTO communities(owner_id,name,slug,description,category,country,privacy) VALUES(?,?,?,?,?,?,?)',[ownerId,cleanName,slug,cleanDesc,cleanCat,String(country||'').trim().slice(0,80)||null,cleanPrivacy]);
  const id=Number(get('SELECT last_insert_rowid() id').id);exec("INSERT INTO community_members(community_id,user_id,role,status) VALUES(?,?, 'owner','active')",[id,ownerId]);saveDatabase();return getCommunity(id,ownerId);
}
function joinCommunity(userId,communityId){const c=get('SELECT id,privacy FROM communities WHERE id=?',[communityId]);if(!c)throw new Error('NOT_FOUND');if(c.privacy==='private')throw new Error('PRIVATE_COMMUNITY');const u=get('SELECT id,status FROM users WHERE id=?',[userId]);if(!u||u.status!=='active')throw new Error('USER_NOT_FOUND');const existing=get('SELECT * FROM community_members WHERE community_id=? AND user_id=?',[communityId,userId]);if(existing){if(existing.status==='active')return existing;exec("UPDATE community_members SET status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?",[existing.id]);}else exec("INSERT INTO community_members(community_id,user_id,role,status) VALUES(?,?, 'member','active')",[communityId,userId]);saveDatabase();return get('SELECT * FROM community_members WHERE community_id=? AND user_id=?',[communityId,userId]);}
function leaveCommunity(userId,communityId){const m=get('SELECT * FROM community_members WHERE community_id=? AND user_id=?',[communityId,userId]);if(!m)throw new Error('NOT_MEMBER');if(m.role==='owner')throw new Error('OWNER_CANNOT_LEAVE');exec("UPDATE community_members SET status='left' WHERE id=?",[m.id]);saveDatabase();return true;}
function listCommunityMembers(communityId,{limit=100,search=null}={}){const n=Math.min(200,Math.max(1,Number(limit)||100));const params=[communityId];let where="WHERE cm.community_id=? AND cm.status='active'";if(search&&String(search).trim()){where+=" AND (LOWER(COALESCE(u.full_name,'')) LIKE ? OR LOWER(COALESCE(u.username,'')) LIKE ?)";const q='%'+String(search).trim().toLowerCase()+'%';params.push(q,q)}params.push(n);const st=db.prepare(`SELECT u.id,u.username,u.full_name,u.country,u.language,cm.role,cm.created_at FROM community_members cm JOIN users u ON u.id=cm.user_id ${where} ORDER BY cm.role='owner' DESC,cm.id DESC LIMIT ?`);try{st.bind(params);const rows=[];while(st.step())rows.push(st.getAsObject());return rows}finally{st.free()}}
function isCommunityMember(userId,communityId){return !!get("SELECT id FROM community_members WHERE community_id=? AND user_id=? AND status='active'",[communityId,userId]);}
function createCommunityPost(userId,communityId,body){const text=String(body||'').trim();if(!text)throw new Error('EMPTY_POST');if(text.length>5000)throw new Error('POST_TOO_LONG');if(!isCommunityMember(userId,communityId))throw new Error('NOT_MEMBER');exec('INSERT INTO community_posts(community_id,user_id,body) VALUES(?,?,?)',[communityId,userId,text]);saveDatabase();return getCommunityPost(Number(get('SELECT last_insert_rowid() id').id));}
function getCommunityPost(id){return get(`SELECT p.*,u.username,u.full_name,u.country,(SELECT COUNT(*) FROM community_comments cc WHERE cc.post_id=p.id) comment_count FROM community_posts p JOIN users u ON u.id=p.user_id WHERE p.id=?`,[id]);}
function listCommunityPosts(communityId,{limit=50}={}){const n=Math.min(100,Math.max(1,Number(limit)||50));const st=db.prepare(`SELECT p.*,u.username,u.full_name,u.country,(SELECT COUNT(*) FROM community_comments cc WHERE cc.post_id=p.id) comment_count FROM community_posts p JOIN users u ON u.id=p.user_id WHERE p.community_id=? ORDER BY p.id DESC LIMIT ?`);try{st.bind([communityId,n]);const rows=[];while(st.step())rows.push(st.getAsObject());return rows}finally{st.free()}}
function createCommunityComment(userId,postId,body){const text=String(body||'').trim();if(!text)throw new Error('EMPTY_COMMENT');if(text.length>2000)throw new Error('COMMENT_TOO_LONG');const post=get('SELECT community_id FROM community_posts WHERE id=?',[postId]);if(!post)throw new Error('POST_NOT_FOUND');if(!isCommunityMember(userId,post.community_id))throw new Error('NOT_MEMBER');exec('INSERT INTO community_comments(post_id,user_id,body) VALUES(?,?,?)',[postId,userId,text]);saveDatabase();return get(`SELECT cc.*,u.username,u.full_name,u.country FROM community_comments cc JOIN users u ON u.id=cc.user_id WHERE cc.id=last_insert_rowid()`);}
function listCommunityComments(postId,{limit=100}={}){const n=Math.min(200,Math.max(1,Number(limit)||100));const st=db.prepare(`SELECT cc.*,u.username,u.full_name,u.country FROM community_comments cc JOIN users u ON u.id=cc.user_id WHERE cc.post_id=? ORDER BY cc.id ASC LIMIT ?`);try{st.bind([postId,n]);const rows=[];while(st.step())rows.push(st.getAsObject());return rows}finally{st.free()}}

function listDiscoverPeople({userId,limit=40,search=null,country=null,language=null}={}){
  const n=Math.min(100,Math.max(1,Number(limit)||40)); const params=[userId]; let where="WHERE u.status='active' AND u.id<>?";
  if(search&&String(search).trim()){where+=" AND (LOWER(COALESCE(u.full_name,'')) LIKE ? OR LOWER(COALESCE(u.username,'')) LIKE ? OR LOWER(COALESCE(u.country,'')) LIKE ?)";const q='%'+String(search).trim().toLowerCase()+'%';params.push(q,q,q)}
  if(country&&String(country).trim()){where+=" AND LOWER(COALESCE(u.country,''))=LOWER(?)";params.push(String(country).trim())}
  if(language&&String(language).trim()){where+=" AND LOWER(COALESCE(u.language,''))=LOWER(?)";params.push(String(language).trim())}
  params.push(n);
  const st=db.prepare(`SELECT u.id,u.username,u.email,u.full_name,u.country,u.language,u.created_at, COALESCE((SELECT status FROM user_connections c WHERE c.requester_id=? AND c.addressee_id=u.id ORDER BY c.id DESC LIMIT 1),(SELECT status FROM user_connections c WHERE c.requester_id=u.id AND c.addressee_id=? ORDER BY c.id DESC LIMIT 1),'none') AS connection_status FROM users u ${where} ORDER BY u.id DESC LIMIT ?`);
  const finalParams=[userId,userId,...params]; try{st.bind(finalParams);const rows=[];while(st.step())rows.push(st.getAsObject());return rows}finally{st.free()}
}
function getConnection(requesterId,addresseeId){return get('SELECT * FROM user_connections WHERE requester_id=? AND addressee_id=?',[requesterId,addresseeId])||get('SELECT * FROM user_connections WHERE requester_id=? AND addressee_id=?',[addresseeId,requesterId])}
function createConnection(requesterId,addresseeId){if(Number(requesterId)===Number(addresseeId))throw new Error('SELF_CONNECTION');const target=get('SELECT id,status FROM users WHERE id=?',[addresseeId]);if(!target||target.status!=='active')throw new Error('USER_NOT_FOUND');const existing=getConnection(requesterId,addresseeId);if(existing){if(existing.status==='accepted')return existing;exec("UPDATE user_connections SET status='pending',requester_id=?,addressee_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",[requesterId,addresseeId,existing.id]);}else exec("INSERT INTO user_connections(requester_id,addressee_id,status) VALUES(?,?, 'pending')",[requesterId,addresseeId]);saveDatabase();return getConnection(requesterId,addresseeId)}
function respondConnection(userId,connectionId,status){if(!['accepted','declined'].includes(status))throw new Error('INVALID_STATUS');const c=get('SELECT * FROM user_connections WHERE id=?',[connectionId]);if(!c||Number(c.addressee_id)!==Number(userId))throw new Error('NOT_FOUND');exec('UPDATE user_connections SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[status,connectionId]);saveDatabase();return get('SELECT * FROM user_connections WHERE id=?',[connectionId])}
function listConnections(userId){const st=db.prepare(`SELECT c.*,u.username,u.full_name,u.country,u.language FROM user_connections c JOIN users u ON u.id=CASE WHEN c.requester_id=? THEN c.addressee_id ELSE c.requester_id END WHERE (c.requester_id=? OR c.addressee_id=?) AND c.status='accepted' ORDER BY c.updated_at DESC`);try{st.bind([userId,userId,userId]);const rows=[];while(st.step())rows.push(st.getAsObject());return rows}finally{st.free()}}
function createDirectMessage(senderId,receiverId,message){const text=typeof message==='string'?message.trim():'';if(!text)throw new Error('EMPTY_MESSAGE');if(text.length>1000)throw new Error('MESSAGE_TOO_LONG');if(Number(senderId)===Number(receiverId))throw new Error('SELF_MESSAGE');const target=get('SELECT id,status FROM users WHERE id=?',[receiverId]);if(!target||target.status!=='active')throw new Error('USER_NOT_FOUND');exec('INSERT INTO direct_messages(sender_id,receiver_id,message) VALUES(?,?,?)',[senderId,receiverId,text]);saveDatabase();return get(`SELECT d.*,s.username sender_username,s.full_name sender_name,r.username receiver_username,r.full_name receiver_name FROM direct_messages d JOIN users s ON s.id=d.sender_id JOIN users r ON r.id=d.receiver_id WHERE d.id=last_insert_rowid()`)}
function listDirectMessages(userId,otherId,limit=80){const n=Math.min(100,Math.max(1,Number(limit)||80));const st=db.prepare(`SELECT d.*,s.username sender_username,s.full_name sender_name,r.username receiver_username,r.full_name receiver_name FROM direct_messages d JOIN users s ON s.id=d.sender_id JOIN users r ON r.id=d.receiver_id WHERE ((d.sender_id=? AND d.receiver_id=?) OR (d.sender_id=? AND d.receiver_id=?)) ORDER BY d.id DESC LIMIT ?`);try{st.bind([userId,otherId,otherId,userId,n]);const rows=[];while(st.step())rows.push(st.getAsObject());return rows.reverse()}finally{st.free()}}
function listMessagePeople(userId){const st=db.prepare(`SELECT u.id,u.username,u.full_name,u.country,u.language,MAX(d.id) last_message_id,MAX(d.created_at) last_message_at FROM direct_messages d JOIN users u ON u.id=CASE WHEN d.sender_id=? THEN d.receiver_id ELSE d.sender_id END WHERE d.sender_id=? OR d.receiver_id=? GROUP BY u.id ORDER BY last_message_id DESC`);try{st.bind([userId,userId,userId]);const rows=[];while(st.step())rows.push(st.getAsObject());return rows}finally{st.free()}}


function listAdminCommunities({search='',status=''}={}){
  const q=String(search||'').trim(); const st=String(status||'').trim(); const clauses=[]; const params=[];
  if(q){clauses.push('(c.name LIKE ? OR c.slug LIKE ? OR c.category LIKE ? OR u.username LIKE ? OR u.full_name LIKE ?)');const like='%'+q+'%';params.push(like,like,like,like,like)}
  if(st==='active') clauses.push('c.is_active=1'); else if(st==='disabled') clauses.push('c.is_active=0');
  const where=clauses.length?'WHERE '+clauses.join(' AND '):'';
  const stt=db.prepare(`SELECT c.id,c.name,c.slug,c.description,c.category,c.country,c.privacy,c.is_active,c.created_at,c.updated_at,u.id owner_id,u.username owner_username,u.full_name owner_name,(SELECT COUNT(*) FROM community_members cm WHERE cm.community_id=c.id AND cm.status='active') member_count,(SELECT COUNT(*) FROM community_posts cp WHERE cp.community_id=c.id) post_count FROM communities c JOIN users u ON u.id=c.owner_id ${where} ORDER BY c.id DESC`);
  try{stt.bind(params);const rows=[];while(stt.step())rows.push(stt.getAsObject());return rows}finally{stt.free()}
}
function updateCommunityAdmin(id,{is_active,privacy,category}){const c=get('SELECT id FROM communities WHERE id=?',[id]);if(!c)throw new Error('NOT_FOUND');exec('UPDATE communities SET is_active=COALESCE(?,is_active),privacy=COALESCE(?,privacy),category=COALESCE(?,category),updated_at=CURRENT_TIMESTAMP WHERE id=?',[typeof is_active==='number'?is_active:null,privacy||null,category||null,id]);return get(`SELECT c.*,u.username owner_username,u.full_name owner_name,(SELECT COUNT(*) FROM community_members cm WHERE cm.community_id=c.id AND cm.status='active') member_count,(SELECT COUNT(*) FROM community_posts cp WHERE cp.community_id=c.id) post_count FROM communities c JOIN users u ON u.id=c.owner_id WHERE c.id=?`,[id]);}
function deleteCommunityAdmin(id){const c=get('SELECT id FROM communities WHERE id=?',[id]);if(!c)throw new Error('NOT_FOUND');exec('DELETE FROM communities WHERE id=?',[id]);return true;}
function listAdminCommunityPosts({communityId=null,limit=100}={}){const n=Math.min(500,Math.max(1,Number(limit)||100));const params=[];let where='';if(communityId){where='WHERE p.community_id=?';params.push(Number(communityId));}params.push(n);const st=db.prepare(`SELECT p.id,p.community_id,p.body,p.created_at,c.name community_name,u.id user_id,u.username,u.full_name,u.country FROM community_posts p JOIN communities c ON c.id=p.community_id JOIN users u ON u.id=p.user_id ${where} ORDER BY p.id DESC LIMIT ?`);try{st.bind(params);const rows=[];while(st.step())rows.push(st.getAsObject());return rows}finally{st.free()}}
function deleteCommunityPostAdmin(id){const p=get('SELECT id FROM community_posts WHERE id=?',[id]);if(!p)throw new Error('NOT_FOUND');exec('DELETE FROM community_posts WHERE id=?',[id]);return true;}

module.exports = {
  initDatabase,
  authenticateAdmin,
  logAdminActivity,
  getDashboardSummary,
  getAdminById,
  listAdmins,
  createAdmin,
  updateAdmin,
  changeAdminPassword,
  countActiveSuperAdmins,
  listUsers,
  getUserById,
  createUser,
  updateUser,
  authenticateUser,
  registerUser,
  getUserAccountById, updateUserProfile, issueEmailVerificationToken, verifyEmailToken, getUserVerificationStatus, issuePasswordResetToken, resetPasswordWithToken, getUserByEmail, updateMembership,
  updateUserPassword, repairUserAccount,
  getWallet, listTransactions, createTransaction, listAllTransactions, updateTransactionStatus,
  createPaymentIntent, getPaymentIntent, updatePaymentProviderData, listPaymentIntents, setPaymentProcessing, recordPaymentEvent, completePayment, failPayment,
  listActivityLogs, createNotification, listNotifications, markNotificationRead, markAllNotificationsRead, createCommunityMessage, listCommunityMessages, listCommunityPeople, countCommunityPeople,
  listCommunities, getCommunity, listAdminCommunities, updateCommunityAdmin, deleteCommunityAdmin, listAdminCommunityPosts, deleteCommunityPostAdmin, createCommunity, joinCommunity, leaveCommunity, listCommunityMembers, createCommunityPost, listCommunityPosts, createCommunityComment, listCommunityComments,
  listDiscoverPeople, createConnection, respondConnection, listConnections, createDirectMessage, listDirectMessages, listMessagePeople, listSettings, getSetting, setSetting, getReportsSummary, getDailyReport, getSecuritySummary,
  DB_FILE
};

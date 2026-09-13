const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const PAYMENT_PROVIDER = String(process.env.PAYMENT_PROVIDER || 'unconfigured').trim();
const PAYMENT_PROVIDER_BASE_URL = String(process.env.PAYMENT_PROVIDER_BASE_URL || '').trim();
const PAYMENT_PROVIDER_API_KEY = String(process.env.PAYMENT_PROVIDER_API_KEY || '').trim();
const PAYMENT_WEBHOOK_SECRET = String(process.env.PAYMENT_WEBHOOK_SECRET || '').trim();
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || '').trim();
const MAIL_FROM = String(process.env.MAIL_FROM || 'Golden Ghost <onboarding@resend.dev>').trim();
const APP_BASE_URL = String(process.env.APP_BASE_URL || '').trim().replace(/\/$/, '');
const DEV_EMAIL_MODE = String(process.env.DEV_EMAIL_MODE || 'false').toLowerCase() === 'true';

async function sendTransactionalEmail({to,subject,html}) {
  if (!RESEND_API_KEY) {
    if (DEV_EMAIL_MODE) return {dev:true};
    throw new Error('EMAIL_PROVIDER_NOT_CONFIGURED');
  }
  const r = await fetch('https://api.resend.com/emails', {method:'POST',headers:{'Authorization':`Bearer ${RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:MAIL_FROM,to:[to],subject,html})});
  const data = await r.json().catch(()=>({}));
  if (!r.ok) { const e=new Error('EMAIL_SEND_FAILED'); e.providerResponse=data; throw e; }
  return {id:data.id||null};
}
function baseUrl(req) { return APP_BASE_URL || `${req.protocol}://${req.get('host')}`; }
function verificationUrl(req,token){return `${baseUrl(req)}/verify-email.html?token=${encodeURIComponent(token)}`;}
function resetUrl(req,token){return `${baseUrl(req)}/reset-password.html?token=${encodeURIComponent(token)}`;}


const {
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
  updateUserPassword,
  getWallet, listTransactions, createTransaction, listAllTransactions, updateTransactionStatus,
  createPaymentIntent, getPaymentIntent, updatePaymentProviderData, listPaymentIntents, setPaymentProcessing, recordPaymentEvent, completePayment, failPayment,
  listActivityLogs, createNotification, listNotifications, markNotificationRead, markAllNotificationsRead, createCommunityMessage, listCommunityMessages, listCommunityPeople, countCommunityPeople, listCommunities, getCommunity, listAdminCommunities, updateCommunityAdmin, deleteCommunityAdmin, listAdminCommunityPosts, deleteCommunityPostAdmin, createCommunity, joinCommunity, leaveCommunity, listCommunityMembers, createCommunityPost, listCommunityPosts, createCommunityComment, listCommunityComments, listDiscoverPeople, createConnection, respondConnection, listConnections, createDirectMessage, listDirectMessages, listMessagePeople, listSettings, getSetting, setSetting, getReportsSummary, getDailyReport, getSecuritySummary
} = require('./db');
const { createHostedCheckout, getProviderPaymentStatus, providerConfigured, verifyHmac } = require('./payment-provider');

const app = express();
const PORT = Number(process.env.PORT || 10000);
const HOST = process.env.HOST || '0.0.0.0';

function resolvePublicRoot() {
  const roots = [__dirname, process.cwd()];
  const seen = new Set();
  const queue = [];
  for (const root of roots) if (root && !seen.has(root)) { seen.add(root); queue.push([root, 0]); }
  const skip = new Set(['node_modules', '.git', '.cache', 'data', 'dist', 'dist-desktop']);
  while (queue.length) {
    const [dir, depth] = queue.shift();
    const direct = path.join(dir, 'public');
    if (fs.existsSync(path.join(direct, 'index.html'))) return direct;
    if (depth >= 6) continue;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory() || skip.has(entry.name)) continue;
      const child = path.join(dir, entry.name);
      if (!seen.has(child)) { seen.add(child); queue.push([child, depth + 1]); }
    }
  }
  return path.join(__dirname, 'public');
}

const PUBLIC_DIR = resolvePublicRoot();
const INDEX_FILE = path.join(PUBLIC_DIR, 'index.html');
let SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  SESSION_SECRET = require('crypto').randomBytes(48).toString('base64url');
  console.warn('SESSION_SECRET is not set. A temporary secure secret was generated for this instance. Set SESSION_SECRET in your cloud service for persistent sessions across restarts.');
}
const SESSION_IDLE_MS = Number(process.env.SESSION_IDLE_MS || 1000 * 60 * 30);
const SESSION_ABSOLUTE_MS = Number(process.env.SESSION_ABSOLUTE_MS || 1000 * 60 * 60 * 24);

app.disable('x-powered-by');
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));

// Lightweight same-origin guard for state-changing JSON APIs. SameSite cookies remain enabled below.
app.use((req, res, next) => {
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method) || req.path === '/api/payments/webhook') return next();
  const origin = req.get('origin');
  if (!origin) return next();
  const expected = `${req.protocol}://${req.get('host')}`;
  if (origin !== expected) return res.status(403).json({ message: 'Request origin hairuhusiwi.' });
  next();
});

app.use(express.json({ limit: '20kb', verify: (req, res, buf) => { req.rawBody = Buffer.from(buf); } }));

app.use(session({
  name: 'gg_session',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_ABSOLUTE_MS
  }
}));

// Enforce both inactivity and absolute authenticated-session limits server-side.
app.use((req, res, next) => {
  if (!req.session?.isUser && !req.session?.isAdmin) return next();
  const now = Date.now();
  if (!req.session.authenticatedAt) req.session.authenticatedAt = now;
  if (!req.session.lastActivityAt) req.session.lastActivityAt = now;
  const expired = (now - req.session.lastActivityAt) > SESSION_IDLE_MS || (now - req.session.authenticatedAt) > SESSION_ABSOLUTE_MS;
  if (expired) {
    return req.session.destroy(() => {
      res.clearCookie('gg_session');
      res.status(401).json({ message: 'Session imekwisha. Ingia tena.' });
    });
  }
  req.session.lastActivityAt = now;
  next();
});


const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Majaribio ya login yamezidi. Subiri dakika chache kisha jaribu tena.' }
});

function requireAdmin(req, res, next) {
  if (req.session?.isAdmin !== true || !Number.isInteger(Number(req.session.adminId))) return res.redirect('/admin-login.html');
  const admin = getAdminById(Number(req.session.adminId));
  if (!admin || Number(admin.is_active) !== 1) {
    return req.session.destroy(() => { res.clearCookie('gg_session'); res.redirect('/admin-login.html'); });
  }
  req.session.adminUsername = admin.username;
  req.session.adminRole = admin.role;
  next();
}

function requireSuperAdmin(req, res, next) {
  if (req.session?.isAdmin !== true || !Number.isInteger(Number(req.session.adminId))) return res.status(403).json({ message: 'Huna ruhusa ya kufanya kazi hii.' });
  const admin = getAdminById(Number(req.session.adminId));
  if (!admin || Number(admin.is_active) !== 1 || admin.role !== 'super_admin') return res.status(403).json({ message: 'Huna ruhusa ya kufanya kazi hii.' });
  req.session.adminUsername = admin.username;
  req.session.adminRole = admin.role;
  next();
}

function validAdminUsername(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_.-]{3,40}$/.test(value.trim());
}

function validPassword(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 200;
}
function validUserUsername(value) { return typeof value === 'string' && /^[a-zA-Z0-9_.-]{3,40}$/.test(value.trim()); }
function validEmail(value) { return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()); }
function requireUser(req,res,next) {
  if (req.session?.isUser !== true || !Number.isInteger(Number(req.session.userId))) return res.redirect('/user-login.html');
  const user = getUserAccountById(Number(req.session.userId));
  if (!user || user.status !== 'active') {
    return req.session.destroy(() => { res.clearCookie('gg_session'); res.redirect('/user-login.html'); });
  }
  req.session.userUsername = user.username;
  req.session.userEmail = user.email;
  next();
}

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ message: 'Jaza username na password.' });
  }

  const admin = authenticateAdmin(username, password);
  if (!admin) {
    return res.status(401).json({ message: 'Username au password sio sahihi.' });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ message: 'Imeshindikana kuanzisha session.' });
    req.session.isAdmin = true;
    req.session.adminId = admin.id;
    req.session.adminUsername = admin.username;
    req.session.adminRole = admin.role;
    req.session.authenticatedAt = Date.now();
    req.session.lastActivityAt = Date.now();

    req.session.save((saveErr) => {
      if (saveErr) return res.status(500).json({ message: 'Imeshindikana kuhifadhi session.' });
      try { logAdminActivity(admin.id, 'admin_login', 'Admin aliingia kwenye dashboard'); } catch (_) {}
      res.json({ ok: true });
    });
  });
});


app.get('/api/health', (req, res) => res.json({ ok: true, service: 'golden-ghost', version: '36.0.0', port: PORT, publicIndex: fs.existsSync(INDEX_FILE), time: new Date().toISOString() }));

app.get('/api/runtime-info', (req, res) => res.json({ ok: true, environment: process.env.NODE_ENV || 'development', port: PORT, host: HOST, publicIndex: fs.existsSync(INDEX_FILE), paymentProvider: PAYMENT_PROVIDER, paymentConfigured: providerConfigured() }));

app.get('/api/admin/session', (req, res) => {
  if (req.session && req.session.isAdmin === true) {
    return res.json({
      authenticated: true,
      username: req.session.adminUsername,
      role: req.session.adminRole
    });
  }
  res.status(401).json({ authenticated: false });
});

app.get('/api/admin/dashboard-summary', requireAdmin, (req, res) => {
  res.json(getDashboardSummary());
});

app.get('/api/admin/activity', requireAdmin, (req,res)=>res.json({activities:listActivityLogs({limit:req.query.limit})}));
app.get('/api/admin/notifications', requireAdmin, (req,res)=>res.json({notifications:listNotifications({adminId:req.session.adminId,unreadOnly:String(req.query.unread)==='1'})}));
app.put('/api/admin/notifications/:id/read', requireAdmin, (req,res)=>{res.json({notification:markNotificationRead(Number(req.params.id),{adminId:req.session.adminId})})});
app.post('/api/admin/notifications/read-all', requireAdmin, (req,res)=>{markAllNotificationsRead({adminId:req.session.adminId});res.json({ok:true})});
app.get('/api/admin/reports/summary', requireAdmin, (req,res)=>res.json(getReportsSummary()));
app.get('/api/admin/reports/daily', requireAdmin, (req,res)=>res.json({rows:getDailyReport(req.query.days)}));
app.get('/api/admin/security', requireAdmin, (req,res)=>res.json(getSecuritySummary()));
app.get('/api/admin/settings', requireSuperAdmin, (req,res)=>res.json({settings:listSettings()}));
app.put('/api/admin/settings/:key', requireSuperAdmin, (req,res)=>{const key=String(req.params.key||'').trim(); if(!/^[a-zA-Z0-9_.-]{1,80}$/.test(key))return res.status(400).json({message:'Setting key sio sahihi.'}); const value=req.body?.value; if(typeof value!=='string'&&typeof value!=='number'&&typeof value!=='boolean')return res.status(400).json({message:'Value sio sahihi.'}); const item=setSetting(key,value); logAdminActivity(req.session.adminId,'setting_updated',`Setting: ${key}`); res.json({setting:item})});
app.get('/api/admin/system-health', requireAdmin, async (req,res)=>{res.json({ok:true,database:'connected',paymentProvider:PAYMENT_PROVIDER,providerConfigured:providerConfigured(),environment:process.env.NODE_ENV||'development',serverTime:new Date().toISOString()})});


app.get('/api/admin/me', requireAdmin, (req, res) => {
  const admin = getAdminById(req.session.adminId);
  if (!admin) return res.status(401).json({ message: 'Admin account haipo.' });
  res.json(admin);
});

app.get('/api/admin/admins', requireSuperAdmin, (req, res) => {
  res.json({ admins: listAdmins() });
});

app.post('/api/admin/admins', requireSuperAdmin, (req, res) => {
  const { username, password, role } = req.body || {};
  if (!validAdminUsername(username) || !validPassword(password)) {
    return res.status(400).json({ message: 'Username iwe na herufi/namba 3-40; password iwe angalau herufi 8.' });
  }
  if (!['admin', 'super_admin'].includes(role)) return res.status(400).json({ message: 'Role sio sahihi.' });
  try {
    const admin = createAdmin({ username: username.trim(), password, role });
    logAdminActivity(req.session.adminId, 'admin_created', `Ameongeza admin: ${admin.username}`);
    res.status(201).json({ admin });
  } catch (error) {
    if (error.message === 'USERNAME_EXISTS') return res.status(409).json({ message: 'Username tayari ipo.' });
    console.error(error);
    res.status(500).json({ message: 'Imeshindikana kuongeza admin.' });
  }
});

app.put('/api/admin/admins/:id', requireSuperAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { username, role, is_active } = req.body || {};
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Admin ID sio sahihi.' });
  if (username !== undefined && !validAdminUsername(username)) return res.status(400).json({ message: 'Username sio sahihi.' });
  if (role !== undefined && !['admin', 'super_admin'].includes(role)) return res.status(400).json({ message: 'Role sio sahihi.' });
  if (is_active !== undefined && ![0,1].includes(Number(is_active))) return res.status(400).json({ message: 'Status sio sahihi.' });
  const target = getAdminById(id);
  if (!target) return res.status(404).json({ message: 'Admin hajapatikana.' });
  if (id === req.session.adminId && Number(is_active) === 0) return res.status(400).json({ message: 'Huwezi kujizima account uliyoingia nayo.' });
  if (target.role === 'super_admin' && target.is_active === 1 && (role === 'admin' || Number(is_active) === 0) && countActiveSuperAdmins() <= 1) {
    return res.status(400).json({ message: 'Lazima kuwe na angalau Super Admin mmoja active.' });
  }
  try {
    const admin = updateAdmin(id, { username: username?.trim(), role, is_active: is_active === undefined ? undefined : Number(is_active) });
    if (id === req.session.adminId) {
      req.session.adminUsername = admin.username;
      req.session.adminRole = admin.role;
    }
    logAdminActivity(req.session.adminId, 'admin_updated', `Amebadilisha admin: ${admin.username}`);
    res.json({ admin });
  } catch (error) {
    if (error.message === 'USERNAME_EXISTS') return res.status(409).json({ message: 'Username tayari ipo.' });
    res.status(500).json({ message: 'Imeshindikana kubadilisha admin.' });
  }
});

app.put('/api/admin/admins/:id/password', requireSuperAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { password } = req.body || {};
  if (!Number.isInteger(id) || id < 1 || !validPassword(password)) return res.status(400).json({ message: 'Password iwe na angalau herufi 8.' });
  try {
    changeAdminPassword(id, password);
    const admin = getAdminById(id);
    logAdminActivity(req.session.adminId, 'admin_password_changed', `Password imebadilishwa: ${admin.username}`);
    res.json({ ok: true });
  } catch (error) {
    res.status(404).json({ message: 'Admin hajapatikana.' });
  }
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search : '';
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  res.json({ users: listUsers({ search, status }) });
});

app.post('/api/admin/users', requireAdmin, (req, res) => {
  const { username, email, full_name } = req.body || {};
  if (username !== undefined && username !== '' && !/^[a-zA-Z0-9_.-]{3,40}$/.test(String(username).trim())) {
    return res.status(400).json({ message: 'Username iwe na herufi/namba 3-40.' });
  }
  if (email !== undefined && email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
    return res.status(400).json({ message: 'Email sio sahihi.' });
  }
  if (full_name !== undefined && String(full_name).length > 100) return res.status(400).json({ message: 'Jina ni refu sana.' });
  try {
    const user = createUser({ username: String(username || '').trim() || null, email: String(email || '').trim().toLowerCase() || null, full_name: String(full_name || '').trim() || null });
    logAdminActivity(req.session.adminId, 'user_created', `Ameongeza user: ${user.username || user.email || user.id}`);
    res.status(201).json({ user });
  } catch (error) {
    if (error.message === 'USERNAME_EXISTS') return res.status(409).json({ message: 'Username tayari ipo.' });
    if (error.message === 'EMAIL_EXISTS') return res.status(409).json({ message: 'Email tayari ipo.' });
    console.error(error);
    res.status(500).json({ message: 'Imeshindikana kuongeza user.' });
  }
});

app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { username, email, full_name, status } = req.body || {};
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'User ID sio sahihi.' });
  if (username !== undefined && username !== '' && !/^[a-zA-Z0-9_.-]{3,40}$/.test(String(username).trim())) return res.status(400).json({ message: 'Username sio sahihi.' });
  if (email !== undefined && email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) return res.status(400).json({ message: 'Email sio sahihi.' });
  if (status !== undefined && !['active','inactive','suspended'].includes(status)) return res.status(400).json({ message: 'Status sio sahihi.' });
  try {
    const user = updateUser(id, {
      username: username === undefined ? undefined : String(username).trim() || null,
      email: email === undefined ? undefined : String(email).trim().toLowerCase() || null,
      full_name: full_name === undefined ? undefined : String(full_name).trim() || null,
      status
    });
    logAdminActivity(req.session.adminId, 'user_updated', `Amebadilisha user: ${user.username || user.email || user.id}`);
    res.json({ user });
  } catch (error) {
    if (error.message === 'USER_NOT_FOUND') return res.status(404).json({ message: 'User hajapatikana.' });
    if (error.message === 'USERNAME_EXISTS') return res.status(409).json({ message: 'Username tayari ipo.' });
    if (error.message === 'EMAIL_EXISTS') return res.status(409).json({ message: 'Email tayari ipo.' });
    res.status(500).json({ message: 'Imeshindikana kubadilisha user.' });
  }
});


const userLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { message: 'Majaribio ya login yamezidi. Subiri dakika chache.' } });

app.get('/api/health', async (req,res)=>res.json({ok:true,service:'golden-ghost',version:'32.0.0',time:new Date().toISOString()}));

app.get('/api/auth/verify-email', (req,res)=>{
  const token=String(req.query.token||'').trim();
  if(!token) return res.status(400).json({message:'Verification token haipo.'});
  try { const user=verifyEmailToken(token); res.json({ok:true,message:'Email imethibitishwa. Sasa unaweza kuingia.',user}); }
  catch(e){ res.status(400).json({message:e.message==='INVALID_VERIFICATION_TOKEN'?'Link ya verification imeisha au tayari imetumika.':'Imeshindikana kuthibitisha email.'}); }
});

app.post('/api/auth/resend-verification', userLoginLimiter, async (req,res)=>{
  const email=String(req.body?.email||'').trim().toLowerCase();
  if(!validEmail(email)) return res.status(400).json({message:'Email sio sahihi.'});
  const user=getUserByEmail(email);
  if(!user || Number(user.email_verified)===1) return res.json({ok:true,message:'Kama account inahitaji verification, email imetumwa.'});
  try {
    const token=issueEmailVerificationToken(user.id); const url=verificationUrl(req,token);
    const result=await sendTransactionalEmail({to:user.email,subject:'Thibitisha email yako — Golden Ghost',html:`<div style="font-family:Arial;background:#050505;color:#fff;padding:30px"><h2 style="color:#ffd21f">Golden Ghost</h2><p>Habari ${user.full_name||user.username},</p><p>Bonyeza kitufe kuthibitisha email yako.</p><p><a href="${url}" style="display:inline-block;background:#ffd21f;color:#080808;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700">THIBITISHA EMAIL</a></p><p>Link hii ina expiry ya saa 24.</p></div>`});
    res.json({ok:true,message:'Verification email imetumwa.',devVerificationUrl:result.dev?url:undefined});
  } catch(e){ console.error('verification email',e.providerResponse||e); res.status(503).json({message:'Email service haijaandaliwa. Weka RESEND_API_KEY na MAIL_FROM kwenye hosting.'}); }
});

app.post('/api/auth/forgot-password', userLoginLimiter, async (req,res)=>{
  const email=String(req.body?.email||'').trim().toLowerCase();
  if(!validEmail(email)) return res.status(400).json({message:'Email sio sahihi.'});
  const user=getUserByEmail(email);
  if(!user) return res.json({ok:true,message:'Kama email ipo kwenye mfumo, reset link imetumwa.'});
  try {
    const token=issuePasswordResetToken(user.id); const url=resetUrl(req,token);
    const result=await sendTransactionalEmail({to:user.email,subject:'Reset password — Golden Ghost',html:`<div style="font-family:Arial;background:#050505;color:#fff;padding:30px"><h2 style="color:#ffd21f">Golden Ghost</h2><p>Umeomba kubadilisha password.</p><p><a href="${url}" style="display:inline-block;background:#ffd21f;color:#080808;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700">RESET PASSWORD</a></p><p>Link hii ina expiry ya dakika 30.</p></div>`});
    res.json({ok:true,message:'Reset link imetumwa kama email ipo kwenye mfumo.',devResetUrl:result.dev?url:undefined});
  } catch(e){ console.error('password reset email',e.providerResponse||e); res.status(503).json({message:'Email service haijaandaliwa. Weka RESEND_API_KEY na MAIL_FROM kwenye hosting.'}); }
});

app.post('/api/auth/reset-password', userLoginLimiter, (req,res)=>{
  const token=String(req.body?.token||'').trim(); const password=req.body?.password;
  if(!token || !validPassword(password)) return res.status(400).json({message:'Token na password ya angalau herufi 8 vinahitajika.'});
  try { resetPasswordWithToken(token,password); res.json({ok:true,message:'Password imebadilishwa. Sasa unaweza kuingia.'}); }
  catch(e){ res.status(400).json({message:e.message==='INVALID_RESET_TOKEN'?'Reset link imeisha au tayari imetumika.':'Imeshindikana kubadilisha password.'}); }
});

app.post('/api/auth/login', userLoginLimiter, (req,res)=>{
  const {identifier,password}=req.body||{};
  if(typeof identifier!=='string'||typeof password!=='string') return res.status(400).json({message:'Jaza username/email na password.'});
  const key=identifier.trim();
  const admin=authenticateAdmin(key,password);
  if(admin){
    return req.session.regenerate(err=>{if(err)return res.status(500).json({message:'Imeshindikana kuanzisha session.'});req.session.isAdmin=true;req.session.adminId=admin.id;req.session.adminUsername=admin.username;req.session.adminRole=admin.role;req.session.authenticatedAt=Date.now();req.session.lastActivityAt=Date.now();req.session.save(e=>{if(e)return res.status(500).json({message:'Imeshindikana kuhifadhi session.'});res.json({ok:true,role:'admin',redirect:'/dashboard.html',user:admin});});});
  }
  const user=authenticateUser(key,password);
  if(user?.blocked) return res.status(403).json({message:`Account yako iko ${user.status}. Wasiliana na support.`});
  if(!user) {
    const candidate=getUserByEmail(key);
    if(candidate && Number(candidate.email_verified)!==1) return res.status(403).json({code:'EMAIL_NOT_VERIFIED',message:'Thibitisha email yako kwanza. Unaweza kutuma verification email tena.'});
    return res.status(401).json({message:'Username/email au password sio sahihi.'});
  }
  if(Number(user.email_verified)!==1) return res.status(403).json({code:'EMAIL_NOT_VERIFIED',message:'Thibitisha email yako kwanza. Unaweza kutuma verification email tena.'});
  req.session.regenerate(err=>{if(err)return res.status(500).json({message:'Imeshindikana kuanzisha session.'});req.session.isUser=true;req.session.userId=user.id;req.session.userUsername=user.username;req.session.userEmail=user.email;req.session.authenticatedAt=Date.now();req.session.lastActivityAt=Date.now();req.session.save(e=>{if(e)return res.status(500).json({message:'Imeshindikana kuhifadhi session.'});res.json({ok:true,role:'user',redirect:'/user-dashboard.html',user});});});
});

app.post('/api/user/register', userLoginLimiter, async (req,res)=>{
  const {username,email,full_name,country,language,password,terms}=req.body||{};
  if(!validUserUsername(username)) return res.status(400).json({message:'Username iwe na herufi/namba 3-40.'});
  if(!validEmail(email)) return res.status(400).json({message:'Email sio sahihi.'});
  if(typeof full_name!=='string'||full_name.trim().length<2||full_name.trim().length>100) return res.status(400).json({message:'Jina kamili linahitajika.'});
  if(!validPassword(password)) return res.status(400).json({message:'Password iwe na angalau herufi 8.'});
  if(terms!==true) return res.status(400).json({message:'Kubali masharti kabla ya kuendelea.'});
  try {
    const user=registerUser({username:username.trim(),email:email.trim().toLowerCase(),full_name:full_name.trim(),country:String(country||'').trim()||null,language:String(language||'').trim()||null,password});
    const token=issueEmailVerificationToken(user.id); const url=verificationUrl(req,token);
    const result=await sendTransactionalEmail({to:user.email,subject:'Thibitisha email yako — Golden Ghost',html:`<div style="font-family:Arial;background:#050505;color:#fff;padding:30px"><h2 style="color:#ffd21f">Karibu Golden Ghost 👻</h2><p>Habari ${user.full_name||user.username},</p><p>Thibitisha email yako ili kuanza kutumia account.</p><p><a href="${url}" style="display:inline-block;background:#ffd21f;color:#080808;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700">THIBITISHA EMAIL</a></p><p>Link hii ina expiry ya saa 24.</p></div>`});
    res.status(201).json({ok:true,requiresVerification:true,message:'Account imetengenezwa. Angalia email yako na uthibitishe account.',devVerificationUrl:result.dev?url:undefined,user:{id:user.id,username:user.username,email:user.email}});
  } catch(e){ if(e.message==='USERNAME_EXISTS')return res.status(409).json({message:'Username tayari ipo.'}); if(e.message==='EMAIL_EXISTS')return res.status(409).json({message:'Email tayari imetumika.'}); if(e.message==='EMAIL_PROVIDER_NOT_CONFIGURED')return res.status(503).json({message:'Account imeundwa lakini email service haijaandaliwa. Admin aweke RESEND_API_KEY na MAIL_FROM.'}); console.error(e.providerResponse||e);res.status(500).json({message:'Imeshindikana kutengeneza account.'}); }
});
app.post('/api/user/login', userLoginLimiter, (req,res)=>{
  const {identifier,password}=req.body||{};
  if(typeof identifier!=='string'||typeof password!=='string')return res.status(400).json({message:'Jaza username/email na password.'});
  const user=authenticateUser(identifier.trim(),password);
  if(user?.blocked)return res.status(403).json({message:`Account yako iko ${user.status}. Wasiliana na support.`});
  if(!user)return res.status(401).json({message:'Username/email au password sio sahihi.'});
  if(Number(user.email_verified)!==1)return res.status(403).json({code:'EMAIL_NOT_VERIFIED',message:'Thibitisha email yako kwanza.'});
  req.session.regenerate(err=>{if(err)return res.status(500).json({message:'Imeshindikana kuanzisha session.'});req.session.isUser=true;req.session.userId=user.id;req.session.userUsername=user.username;req.session.userEmail=user.email;req.session.authenticatedAt=Date.now();req.session.lastActivityAt=Date.now();req.session.save(e=>{if(e)return res.status(500).json({message:'Imeshindikana kuhifadhi session.'});res.json({ok:true,user});});});
});
app.get('/api/user/session',(req,res)=>{if(req.session?.isUser===true)return res.json({authenticated:true,id:req.session.userId,username:req.session.userUsername,email:req.session.userEmail});res.status(401).json({authenticated:false});});
app.get('/api/user/wallet', requireUser, (req,res)=>{ try{ res.json({wallet:getWallet(req.session.userId),transactions:listTransactions(req.session.userId)}); }catch(e){res.status(500).json({message:'Imeshindikana kupata wallet.'});} });
app.post('/api/user/transactions', requireUser, (req,res)=>{ const {type,amount,note}=req.body||{}; const cents=Math.round(Number(amount)*100); if(!Number.isFinite(Number(amount))||cents<=0)return res.status(400).json({message:'Amount sio sahihi.'}); try{ const tx=createTransaction(req.session.userId,type,cents,typeof note==='string'?note.trim().slice(0,200):null); res.status(201).json({transaction:tx,wallet:getWallet(req.session.userId)}); }catch(e){ const map={INSUFFICIENT_FUNDS:'Balance haitoshi.',INVALID_TYPE:'Transaction type sio sahihi.',INVALID_AMOUNT:'Amount sio sahihi.',USER_INACTIVE:'Account haiko active.',USER_NOT_FOUND:'User hajapatikana.'}; res.status(400).json({message:map[e.message]||'Transaction imeshindikana.'}); } });

const PAYMENT_METHODS = ['visa','mastercard','mpesa','airtel_money','tigo_pesa','bank_transfer'];
const PAYMENT_PROVIDERS = { visa: PAYMENT_PROVIDER, mastercard: PAYMENT_PROVIDER, mpesa: PAYMENT_PROVIDER, airtel_money: PAYMENT_PROVIDER, tigo_pesa: PAYMENT_PROVIDER, bank_transfer: PAYMENT_PROVIDER };
function validPaymentAmount(v){ const n=Number(v); return Number.isFinite(n) && n>0 && n<=1000000000; }
function safeIdempotency(req){ return String(req.get('Idempotency-Key') || req.body?.idempotency_key || '').trim(); }
app.get('/api/user/payment-methods', requireUser, (req,res)=>res.json({methods:PAYMENT_METHODS.map(method=>({method,provider:PAYMENT_PROVIDERS[method],configured:PAYMENT_PROVIDERS[method]!=='unconfigured'}))}));
app.post('/api/user/payments', requireUser, async (req,res)=>{
  const {method,amount,currency='TZS',phone=''}=req.body||{}; const cents=Math.round(Number(amount)*100); const key=safeIdempotency(req);
  if(!PAYMENT_METHODS.includes(method)) return res.status(400).json({message:'Payment method sio sahihi.'});
  if(!validPaymentAmount(amount)||cents<=0) return res.status(400).json({message:'Amount sio sahihi.'});
  if(currency!=='TZS') return res.status(400).json({message:'Kwa sasa currency inayoruhusiwa ni TZS.'});
  if(!key) return res.status(400).json({message:'Idempotency-Key inahitajika.'});
  try {
    let payment=createPaymentIntent({userId:req.session.userId,amountCents:cents,currency,method,provider:PAYMENT_PROVIDERS[method],idempotencyKey:key});
    if(providerConfigured() && !payment.checkout_url) {
      const user=getUserAccountById(req.session.userId);
      const result=await createHostedCheckout({payment,user,phone});
      payment=updatePaymentProviderData(payment.id,{providerReference:result.provider_reference,checkoutUrl:result.checkout_url});
    }
    const configured=providerConfigured();
    return res.status(201).json({payment,liveProviderConfigured:configured,message:payment.checkout_url?'Fungua checkout kuendelea na malipo.':configured?'Payment imepelekwa kwa provider; subiri confirmation.':'Payment imeandaliwa lakini provider bado hajaunganishwa. Weka merchant credentials kwenye .env.'});
  } catch(e){const map={INVALID_METHOD:'Payment method sio sahihi.',INVALID_AMOUNT:'Amount sio sahihi.',INVALID_IDEMPOTENCY:'Idempotency key sio sahihi.',USER_NOT_FOUND:'User hajapatikana.',USER_INACTIVE:'Account haiko active.'};console.error('payment create error',e.providerResponse||e);res.status(400).json({message:map[e.message]||'Imeshindikana kuanzisha payment.'});}
});
app.get('/api/user/payments', requireUser, (req,res)=>res.json({payments:listPaymentIntents({userId:req.session.userId,status:req.query.status,method:req.query.method,search:req.query.search})}));
function verifyWebhookSignature(rawBody, signature) { return verifyHmac(rawBody, signature, PAYMENT_WEBHOOK_SECRET); }

// Generic callback endpoint: provider-specific callbacks must still be verified/reconciled.
app.get('/api/payments/callback', async (req,res)=>{
  const paymentId = Number(req.query.payment_id || req.query.paymentId);
  const reference = String(req.query.provider_reference || req.query.transactionId || req.query.reference || '').trim();
  if (!paymentId && !reference) return res.status(400).send('Payment reference missing.');
  try {
    const intent = paymentId ? getPaymentIntent(paymentId) : null;
    if (intent && intent.status === 'completed') return res.redirect('/wallet.html');
    if (reference && providerConfigured()) {
      const status = await getProviderPaymentStatus(reference);
      const text = JSON.stringify(status || {}).toLowerCase();
      if (/success|completed|successful|paid/.test(text) && intent) completePayment(intent.id, reference);
      else if (/failed|cancelled|rejected/.test(text) && intent) failPayment(intent.id);
    }
    return res.redirect('/wallet.html');
  } catch (e) { console.error('payment callback error', e); return res.redirect('/wallet.html'); }
});

app.post('/api/payments/webhook', (req,res)=>{
  const signature = req.get('x-payment-signature') || req.get('x-webhook-signature') || '';
  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  if (!verifyWebhookSignature(raw, signature)) return res.status(401).json({message:'Webhook signature sio sahihi.'});
  const {event_id,event_type,payment_id,provider_reference,status,provider=PAYMENT_PROVIDER,payload}=req.body||{};
  if(!event_id||!event_type||!payment_id) return res.status(400).json({message:'Webhook payload haijakamilika.'});
  try{
    const intent=getPaymentIntent(Number(payment_id)); if(!intent)return res.status(404).json({message:'Payment haipo.'});
    const ev=recordPaymentEvent({paymentIntentId:intent.id,provider,eventId:String(event_id),eventType:String(event_type),signatureValid:true,payload:payload||req.body});
    if(ev.duplicate) return res.json({ok:true,duplicate:true});
    if(status==='processing' || event_type==='payment.processing') setPaymentProcessing(intent.id,provider_reference||null);
    else if(status==='completed' || event_type==='payment.success') completePayment(intent.id,provider_reference||null);
    else if(status==='failed' || event_type==='payment.failed') failPayment(intent.id);
    return res.json({ok:true});
  }catch(e){ console.error('payment webhook error',e); return res.status(400).json({message:'Webhook imeshindikana kuchakatwa.'}); }
});

app.get('/api/admin/payments', requireAdmin, (req,res)=>res.json({payments:listPaymentIntents({status:req.query.status,method:req.query.method,search:req.query.search})}));
app.get('/api/admin/payment-health', requireAdmin, async (req,res)=>{
  try {
    const result = await testProviderConnection();
    res.json(result);
  } catch (error) {
    console.error('Payment provider health check failed:', error);
    res.status(502).json({ configured: true, ok: false, provider: process.env.PAYMENT_PROVIDER || 'unconfigured', reason: error.message || 'PROVIDER_ERROR' });
  }
});
app.put('/api/admin/payments/:id/status', requireAdmin, (req,res)=>{try{const status=req.body?.status;let p;if(status==='processing')p=setPaymentProcessing(Number(req.params.id),req.body?.provider_reference||null);else if(status==='completed')p=completePayment(Number(req.params.id),req.body?.provider_reference||null);else if(status==='failed')p=failPayment(Number(req.params.id));else return res.status(400).json({message:'Status hairuhusiwi.'});logAdminActivity(req.session.adminId,'payment_status_changed',`Payment ${p.id} -> ${p.status}`); try{createNotification({userId:p.user_id,title:'Payment updated',message:`Payment #${p.id} imekuwa ${p.status}.`,type:p.status==='failed'?'error':'success'})}catch(_){} res.json({payment:p});}catch(e){const m={NOT_FOUND:'Payment haipo.',FINALIZED:'Payment tayari imefungwa.',TRANSACTION_NOT_FOUND:'Transaction haipo.'};res.status(400).json({message:m[e.message]||'Imeshindikana kubadilisha payment.'});}});

app.get('/api/admin/communities', requireAdmin, (req,res)=>{res.json({communities:listAdminCommunities({search:req.query.search,status:req.query.status})});});
app.put('/api/admin/communities/:id', requireAdmin, (req,res)=>{try{const id=Number(req.params.id);const payload={is_active:req.body?.is_active===undefined?undefined:Number(req.body.is_active),privacy:req.body?.privacy,category:req.body?.category};if(payload.is_active!==undefined&&!Number.isInteger(payload.is_active))return res.status(400).json({message:'Status sio sahihi.'});const c=updateCommunityAdmin(id,payload);logAdminActivity(req.session.adminId,'community_updated',`Community ${c.id} -> ${c.is_active?'active':'disabled'}`);res.json({community:c});}catch(e){res.status(400).json({message:e.message==='NOT_FOUND'?'Community haipo.':'Imeshindikana kubadilisha community.'});}});
app.delete('/api/admin/communities/:id', requireSuperAdmin, (req,res)=>{try{deleteCommunityAdmin(Number(req.params.id));logAdminActivity(req.session.adminId,'community_deleted',`Community ${req.params.id} imefutwa`);res.json({ok:true});}catch(e){res.status(404).json({message:'Community haipo.'});}});
app.get('/api/admin/community-posts', requireAdmin, (req,res)=>res.json({posts:listAdminCommunityPosts({communityId:req.query.communityId,limit:req.query.limit})}));
app.delete('/api/admin/community-posts/:id', requireAdmin, (req,res)=>{try{deleteCommunityPostAdmin(Number(req.params.id));logAdminActivity(req.session.adminId,'community_post_deleted',`Community post ${req.params.id} imefutwa`);res.json({ok:true});}catch(e){res.status(404).json({message:'Post haipo.'});}});
app.get('/api/admin/transactions', requireAdmin, (req,res)=>{res.json({transactions:listAllTransactions({search:req.query.search,status:req.query.status,type:req.query.type})});});
app.put('/api/admin/transactions/:id/status', requireAdmin, (req,res)=>{try{const tx=updateTransactionStatus(Number(req.params.id),req.body?.status);logAdminActivity(req.session.adminId,'transaction_status_changed',`Transaction ${tx.reference} -> ${tx.status}`); try{createNotification({userId:tx.user_id,title:'Transaction updated',message:`Transaction ${tx.reference} imekuwa ${tx.status}.`,type:tx.status==='failed'?'error':'success'})}catch(_){} res.json({transaction:tx});}catch(e){const m={INSUFFICIENT_FUNDS:'Balance haitoshi kukamilisha withdrawal.',FINALIZED:'Transaction tayari imefungwa.',NOT_FOUND:'Transaction haipo.'};res.status(400).json({message:m[e.message]||'Imeshindikana kubadilisha transaction.'});}});

app.get('/api/user/notifications',requireUser,(req,res)=>res.json({notifications:listNotifications({userId:req.session.userId,unreadOnly:String(req.query.unread)==='1'})}));
app.get('/api/user/discover',requireUser,(req,res)=>{try{res.json({people:listDiscoverPeople({userId:req.session.userId,limit:req.query.limit,search:req.query.search,country:req.query.country,language:req.query.language})});}catch(e){console.error(e);res.status(500).json({message:'Imeshindikana kupata watu.'});}});
app.post('/api/user/connections',requireUser,(req,res)=>{try{const c=createConnection(req.session.userId,Number(req.body?.user_id));try{createNotification({userId:Number(req.body?.user_id),title:'New connection request',message:`${req.session.userUsername||'A member'} ametuma connection request.`,type:'info'});}catch(_){}res.status(201).json({connection:c});}catch(e){const map={SELF_CONNECTION:'Huwezi kujiconnect mwenyewe.',USER_NOT_FOUND:'User hajapatikana.'};res.status(400).json({message:map[e.message]||'Connection imeshindikana.'});}});
app.get('/api/user/connections',requireUser,(req,res)=>res.json({connections:listConnections(req.session.userId)}));
app.put('/api/user/connections/:id',requireUser,(req,res)=>{try{res.json({connection:respondConnection(req.session.userId,Number(req.params.id),req.body?.status)});}catch(e){res.status(400).json({message:e.message==='NOT_FOUND'?'Connection haipo.':'Status sio sahihi.'});}});
app.get('/api/user/messages',requireUser,(req,res)=>{res.json({people:listMessagePeople(req.session.userId)});});
app.get('/api/user/messages/:userId',requireUser,(req,res)=>{const other=Number(req.params.userId);if(!Number.isInteger(other)||other<1)return res.status(400).json({message:'User ID sio sahihi.'});const target=getUserAccountById(other);if(!target||target.status!=='active')return res.status(404).json({message:'User hajapatikana.'});res.json({user:{id:target.id,username:target.username,full_name:target.full_name,country:target.country,language:target.language},messages:listDirectMessages(req.session.userId,other,req.query.limit)});});
app.post('/api/user/messages/:userId',requireUser,(req,res)=>{try{const msg=createDirectMessage(req.session.userId,Number(req.params.userId),req.body?.message);res.status(201).json({message:msg});}catch(e){const map={EMPTY_MESSAGE:'Andika ujumbe kwanza.',MESSAGE_TOO_LONG:'Ujumbe ni mrefu sana.',SELF_MESSAGE:'Huwezi kujitumia ujumbe.',USER_NOT_FOUND:'User hajapatikana.'};res.status(400).json({message:map[e.message]||'Ujumbe haukutumwa.'});}});
app.get('/api/user/communities',requireUser,(req,res)=>{try{res.json({communities:listCommunities({userId:req.session.userId,search:req.query.search,category:req.query.category,limit:req.query.limit})});}catch(e){res.status(500).json({message:'Imeshindikana kupata communities.'});}});
app.post('/api/user/communities',requireUser,(req,res)=>{try{const c=createCommunity({ownerId:req.session.userId,name:req.body?.name,description:req.body?.description,category:req.body?.category,country:req.body?.country,privacy:req.body?.privacy});res.status(201).json({community:c});}catch(e){const m={INVALID_NAME:'Jina la community liwe na herufi 3-80.',USER_NOT_FOUND:'User hajapatikana.'};res.status(400).json({message:m[e.message]||'Imeshindikana kuunda community.'});}});
app.get('/api/user/communities/:id',requireUser,(req,res)=>{try{const c=getCommunity(Number(req.params.id),req.session.userId);if(!c)return res.status(404).json({message:'Community haipo.'});res.json({community:c, members:listCommunityMembers(c.id,{limit:100}), posts:listCommunityPosts(c.id,{limit:50})});}catch(e){res.status(500).json({message:'Imeshindikana kupata community.'});}});
app.post('/api/user/communities/:id/join',requireUser,(req,res)=>{try{res.json({membership:joinCommunity(req.session.userId,Number(req.params.id))});}catch(e){const m={NOT_FOUND:'Community haipo.',PRIVATE_COMMUNITY:'Community hii ni private; joining request itahitaji approval.'};res.status(400).json({message:m[e.message]||'Imeshindikana kujiunga.'});}});
app.post('/api/user/communities/:id/leave',requireUser,(req,res)=>{try{leaveCommunity(req.session.userId,Number(req.params.id));res.json({ok:true});}catch(e){const m={NOT_MEMBER:'Wewe si member wa community hii.',OWNER_CANNOT_LEAVE:'Owner hawezi kuondoka kwenye community yake.'};res.status(400).json({message:m[e.message]||'Imeshindikana kuondoka.'});}});
app.get('/api/user/communities/:id/members',requireUser,(req,res)=>{try{const c=getCommunity(Number(req.params.id),req.session.userId);if(!c)return res.status(404).json({message:'Community haipo.'});res.json({members:listCommunityMembers(c.id,{limit:req.query.limit,search:req.query.search})});}catch(e){res.status(500).json({message:'Imeshindikana kupata members.'});}});
app.post('/api/user/communities/:id/posts',requireUser,(req,res)=>{try{res.status(201).json({post:createCommunityPost(req.session.userId,Number(req.params.id),req.body?.body)});}catch(e){const m={EMPTY_POST:'Andika post kwanza.',POST_TOO_LONG:'Post ni ndefu sana.',NOT_MEMBER:'Jiunge na community kwanza.'};res.status(400).json({message:m[e.message]||'Post imeshindikana.'});}});
app.get('/api/user/community-posts/:id/comments',requireUser,(req,res)=>{try{res.json({comments:listCommunityComments(Number(req.params.id),{limit:req.query.limit})});}catch(e){res.status(500).json({message:'Imeshindikana kupata comments.'});}});
app.post('/api/user/community-posts/:id/comments',requireUser,(req,res)=>{try{res.status(201).json({comment:createCommunityComment(req.session.userId,Number(req.params.id),req.body?.body)});}catch(e){const m={EMPTY_COMMENT:'Andika comment kwanza.',COMMENT_TOO_LONG:'Comment ni ndefu sana.',POST_NOT_FOUND:'Post haipo.',NOT_MEMBER:'Jiunge na community kwanza.'};res.status(400).json({message:m[e.message]||'Comment imeshindikana.'});}});
app.get('/api/user/community/summary',requireUser,(req,res)=>{
  try { res.json({room:'global',memberCount:countCommunityPeople(),people:listCommunityPeople({limit:18})}); }
  catch(e){ res.status(500).json({message:'Imeshindikana kupata community.'}); }
});
app.get('/api/user/community/messages',requireUser,(req,res)=>{
  try { res.json({messages:listCommunityMessages({room:String(req.query.room||'global'),limit:req.query.limit,beforeId:req.query.beforeId})}); }
  catch(e){ res.status(500).json({message:'Imeshindikana kupata ujumbe.'}); }
});
app.post('/api/user/community/messages',requireUser,(req,res)=>{
  try { const msg=createCommunityMessage({userId:req.session.userId,message:req.body?.message,room:req.body?.room||'global'}); res.status(201).json({message:msg}); }
  catch(e){ const map={EMPTY_MESSAGE:'Andika ujumbe kwanza.',MESSAGE_TOO_LONG:'Ujumbe ni mrefu sana.',USER_INACTIVE:'Account haiko active.'}; res.status(400).json({message:map[e.message]||'Ujumbe haukutumwa.'}); }
});

app.put('/api/user/notifications/:id/read',requireUser,(req,res)=>res.json({notification:markNotificationRead(Number(req.params.id),{userId:req.session.userId})}));
app.post('/api/user/notifications/read-all',requireUser,(req,res)=>{markAllNotificationsRead({userId:req.session.userId});res.json({ok:true})});
app.get('/api/user/me',requireUser,(req,res)=>{const user=getUserAccountById(req.session.userId);if(!user||user.status!=='active')return res.status(401).json({message:'Account haipo au haiko active.'});res.json(user);});
app.get('/api/user/membership',requireUser,(req,res)=>{const user=getUserAccountById(req.session.userId);res.json({current:{plan:user.membership_plan,status:user.membership_status},plans:[{id:'free',name:'Free',monthly:0,yearly:0},{id:'plus',name:'Plus',monthly:5000,yearly:45000},{id:'premium',name:'Premium',monthly:12000,yearly:108000}],paymentConfigured:providerConfigured()});});
app.post('/api/user/membership/checkout',requireUser,(req,res)=>{if(!providerConfigured())return res.status(503).json({message:'Payment provider bado haijaunganishwa. Hakuna subscription iliyobadilishwa.'});const plan=String(req.body?.plan||'');if(!['plus','premium'].includes(plan))return res.status(400).json({message:'Plan sio sahihi.'});res.status(501).json({message:'Checkout ya membership itaunganishwa kupitia payment provider halisi.'});});
app.put('/api/user/profile',requireUser,(req,res)=>{try{const {username,email,full_name,country,language}=req.body||{};if(!validUserUsername(String(username||'')))return res.status(400).json({message:'Username sio sahihi.'});if(!validEmail(String(email||'')))return res.status(400).json({message:'Email sio sahihi.'});if(String(full_name||'').trim().length<2||String(full_name||'').trim().length>100)return res.status(400).json({message:'Jina kamili linahitajika.'});const user=updateUserProfile(req.session.userId,{username:String(username).trim(),email:String(email).trim().toLowerCase(),full_name:String(full_name).trim(),country:String(country||'').trim()||null,language:String(language||'').trim()||null});req.session.userUsername=user.username;req.session.userEmail=user.email;res.json({user});}catch(e){const m={USER_NOT_FOUND:'User hajapatikana.',USERNAME_EXISTS:'Username tayari ipo.',EMAIL_EXISTS:'Email tayari imetumika.'};res.status(400).json({message:m[e.message]||'Imeshindikana kuhifadhi profile.'});}});
app.put('/api/user/password',requireUser,(req,res)=>{const {current_password,new_password}=req.body||{};if(!validPassword(new_password))return res.status(400).json({message:'Password mpya iwe na angalau herufi 8.'});const user=getUserAccountById(req.session.userId);const verified=user&&authenticateUser(user.username||user.email,current_password||'');if(!verified||verified.blocked||verified.id!==user.id)return res.status(401).json({message:'Current password sio sahihi.'});try{updateUserPassword(user.id,new_password);res.json({ok:true});}catch(_){res.status(500).json({message:'Imeshindikana kubadilisha password.'});}});
app.post('/api/user/logout',(req,res)=>{req.session.destroy(()=>res.json({ok:true}));});

app.post('/api/admin/logout', (req, res) => {
  const adminId = req.session?.adminId;
  req.session.destroy(() => {
    if (adminId) {
      try { logAdminActivity(adminId, 'admin_logout', 'Admin ametoka kwenye dashboard'); } catch (_) {}
    }
    res.clearCookie('gg_session'); res.clearCookie('gg_admin_session');
    res.json({ ok: true });
  });
});

// IMPORTANT: dashboard.html is not exposed by express.static.
app.get('/wallet.html', requireUser, (req,res)=>res.sendFile(path.join(__dirname,'public','wallet.html')));
app.get('/discover.html', requireUser, (req,res)=>res.sendFile(path.join(__dirname,'public','discover.html')));
app.get('/communities.html', requireUser, (req,res)=>res.sendFile(path.join(__dirname,'public','communities.html')));
app.get('/messages.html', requireUser, (req,res)=>res.sendFile(path.join(__dirname,'public','messages.html')));
app.get('/chat.html', requireUser, (req,res)=>res.sendFile(path.join(__dirname,'public','chat.html')));


app.get('/user-dashboard.html', requireUser, (req,res)=>res.sendFile(path.join(__dirname,'public','user-dashboard.html')));

app.get('/user-transactions.html', requireUser, (req,res)=>res.sendFile(path.join(__dirname,'public','user-transactions.html')));
app.get('/user-payments.html', requireUser, (req,res)=>res.sendFile(path.join(__dirname,'public','user-payments.html')));
app.get('/user-notifications.html', requireUser, (req,res)=>res.sendFile(path.join(__dirname,'public','user-notifications.html')));
app.get('/user-settings.html', requireUser, (req,res)=>res.sendFile(path.join(__dirname,'public','user-settings.html')));
app.get('/membership.html', requireUser, (req,res)=>res.sendFile(path.join(__dirname,'public','membership.html')));

app.get('/dashboard.html', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/admins.html', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admins.html'));
});

app.get('/users.html', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'users.html'));
});
app.get('/admin-communities.html', requireAdmin, (req,res)=>res.sendFile(path.join(__dirname,'public','admin-communities.html')));

app.get('/transactions.html', requireAdmin, (req,res)=>res.sendFile(path.join(__dirname,'public','transactions.html')));
app.get('/payments.html', requireAdmin, (req,res)=>res.sendFile(path.join(__dirname,'public','payments.html')));
app.get('/reports.html', requireAdmin, (req,res)=>res.sendFile(path.join(__dirname,'public','reports.html')));
app.get('/notifications.html', requireAdmin, (req,res)=>res.sendFile(path.join(__dirname,'public','notifications.html')));
app.get('/settings.html', requireAdmin, (req,res)=>res.sendFile(path.join(__dirname,'public','settings.html')));
app.get('/security.html', requireAdmin, (req,res)=>res.sendFile(path.join(__dirname,'public','security.html')));
app.get('/system-health.html', requireAdmin, (req,res)=>res.sendFile(path.join(__dirname,'public','system-health.html')));
app.get('/final-check.html', requireAdmin, (req,res)=>res.sendFile(path.join(__dirname,'public','final-check.html')));


app.get('/admin', requireAdmin, (req, res) => {
  res.redirect('/dashboard.html');
});

// Static assets are served before the error middleware.
app.use(express.static(PUBLIC_DIR, { index: false, etag: true, maxAge: '1h' }));
app.use((req,res,next)=>{ if (req.path.endsWith('.html') || req.path === '/') res.set('Cache-Control','no-cache'); next(); });

// Public landing route is explicit and uses an absolute path derived from __dirname.
app.get('/', (req, res, next) => {
  res.sendFile(INDEX_FILE, (err) => {
    if (err) next(err);
  });
});

app.get('/healthz', (req, res) => {
  res.status(200).json({ ok: true, service: 'golden-ghost', version: '36.0.0', time: new Date().toISOString() });
});

// JSON fallback for unknown API routes.
app.use('/api', (req, res) => res.status(404).json({ message: 'API route haipatikani.' }));

// HTML fallback for unknown public paths.
app.use((req, res) => {
  if (req.accepts('html')) return res.status(404).sendFile(path.join(PUBLIC_DIR, 'index.html'));
  res.status(404).json({ message: 'Ukurasa haupatikani.' });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('Unhandled request error:', err);
  res.status(500).json({ message: 'Server imepata hitilafu. Jaribu tena.' });
});


(async () => {
  try {
    const fs = require('fs');
    if (!fs.existsSync(INDEX_FILE)) {
      throw new Error(`PUBLIC_INDEX_MISSING: ${INDEX_FILE}. Upload the complete repository with public/index.html at the root.`);
    }
    await initDatabase();
    app.listen(PORT, HOST, () => {
      console.log(`Golden Ghost running on http://${HOST}:${PORT}`);
      console.log(`Public root: ${INDEX_FILE}`);
      console.log('Database: data/golden-ghost.db');
    });
  } catch (error) {
    console.error('Application startup failed:', error.message);
    process.exit(1);
  }
})();

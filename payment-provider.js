const crypto = require('crypto');

const PROVIDER = String(process.env.PAYMENT_PROVIDER || 'unconfigured').trim().toLowerCase();
const BASE_URL = String(process.env.PAYMENT_PROVIDER_BASE_URL || '').trim().replace(/\/$/, '');
const API_KEY = String(process.env.PAYMENT_PROVIDER_API_KEY || '').trim();
const CALLBACK_URL = String(process.env.PAYMENT_CALLBACK_URL || '').trim();
const RETURN_URL = String(process.env.PAYMENT_RETURN_URL || '').trim();
const AZAM_APP_NAME = String(process.env.AZAM_APP_NAME || '').trim();
const AZAM_CLIENT_ID = String(process.env.AZAM_CLIENT_ID || '').trim();
const AZAM_CLIENT_SECRET = String(process.env.AZAM_CLIENT_SECRET || '').trim();
const AZAM_TOKEN_KEY = String(process.env.AZAM_TOKEN_KEY || '').trim();
const AZAM_SANDBOX = String(process.env.AZAM_SANDBOX || 'true').toLowerCase() !== 'false';
const AZAM_AUTH_URL = String(process.env.AZAM_AUTH_URL || (AZAM_SANDBOX ? 'https://authenticator-sandbox.azampay.co.tz/AppRegistration/GenerateToken' : 'https://authenticator.azampay.co.tz/AppRegistration/GenerateToken')).trim();
const AZAM_API_BASE = String(process.env.AZAM_API_BASE || (AZAM_SANDBOX ? 'https://sandbox.azampay.co.tz' : 'https://api.azampay.co.tz')).trim().replace(/\/$/, '');
const AZAM_MNO_PATH = String(process.env.AZAM_MNO_PATH || '/azampay/mno/checkout').trim();
const AZAM_POST_CHECKOUT_PATH = String(process.env.AZAM_POST_CHECKOUT_PATH || '/api/v1/Partner/PostCheckout').trim();
const AZAM_STATUS_PATH = String(process.env.AZAM_STATUS_PATH || '/azampay/gettransactionstatus').trim();
const AZAM_VENDOR_ID = String(process.env.AZAM_VENDOR_ID || '').trim();

const METHOD_MAP = {
  visa: 'VISA',
  mastercard: 'MASTERCARD',
  mpesa: 'Mpesa',
  airtel_money: 'Airtel',
  tigo_pesa: 'Tigo',
  bank_transfer: 'BANK'
};

function providerConfigured() {
  if (PROVIDER === 'azampay') return !!(AZAM_APP_NAME && AZAM_CLIENT_ID && AZAM_CLIENT_SECRET);
  return PROVIDER !== 'unconfigured' && !!BASE_URL && !!API_KEY;
}

async function parseResponse(response) {
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }
  if (!response.ok) {
    const err = new Error(`PROVIDER_HTTP_${response.status}`);
    err.providerStatus = response.status;
    err.providerResponse = data;
    throw err;
  }
  return data;
}

let azamTokenCache = { token: null, expiresAt: 0 };

async function getAzamToken() {
  if (azamTokenCache.token && Date.now() < azamTokenCache.expiresAt) return azamTokenCache.token;
  const headers = { 'Content-Type': 'application/json' };
  if (AZAM_TOKEN_KEY) headers.Authorization = `Bearer ${AZAM_TOKEN_KEY}`;
  const response = await fetch(AZAM_AUTH_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ appName: AZAM_APP_NAME, clientId: AZAM_CLIENT_ID, clientSecret: AZAM_CLIENT_SECRET })
  });
  const data = await parseResponse(response);
  const token = data?.data?.accessToken || data?.data?.token || data?.accessToken || data?.token;
  if (!token) {
    const err = new Error('AZAM_TOKEN_MISSING');
    err.providerResponse = data;
    throw err;
  }
  azamTokenCache = { token: String(token), expiresAt: Date.now() + 50 * 60 * 1000 };
  return azamTokenCache.token;
}

async function azamRequest(path, body, query) {
  const token = await getAzamToken();
  const url = new URL(`${AZAM_API_BASE}${path.startsWith('/') ? path : `/${path}`}`);
  if (query) Object.entries(query).forEach(([k,v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v)); });
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  return parseResponse(response);
}

function normalizeAzamResult(data) {
  const d = data?.data || data;
  return {
    checkout_url: d?.checkoutUrl || d?.checkout_url || d?.paymentUrl || d?.payment_url || d?.url || (typeof d === 'string' ? d : null),
    provider_reference: d?.transactionId || d?.transactionID || d?.referenceId || d?.referenceID || d?.reference || d?.externalId || null,
    raw: data
  };
}

async function createAzamCheckout({ payment, user, phone }) {
  const amount = (Number(payment.amount_cents) / 100).toFixed(2);
  const reference = payment.transaction_reference || `GG-PAY-${payment.id}`;
  if (['mpesa', 'airtel_money', 'tigo_pesa'].includes(payment.method)) {
    if (!phone) {
      const err = new Error('PHONE_REQUIRED');
      throw err;
    }
    const data = await azamRequest(AZAM_MNO_PATH, {
      accountNumber: phone,
      amount,
      currency: payment.currency,
      externalId: reference,
      provider: METHOD_MAP[payment.method]
    });
    return normalizeAzamResult(data);
  }

  const data = await azamRequest(AZAM_POST_CHECKOUT_PATH, {
    appName: AZAM_APP_NAME,
    amount,
    cart: { items: [{ name: 'Golden Ghost Wallet Deposit', amount, quantity: 1 }] },
    clientId: AZAM_CLIENT_ID,
    currency: payment.currency,
    externalId: reference,
    language: 'SW',
    redirectFailURL: RETURN_URL || undefined,
    redirectSuccessURL: RETURN_URL || undefined,
    requestOrigin: CALLBACK_URL ? new URL(CALLBACK_URL).origin : undefined,
    vendorId: AZAM_VENDOR_ID || undefined,
    vendorName: 'Golden Ghost'
  });
  return normalizeAzamResult(data);
}

async function createHostedCheckout({ payment, user, phone }) {
  if (!providerConfigured()) return { configured: false, checkout_url: null, provider_reference: null };
  if (PROVIDER === 'azampay') {
    const result = await createAzamCheckout({ payment, user, phone });
    return { configured: true, ...result };
  }
  const path = String(process.env.PAYMENT_CHECKOUT_PATH || '/checkout').trim();
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const payload = {
    amount: Number(payment.amount_cents) / 100,
    amount_cents: Number(payment.amount_cents),
    currency: payment.currency,
    description: `Golden Ghost ${payment.transaction_reference || payment.id}`,
    reference: payment.transaction_reference || `GG-PAY-${payment.id}`,
    payment_method: METHOD_MAP[payment.method],
    customer: { user_id: payment.user_id, username: user?.username || undefined, email: user?.email || undefined, phone: phone || undefined },
    callback_url: CALLBACK_URL || undefined,
    return_url: RETURN_URL || undefined
  };
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': payment.idempotency_key }, body: JSON.stringify(payload) });
  const data = await parseResponse(response);
  return { configured: true, checkout_url: data.checkout_url || data.checkoutUrl || data.payment_url || data.url || null, provider_reference: data.provider_reference || data.providerReference || data.reference || data.transaction_id || null, raw: data };
}

async function testProviderConnection() {
  if (!providerConfigured()) return { configured: false, ok: false, provider: PROVIDER, reason: 'NOT_CONFIGURED' };
  if (PROVIDER === 'azampay') {
    const token = await getAzamToken();
    return { configured: true, ok: !!token, provider: PROVIDER, sandbox: AZAM_SANDBOX };
  }
  return { configured: true, ok: true, provider: PROVIDER, sandbox: null };
}

async function getProviderPaymentStatus(providerReference) {
  if (!providerReference || PROVIDER !== 'azampay' || !providerConfigured()) return null;
  const data = await azamRequest(AZAM_STATUS_PATH, { transactionId: providerReference });
  return data;
}

function verifyHmac(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature))); } catch (_) { return false; }
}

module.exports = { PROVIDER, METHOD_MAP, providerConfigured, createHostedCheckout, testProviderConnection, getProviderPaymentStatus, verifyHmac };

const CACHE = 'golden-ghost-shell-v36';
const SHELL = [
  '/', '/index.html', '/login.html', '/signup.html', '/membership.html',
  '/manifest.webmanifest', '/offline.html', '/golden-ghost-logo.png', '/logo.png',
  '/icon-192.png', '/icon-512.png', '/admin-suite.css', '/admin-suite.js', '/gg-i18n.js', '/pwa-install.js'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(async () => (await caches.match(req)) || (await caches.match('/')) || caches.match('/offline.html')));
    return;
  }
  event.respondWith(fetch(req).then(res => {
    if (res.ok) caches.open(CACHE).then(cache => cache.put(req, res.clone())).catch(() => {});
    return res;
  }).catch(() => caches.match(req)));
});

const CACHE = 'ems-shell-v1';
const SHELL = ['index.html', 'login.html', 'styles.css'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
    self.skipWaiting();
});
self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first, so the portal is always current; the cached shell is only a fallback
self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

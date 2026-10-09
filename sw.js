/* Batty Casino offline support.
   Network-first for all local GET assets (especially index.html, CSS and JS) so a new
   deployment cannot be hidden indefinitely by the previous service worker cache.
   API requests are NEVER intercepted; bets and balances always use the server. */
const V = 'batty-20261009b';
/* The shell precached for offline start-up. Everything else (each game's JS and CSS) is cached as it is fetched. */
const SHELL = [
  './', 'core/shell.css?v=20261009b', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(V).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('batty-') && key !== V).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || /(?:^|\/)(?:api|install)\.php$/i.test(url.pathname)) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
        const cache = await caches.open(V);
        // Cache a clean navigation fallback in addition to the exact requested URL.
        await cache.put(request, response.clone());
        if (request.mode === 'navigate') await cache.put('./', response.clone());
      }
      return response;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const shell = await caches.match('./');
        if (shell) return shell;
      }
      return Response.error();
    }
  })());
});

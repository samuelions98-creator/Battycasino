/* Batty Casino offline support.
   Network-first for all local GET assets (especially index.html, CSS and JS) so a new
   deployment cannot be hidden indefinitely by the previous service worker cache.
   API requests are NEVER intercepted; bets and balances always use the server. */
const V = 'batty-20261011q';
/* Precached for offline start-up: the shell, every game's JS and CSS and the platform pages, with the exact ?v= tags
   index.html requests (keep them in step when a tag is bumped). Anything else is cached as it is fetched. */
const SHELL = [
  './', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'core/shell.css?v=20261011q',
  'games/bunky/style.css?v=20261011g',
  'games/olympus/style.css?v=20261009b',
  'games/fishing/style.css?v=20261009b',
  'games/plachinko/style.css?v=20261009b',
  'games/moonshot/style.css?v=20261011q',
  'games/ultraheist/style.css?v=20261009b',
  'games/batjack/style.css?v=20261010a',
  'games/bonanza/style.css?v=20261009b',
  'games/starwing/style.css?v=20261009b',
  'games/circus/style.css?v=R4',
  'games/crypt/style.css?v=20261011a',
  'games/nighttrain/style.css?v=20261010b',
  'games/gummy/style.css?v=20261011a',
  'games/bookofbats/style.css?v=20261010b',
  'games/derby/style.css?v=20261011q',
  'games/bonkers/style.css?v=20261011q',
  'games/baccarat/style.css?v=20261011c',
  'games/royale/style.css?v=20261011b',
  'core/platform.css?v=20261011f',
  'games/bunky/game.js?v=20261011g',
  'games/olympus/game.js?v=20261009b',
  'games/fishing/game.js?v=20261009b',
  'games/plachinko/game.js?v=20261009b',
  'games/moonshot/game.js?v=20261011q',
  'games/ultraheist/game.js?v=20261009b',
  'games/batjack/game.js?v=20261010a',
  'games/bonanza/game.js?v=20261009b',
  'games/starwing/game.js?v=20261009b',
  'games/crypt/game.js?v=20261011a',
  'games/nighttrain/game.js?v=20261010b',
  'games/gummy/game.js?v=20261011a',
  'games/bookofbats/game.js?v=20261010b',
  'games/derby/game.js?v=20261011q',
  'games/bonkers/game.js?v=20261011q',
  'games/baccarat/game.js?v=20261011c',
  'games/royale/game.js?v=20261011b',
  'games/circus/math.js?v=R4',
  'games/circus/art.js?v=R4',
  'games/circus/game.js?v=R4',
  'core/platform.js?v=20261011f'
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

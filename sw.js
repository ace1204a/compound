// ============================================================
// Service worker — makes Compound installable + work offline.
// Strategy:
//  - the page itself (index.html): network-first, so you never
//    get stuck on a stale version after an update
//  - assets (js/css/icons): cache-first for instant loads
// Bump VERSION on every deploy to invalidate old caches.
// ============================================================

const VERSION = 'compound-v3';
const CORE = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './js/app.js',
  './js/store.js',
  './js/ui.js',
  './js/sync.js',
  './js/modules/today.js',
  './js/modules/habits.js',
  './js/modules/tasks.js',
  './js/modules/goals.js',
  './js/modules/gym.js',
  './js/modules/diet.js',
  './js/modules/trading.js',
  './js/modules/inbox.js',
  './js/modules/finance.js',
  './js/modules/books.js',
  './js/modules/settings.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // never touch Supabase/CDN calls

  // page loads: fresh first, cache as offline fallback
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // assets: cache first, then network (and cache what we fetch)
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return res;
    }))
  );
});

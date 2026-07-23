const CACHE_NAME = 'shelfd-v19';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/icon.svg',
  '/manifest.json'
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first strategy so edits load immediately
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Network-first for all local assets & API calls
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && (url.origin === self.location.origin || url.hostname === 'covers.openlibrary.org')) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

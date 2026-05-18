/**
 * Ghost Key — Service Worker
 * Offline-first caching for PWA installable experience.
 * Cache strategy: Cache-First for static assets, Network-First for API/data.
 */
const CACHE_NAME = 'ghost-key-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/ghost.svg',
  '/favicon.svg',
  '/icons.svg',
];

// Install: pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: cache-first for static, network-first for everything else
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and non-browser-origin requests
  if (request.method !== 'GET') return;
  if (!url.origin.startsWith(self.location.origin)) return;

  // Static assets: cache-first
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    request.destination === 'image' ||
    STATIC_ASSETS.includes(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request).then((response) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // Everything else (Dexie/IndexedDB is local, no caching needed): network-first
  event.respondWith(
    fetch(request)
      .then((response) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, response.clone());
          return response;
        });
      })
      .catch(() => caches.match(request))
  );
});
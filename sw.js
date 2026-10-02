/* ==========================================
   FITTRACK — SERVICE WORKER
   Cache-first strategy for offline use
   ========================================== */

const CACHE_NAME = 'fittrack-v5';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './mobile.css',
  './app.js',
  './firebase-config.js',
  './firebase-sync.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@400;600;700;800&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
];

// Install: mise en cache de tous les assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(err => {
        // Si certains assets externes échouent, on continue quand même
        console.warn('SW: certains assets non mis en cache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: nettoyage des anciens caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: Cache-first pour les assets locaux, Network-first pour les APIs externes
self.addEventListener('fetch', event => {
  // Ignorer les requêtes non-GET
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Assets locaux : cache-first
  if (url.origin === location.origin || url.href.includes('fonts.googleapis') || url.href.includes('jsdelivr')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          // Fallback offline
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
      })
    );
  }
});

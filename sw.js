/**
 * sw.js
 * -----------------------------------------------------------------------
 * Service worker for 100% offline functionality. Precaches the entire app
 * shell -- HTML, manifest, compiled CSS, vendored libraries, and every JS
 * module -- on install, then serves everything cache-first at runtime.
 *
 * Note on "JSON datasets": the 325-food / 240-exercise seed library isn't
 * a separate .json file fetched at runtime -- it's embedded directly as
 * JS arrays inside js/db-setup.js (see that file's header comment for why).
 * Caching js/db-setup.js therefore already covers the full dataset offline;
 * there's no separate network request for it to fail.
 * -----------------------------------------------------------------------
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `tracker-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `tracker-runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './vendor/dexie.js',
  './vendor/fuse.min.js',
  './vendor/tailwind.css',
  './js/db-setup.js',
  './js/parser.js',
  './js/dashboard.js',
  './js/override-modal.js',
  './js/backup.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// ---- install: precache the full app shell -----------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ---- activate: drop any caches from a previous app version ------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ---- fetch: cache-first for everything, with a runtime cache for -----
//      anything not precached (e.g. Google Fonts, if the font <link>
//      loads successfully at least once). Non-critical assets (fonts)
//      degrade gracefully to the system-font fallback already baked into
//      dashboard.js/override-modal.js's CSS, so a font-fetch failure never
//      blocks the app.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // SPA navigation requests: always serve the cached app shell so deep
  // refreshes work offline (there's only one real route).
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => cached || fetch(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          // Only cache successful, cacheable responses (opaque cross-origin
          // responses -- e.g. Google Fonts -- are still worth stashing for
          // next time, even though we can't inspect their status).
          if (!response || (response.status !== 200 && response.type !== 'opaque')) {
            return response;
          }
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, responseClone));
          return response;
        })
        .catch(() => {
          // Offline and not in any cache -- nothing more we can do for
          // this particular request (e.g. a font that was never fetched).
          return new Response('', { status: 504, statusText: 'Offline and not cached' });
        });
    })
  );
});

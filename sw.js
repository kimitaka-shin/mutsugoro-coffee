const CACHE = 'mutsugoro-coffee-v8';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // HTMLはネットワークを優先。
  // 新しいバージョンを公開したときに古いHTMLが残らないようにする。
  if (
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('/index.html') ||
    url.pathname === '/'
  ) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();

          caches.open(CACHE)
            .then(cache => cache.put(event.request, copy))
            .catch(() => {});

          return response;
        })
        .catch(() =>
          caches.match(event.request)
            .then(response =>
              response || caches.match('./index.html')
            )
        )
    );

    return;
  }

  // HTML以外はキャッシュを優先。
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;

        return fetch(event.request)
          .then(response => {
            const copy = response.clone();

            if (url.origin === self.location.origin) {
              caches.open(CACHE)
                .then(cache => cache.put(event.request, copy))
                .catch(() => {});
            }

            return response;
          })
          .catch(() => caches.match('./index.html'));
      })
  );
});

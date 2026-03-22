// Fateen OS — Service Worker v2
const CACHE_NAME = 'fateen-os-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/pos.html',
  '/manager.html',
  '/inventory.html',
  '/accounting.html',
  '/reports.html',
  '/3dadat.html',
  '/employeesite.html',
  '/scan.html',
  '/about.html',
  '/guide.html',
  '/hr.html',
  '/no-internet.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Supabase — network only
  if (url.hostname.includes('supabase.co')) return;

  // Fonts — cache first
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(res => {
          caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
          return res;
        })
      )
    );
    return;
  }

  // HTML — network first, cache fallback, then no-internet
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
          return res;
        })
        .catch(() =>
          caches.match(event.request)
            .then(cached => cached || caches.match('/no-internet.html'))
        )
    );
    return;
  }

  // Static assets — cache first
  event.respondWith(
    caches.match(event.request).then(cached =>
      cached || fetch(event.request).then(res => {
        if (res.ok) caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
        return res;
      }).catch(() => caches.match('/no-internet.html'))
    )
  );
});

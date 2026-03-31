// Fateen POS — Service Worker v3
// Uses relative paths to work under any hosting base (GitHub Pages subpath or custom domain)
const CACHE_NAME = 'fateen-pos-v3';

const STATIC_ASSETS = [
  'index.html',
  'setup.html',
  'pos.html',
  'manager.html',
  'inventory.html',
  'accounting.html',
  'reports.html',
  '3dadat.html',
  'employeesite.html',
  'scan.html',
  'settings.html',
  'about.html',
  'guide.html',
  'hr.html',
  'marketer.html',
  'developer.html',
  'no-internet.html',
  'manifest.json',
  'src/js/db.js',
  'src/js/auth.js',
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
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never intercept Supabase API calls
  if (url.hostname.includes('supabase.co')) return;

  // Cache-then-network for Google Fonts
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

  // Navigation requests: network-first, cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
          return res;
        })
        .catch(() =>
          caches.match(event.request)
            .then(cached => cached || caches.match('no-internet.html'))
        )
    );
    return;
  }

  // Everything else: cache-first, network fallback
  event.respondWith(
    caches.match(event.request).then(cached =>
      cached || fetch(event.request).then(res => {
        if (res.ok) caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
        return res;
      }).catch(() => caches.match('no-internet.html'))
    )
  );
});

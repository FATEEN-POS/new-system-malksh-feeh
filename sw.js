const CACHE_NAME = 'fateen-os-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/pos.html',
  '/manager.html',
  '/employeesite.html',
  '/inventory.html',
  '/reports.html'
];

// تثبيت الـ Service Worker وحفظ الملفات في الكاش
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// تشغيل التطبيق وجلب البيانات
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

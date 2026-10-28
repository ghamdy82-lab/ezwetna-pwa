const CACHE_NAME = 'ezwetna-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './register.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-512.png'
];

// تثبيت ملفات الكاش
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// تشغيل التطبيق في حالة عدم وجود إنترنت
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
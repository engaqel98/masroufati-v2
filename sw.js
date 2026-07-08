// Service Worker — يخزّن هيكل التطبيق للعمل دون اتصال.
// عند تعديل أي ملف، ارفع رقم النسخة CACHE ليُحدَّث الكاش.
var CACHE = 'masroufati-v49';
var ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/config.js',
  './js/parsers.js',
  './js/charts.js',
  './js/save.js',
  './js/render.js',
  './js/i18n.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png'
];

self.addEventListener('install', function(e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c) { return c.addAll(ASSETS); }).catch(function(){}));
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  var req = e.request;
  if (req.method !== 'GET') return;                       // الكتابة دائماً للشبكة
  var sameOrigin = req.url.indexOf(self.location.origin) === 0;
  if (!sameOrigin) return;                                // طلبات Google Sheets → الشبكة مباشرة

  // ملفات التطبيق: من الكاش أولاً، ثم الشبكة (ونحدّث الكاش بالخلفية)
  e.respondWith(
    caches.match(req).then(function(cached) {
      var net = fetch(req).then(function(resp) {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          var copy = resp.clone();
          caches.open(CACHE).then(function(c) { c.put(req, copy); });
        }
        return resp;
      }).catch(function() { return cached; });
      return cached || net;
    })
  );
});

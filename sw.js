// 오프라인 저장: 처음 열 때 화면·명단·쪽 사진을 모두 저장해 둔다.
// 명단이나 사진을 바꾸면 VERSION을 올린다.
var VERSION = 'v1';
var CACHE = 'backer-search-' + VERSION;
var FILES = ['./', 'index.html', 'style.css', 'search.js', 'app.js', 'data/names.json',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
for (var p = 468; p <= 479; p++) FILES.push('pages/' + p + '.jpg');

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('backer-search-') === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(e.request);
  }));
});

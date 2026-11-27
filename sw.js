/* 운명 로또 — K-사주 로또
   Service Worker: 앱 셸 오프라인 캐시 + 회차 데이터 네트워크 우선
   GitHub Pages 하위 경로(/k-lotto-fortune/)에서도 동작하도록 상대 경로 사용 */

var CACHE = 'unmyeong-lotto-v1';
var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './privacy.html',
  './style.css',
  './lunar.js',
  './saju.js',
  './app.js',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

function scopeUrl(path) { return new URL(path, self.registration.scope).toString(); }

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return Promise.all(SHELL.map(function (f) {
        return cache.add(new Request(scopeUrl(f), { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return; // 폰트 등 외부 리소스는 그대로

  /* 회차 데이터는 항상 최신을 먼저 시도하고, 실패하면 캐시 사용 */
  if (url.pathname.indexOf('/lotto.json') >= 0) {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () { return caches.match(req); })
    );
    return;
  }

  /* 앱 셸: 캐시 우선 + 뒤에서 갱신 */
  event.respondWith(
    caches.match(req).then(function (hit) {
      var network = fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () { return hit; });
      return hit || network;
    })
  );
});

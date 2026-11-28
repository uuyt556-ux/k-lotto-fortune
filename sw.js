/* 복채로또 — 사주·2027 재물운 번호
   Service Worker: 네트워크 우선 + 오프라인 캐시
   (앱을 자주 고치므로 캐시 우선 대신 네트워크를 먼저 확인하고, 끊겼을 때만 캐시를 씁니다)
   GitHub Pages 하위 경로(/k-lotto-fortune/)에서도 동작하도록 상대 경로 사용 */

var CACHE = 'bokchae-lotto-v12';
var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './privacy.html',
  './style.css?v=12',
  './webtoon.css?v=12',
  './lunar.js?v=12',
  './saju.js?v=12',
  './account.js?v=12',
  './premium.js?v=12',
  './webtoon.js?v=12',
  './wish.js?v=12',
  './app.js?v=12',
  './assets/teller-male.webp',
  './assets/teller-female.webp',
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

  event.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match(scopeUrl('./index.html'));
        return new Response('오프라인 상태입니다.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      });
    })
  );
});

/* B0DY · Lịch tập tuần — service worker: mở lại trang tức thì.
   · Trang (điều hướng): mạng trước, tải song song nhờ navigation preload; mạng chậm quá 1,2 s hoặc mất mạng → bản đã lưu.
   · Tệp tĩnh (css / js có ?v=, phông, ảnh): lấy từ bộ nhớ trước, chưa có thì tải rồi lưu.
   · Không bao giờ chạm vào lệnh gọi máy chủ đặt lịch (POST, khác origin).
   Mỗi lần deploy: đổi VER ở đây cùng ?v= trong index.html. */
'use strict';
var VER = '1.9.1';
var CACHE = 'lt-' + VER;
var CORE = ['./', 'app.css?v=' + VER, 'app.js?v=' + VER, 'b0b.js?v=' + VER, 'tk3d.js?v=' + VER, 'ke-core.js?v=' + VER,
  'fonts/SVN-Switzer-Medium.woff2', 'fonts/JetBrainsMono-Medium.woff2', 'img/favicon.svg'];
/* lưu nếu được, thiếu cũng không sao: ảnh dự phòng của B0B + trang "Để B0DY kể về bạn" (ke.html, mở lại được khi mất mạng) */
var LATER = ['img/b0b-quan-sat.webp', 'img/b0b-chao.webp', 'img/b0b-nghi.webp', 'img/b0b-ngu.webp', 'img/apple-touch-icon.png',
  'ke.html', 'ke.css?v=' + VER, 'ke.js?v=' + VER, 'ke-b0b.js?v=' + VER, 'fonts/ArchivoExtraCondensed-ExtraBold.woff2', 'fonts/ArchivoCondensed-Bold.woff2'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(CORE.map(function (u) { return new Request(u, { cache: 'reload' }); })).then(function () {
      /* LATER: lưu nếu được, thiếu cũng không sao */
      return Promise.all(LATER.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
    });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(Promise.all([
    caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('lt-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); })); }),
    self.registration.navigationPreload ? self.registration.navigationPreload.enable().catch(function () {}) : null
  ]).then(function () { return self.clients.claim(); }));
});

function fromNet(e) {
  return Promise.resolve(e.preloadResponse).then(function (p) { return p || fetch(e.request); });
}
function timeout(ms) { return new Promise(function (_, rej) { setTimeout(function () { rej(new Error('cham')); }, ms); }); }

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    /* chỉ trang đặt lịch (/ hoặc /index.html → khoá './') và trang "Để B0DY kể về bạn" (/ke.html → khoá 'ke.html') mới được lưu và dùng
       làm bản dự phòng — trang khác cùng tên miền đi thẳng mạng, không bao giờ đè bản đã lưu của hai trang này */
    var root = new URL(self.registration.scope).pathname;
    var key = url.pathname === root || url.pathname === root + 'index.html' ? './' : url.pathname === root + 'ke.html' ? 'ke.html' : '';
    if (!key) { e.respondWith(fromNet(e)); return; }
    var net = fromNet(e);
    e.respondWith(Promise.race([net, timeout(1200)]).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(key, copy); }); return res; }
      /* máy chủ trang lỗi 5xx → bản đã lưu (nếu có) */
      if (res && res.status >= 500) return caches.match(key).then(function (hit) { return hit || res; });
      return res;
    }).catch(function () {
      return caches.match(key).then(function (hit) { return hit || net; });
    }));
    return;
  }

  e.respondWith(caches.match(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      /* chỉ lưu tệp của trang (cùng origin, trả 200 đầy đủ) */
      if (res && res.status === 200 && res.type === 'basic' && /\.(css|js|woff2|webp|png|svg)$/.test(url.pathname)) {
        var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    });
  }));
});

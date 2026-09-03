// 只快取畫面外殼（HTML/CSS/JS），不快取資料。GAS API 一律略過快取，直接走網路。
// 外殼採「網路優先、失敗才退回快取」：使用者已確認賣場收訊良好、不需要離線讀寫，
// 這裡只是離線時的保底，優先權永遠是「有網路就一定要看到最新部署」，避免改版後
// 使用者端因為舊快取一直卡在舊版畫面。每次外殼檔案有實質變動就把版本號往上加一。
var CACHE_NAME = 'shopping-list-shell-v2';
var SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/config.js',
  './js/api.js',
  './js/app.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(SHELL_FILES); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  var url = event.request.url;
  // GAS API 或任何非 GET 請求不經過 service worker 快取
  if (event.request.method !== 'GET' || url.indexOf('script.google.com') > -1) return;

  event.respondWith(
    fetch(event.request).then(function (response) {
      var copy = response.clone();
      caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
      return response;
    }).catch(function () {
      return caches.match(event.request);
    })
  );
});

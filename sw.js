// 웹 주소로 열었을 때만 쓰는 오프라인 캐시.
// 인터넷이 되면 늘 서버의 최신 파일을 받고(받으면서 캐시에 보관), 끊기면 보관해 둔 파일로 엶.
// 작업 자료(PC 폴더)는 여기와 상관없음 — 프로그램 파일만 다룸.
const CACHE = 'yusung-app';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin || /version\.json/.test(req.url)) return;
  // cache:'no-cache' — 브라우저 캐시(깃허브는 10분 보관)를 거치지 않고 서버에 새 파일인지 꼭 물어봄
  // 보관은 ?v=버전 을 뗀 주소로 (버전마다 따로 쌓이지 않고 덮어씀)
  const u = new URL(req.url), key = u.origin + u.pathname;
  e.respondWith(fetch(req.url, { cache: 'no-cache' }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
    return res;
  }).catch(() => caches.match(key, { ignoreSearch: true }).then(r => r || Response.error())));
});

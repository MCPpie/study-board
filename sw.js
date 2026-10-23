/* 学习看板 Service Worker */
const CACHE = 'study-board-v4';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './个人学习总规划_2026秋.html',
  './洛谷题单进度表.html',
  './编程能力建设路线图.html',
  './本学期竞赛机会清单_2026秋.html',
  './docs/电路课件带读手册.html',
  './docs/电子电路与技术2_补课辅助.html',
  './docs/数竞30天冲刺计划_非数学A类.html',
  './docs/大学物理速成课_目录.md',
  './docs/六级听力专项.html',
  './docs/离散集中补计划.html'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(ASSETS.map(a => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // 每日数据：网络优先，保证内容是最新的
  if (url.pathname.endsWith('note-data.json')) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 其余：缓存优先，回退网络
  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    }).catch(() => caches.match('./index.html'))
  );
});

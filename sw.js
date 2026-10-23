/* 学习看板 Service Worker · v7
   策略：HTML/JS/CSS/JSON 走「网络优先」，保证内容永远最新；
        图片等静态资源走「缓存优先」，保证离线可用。 */
const CACHE = 'study-board-v7';

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
  './docs/大物速成课目录.html',
  './docs/大物热学知识总结.html',
  './docs/大物模拟卷.html',
  './docs/六级听力专项.html',
  './docs/六级写作翻译模板.html',
  './docs/离散集中补计划.html',
  './docs/离散知识点卡片.html',
  './docs/数竞公式与题型.html',
  './docs/数竞真题指南.html',
  './docs/概率论期末专项.html'
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

  // 文档类：网络优先（有网时永远拿最新的）
  const isDoc = req.destination === 'document'
             || /\.(html|js|css|json)$/i.test(url.pathname);

  if (isDoc) {
    e.respondWith(
      fetch(req, { cache: 'reload' })
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // 图片等：缓存优先
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

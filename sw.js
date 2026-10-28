/* 学习看板 Service Worker · v9
   策略：HTML/JS/CSS/JSON 走「网络优先」，保证内容永远最新；
        图片等静态资源走「缓存优先」，保证离线可用。 */
const CACHE = 'study-board-v50';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './vendor/morphicons/element.js',
  './vendor/morphicons/controller--7SSBggk.js',
  './vendor/morphicons/dom.js',
  './vendor/morphicons/normalize-CYnN3Npw.js',
  './vendor/morphicons/region-BjECuWZR.js',
  './vendor/morphicons/resample-CXlaZ5ZQ.js',
  './vendor/morphicons/spring-B_P92nf6.js',
  './vendor/morphicons/adapters.js',
  './个人学习总规划_2026秋.html',
  './洛谷题单进度表.html',
  './编程能力建设路线图.html',
  './本学期竞赛机会清单_2026秋.html',
  './docs/电路/电路课件带读手册.html',
  './docs/reader.js',
  './docs/ask.js',
  './tt-parse.js',
  './timetable.js',
  './backup.js',
  './docs/电路/电路课件3带读.html',
  './docs/电路/电路课件4带读.html',
  './docs/电路/电路课件5带读.html',
  './docs/电路/电路课件6带读.html',
  './docs/电路/电子电路与技术2_补课辅助.html',
  './docs/数竞/数竞19天冲刺计划_按章节.html',
  './docs/数竞/CMC十年真题章节分类表.html',
  './docs/数竞/CMC极限知识点手册.html',
  './docs/数竞/分章练习/00-总索引.html',
  './docs/数竞/分章练习/01-极限.html',
  './docs/数竞/分章练习/02-一元微分.html',
  './docs/数竞/分章练习/03-一元积分.html',
  './docs/数竞/分章练习/04-常微分方程.html',
  './docs/数竞/分章练习/05-空间解析几何.html',
  './docs/数竞/分章练习/06-多元微分.html',
  './docs/数竞/分章练习/07-多元积分.html',
  './docs/数竞/分章练习/08-无穷级数.html',
  './docs/数竞/分章练习/09-连续与间断.html',
  './docs/大物/大物速成课目录.html',
  './docs/大物/大物热学知识总结.html',
  './docs/大物/大物模拟卷.html',
  './docs/大物/大物考前重点题与公式表.html',
  './docs/六级/六级听力专项.html',
  './docs/六级/六级写作翻译模板.html',
  './docs/离散/离散集中补计划.html',
  './docs/离散/离散知识点卡片.html',
  './docs/数竞/数竞公式与题型.html',
  './docs/数竞/数竞真题指南.html',
  './docs/CMC第16届_2024_非数学A类_题目与答案.pdf',
  './docs/概率论/概率论期末专项.html',
  './docs/资料/index.html',
  './docs/编程/记账本计划.html',
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
    e.respondWith((async () => {
      // 缓存兜底：网络慢或断网时先拿旧版顶上，避免白屏干等
      const cached = await caches.match(req);
      const netTask = fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        });

      if (cached) {
        // 已缓存：最多等 1.2 秒，超时先用缓存渲染，同时让网络继续在后台更新
        return await new Promise(resolve => {
          let settled = false;
          const timer = setTimeout(() => {
            if (!settled) { settled = true; resolve(cached); }
          }, 250);
          netTask.then(res => {
            if (!settled) { settled = true; clearTimeout(timer); resolve(res); }
          }).catch(() => {
            if (!settled) { settled = true; clearTimeout(timer); resolve(cached); }
          });
        });
      }

      try {
        return await netTask;
      } catch (err) {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // 资料类（PDF/DOC 等大文件）：不缓存，直接走网络
  // 避免 100MB+ 的资料把手机缓存撑爆
  const isMaterial = /\.(pdf|docx?|xlsx?|pptx?|zip)$/i.test(url.pathname)
                  || url.pathname.indexOf('/资料/') >= 0;
  if (isMaterial) {
    e.respondWith(fetch(req).catch(() => new Response('离线状态下打不开资料，请联网后重试',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })));
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

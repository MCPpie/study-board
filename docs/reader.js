/* 阅读工具栏 · 通用注入脚本
   功能：① 顶部阅读进度条 ② 目录跳转 ③ 字号调节 ④ 阅读位置记忆
   用法：在文档 </body> 前加 <script src="reader.js" defer></script>
   说明：样式由本脚本自己注入，不需要额外的 css 文件。 */
(function () {
  'use strict';

  var KEY_FONT = 'sb-reader-font';
  var KEY_POS = 'sb-reader-pos:' + location.pathname;

  // ---------- 样式 ----------
  var CSS = ''
  + '.sbr-back{position:fixed;left:11px;top:calc(11px + env(safe-area-inset-top));z-index:9997;'
  + 'width:40px;height:40px;border-radius:50%;border:1px solid #333b4d;'
  + 'background:rgba(24,28,36,.96);'
  + 'display:flex;align-items:center;justify-content:center;'
  + 'box-shadow:0 3px 14px rgba(0,0,0,.4);transition:opacity .22s,transform .12s;'
  + 'cursor:pointer;-webkit-tap-highlight-color:transparent}'
  + '.sbr-back svg{width:19px;height:19px;fill:none;stroke:#e8ebf2;stroke-width:2.2;'
  + 'stroke-linecap:round;stroke-linejoin:round;margin-left:-1px}'
  + '.sbr-back:active{transform:scale(.9)}'
  + '.sbr-back.dim{opacity:.42}'
  + 'body.sbr-has-back header{padding-top:60px !important}'
  + '.sbr-bar{position:fixed;left:0;right:0;top:0;height:3px;z-index:9998;background:transparent;pointer-events:none}'
  + '.sbr-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#38d0d8,#5b9bff);'
  + 'border-radius:0 2px 2px 0;transition:width .12s linear}'
  + '.sbr-nav{position:fixed;left:0;right:0;bottom:0;z-index:9999;display:flex;'
  + 'background:#161a23;'
  + 'border-top:1px solid #272d3a;padding-bottom:env(safe-area-inset-bottom)}'
  + '.sbr-nav button{flex:1;border:none;background:none;color:#aab3c4;font-family:inherit;'
  + 'padding:9px 0 10px;display:flex;flex-direction:column;align-items:center;gap:3px;'
  + 'font-size:10.5px;letter-spacing:.02em;cursor:pointer;-webkit-tap-highlight-color:transparent}'
  + '.sbr-nav button svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.9;'
  + 'stroke-linecap:round;stroke-linejoin:round}'
  + '.sbr-nav button:active{color:#38d0d8}'
  + '.sbr-nav .sbr-pct{font-variant-numeric:tabular-nums}'
  + '.sbr-mask{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10000;display:none}'
  + '.sbr-mask.on{display:block}'
  + '.sbr-sheet{position:fixed;left:0;right:0;bottom:0;z-index:10001;background:#161a23;'
  + 'border-radius:16px 16px 0 0;border-top:1px solid #333b4d;max-height:72vh;display:flex;'
  + 'flex-direction:column;transform:translateY(100%);transition:transform .24s ease}'
  + '.sbr-sheet.on{transform:translateY(0)}'
  + '.sbr-sheet-h{padding:14px 16px 10px;border-bottom:1px solid #272d3a;display:flex;'
  + 'align-items:center;gap:10px;flex:0 0 auto}'
  + '.sbr-sheet-h b{font-size:13px;color:#e8ebf2;font-weight:700}'
  + '.sbr-sheet-h span{margin-left:auto;font-size:11px;color:#7c8699}'
  + '.sbr-sheet-b{overflow-y:auto;-webkit-overflow-scrolling:touch;padding:6px 0 10px}'
  + '.sbr-toc{display:block;width:100%;text-align:left;border:none;background:none;'
  + 'font-family:inherit;color:#aab3c4;padding:10px 16px;font-size:12.5px;line-height:1.5;'
  + 'border-bottom:1px solid rgba(255,255,255,.045);cursor:pointer;'
  + '-webkit-tap-highlight-color:transparent}'
  + '.sbr-toc:last-child{border-bottom:none}'
  + '.sbr-toc:active{background:#1e2330}'
  + '.sbr-toc.lv1{color:#e8ebf2;font-weight:700;font-size:13px}'
  + '.sbr-toc.lv2{padding-left:34px;font-size:12px;color:#8f99ab}'
  + '.sbr-toc .no{display:inline-block;min-width:20px;color:#38d0d8;font-size:10.5px;'
  + 'font-weight:700;margin-right:5px}'
  + '.sbr-toc.cur{background:rgba(56,208,216,.08)}'
  + '.sbr-fontbox{display:flex;gap:10px;padding:18px 16px 22px;align-items:center}'
  + '.sbr-fontbox button{flex:1;height:46px;border-radius:11px;border:1px solid #333b4d;'
  + 'background:#1e2330;color:#e8ebf2;font-family:inherit;font-size:15px;font-weight:700;'
  + 'cursor:pointer}'
  + '.sbr-fontbox button.on{background:rgba(56,208,216,.14);border-color:rgba(56,208,216,.45);'
  + 'color:#38d0d8}'
  + '.sbr-fontbox .lab{flex:0 0 auto;font-size:11.5px;color:#7c8699;padding-left:4px}'
  + '.sbr-toast{position:fixed;left:50%;bottom:76px;transform:translateX(-50%) translateY(12px);'
  + 'z-index:10002;background:#243044;border:1px solid #38506e;color:#e8ebf2;font-size:12px;'
  + 'padding:9px 15px;border-radius:100px;opacity:0;transition:opacity .2s,transform .2s;'
  + 'pointer-events:none;white-space:nowrap;box-shadow:0 6px 20px rgba(0,0,0,.45)}'
  + '.sbr-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}'
  + 'body.sbr-has-nav{padding-bottom:64px !important}';

  var st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);

  // ---------- 骨架 ----------
  var bar = document.createElement('div');
  bar.className = 'sbr-bar';
  bar.innerHTML = '<i></i>';
  document.body.appendChild(bar);
  var barFill = bar.firstChild;

  var nav = document.createElement('div');
  nav.className = 'sbr-nav';
  nav.innerHTML =
      '<button id="sbrBtnToc"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg><span>目录</span></button>'
    + '<button id="sbrBtnFont"><svg viewBox="0 0 24 24"><path d="M4 19V7m0 0h13M4 13h9"/></svg><span id="sbrFontLab">字号 100%</span></button>'
    + '<button id="sbrBtnPos"><svg viewBox="0 0 24 24"><path d="M12 19V5m0 0l6 6m-6-6l-6 6"/></svg><span class="sbr-pct">0%</span></button>';
  document.body.appendChild(nav);
  document.body.classList.add('sbr-has-nav');

  // ---------- 左上角返回 ----------
  var backBtn = document.createElement('div');
  backBtn.className = 'sbr-back';
  backBtn.setAttribute('role', 'button');
  backBtn.setAttribute('aria-label', '返回');
  backBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7"/></svg>';
  document.body.appendChild(backBtn);
  document.body.classList.add('sbr-has-back');

  backBtn.addEventListener('click', function () {
    // 首页路径按「文档在 docs 下第几层」现算：
    //   docs/电路/x.html        -> ../../index.html
    //   docs/数竞/分章练习/x.html -> ../../../index.html
    // （2026-10-25 文档迁入科目子目录后，原先固定 '../' 会跳到不存在的 docs/index.html）
    var home = (function () {
      var p = location.pathname;
      var i = p.indexOf('/docs/');
      if (i < 0) return 'index.html';                  // 本身就在站点根目录
      var depth = (p.slice(i + 6).match(/\//g) || []).length;
      var up = '';
      for (var n = 0; n <= depth; n++) up += '../';
      return up + 'index.html';
    })();
    var before = location.pathname + location.search;
    var ref = document.referrer || '';
    // 只有「确实是从本站点内点进来的」才回退历史，否则直接回首页
    var fromInside = ref !== '' && ref.indexOf(location.host) >= 0;

    if (window.history.length > 1 && fromInside) {
      window.history.back();
      // 兜底：420ms 后若仍停在本页，说明后退没生效，直接跳首页
      setTimeout(function () {
        if (location.pathname + location.search === before) {
          location.href = home;
        }
      }, 420);
    } else {
      location.href = home;
    }
  });

  var mask = document.createElement('div');
  mask.className = 'sbr-mask';
  document.body.appendChild(mask);

  var sheet = document.createElement('div');
  sheet.className = 'sbr-sheet';
  document.body.appendChild(sheet);

  var toast = document.createElement('div');
  toast.className = 'sbr-toast';
  document.body.appendChild(toast);

  var toastTimer = null;
  function say(msg) {
    toast.textContent = msg;
    toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('on'); }, 1600);
  }

  // ---------- 字号 ----------
  var LEVELS = [1, 1.12, 1.26];
  var FONTLAB = ['100%', '112%', '126%'];
  var lv = 0;
  try {
    var saved = parseInt(localStorage.getItem(KEY_FONT), 10);
    if (saved >= 0 && saved < LEVELS.length) lv = saved;
  } catch (e) {}

  function applyFont() {
    var z = LEVELS[lv];
    // 用 zoom 整体放大，保持行宽比例不变
    document.body.style.zoom = z === 1 ? '' : String(z);
    var lab = document.getElementById('sbrFontLab');
    if (lab) lab.textContent = '字号 ' + FONTLAB[lv];
    try { localStorage.setItem(KEY_FONT, String(lv)); } catch (e) {}
  }

  // ---------- 目录 ----------
  function buildToc() {
    var hs = [].slice.call(document.querySelectorAll('h2'));
    var subs = [].slice.call(document.querySelectorAll('.step-p'));
    var items = [];
    hs.forEach(function (h) {
      items.push({ el: h, text: h.textContent.trim(), lv: 1 });
    });
    // 只有大段不超过 30 时才把小节也列进去
    if (items.length && items.length <= 30) {
      subs.forEach(function (s) {
        items.push({ el: s, text: s.textContent.trim(), lv: 2 });
      });
    }
    items.sort(function (a, b) {
      if (a.el === b.el) return 0;
      var r = a.el.compareDocumentPosition(b.el);
      return (r & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
    });
    return items;
  }

  var tocItems = buildToc();

  function openToc() {
    var h = '<div class="sbr-sheet-h"><b>目录</b><span>' + tocItems.length + ' 项</span></div><div class="sbr-sheet-b">';
    if (!tocItems.length) {
      h += '<div style="padding:20px 16px;color:#7c8699;font-size:12.5px">这份文档没有分段标题</div>';
    } else {
      var n1 = 0, n2 = 0;
      tocItems.forEach(function (it, i) {
        var no;
        if (it.lv === 1) { n1++; n2 = 0; no = n1 + ''; }
        else { n2++; no = n1 + '.' + n2; }
        h += '<button class="sbr-toc lv' + it.lv + '" data-i="' + i + '">'
           + '<span class="no">' + no + '</span>' + esc(it.text) + '</button>';
      });
    }
    h += '</div>';
    sheet.innerHTML = h;
    mask.classList.add('on');
    sheet.classList.add('on');
    sheet.querySelectorAll('.sbr-toc').forEach(function (b) {
      b.addEventListener('click', function () {
        var it = tocItems[+b.dataset.i];
        closeSheet();
        if (it) scrollToEl(it.el);
      });
    });
  }

  function openFont() {
    var h = '<div class="sbr-sheet-h"><b>字号</b><span>当前 ' + FONTLAB[lv] + '</span></div>'
          + '<div class="sbr-fontbox">'
          + '<button data-z="0" class="' + (lv === 0 ? 'on' : '') + '">A-</button>'
          + '<button data-z="1" class="' + (lv === 1 ? 'on' : '') + '">A</button>'
          + '<button data-z="2" class="' + (lv === 2 ? 'on' : '') + '">A+</button>'
          + '</div>'
          + '<div style="padding:0 16px 20px;font-size:11.5px;color:#7c8699">调完会记住，所有文档通用</div>';
    sheet.innerHTML = h;
    mask.classList.add('on');
    sheet.classList.add('on');
    sheet.querySelectorAll('.sbr-fontbox button').forEach(function (b) {
      b.addEventListener('click', function () {
        lv = +b.dataset.z;
        applyFont();
        openFont();
      });
    });
  }

  function closeSheet() {
    mask.classList.remove('on');
    sheet.classList.remove('on');
  }
  mask.addEventListener('click', closeSheet);

  function scrollToEl(el) {
    var y = el.getBoundingClientRect().top + window.pageYOffset - 14;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---------- 进度与位置记忆 ----------
  var pctEl = nav.querySelector('.sbr-pct');
  var ticking = false;
  var lastSave = 0;

  function maxScroll() {
    return Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var p = Math.min(1, window.pageYOffset / maxScroll());
      barFill.style.width = (p * 100).toFixed(1) + '%';
      pctEl.textContent = Math.round(p * 100) + '%';
      ticking = false;

      // 滚动后按钮变淡，避免遮挡正文
      if (window.pageYOffset > 80) backBtn.classList.add('dim');
      else backBtn.classList.remove('dim');

      var now = Date.now();
      if (now - lastSave > 700) {
        lastSave = now;
        try {
          localStorage.setItem(KEY_POS, JSON.stringify({
            r: p, y: window.pageYOffset, t: now
          }));
        } catch (e) {}
      }
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  // ---------- 按钮 ----------
  document.getElementById('sbrBtnToc').addEventListener('click', openToc);
  document.getElementById('sbrBtnFont').addEventListener('click', openFont);

  document.getElementById('sbrBtnPos').addEventListener('click', function () {
    // 单点 = 回到顶端；长按 = 回上次位置。为避免歧义，这里直接回上次位置，顶部用双击
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY_POS) || 'null'); } catch (e) {}
    var p = Math.min(1, window.pageYOffset / maxScroll());
    if (saved && Math.abs(saved.r - p) > 0.06) {
      window.scrollTo({ top: saved.y, behavior: 'smooth' });
      say('回到上次位置 ' + Math.round(saved.r * 100) + '%');
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      say('回到顶部');
    }
  });

  // ---------- 启动 ----------
  applyFont();
  onScroll();

  // 恢复阅读位置
  try {
    var sv = JSON.parse(localStorage.getItem(KEY_POS) || 'null');
    if (sv && sv.r > 0.05 && sv.r < 0.95) {
      setTimeout(function () {
        window.scrollTo({ top: sv.y, behavior: 'auto' });
        say('已恢复到上次阅读位置 ' + Math.round(sv.r * 100) + '%');
      }, 260);
    }
  } catch (e) {}

  // 离开前再存一次
  window.addEventListener('pagehide', function () {
    try {
      localStorage.setItem(KEY_POS, JSON.stringify({
        r: Math.min(1, window.pageYOffset / maxScroll()),
        y: window.pageYOffset, t: Date.now()
      }));
    } catch (e) {}
  });
})();

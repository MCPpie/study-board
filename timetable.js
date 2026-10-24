/* 课表模块 · timetable.js
   功能：截图导入课表（视觉模型识别）+ 今日有课提醒 + 全周课表查看 + 手动编辑
   依赖：index.html 的 CSS 变量（--card / --line / --tx / --cyan 等）
   存储：localStorage
     sb-tt-courses  课程数组
     sb-tt-meta     学期信息 { termStart: 'YYYY-MM-DD' }
     sb-tt-ai       识图模型配置 { base, model, key }（key 留空则复用聊天配置） */
(function () {
  'use strict';

  var K_COURSES = 'sb-tt-courses';
  var K_META = 'sb-tt-meta';
  var K_AI = 'sb-tt-ai';
  var K_PREIODS = 'sb-tt-periods';

  /* ---------------- 默认节次时间（可编辑） ---------------- */
  var DEFAULT_PERIODS = [
    ['08:00', '08:45'], ['08:55', '09:40'],
    ['10:00', '10:45'], ['10:55', '11:40'],
    ['14:00', '14:45'], ['14:55', '15:40'],
    ['16:00', '16:45'], ['16:55', '17:40'],
    ['19:00', '19:45'], ['19:55', '20:40'], ['20:50', '21:35']
  ];

  var DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  /* ---------------- 存储 ---------------- */
  function load(key, dft) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(dft));
    } catch (e) { return JSON.parse(JSON.stringify(dft)); }
  }
  function save(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {}
  }

  function getCourses() { return load(K_COURSES, []); }
  function setCourses(v) { save(K_COURSES, v); }
  function getMeta() { return load(K_META, { termStart: '' }); }
  function setMeta(v) { save(K_META, v); }
  function getPeriods() { return load(K_PREIODS, DEFAULT_PERIODS); }

  /* ---------------- 周次解析 ---------------- */
  // 支持 "1-16"、"1-16单"、"1-16双"、"3-8,10-14"、"5" 等
  function parseWeeks(str) {
    var set = {};
    if (!str) return null;              // 空 = 全周
    String(str).replace(/\s/g, '').split(',').forEach(function (part) {
      if (!part) return;
      var odd = /单$/.test(part), even = /双$/.test(part);
      var p = part.replace(/[单双]$/, '');
      var m = p.match(/^(\d+)-(\d+)$/);
      var a, b;
      if (m) { a = +m[1]; b = +m[2]; }
      else if (/^\d+$/.test(p)) { a = b = +p; }
      else return;
      for (var i = a; i <= b; i++) {
        if (odd && i % 2 === 0) continue;
        if (even && i % 2 === 1) continue;
        set[i] = 1;
      }
    });
    return set;
  }

  // 当前是学期第几周
  function currentWeek() {
    var meta = getMeta();
    if (!meta.termStart) return 0;
    var s = new Date(meta.termStart + 'T00:00:00');
    var now = new Date();
    var d0 = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    var d1 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var diff = Math.floor((d1 - d0) / 86400000);
    if (diff < 0) return 0;
    return Math.floor(diff / 7) + 1;
  }

  // 某课程在某周是否上课
  function activeInWeek(course, wk) {
    var set = parseWeeks(course.weeks);
    if (!set) return true;
    if (!wk) return true;               // 没设学期开始，就都显示
    return !!set[wk];
  }

  /* ---------------- 今日课程 ---------------- */
  function coursesOnDay(day, wk) {
    return getCourses().filter(function (c) {
      return +c.day === day && activeInWeek(c, wk);
    }).sort(function (a, b) { return a.start - b.start; });
  }

  function todayDayIdx() {
    // 1=周一 ... 7=周日；JS getDay(): 0=周日
    var d = new Date().getDay();
    return d === 0 ? 7 : d;
  }

  /* ---------------- 样式 ---------------- */
  var CSS = ''
  + '.tt-card{background:var(--card);border:1px solid rgba(56,208,216,.22);border-radius:12px;'
  + 'padding:11px 13px;margin-bottom:12px;cursor:pointer}'
  + '.tt-card:active{background:var(--card2)}'
  + '.tt-card .hd{display:flex;align-items:center;gap:7px;margin-bottom:7px}'
  + '.tt-card .hd b{font-size:11.5px;color:var(--cyan);font-weight:700;letter-spacing:.03em}'
  + '.tt-card .hd span{margin-left:auto;font-size:10.5px;color:var(--tx3)}'
  + '.tt-row{display:flex;align-items:baseline;gap:8px;font-size:12px;'
  + 'color:var(--tx2);padding:3px 0}'
  + '.tt-row .no{flex:0 0 auto;font-size:10.5px;color:var(--tx3);'
  + 'font-variant-numeric:tabular-nums;min-width:38px}'
  + '.tt-row .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
  + '.tt-row .rm{flex:0 0 auto;font-size:10.5px;color:var(--tx3)}'
  + '.tt-row.now .nm{color:var(--cyan);font-weight:600}'
  + '.tt-row.now .no{color:var(--cyan)}'
  + '.tt-none{font-size:11.5px;color:var(--tx3);padding:2px 0}'

  /* 全周课表抽屉 */
  + '.ttmask{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10030;display:none}'
  + '.ttmask.on{display:block}'
  + '.ttwrap{position:fixed;left:0;right:0;bottom:0;z-index:10031;background:#141821;'
  + 'border-radius:16px 16px 0 0;border-top:1px solid #333b4d;max-height:88vh;'
  + 'display:flex;flex-direction:column;transform:translateY(100%);'
  + 'transition:transform .26s cubic-bezier(.3,.9,.3,1)}'
  + '.ttwrap.on{transform:translateY(0)}'
  + '.tthd{padding:13px 15px 10px;border-bottom:1px solid #272d3a;display:flex;'
  + 'align-items:center;gap:9px;flex:0 0 auto}'
  + '.tthd b{font-size:13px;color:#e8ebf2;font-weight:700}'
  + '.tthd .wk{margin-left:auto;font-size:10.5px;color:#7c8699}'
  + '.ttbody{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 13px 24px}'

  /* 周网格 */
  + '.grid{display:grid;grid-template-columns:38px repeat(7,1fr);gap:4px;font-size:10.5px}'
  + '.grid .gh{text-align:center;color:#7c8699;font-weight:600;padding:4px 0;font-size:10px}'
  + '.grid .ph{color:#7c8699;display:flex;align-items:center;justify-content:center;'
  + 'font-variant-numeric:tabular-nums;font-size:9.5px}'
  + '.grid .cell{background:#1a1f2a;border-radius:5px;min-height:30px;'
  + 'display:flex;align-items:center;justify-content:center;color:#4a5262;font-size:9px}'
  + '.grid .cell.has{background:rgba(56,208,216,.14);border:1px solid rgba(56,208,216,.3);'
  + 'color:#a8e8ec;font-size:9px;line-height:1.25;padding:2px;text-align:center;'
  + 'overflow:hidden;word-break:break-all}'
  + '.grid .cell.today{outline:1px solid rgba(56,208,216,.55)}'

  /* 按钮组 */
  + '.ttbtns{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}'
  + '.ttbtns button{flex:1;min-width:96px;height:42px;border-radius:11px;'
  + 'border:1px solid #333b4d;background:#1e2431;color:#aab3c4;font-size:12.5px;'
  + 'font-family:inherit}'
  + '.ttbtns button.pri{background:rgba(56,208,216,.14);'
  + 'border-color:rgba(56,208,216,.42);color:#38d0d8;font-weight:600}'

  /* 课程列表 */
  + '.citem{display:flex;align-items:center;gap:10px;padding:10px 0;'
  + 'border-bottom:1px solid rgba(255,255,255,.05)}'
  + '.citem:last-child{border-bottom:none}'
  + '.citem .tx{flex:1;min-width:0}'
  + '.citem .tx b{display:block;font-size:12.5px;color:#e8ebf2;font-weight:600;margin-bottom:1px}'
  + '.citem .tx span{font-size:10.5px;color:#7c8699}'
  + '.citem .del{flex:0 0 auto;font-size:11px;color:#ff7a7a;padding:4px 8px}'
  + '.ttempty{text-align:center;padding:26px 16px;color:#7c8699;font-size:12.5px;line-height:1.9}'
  + '.ttempty b{color:#aab3c4}'

  /* 导入预览 */
  + '.prev{background:#1a1f2a;border:1px solid #272d3a;border-radius:10px;'
  + 'padding:10px 12px;margin-bottom:10px;font-size:11.5px;color:#aab3c4;'
  + 'line-height:1.7;max-height:200px;overflow:auto;white-space:pre-wrap}'
  + '.tttoast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%) translateY(10px);'
  + 'z-index:10040;background:#243044;border:1px solid #38506e;color:#e8ebf2;font-size:12px;'
  + 'padding:9px 16px;border-radius:100px;opacity:0;transition:opacity .2s,transform .2s;'
  + 'pointer-events:none;max-width:86vw;text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.45)}'
  + '.tttoast.on{opacity:1;transform:translateX(-50%) translateY(0)}';

  var styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  /* ---------------- 小工具 ---------------- */
  var toastEl = null, toastTimer = null;
  function say(msg, ms) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'tttoast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, ms || 2000);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function periodLabel(start, end) {
    return start === end ? ('第' + start + '节') : ('第' + start + '-' + end + '节');
  }

  function periodTime(start, end) {
    var ps = getPeriods();
    var a = ps[start - 1], b = ps[end - 1];
    if (!a || !b) return '';
    return a[0] + '–' + b[1];
  }

  /* ---------------- 今日卡片 ---------------- */
  function renderTodayCard() {
    var old = document.getElementById('ttTodayCard');
    if (old) old.parentNode.removeChild(old);

    var host = document.querySelector('#v-today .dnav');
    if (!host) return;

    var wk = currentWeek();
    var all = getCourses();
    var list = coursesOnDay(todayDayIdx(), wk);

    var now = new Date();
    var curMin = now.getHours() * 60 + now.getMinutes();
    var ps = getPeriods();

    var rows = list.map(function (c) {
      var t = ps[c.start - 1], t2 = ps[c.end - 1];
      var isNow = false;
      if (t && t2) {
        var a = +t[0].split(':')[0] * 60 + +t[0].split(':')[1];
        var b = +t2[1].split(':')[0] * 60 + +t2[1].split(':')[1];
        isNow = curMin >= a && curMin <= b;
      }
      return '<div class="tt-row' + (isNow ? ' now' : '') + '">'
        + '<span class="no">' + periodLabel(c.start, c.end) + '</span>'
        + '<span class="nm">' + esc(c.name) + '</span>'
        + (c.room ? '<span class="rm">' + esc(c.room) + '</span>' : '')
        + '</div>';
    }).join('');

    var card = document.createElement('div');
    card.className = 'tt-card';
    card.id = 'ttTodayCard';

    var wkTxt = wk ? ('第 ' + wk + ' 周 · ') : '';
    var title, extra;

    if (!all.length) {
      title = '<b>课表</b><span>还没导入 · 点这里 ›</span>';
      extra = '<div class="tt-none">截图导入教务系统课表，自动识别成一门门课</div>';
    } else if (!list.length) {
      title = '<b>课表</b><span>' + wkTxt + '今天没课 ›</span>';
      extra = '';
    } else {
      title = '<b>课表</b><span>' + wkTxt + '今天 ' + list.length + ' 门 ›</span>';
      extra = rows;
    }

    card.innerHTML = '<div class="hd">' + title + '</div>' + extra;
    card.addEventListener('click', openSheet);

    host.parentNode.insertBefore(card, host);
  }

  /* ---------------- 抽屉 ---------------- */
  var mask, wrap, bodyEl;

  function buildSheet() {
    mask = document.createElement('div');
    mask.className = 'ttmask';
    document.body.appendChild(mask);

    wrap = document.createElement('div');
    wrap.className = 'ttwrap';
    wrap.innerHTML = '<div class="tthd"><b>课表</b><span class="wk" id="ttWk"></span></div>'
      + '<div class="ttbody" id="ttBody"></div>';
    document.body.appendChild(wrap);
    bodyEl = document.getElementById('ttBody');

    mask.addEventListener('click', closeSheet);
  }

  function openSheet() {
    if (!wrap) buildSheet();
    renderSheet();
    mask.classList.add('on');
    wrap.classList.add('on');
  }
  function closeSheet() {
    if (!mask) return;
    mask.classList.remove('on');
    wrap.classList.remove('on');
  }

  function renderSheet() {
    var wk = currentWeek();
    var el = document.getElementById('ttWk');
    if (el) el.textContent = wk ? ('第 ' + wk + ' 周') : '未设置学期';

    var courses = getCourses();
    var h = '';

    h += '<div class="ttbtns">'
      + '<button class="pri" id="ttImport">截屏导入</button>'
      + '<button id="ttManual">手动添加</button>'
      + '</div>';

    if (!courses.length) {
      h += '<div class="ttempty">'
        + '<b>还没有课表</b><br><br>'
        + '点「截屏导入」，把教务系统的课表截图发进来，<br>'
        + 'AI 会自动识别成课程。<br><br>'
        + '或者点「手动添加」自己填。'
        + '</div>';
      bodyEl.innerHTML = h;
      bindSheetBtns();
      return;
    }

    // 周网格
    var ps = getPeriods();
    var maxP = 0;
    courses.forEach(function (c) { if (+c.end > maxP) maxP = +c.end; });
    var nP = Math.max(maxP, 8);

    h += '<div class="grid">';
    h += '<div class="gh"></div>';
    for (var d = 0; d < 7; d++) h += '<div class="gh">' + DAYS[d].slice(1) + '</div>';

    var todayIdx = todayDayIdx();
    for (var p = 1; p <= nP; p++) {
      h += '<div class="ph">' + p + '</div>';
      for (var dd = 1; dd <= 7; dd++) {
        var hit = courses.filter(function (c) {
          return +c.day === dd && +c.start <= p && +c.end >= p && activeInWeek(c, wk);
        });
        var cls = 'cell' + (hit.length ? ' has' : '') + (dd === todayIdx ? ' today' : '');
        h += '<div class="' + cls + '">'
          + (hit.length ? esc(hit[0].name.slice(0, 5)) : '')
          + '</div>';
      }
    }
    h += '</div>';

    // 课程清单
    h += '<div style="margin-top:18px;font-size:11.5px;color:#7c8699;'
      + 'margin-bottom:4px">全部课程（' + courses.length + '）</div>';
    h += courses.map(function (c, i) {
      return '<div class="citem">'
        + '<span style="flex:0 0 auto;font-size:11px;color:#38d0d8">'
        + DAYS[c.day - 1] + '</span>'
        + '<div class="tx"><b>' + esc(c.name) + '</b>'
        + '<span>' + periodLabel(c.start, c.end)
        + (periodTime(c.start, c.end) ? ' · ' + periodTime(c.start, c.end) : '')
        + (c.room ? ' · ' + esc(c.room) : '')
        + (c.weeks ? ' · ' + esc(c.weeks) + '周' : '')
        + '</span></div>'
        + '<span class="del" data-del="' + i + '">删除</span>'
        + '</div>';
    }).join('');

    // 设置
    var meta = getMeta();
    h += '<div style="margin-top:18px;padding-top:14px;border-top:1px solid #272d3a">'
      + '<div style="font-size:11.5px;color:#7c8699;margin-bottom:7px">'
      + '学期第一周的周一（用来算周次，单双周课需要）</div>'
      + '<input id="ttTerm" type="date" value="' + esc(meta.termStart) + '" '
      + 'style="width:100%;background:#1e2431;border:1px solid #333b4d;border-radius:10px;'
      + 'padding:9px 12px;color:#e8ebf2;font-size:12.5px;font-family:inherit">'
      + '</div>';

    bodyEl.innerHTML = h;
    bindSheetBtns();
  }

  function bindSheetBtns() {
    var imp = document.getElementById('ttImport');
    if (imp) imp.addEventListener('click', startImport);
    var man = document.getElementById('ttManual');
    if (man) man.addEventListener('click', startManual);

    bodyEl.querySelectorAll('[data-del]').forEach(function (el) {
      el.addEventListener('click', function () {
        var i = +el.dataset.del;
        var cs = getCourses();
        var name = cs[i].name;
        cs.splice(i, 1);
        setCourses(cs);
        renderSheet();
        renderTodayCard();
        say('已删除：' + name);
      });
    });

    var term = document.getElementById('ttTerm');
    if (term) {
      term.addEventListener('change', function () {
        var m = getMeta();
        m.termStart = term.value;
        setMeta(m);
        var el = document.getElementById('ttWk');
        var wk = currentWeek();
        if (el) el.textContent = wk ? ('第 ' + wk + ' 周') : '未设置学期';
        say(wk ? ('现在是第 ' + wk + ' 周') : '已清除学期设置');
      });
    }
  }

  /* ---------------- 图片压缩 ---------------- */
  function compressImage(file, maxSide, quality) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('读取图片失败')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('图片解析失败')); };
        img.onload = function () {
          var w = img.width, h = img.height;
          var scale = Math.min(1, (maxSide || 1600) / Math.max(w, h));
          var cw = Math.round(w * scale), ch = Math.round(h * scale);
          var cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          var ctx = cv.getContext('2d');
          ctx.drawImage(img, 0, 0, cw, ch);
          resolve(cv.toDataURL('image/jpeg', quality || 0.86));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---------------- 识图配置 ---------------- */
  function getAiCfg() {
    var own = load(K_AI, { base: '', model: '', key: '' });
    var chat = {};
    try { chat = JSON.parse(localStorage.getItem('sb-ai-cfg') || '{}'); } catch (e) {}

    var base = own.base || 'https://api.deepseek.com/chat/completions';
    var model = own.model || 'deepseek-v4-flash-vision-exp';
    var key = own.key || chat.key || '';
    // 如果复用的是聊天配置，接口地址也跟着聊天走（避免用户换了服务商）
    if (!own.base && chat.base) base = chat.base;
    if (!own.key && chat.provider === 'doubao') model = own.model || '';
    return { base: base, model: model, key: key };
  }

  /* ---------------- 识别 prompt ---------------- */
  var PROMPT = '这是一张大学课程表截图。请提取所有课程信息。\n'
    + '严格只输出 JSON，不要任何解释文字、不要 markdown 代码块。\n\n'
    + '输出格式：\n'
    + '{"courses":[{"name":"课程名","teacher":"","room":"","day":1,"start":3,"end":4,"weeks":"1-16"}]}\n\n'
    + '规则：\n'
    + '1. day：1=周一 2=周二 … 7=周日\n'
    + '2. start/end：第几节课，填数字\n'
    + '3. weeks：周次，如 "1-16"、"1-16单"、"3-8,10-14"；看不清就填空字符串\n'
    + '4. 一门课如果一周多次，拆成多条记录\n'
    + '5. teacher / room 看不清就填空字符串\n'
    + '6. 忽略表头、时间轴、注释、空单元格';

  /* ---------------- 导入流程 ---------------- */
  var importBusy = false;

  function startImport() {
    if (importBusy) return;
    // 先检查配置
    var cfg = getAiCfg();
    if (!cfg.key) {
      bodyEl.innerHTML = '<div class="ttempty">'
        + '<b>需要先配置 AI</b><br><br>'
        + '截屏导入要用一个能看图的模型识别课表。<br><br>'
        + '<b style="color:#38d0d8">做法</b>：随便打开一份文档 → 底部点「问」→ 右上角 ⚙ '
        + '→ 填一个 DeepSeek 的 API Key。<br><br>'
        + '填完回这里就能用了。'
        + '</div>';
      return;
    }
    if (!cfg.model) {
      bodyEl.innerHTML = '<div class="ttempty">'
        + '<b>当前服务商没有可用的识图模型</b><br><br>'
        + '你现在用的是豆包，它的识图模型需要在'
        + '火山方舟控制台单独开通并创建接入点。<br><br>'
        + '最简单的办法：临时切到 DeepSeek，'
        + '它自带 <b>deepseek-v4-flash-vision-exp</b>，填个 key 就能识图。'
        + '</div>';
      return;
    }

    importBusy = true;

    var btn = document.getElementById('ttImport');
    var oldLabel = btn ? btn.textContent : '';
    if (btn) { btn.textContent = '正在打开相册…'; btn.disabled = true; }

    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);

    var picked = false;
    var opened = false;

    // 页面被切到后台 = 文件选择器弹出来了
    function onVis() {
      if (document.hidden) opened = true;
    }
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', function () { opened = true; });

    input.addEventListener('change', function () {
      picked = true;
      var f = input.files && input.files[0];
      document.removeEventListener('visibilitychange', onVis);
      if (input.parentNode) input.parentNode.removeChild(input);
      importBusy = false;
      if (btn) { btn.textContent = oldLabel; btn.disabled = false; }
      if (!f) {
        say('没选图片');
        return;
      }
      doImport(f);
    });

    input.click();

    // 3.5 秒后既没选图、页面也没被切走 → 说明选择器根本没弹出来
    setTimeout(function () {
      if (picked) return;
      importBusy = false;
      if (btn) { btn.textContent = oldLabel; btn.disabled = false; }
      if (opened) return;      // 弹出过，只是用户取消了

      document.removeEventListener('visibilitychange', onVis);
      if (input.parentNode) input.parentNode.removeChild(input);

      var isApp = !!(window.StudyBoard && window.StudyBoard.appVersion);
      var ver = isApp ? window.StudyBoard.appVersion() : '';
      bodyEl.innerHTML = '<div class="ttempty">'
        + '<b>点了没反应，选择器没弹出来</b><br><br>'
        + (isApp
            ? ('当前 App 版本：<b>' + esc(ver) + '</b><br>'
               + '<b style="color:#ffc48a">这个版本不支持选图片。</b><br>'
               + '需要装 v1.3 或更新的 APK（桌面上的「学习看板-v1.3.apk」），'
               + '装完覆盖安装即可，数据不会丢。<br><br>'
               + '在此之前，可以先用「手动添加」把课表录进去。')
            : '当前是浏览器环境。<br>'
              + '可能是浏览器不支持选文件，或者被权限拦了。<br><br>'
              + '建议用 App 打开，或者先用「手动添加」。')
        + '</div>'
        + '<div class="ttbtns" style="margin-top:16px">'
        + '<button class="pri" id="ttManual">手动添加</button>'
        + '<button id="ttCancel">返回</button></div>';
      bindFastBtns();
    }, 3500);
  }

  function doImport(file) {
    bodyEl.innerHTML = '<div class="ttempty">'
      + '<b>正在识别…</b><br><br>'
      + '图片在压缩后发给 AI，通常 10–30 秒。<br>'
      + '请保持这个页面开着。'
      + '</div>';

    var cfg = getAiCfg();
    var t0 = Date.now();

    compressImage(file, 1600, 0.86).then(function (dataUrl) {
      var payload = {
        model: cfg.model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }],
        max_tokens: 2000,
        temperature: 0.1,
        stream: false
      };

      return fetch(cfg.base, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + cfg.key
        },
        body: JSON.stringify(payload)
      });
    }).then(function (res) {
      return res.text().then(function (t) {
        if (!res.ok) {
          throw new Error('HTTP ' + res.status + '：' + t.slice(0, 200));
        }
        var j;
        try { j = JSON.parse(t); } catch (e) { throw new Error('返回内容不是 JSON'); }
        var content = j.choices && j.choices[0] && j.choices[0].message
          && j.choices[0].message.content;
        if (!content) throw new Error('模型没有返回内容');

        var parsed = extractJson(content);
        if (!parsed) {
          throw new Error('识别结果无法解析成 JSON。原始内容：' + String(content).slice(0, 300));
        }
        return { courses: parsed.courses || [], raw: content, ms: Date.now() - t0 };
      });
    }).then(function (r) {
      showPreview(r.courses, r.ms);
    }).catch(function (err) {
      var msg = String(err && err.message || err);
      var hint = '';
      if (/HTTP 401|unauthorized/i.test(msg)) hint = 'API Key 不对，去「问 AI」的 ⚙ 里重填。';
      else if (/HTTP 404|model/i.test(msg)) hint = '\n\n多半是模型名不对。识图需要用支持图片的模型，'
        + '默认是 deepseek-v4-flash-vision-exp。';
      else if (/Failed to fetch/i.test(msg)) hint = '\n\n请求没发出去，检查网络或接口地址。';
      bodyEl.innerHTML = '<div class="ttempty"><b>识别失败</b><br><br>'
        + esc(msg) + (hint ? '<br><br>' + esc(hint) : '')
        + '</div><div class="ttbtns" style="margin-top:16px">'
        + '<button class="pri" id="ttImport">重试</button>'
        + '<button id="ttCancel">返回</button></div>';
      bindFastBtns();
    });
  }

  // 从模型输出里抠出 JSON（容忍 markdown 代码块、前后废话）
  function extractJson(text) {
    var s = String(text).trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    try { return JSON.parse(s); } catch (e) {}
    var a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try { return JSON.parse(s.slice(a, b + 1)); } catch (e) {}
    }
    return null;
  }

  function showPreview(list, ms) {
    if (!list.length) {
      bodyEl.innerHTML = '<div class="ttempty"><b>没识别出课程</b><br><br>'
        + '可能是图片太模糊，或者截图里没有表格。<br>'
        + '试试截得更清楚一点，或者用手动添加。</div>'
        + '<div class="ttbtns" style="margin-top:16px">'
        + '<button class="pri" id="ttImport">再试一次</button>'
        + '<button id="ttManual">手动添加</button></div>';
      bindFastBtns();
      return;
    }

    // 校验 + 修补
    var fixed = list.filter(function (c) {
      return c && c.name && +c.day >= 1 && +c.day <= 7 && +c.start >= 1;
    }).map(function (c) {
      var st = Math.min(+c.start, +c.end || +c.start);
      var en = Math.max(+c.start, +c.end || +c.start);
      return {
        name: String(c.name).trim(),
        teacher: String(c.teacher || '').trim(),
        room: String(c.room || '').trim(),
        day: +c.day,
        start: st,
        end: en,
        weeks: String(c.weeks || '').trim()
      };
    });

    var lines = fixed.map(function (c) {
      return DAYS[c.day - 1] + ' ' + periodLabel(c.start, c.end) + '　' + c.name
        + (c.room ? '　' + c.room : '')
        + (c.weeks ? '　' + c.weeks + '周' : '');
    }).join('\n');

    bodyEl.innerHTML = '<div style="font-size:12.5px;color:#aab3c4;margin-bottom:10px">'
      + '识别出 <b style="color:#38d0d8">' + fixed.length + '</b> 条'
      + '（用时 ' + ((ms || 0) / 1000).toFixed(1) + 's）'
      + '<br><span style="font-size:11px;color:#7c8699">'
      + '请核对一下，有错就取消后手动改</span></div>'
      + '<div class="prev">' + esc(lines) + '</div>'
      + '<div class="ttbtns">'
      + '<button class="pri" id="ttConfirm">确认导入</button>'
      + '<button id="ttCancel">取消</button>'
      + '</div>';

    document.getElementById('ttConfirm').addEventListener('click', function () {
      var old = getCourses();
      // 去重：同名+同天+同起始节次视为同一条
      var seen = {};
      old.forEach(function (c) { seen[c.name + '|' + c.day + '|' + c.start] = 1; });
      var added = 0;
      fixed.forEach(function (c) {
        var k = c.name + '|' + c.day + '|' + c.start;
        if (!seen[k]) { old.push(c); seen[k] = 1; added++; }
      });
      setCourses(old);
      renderSheet();
      renderTodayCard();
      say('已导入 ' + added + ' 条课程' + (added < fixed.length ? '（' + (fixed.length - added) + ' 条重复已跳过）' : ''));
    });

    document.getElementById('ttCancel').addEventListener('click', renderSheet);
  }

  function bindFastBtns() {
    var a = document.getElementById('ttImport');
    if (a) a.addEventListener('click', startImport);
    var b = document.getElementById('ttManual');
    if (b) b.addEventListener('click', startManual);
    var c = document.getElementById('ttCancel');
    if (c) c.addEventListener('click', renderSheet);
  }

  /* ---------------- 手动添加 ---------------- */
  function startManual() {
    var h = '<div style="font-size:12.5px;color:#aab3c4;margin-bottom:12px">'
      + '手动添加一门课</div>';
    h += '<div style="display:flex;flex-direction:column;gap:9px">';
    h += '<input id="mName" placeholder="课程名，如 电子电路与技术(2)" '
      + 'style="background:#1e2431;border:1px solid #333b4d;border-radius:10px;'
      + 'padding:10px 12px;color:#e8ebf2;font-size:12.5px;font-family:inherit">';
    h += '<input id="mRoom" placeholder="教室（可空）" '
      + 'style="background:#1e2431;border:1px solid #333b4d;border-radius:10px;'
      + 'padding:10px 12px;color:#e8ebf2;font-size:12.5px;font-family:inherit">';
    h += '<div style="display:flex;gap:8px">';
    h += '<select id="mDay" style="flex:1;background:#1e2431;border:1px solid #333b4d;'
      + 'border-radius:10px;padding:10px;color:#e8ebf2;font-size:12.5px;font-family:inherit">'
      + DAYS.map(function (d, i) { return '<option value="' + (i + 1) + '">' + d + '</option>'; }).join('')
      + '</select>';
    h += '<input id="mStart" type="number" min="1" max="13" value="1" placeholder="起始节" '
      + 'style="flex:1;background:#1e2431;border:1px solid #333b4d;border-radius:10px;'
      + 'padding:10px;color:#e8ebf2;font-size:12.5px;font-family:inherit">';
    h += '<input id="mEnd" type="number" min="1" max="13" value="2" placeholder="结束节" '
      + 'style="flex:1;background:#1e2431;border:1px solid #333b4d;border-radius:10px;'
      + 'padding:10px;color:#e8ebf2;font-size:12.5px;font-family:inherit">';
    h += '</div>';
    h += '<input id="mWeeks" placeholder="周次，可空（如 1-16 或 1-16单）" '
      + 'style="background:#1e2431;border:1px solid #333b4d;border-radius:10px;'
      + 'padding:10px 12px;color:#e8ebf2;font-size:12.5px;font-family:inherit">';
    h += '</div>';
    h += '<div class="ttbtns" style="margin-top:14px">'
      + '<button class="pri" id="ttSaveManual">保存</button>'
      + '<button id="ttCancel">取消</button></div>';

    bodyEl.innerHTML = h;

    document.getElementById('ttSaveManual').addEventListener('click', function () {
      var name = (document.getElementById('mName').value || '').trim();
      if (!name) { say('课程名不能空着'); return; }
      var st = +document.getElementById('mStart').value || 1;
      var en = +document.getElementById('mEnd').value || st;
      var c = {
        name: name,
        teacher: '',
        room: (document.getElementById('mRoom').value || '').trim(),
        day: +document.getElementById('mDay').value,
        start: Math.min(st, en),
        end: Math.max(st, en),
        weeks: (document.getElementById('mWeeks').value || '').trim()
      };
      var cs = getCourses();
      cs.push(c);
      setCourses(cs);
      renderSheet();
      renderTodayCard();
      say('已添加：' + name);
    });

    document.getElementById('ttCancel').addEventListener('click', renderSheet);
  }

  /* ---------------- 挂载 ---------------- */
  function mount() {
    buildSheet();
    renderTodayCard();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  // 暴露给 index.html 调用（切换 tab / 切日期时刷新卡片）
  window.SBTT = {
    refresh: renderTodayCard,
    open: openSheet
  };

  // renderDay 之后自动刷新刚发生的变化（用 MutationObserver 监听 todayBox 变化）
  document.addEventListener('DOMContentLoaded', function () {
    var box = document.getElementById('todayBox');
    if (!box) return;
    var t = null;
    var mo = new MutationObserver(function () {
      clearTimeout(t);
      t = setTimeout(renderTodayCard, 60);
    });
    mo.observe(box, { childList: true });
  });
})();

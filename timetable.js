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

  /* ---------- 基准课表 ---------- */
  function getBaseCourses() { return load(K_COURSES, []); }
  function setBaseCourses(v) { save(K_COURSES, v); }

  /* ---------- 每周覆盖 ---------- */
  function getWeekMap() { return load('sb-tt-weeks', {}); }
  function setWeekMap(v) { save('sb-tt-weeks', v); }

  function viewWeek() {
    var m = getMeta();
    if (m.viewWeek) return +m.viewWeek;
    var w = currentWeek();
    return w || 1;
  }
  function setViewWeek(w) {
    var m = getMeta();
    m.viewWeek = +w;
    setMeta(m);
  }

  function hasWeekOverride(w) {
    var map = getWeekMap();
    return Object.prototype.hasOwnProperty.call(map, String(w));
  }

  /* 当前查看的是否为「本周单独修改」状态 */
  function isWeekMode() { return hasWeekOverride(viewWeek()); }

  /* 读：本周有覆盖用覆盖，否则用基准 */
  function getCourses() {
    var w = viewWeek();
    var map = getWeekMap();
    if (Object.prototype.hasOwnProperty.call(map, String(w))) {
      return JSON.parse(JSON.stringify(map[String(w)] || []));
    }
    return JSON.parse(JSON.stringify(getBaseCourses()));
  }

  /* 写：本周已覆盖 → 写本周；否则 → 写基准 */
  function setCourses(v) {
    var w = viewWeek();
    if (isWeekMode()) {
      var map = getWeekMap();
      map[String(w)] = JSON.parse(JSON.stringify(v));
      setWeekMap(map);
    } else {
      setBaseCourses(v);
    }
  }

  /* 把本周变成「单独修改」（复制基准） */
  function forkWeek() {
    var w = viewWeek();
    if (hasWeekOverride(w)) return false;
    var map = getWeekMap();
    map[String(w)] = JSON.parse(JSON.stringify(getBaseCourses()));
    setWeekMap(map);
    return true;
  }

  /* 取消本周覆盖 */
  function unforkWeek() {
    var w = viewWeek();
    var map = getWeekMap();
    if (Object.prototype.hasOwnProperty.call(map, String(w))) {
      delete map[String(w)];
      setWeekMap(map);
      return true;
    }
    return false;
  }

  /* 本周相对基准有几处不同 */
  function diffCount() {
    var w = viewWeek();
    if (!hasWeekOverride(w)) return 0;
    var cur = getCourses(), base = getBaseCourses();
    var key = function (c) {
      return c.name + '|' + c.day + '|' + c.start + '|' + c.end + '|' + (c.room || '');
    };
    var setB = {}, setC = {};
    base.forEach(function (c) { setB[key(c)] = 1; });
    cur.forEach(function (c) { setC[key(c)] = 1; });
    var n = 0, k;
    for (k in setB) if (!setC[k]) n++;
    for (k in setC) if (!setB[k]) n++;
    return n;
  }
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
  + '.wkbar{display:flex;align-items:center;gap:9px;background:#1a1f2a;'
  + 'border:1px solid #272d3a;border-radius:11px;padding:9px 11px;margin-bottom:10px}'
  + '.wkbar button{flex:0 0 32px;height:32px;border-radius:8px;border:1px solid #333b4d;'
  + 'background:#232a38;color:#aab3c4;font-size:15px;line-height:1;font-family:inherit}'
  + '.wkbar button:active{background:#2c3446}'
  + '.wkbar .mid{flex:1;text-align:center;min-width:0}'
  + '.wkbar .mid b{display:block;font-size:13px;color:#e8ebf2;font-weight:700}'
  + '.wkbar .mid span{font-size:10.5px;color:#7c8699;display:block;margin-top:1px}'
  + '.wkmode{display:flex;gap:8px;margin-bottom:13px}'
  + '.wkmode button{flex:1;height:38px;border-radius:10px;border:1px solid #333b4d;'
  + 'background:#1e2431;color:#aab3c4;font-size:11.5px;font-family:inherit;line-height:1.3}'
  + '.wkmode button.pri{background:rgba(255,180,80,.13);border-color:rgba(255,180,80,.4);'
  + 'color:#ffc48a;font-weight:600}'
  + '.wknote{background:rgba(255,180,80,.08);border:1px solid rgba(255,180,80,.28);'
  + 'border-radius:9px;padding:9px 12px;font-size:11px;color:#ffc48a;line-height:1.7;'
  + 'margin-bottom:11px}'
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
  + '.citem{cursor:pointer}'
  + '.citem:active{background:rgba(255,255,255,.03)}'
  + '.citem .pen{flex:0 0 auto;font-size:11px;color:#38d0d8;padding:4px 8px}'
  + '.editwrap{display:flex;flex-direction:column;gap:9px}'
  + '.editwrap input{background:#1e2431;border:1px solid #333b4d;border-radius:10px;'
  + 'padding:10px 12px;color:#e8ebf2;font-size:12.5px;font-family:inherit;width:100%}'
  + '.editwrap input:focus{outline:none;border-color:rgba(56,208,216,.5)}'
  + '.editrow{display:flex;gap:8px}'
  + '.editrow select{flex:1;background:#1e2431;border:1px solid #333b4d;border-radius:10px;'
  + 'padding:10px;color:#e8ebf2;font-size:12.5px;font-family:inherit}'
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
    // 今日卡片始终用「本周」的课表，不受抽屉里翻看哪一周影响
    var map = getWeekMap();
    var todayList = Object.prototype.hasOwnProperty.call(map, String(wk))
      ? map[String(wk)]
      : getBaseCourses();
    var list = todayList.filter(function (c) {
      return +c.day === todayDayIdx();
    }).sort(function (a, b) { return a.start - b.start; });

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
    var realWk = currentWeek();
    var w = viewWeek();
    var el = document.getElementById('ttWk');
    if (el) el.textContent = realWk ? ('本学期第 ' + realWk + ' 周') : '未设置学期';

    var courses = getCourses();
    var inWeekMode = isWeekMode();
    var diff = diffCount();
    var isCurWeek = realWk && (w === realWk);

    var h = '';

    // 周次切换
    h += '<div class="wkbar">'
      + '<button id="wkPrev">‹</button>'
      + '<div class="mid"><b>第 ' + w + ' 周</b>'
      + '<span>' + (isCurWeek ? '本周' : (realWk ? (w < realWk ? '已过去 ' + (realWk - w) + ' 周' : '还有 ' + (w - realWk) + ' 周') : '未设置学期'))
      + ' · ' + (inWeekMode ? '单独修改' : '沿用基准') + '</span></div>'
      + '<button id="wkNext">›</button>'
      + '</div>';

    // 模式提示
    if (inWeekMode) {
      h += '<div class="wknote">第 ' + w + ' 周有 <b>' + diff + '</b> 处与基准不同。'
        + '在这里的修改<b>只影响这一周</b>，其他周仍是基准课表。</div>';
    } else {
      h += '<div class="wknote" style="background:rgba(56,208,216,.06);'
        + 'border-color:rgba(56,208,216,.25);color:#8fbfc4">'
        + '当前显示的是<b>基准课表</b>（每周默认）。'
        + (realWk ? '如果第 ' + w + ' 周有几节课不一样，点下面的「本周单独修改」。' : '')
        + '</div>';
    }

    // 模式按钮
    h += '<div class="wkmode">';
    if (inWeekMode) {
      h += '<button id="wkUnfork">恢复沿用基准</button>';
      h += '<button id="wkCopyNext">把这周复制到下周</button>';
    } else {
      h += '<button class="pri" id="wkFork">本周单独修改</button>';
    }
    h += '</div>';

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
          if (+c.day !== dd || +c.start > p || +c.end < p) return false;
          // 本周模式：课表就是这一周的，不再按 weeks 过滤
          // 基准模式：按 weeks 字段过滤
          return inWeekMode ? true : activeInWeek(c, w);
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
      return '<div class="citem" data-edit="' + i + '">'
        + '<span style="flex:0 0 auto;font-size:11px;color:#38d0d8">'
        + DAYS[c.day - 1] + '</span>'
        + '<div class="tx"><b>' + esc(c.name) + '</b>'
        + '<span>' + periodLabel(c.start, c.end)
        + (periodTime(c.start, c.end) ? ' · ' + periodTime(c.start, c.end) : '')
        + (c.room ? ' · ' + esc(c.room) : '')
        + (c.weeks ? ' · ' + esc(c.weeks) + '周' : '')
        + '</span></div>'
        + '<span class="pen">改</span>'
        + '</div>';
    }).join('');

    h += '<div style="margin-top:10px;font-size:11px;color:#7c8699;text-align:center">'
      + '点任意一行可以修改或删除</div>';

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
    var wp = document.getElementById('wkPrev');
    if (wp) wp.addEventListener('click', function () {
      var w = viewWeek();
      setViewWeek(Math.max(1, w - 1));
      renderSheet();
    });
    var wn = document.getElementById('wkNext');
    if (wn) wn.addEventListener('click', function () {
      setViewWeek(viewWeek() + 1);
      renderSheet();
    });
    var wf = document.getElementById('wkFork');
    if (wf) wf.addEventListener('click', function () {
      forkWeek();
      renderSheet();
      say('第 ' + viewWeek() + ' 周已改为单独修改');
    });
    var wu = document.getElementById('wkUnfork');
    if (wu) wu.addEventListener('click', function () {
      unforkWeek();
      renderSheet();
      renderTodayCard();
      say('已恢复沿用基准课表');
    });
    var wc = document.getElementById('wkCopyNext');
    if (wc) wc.addEventListener('click', function () {
      var w = viewWeek();
      var map = getWeekMap();
      map[String(w + 1)] = JSON.parse(JSON.stringify(getCourses()));
      setWeekMap(map);
      setViewWeek(w + 1);
      renderSheet();
      say('已复制到第 ' + (w + 1) + ' 周');
    });

    var imp = document.getElementById('ttImport');
    if (imp) imp.addEventListener('click', startImport);
    var man = document.getElementById('ttManual');
    if (man) man.addEventListener('click', startManual);

    bodyEl.querySelectorAll('[data-edit]').forEach(function (el) {
      el.addEventListener('click', function () {
        editCourse(+el.dataset.edit);
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
    var model = own.model || 'deepseek-flash';
    var key = own.key || chat.key || '';
    // 如果复用的是聊天配置，接口地址也跟着聊天走（避免用户换了服务商）
    if (!own.base && chat.base) base = chat.base;
    if (!own.key && chat.provider === 'doubao') model = own.model || '';
    return { base: base, model: model, key: key };
  }

  /* ---------------- 识别 prompt ---------------- */
  // 注意：deepseek-flash 这类推理模型会先长篇思考，把 token 预算吃光。
  // 所以指令必须极短，并明确禁止分析过程。
  var PROMPT = '直接输出课程表 JSON，不要分析、不要复述题目、不要思考过程。\n'
    + '格式：{"courses":[{"name":"","room":"","day":1,"start":1,"end":2,"weeks":""}]}\n'
    + 'day 1-7 表示周一到周日；start/end 为节次数字；weeks 看不清留空。\n'
    + '相邻节次的同一门课合并成一条（start 到 end）。忽略表头和时间轴。\n'
    + '第一行就写 {，最后一行写 }。';

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
        + '它自带 <b>deepseek-flash</b>，填个 key 就能识图。'
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
      return requestOnce(cfg, dataUrl).then(function (r) {
        // 关键：如果正文为空、但思考内容很长 → 自动切半重试
        if (r.empty && r.reasoningLen > 3000) {
          bodyEl.innerHTML = '<div class="ttempty">'
            + '<b>模型思考太长，一次读不完</b><br><br>'
            + '正在把课表切成上下两半分别识别…<br>'
            + '（这是思考型模型的常见问题，会自动处理）'
            + '</div>';
          return splitImage(dataUrl).then(function (halves) {
            return Promise.all(halves.map(function (h) {
              return requestOnce(cfg, h).catch(function () { return { courses: [] }; });
            })).then(function (rs) {
              var all = [];
              var anyPartial = false;
              rs.forEach(function (x) {
                all = all.concat(x.courses || []);
                if (x.partial) anyPartial = true;
              });
              if (!all.length) throw new Error(r.diag);
              return { courses: all, partial: anyPartial, ms: Date.now() - t0 };
            });
          });
        }
        if (r.empty) throw new Error(r.diag);
        return r;
      });
    }).then(function (r) {
      showPreview(r.courses, r.ms, r.partial);
    }).catch(function (err) {
      var msg = String(err && err.message || err);
      var hint = '';
      // 只在真正的 HTTP 状态码上做判断，不要用正文里的 "model" 字样（会误判）
      if (/HTTP 401|HTTP 403|unauthorized/i.test(msg)) {
        hint = 'API Key 不对，或这个 Key 没有该模型的权限。\n'
             + '去「问 AI」的 ⚙ 里重新填一次。';
      } else if (/HTTP 404/.test(msg)) {
        hint = '接口地址或模型名不存在。\n'
             + '识别课表要用支持图片的模型，DeepSeek 的是 deepseek-flash。\n'
             + '确认你的账号能调用这个模型。';
      } else if (/HTTP 429/.test(msg)) {
        hint = '请求太频繁，等一分钟再试。';
      } else if (/HTTP 402|insufficient|balance/i.test(msg)) {
        hint = '账户余额不足。';
      } else if (/Failed to fetch/i.test(msg)) {
        hint = '请求没发出去，检查网络或接口地址。';
      } else if (/没有返回正文/.test(msg)) {
        hint = '模型没有输出正文，通常是这两种情况：\n'
             + '① 这个模型不支持图片输入（只支持纯文字）\n'
             + '② 输出的 token 上限不够\n'
             + '上面的原始返回里能看到具体原因。';
      }

      bodyEl.innerHTML = '<div class="ttempty" style="text-align:left">'
        + '<b style="color:#ff9d9d">识别失败</b><br><br>'
        + '<div style="background:#0f131b;border:1px solid #272d3a;border-radius:10px;'
        + 'padding:11px 13px;font-size:11px;line-height:1.75;color:#aab3c4;'
        + 'white-space:pre-wrap;word-break:break-all;max-height:240px;overflow:auto">'
        + esc(msg) + '</div>'
        + (hint ? '<div style="margin-top:11px;font-size:11.5px;line-height:1.8;'
           + 'color:#ffc48a">' + esc(hint) + '</div>' : '')
        + '</div><div class="ttbtns" style="margin-top:16px">'
        + '<button class="pri" id="ttImport">重试</button>'
        + '<button id="ttManual">手动添加</button>'
        + '<button id="ttCancel">返回</button></div>';
      bindFastBtns();
    });
  }

  // 发一次识别请求，返回 {courses, partial, empty, reasoningLen, diag}
  function requestOnce(cfg, dataUrl) {
    var payload = {
      model: cfg.model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }],
      max_tokens: 8000,
      stream: false,
      // 关键：DeepSeek 的 thinking 默认 enabled + effort=high，
      // 会先输出上万字思维链，把输出额度吃光导致 content 为空。
      // 识别课表是纯粹的机械提取，不需要推理，直接关掉。
      thinking: { type: 'disabled' }
    };

    return fetch(cfg.base, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.key
      },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.text().then(function (t) {
        if (!res.ok) {
          throw new Error('HTTP ' + res.status + '：' + t.slice(0, 200));
        }
        var j;
        try { j = JSON.parse(t); } catch (e) {
          throw new Error('返回内容不是 JSON：' + t.slice(0, 300));
        }

        var msg = (j.choices && j.choices[0] && j.choices[0].message) || {};
        var content = msg.content || '';
        var reasoning = msg.reasoning_content || msg.reasoning || '';
        var finish = (j.choices && j.choices[0] && j.choices[0].finish_reason) || '';

        if (!content) {
          var diag = '模型没有返回正文。\n';
          diag += 'finish_reason：' + (finish || '（空）') + '\n';
          if (reasoning) {
            diag += '思考内容 ' + reasoning.length + ' 字，把输出额度用完了。\n'
                 + '（说明本次请求的 thinking 没关掉）';
          }
          if (j.error) {
            diag += '\n错误：' + JSON.stringify(j.error).slice(0, 200);
          }
          diag += '\n\n原始返回（前 300 字）：\n' + t.slice(0, 300);
          return { courses: [], empty: true, reasoningLen: reasoning.length, diag: diag };
        }

        var parsed = extractJson(content);
        if (!parsed) {
          return {
            courses: [], empty: false, reasoningLen: reasoning.length,
            diag: '模型有输出，但没找到课程数据。\n原始内容：\n' + content.slice(0, 300)
          };
        }
        return {
          courses: mergeCourses(parsed.courses || []),
          partial: parsed.partial,
          empty: false,
          reasoningLen: reasoning.length,
          finish: finish
        };
      });
    });
  }

  // 把图片从中间切成上下两半，降低单次识别量
  function splitImage(dataUrl) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var h = Math.floor(img.height / 2);
        var out = [];
        for (var k = 0; k < 2; k++) {
          var cv = document.createElement('canvas');
          cv.width = img.width;
          cv.height = h;
          var ctx = cv.getContext('2d');
          ctx.drawImage(img, 0, k * h, img.width, h, 0, 0, img.width, h);
          out.push(cv.toDataURL('image/jpeg', 0.86));
        }
        resolve(out);
      };
      img.onerror = function () { resolve([dataUrl]); };
      img.src = dataUrl;
    });
  }

  // 从模型输出里抠出 JSON（容忍 markdown 包裹、前后废话、以及被截断）
  function extractJson(text) {
    var s = String(text).trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

    // ① 完整 JSON
    try {
      var full = JSON.parse(s);
      if (full && full.courses) return { courses: full.courses, partial: false };
    } catch (e) {}

    // ② 掐头去尾再试
    var a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        var cut = JSON.parse(s.slice(a, b + 1));
        if (cut && cut.courses) return { courses: cut.courses, partial: false };
      } catch (e) {}
    }

    // ③ 被截断：从每个 { 出发找它自己的配对 }，能闭合就尝试解析
    //    （不能只等整体归零——最外层数组的 { 永远等不到闭合）
    var objs = [];
    var i = 0;
    while (i < s.length) {
      if (s.charAt(i) !== '{') { i++; continue; }

      // 从这个 { 开始找匹配的 }
      var depth = 0, inStr = false, esc = false, j = i, closeAt = -1;
      for (; j < s.length; j++) {
        var c = s.charAt(j);
        if (inStr) {
          if (esc) { esc = false; }
          else if (c === '\\') { esc = true; }
          else if (c === '"') { inStr = false; }
          continue;
        }
        if (c === '"') { inStr = true; continue; }
        if (c === '{') { depth++; }
        else if (c === '}') {
          depth--;
          if (depth === 0) { closeAt = j; break; }
        }
      }

      if (closeAt < 0) {
        // 这个 { 没有闭合（截断处），往后挪一位继续找
        i++;
        continue;
      }

      var frag = s.slice(i, closeAt + 1);
      if (frag.indexOf('"name"') >= 0) {
        try {
          var o = JSON.parse(frag);
          if (o && o.name) objs.push(o);
        } catch (e) {}
      }
      i = closeAt + 1;
    }

    if (objs.length) return { courses: objs, partial: true };
    return null;
  }

  // 合并同一天相邻节次、同名的课（模型常把 3、4 节拆成两条）
  function mergeCourses(list) {
    var byKey = {};
    var order = [];
    list.forEach(function (c) {
      var k = c.name + '|' + c.day + '|' + (c.room || '') + '|' + (c.weeks || '');
      if (!byKey[k]) {
        byKey[k] = c;
        order.push(k);
      } else {
        var e = byKey[k];
        // 相邻或重叠则合并
        if (+c.start <= +e.end + 1 && +c.end >= +e.start - 1) {
          e.start = Math.min(+e.start, +c.start);
          e.end = Math.max(+e.end, +c.end);
        }
      }
    });
    return order.map(function (k) { return byKey[k]; });
  }

  function showPreview(list, ms, partial) {
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
      + (partial
          ? '<br><span style="font-size:11px;color:#ffc48a">⚠️ 输出被截断了，'
            + '可能只拿到一部分。建议分两次导入，或用手动添加补剩下的。</span>'
          : '<br><span style="font-size:11px;color:#7c8699">请核对一下，有错就取消后手动改</span>')
      + '</div>'
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

  /* ---------------- 编辑课程 ---------------- */
  function editCourse(idx) {
    var cs = getCourses();
    var c = cs[idx];
    if (!c) return;

    var h = '<div style="font-size:12.5px;color:#aab3c4;margin-bottom:12px">'
      + '修改课程 <span style="color:#38d0d8">#' + (idx + 1) + '</span></div>'
      + '<div class="editwrap">'
      + '<input id="eName" placeholder="课程名" value="' + esc(c.name) + '">'
      + '<input id="eRoom" placeholder="教室" value="' + esc(c.room || '') + '">'
      + '<div class="editrow">'
      + '<select id="eDay">'
      + DAYS.map(function (d, i) {
          return '<option value="' + (i + 1) + '"'
            + (+c.day === i + 1 ? ' selected' : '') + '>' + d + '</option>';
        }).join('')
      + '</select>'
      + '<input id="eStart" type="number" min="1" max="13" value="' + c.start + '" title="起始节">'
      + '<input id="eEnd" type="number" min="1" max="13" value="' + c.end + '" title="结束节">'
      + '</div>'
      + '<input id="eWeeks" placeholder="周次，可空（如 1-16 或 1-16单）" value="' + esc(c.weeks || '') + '">'
      + '</div>'
      + '<div class="ttbtns" style="margin-top:14px">'
      + '<button class="pri" id="eSave">保存修改</button>'
      + '<button id="eCancel">取消</button>'
      + '</div>'
      + '<div class="ttbtns" style="margin-top:8px">'
      + '<button id="eDel" style="color:#ff7a7a;border-color:rgba(255,122,122,.35)">'
      + '删除这门课</button>'
      + '</div>';

    bodyEl.innerHTML = h;

    document.getElementById('eSave').addEventListener('click', function () {
      var name = (document.getElementById('eName').value || '').trim();
      if (!name) { say('课程名不能空着'); return; }
      var st = +document.getElementById('eStart').value || 1;
      var en = +document.getElementById('eEnd').value || st;
      var list = getCourses();
      list[idx] = {
        name: name,
        teacher: c.teacher || '',
        room: (document.getElementById('eRoom').value || '').trim(),
        day: +document.getElementById('eDay').value,
        start: Math.min(st, en),
        end: Math.max(st, en),
        weeks: (document.getElementById('eWeeks').value || '').trim()
      };
      setCourses(list);
      renderSheet();
      renderTodayCard();
      say('已保存修改');
    });

    document.getElementById('eCancel').addEventListener('click', renderSheet);

    document.getElementById('eDel').addEventListener('click', function () {
      var list = getCourses();
      var nm = list[idx].name;
      list.splice(idx, 1);
      setCourses(list);
      renderSheet();
      renderTodayCard();
      say('已删除：' + nm);
    });
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
      t = setTimeout(function () {
        // 只在「今日」视图可见时重建，别的 tab 下没必要
        var v = document.getElementById('v-today');
        if (v && !v.classList.contains('on')) return;
        renderTodayCard();
      }, 120);
    });
    mo.observe(box, { childList: true });
  });
})();

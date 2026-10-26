/* 数据安全模块 · backup.js
   目标：让「打勾丢失」这件事不再发生
   1. 每次写入自动快照（保留最近 8 份，带时间戳）
   2. 启动时检测主数据异常归零 → 主动提示恢复
   3. 导出 / 导入 JSON 文件（跨容器、跨设备搬运）
   4. 显示当前容器信息，提醒用户别混用
*/
(function () {
  'use strict';

  var K_SNAP = 'sb-snapshots';
  var K_META = 'sb-backup-meta';
  var MAX_SNAP = 8;

  // 需要备份的数据前缀
  var PREFIXES = ['sb-check-', 'sb-note-', 'sb-focus-', 'sb-tt-', 'sb-snapshots', 'sb-backup-meta'];

  function isOurKey(k) {
    for (var i = 0; i < PREFIXES.length; i++) {
      if (k.indexOf(PREFIXES[i]) === 0) return true;
    }
    return false;
  }

  /* ---------------- 全量数据抓取 ---------------- */
  function grabAll() {
    var out = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k || !isOurKey(k)) continue;
      if (k === K_SNAP) continue;              // 快照本身不打包进去，避免无限递归
      if (k === K_META) continue;
      out[k] = localStorage.getItem(k);
    }
    return out;
  }

  function countChecks(data) {
    var n = 0;
    for (var k in data) {
      if (k.indexOf('sb-check-') !== 0) continue;
      try {
        var o = JSON.parse(data[k]);
        n += Object.keys(o || {}).length;
      } catch (e) {}
    }
    return n;
  }

  /* ---------------- 快照 ---------------- */
  function takeSnapshot(reason) {
    var data = grabAll();
    var checks = countChecks(data);
    // 没有任何打卡记录就不存快照，省空间
    if (checks === 0 && reason !== 'manual') return null;

    var list = [];
    try { list = JSON.parse(localStorage.getItem(K_SNAP) || '[]'); } catch (e) { list = []; }

    var snap = {
      t: Date.now(),
      reason: reason || 'auto',
      checks: checks,
      keys: Object.keys(data).length,
      data: data
    };

    // 如果和上一份完全一样，跳过（避免重复占位）
    if (list.length && list[0].checks === snap.checks
        && JSON.stringify(list[0].data) === JSON.stringify(snap.data)) {
      return null;
    }

    list.unshift(snap);
    while (list.length > MAX_SNAP) list.pop();

    try {
      localStorage.setItem(K_SNAP, JSON.stringify(list));
      localStorage.setItem(K_META, JSON.stringify({
        lastSnap: snap.t,
        lastChecks: checks,
        total: list.length
      }));
    } catch (e) {
      // 空间不够：砍一半再试一次
      list = list.slice(0, Math.ceil(list.length / 2));
      try { localStorage.setItem(K_SNAP, JSON.stringify(list)); } catch (e2) {}
    }
    return snap;
  }

  function getSnapshots() {
    try { return JSON.parse(localStorage.getItem(K_SNAP) || '[]'); } catch (e) { return []; }
  }

  /* ---------------- 恢复 ---------------- */
  function restore(snapIdx) {
    var list = getSnapshots();
    var s = list[snapIdx];
    if (!s) return false;
    for (var k in s.data) {
      try { localStorage.setItem(k, s.data[k]); } catch (e) {}
    }
    return true;
  }

  /* ---------------- 导出 ---------------- */
  function exportFile() {
    var data = grabAll();
    var pack = {
      app: 'study-board',
      version: 1,
      exportedAt: new Date().toISOString(),
      checks: countChecks(data),
      data: data
    };
    var str = JSON.stringify(pack, null, 2);
    var blob = new Blob([str], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var d = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    a.href = url;
    a.download = '学习看板备份-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
               + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1200);
    return pack;
  }

  /* ---------------- 导入 ---------------- */
  function importFile(file, cb) {
    var reader = new FileReader();
    reader.onerror = function () { cb(new Error('读文件失败')); };
    reader.onload = function () {
      var pack;
      try { pack = JSON.parse(reader.result); } catch (e) { cb(new Error('不是合法的 JSON 文件')); return; }
      if (!pack || pack.app !== 'study-board' || !pack.data) {
        cb(new Error('这不是学习看板的备份文件')); return;
      }
      var incoming = pack.data;
      var mode = cb.needMode ? null : null;
      cb(null, incoming, pack);
    };
    reader.readAsText(file);
  }

  function applyImport(incoming, merge) {
    var added = 0, kept = 0;
    for (var k in incoming) {
      try {
        if (merge) {
          // 合并模式：打卡记录取并集，其他以导入为准
          if (k.indexOf('sb-check-') === 0) {
            var old = {};
            try { old = JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) {}
            var inc = {};
            try { inc = JSON.parse(incoming[k] || '{}'); } catch (e) {}
            var obj = {};
            var kk;
            for (kk in old) obj[kk] = old[kk];
            for (kk in inc) obj[kk] = inc[kk];
            localStorage.setItem(k, JSON.stringify(obj));
          } else {
            localStorage.setItem(k, incoming[k]);
          }
          added++;
        } else {
          localStorage.setItem(k, incoming[k]);
          added++;
        }
      } catch (e) {}
    }
    return { added: added, kept: kept };
  }

  /* ---------------- UI ---------------- */
  var CSS = ''
  + '.bk-mask{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10050;display:none}'
  + '.bk-mask.on{display:block}'
  + '.bk-wrap{position:fixed;left:0;right:0;bottom:0;z-index:10051;background:#141821;'
  + 'border-radius:16px 16px 0 0;border-top:1px solid #333b4d;max-height:86vh;'
  + 'display:flex;flex-direction:column;transform:translateY(100%);'
  + 'transition:transform .26s cubic-bezier(.3,.9,.3,1)}'
  + '.bk-wrap.on{transform:translateY(0)}'
  + '.bk-hd{padding:13px 15px 10px;border-bottom:1px solid #272d3a;display:flex;align-items:center;gap:9px}'
  + '.bk-hd b{font-size:13px;color:#e8ebf2;font-weight:700}'
  + '.bk-hd span{margin-left:auto;font-size:10.5px;color:#7c8699}'
  + '.bk-bd{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:14px 15px 26px}'
  + '.bk-sec{font-size:11.5px;color:#7c8699;margin:16px 0 8px;font-weight:600}'
  + '.bk-sec:first-child{margin-top:0}'
  + '.bk-btn{display:block;width:100%;height:44px;border-radius:11px;border:1px solid #333b4d;'
  + 'background:#1e2431;color:#aab3c4;font-size:13px;font-family:inherit;margin-bottom:9px}'
  + '.bk-btn.pri{background:rgba(56,208,216,.14);border-color:rgba(56,208,216,.42);'
  + 'color:#38d0d8;font-weight:600}'
  + '.bk-btn.danger{color:#ff9d9d;border-color:rgba(255,122,122,.3)}'
  + '.bk-info{background:#0f131b;border:1px solid #272d3a;border-radius:10px;'
  + 'padding:11px 13px;font-size:11.5px;line-height:1.85;color:#aab3c4;margin-bottom:12px}'
  + '.bk-info b{color:#e8ebf2}'
  + '.bk-warn{background:rgba(255,122,122,.08);border:1px solid rgba(255,122,122,.28);'
  + 'border-radius:10px;padding:11px 13px;font-size:11.5px;line-height:1.85;color:#ffc48a;'
  + 'margin-bottom:12px}'
  + '.bk-snap{display:flex;align-items:center;gap:10px;padding:10px 0;'
  + 'border-bottom:1px solid rgba(255,255,255,.05)}'
  + '.bk-snap:last-child{border-bottom:none}'
  + '.bk-snap .tm{flex:1;font-size:11.5px;color:#aab3c4}'
  + '.bk-snap .tm b{display:block;color:#e8ebf2;font-size:12px;margin-bottom:1px}'
  + '.bk-snap button{flex:0 0 auto;padding:6px 12px;border-radius:8px;'
  + 'border:1px solid rgba(56,208,216,.4);background:rgba(56,208,216,.1);'
  + 'color:#38d0d8;font-size:11px;font-family:inherit}'
  + '.bkdlg-mask{position:fixed;inset:0;background:rgba(0,0,0,.66);z-index:10070;display:none}'
  + '.bkdlg-mask.on{display:flex;align-items:center;justify-content:center;padding:24px}'
  + '.bkdlg{width:100%;max-width:340px;background:#1a1f2a;border:1px solid #333b4d;'
  + 'border-radius:14px;padding:18px 18px 14px;box-shadow:0 14px 40px rgba(0,0,0,.6)}'
  + '.bkdlg .tt{font-size:14px;font-weight:700;color:#e8ebf2;margin-bottom:10px}'
  + '.bkdlg .ms{font-size:12.5px;color:#aab3c4;line-height:1.8;white-space:pre-wrap;margin-bottom:16px}'
  + '.bkdlg .bt{display:flex;gap:9px}'
  + '.bkdlg .bt button{flex:1;height:42px;border-radius:10px;border:1px solid #333b4d;'
  + 'background:#1e2431;color:#aab3c4;font-size:13px;font-family:inherit}'
  + '.bkdlg .bt button.pri{background:rgba(56,208,216,.16);border-color:rgba(56,208,216,.45);'
  + 'color:#38d0d8;font-weight:600}';

  var styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  var mask, wrap, bodyEl;

  function build() {
    mask = document.createElement('div');
    mask.className = 'bk-mask';
    document.body.appendChild(mask);

    wrap = document.createElement('div');
    wrap.className = 'bk-wrap';
    wrap.innerHTML = '<div class="bk-hd"><b>数据安全</b><span id="bkSum"></span></div>'
      + '<div class="bk-bd" id="bkBody"></div>';
    document.body.appendChild(wrap);
    bodyEl = document.getElementById('bkBody');
    mask.addEventListener('click', close);
  }

  function fmtTime(ts) {
    var d = new Date(ts);
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function render() {
    var snaps = getSnapshots();
    var data = grabAll();
    var checks = countChecks(data);
    var notes = 0;
    for (var k in data) if (k.indexOf('sb-note-') === 0 && data[k] && data[k] !== '""') notes++;

    document.getElementById('bkSum').textContent = checks + ' 个勾 · ' + notes + ' 条笔记';

    var inApp = !!(window.StudyBoard && window.StudyBoard.appVersion);
    var where = inApp ? '独立 App' : '浏览器 / 微信';

    var h = '';

    // 当前状态
    h += '<div class="bk-info">'
      + '<b>当前数据</b><br>'
      + '打卡记录：<b>' + checks + '</b> 个<br>'
      + '笔记：<b>' + notes + '</b> 条<br>'
      + '首次快照：' + (snaps.length ? fmtTime(snaps[snaps.length - 1].t) : '—') + '<br>'
      + '最近快照：' + (snaps.length ? fmtTime(snaps[0].t) : '—')
      + '</div>';

    // 关键提醒：容器隔离
    h += '<div class="bk-warn">'
      + '<b>重要：数据只存在当前这个容器里</b><br>'
      + '你现在用的是「<b>' + where + '</b>」。<br>'
      + 'App 和微信/浏览器是两套独立存储，<b>互不相通</b>。<br>'
      + '在微信里打的勾，App 里看不到，反之也一样。<br>'
      + '<b>请固定用 App 打勾</b>，并每周导出一次备份。'
      + '</div>';

    // 操作
    h += '<div class="bk-sec">备份与恢复</div>';
    h += '<button class="bk-btn pri" id="bkExport">导出备份文件</button>';
    h += '<button class="bk-btn" id="bkImport">从文件导入</button>';
    h += '<div style="font-size:11px;color:#7c8699;line-height:1.75;margin:-3px 0 10px 2px">'
      + '导出的 .json 文件在手机「下载」目录里，可以发给自己或换设备时导入。'
      + '</div>';

    // 快照列表
    h += '<div class="bk-sec">自动快照（最近 ' + snaps.length + ' 份）</div>';
    if (!snaps.length) {
      h += '<div style="font-size:11.5px;color:#7c8699;padding:6px 0 12px">'
        + '还没有快照。你每打一次勾，系统会自动存一份。</div>';
    } else {
      snaps.forEach(function (s, i) {
        h += '<div class="bk-snap">'
          + '<div class="tm"><b>' + fmtTime(s.t) + '</b>'
          + s.checks + ' 个勾 · ' + s.keys + ' 项数据</div>'
          + '<button data-restore="' + i + '">恢复</button>'
          + '</div>';
      });
    }

    bodyEl.innerHTML = h;

    // 绑定
    document.getElementById('bkExport').addEventListener('click', function () {
      // 先存一份快照再导出
      takeSnapshot('manual');
      exportFile();
      say('已导出，去「下载」目录找');
      render();
    });

    document.getElementById('bkImport').addEventListener('click', function () {
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.json,application/json';
      inp.style.display = 'none';
      document.body.appendChild(inp);
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0];
        if (inp.parentNode) inp.parentNode.removeChild(inp);
        if (!f) return;
        importFile(f, function (err, incoming, pack) {
          if (err) { say(err.message, 3000); return; }
          var n = Object.keys(incoming).length;
          var c = countChecks(incoming);
          var d = new Date(pack.exportedAt || Date.now());
          ask('导入这份备份？',
            '导出时间：' + d.toLocaleString() + '\n'
            + '含 ' + n + ' 项数据，其中 ' + c + ' 个打卡记录\n\n'
            + '会与现有数据合并，不会覆盖你现有的勾。',
            '导入',
            function (ok) {
              if (!ok) return;
              takeSnapshot('before-import');
              var r = applyImport(incoming, true);
              render();
              say('已导入 ' + r.added + ' 项，刷新中…', 3000);
              setTimeout(function () { location.reload(); }, 1600);
            });
        });
      });
      inp.click();
    });

    bodyEl.querySelectorAll('[data-restore]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = +btn.dataset.restore;
        var s = getSnapshots()[i];
        if (!s) return;
        ask('恢复这个快照？',
          fmtTime(s.t) + ' ／ ' + s.checks + ' 个打卡记录\n\n'
          + '恢复后会覆盖当前数据，然后自动刷新。',
          '恢复',
          function (ok) {
            if (!ok) return;
            restore(i);
            say('已恢复，刷新中…', 2500);
            setTimeout(function () { location.reload(); }, 1200);
          });
      });
    });
  }

  function open() {
    if (!wrap) build();
    render();
    mask.classList.add('on');
    wrap.classList.add('on');
  }
  function close() {
    if (!mask) return;
    mask.classList.remove('on');
    wrap.classList.remove('on');
  }

  /* ---------------- 自绘确认框（不依赖 WebView 的 confirm） ---------------- */
  function ask(title, msg, okText, cb) {
    var m = document.createElement('div');
    m.className = 'bkdlg-mask on';
    m.innerHTML = '<div class="bkdlg">'
      + '<div class="tt">' + esc(title) + '</div>'
      + '<div class="ms">' + esc(msg) + '</div>'
      + '<div class="bt">'
      + '<button id="bkDlgNo">取消</button>'
      + '<button class="pri" id="bkDlgYes">' + esc(okText || '确定') + '</button>'
      + '</div></div>';
    document.body.appendChild(m);
    var done = false;
    function finish(v) {
      if (done) return;
      done = true;
      if (m.parentNode) m.parentNode.removeChild(m);
      cb(v);
    }
    m.querySelector('#bkDlgYes').addEventListener('click', function () { finish(true); });
    m.querySelector('#bkDlgNo').addEventListener('click', function () { finish(false); });
    m.addEventListener('click', function (e) {
      if (e.target === m) finish(false);
    });
  }

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------------- 提示条 ---------------- */
  var toastEl = null, toastTimer = null;
  function say(msg, ms) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.cssText = 'position:fixed;left:50%;bottom:100px;transform:translateX(-50%);'
        + 'z-index:10060;background:#243044;border:1px solid #38506e;color:#e8ebf2;'
        + 'font-size:12px;padding:10px 18px;border-radius:100px;max-width:84vw;'
        + 'text-align:center;line-height:1.6;box-shadow:0 6px 20px rgba(0,0,0,.5)';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.style.opacity = '0'; }, ms || 2000);
  }

  /* ---------------- 自动快照钩子 ---------------- */
  // 监视 localStorage 变化（同页内写入）
  var lastSig = '';
  function sig() {
    var d = grabAll();
    return countChecks(d) + '|' + Object.keys(d).length;
  }

  setInterval(function () {
    var s = sig();
    if (s !== lastSig) {
      lastSig = s;
      takeSnapshot('auto');
    }
  }, 4000);

  // 页面隐藏/关闭时再存一次
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) takeSnapshot('hide');
  });
  window.addEventListener('pagehide', function () { takeSnapshot('hide'); });

  /* ---------------- 启动检测：数据是否异常归零 ---------------- */
  function bootCheck() {
    var snaps = getSnapshots();
    if (!snaps.length) return;

    var best = snaps[0];
    var cur = countChecks(grabAll());

    // 当前为 0，但快照里有记录 → 说明数据丢了
    if (cur === 0 && best.checks >= 2) {
      setTimeout(function () {
        ask('打卡记录不见了',
          '最近一份快照（' + fmtTime(best.t) + '）里有 ' + best.checks + ' 个勾，'
          + '但现在一个都没有。\n\n'
          + '要恢复吗？点「取消」不会删任何东西，'
          + '之后也可以在「数据安全」里手动恢复。',
          '恢复',
          function (ok) {
            if (!ok) return;
            restore(0);
            location.reload();
          });
      }, 1500);
    }
  }

  /* ---------------- 对外接口 ---------------- */
  window.SBBK = {
    open: open,
    snapshot: takeSnapshot,
    exportFile: exportFile
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      takeSnapshot('boot');
      bootCheck();
    });
  } else {
    takeSnapshot('boot');
    bootCheck();
  }
})();

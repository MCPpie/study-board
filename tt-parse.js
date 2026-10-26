/* 课表文字解析 · tt-parse.js
   目标：把「粘进来的文字」准确变成课程对象，不依赖 AI。

   v3：改用「全行标记区间」方案
     · 在原始行上一次性找出 周次 / 星期 / 节次 的位置并标记
     · 合并重叠区间（防止一次内容被认成两种）
     · 从后往前切除（索引不前移，不会吃字）
     · 剩余文字按分隔符切开 → 课程名 + 教室

   关键修复（v2 的错误）：
     · 周次必须含「周」字，否则 "1-2" 会被当成周次而不是节次
     · 中文数字「第一节-第二节」需先全局去「第/节」
     · 支持无空格粘连「周一1-2」
*/
(function (global) {
  'use strict';

  var CN_NUM = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7,
    '八': 8, '九': 9, '十': 10, '十一': 11, '十二': 12, '十三': 13,
    '十四': 14, '十五': 15
  };

  function toNum(s) {
    s = String(s).trim();
    if (/^\d+$/.test(s)) return +s;
    if (CN_NUM[s] != null) return CN_NUM[s];
    return NaN;
  }

  var DAY_MAP = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7
  };

  /* ============ 1. 在行内找各类字段（返回区间） ============ */

  function findWeeks(line) {
    var m;
    // 1-16周 / 1-16单周 / 1-16周单
    m = line.match(/(\d{1,2})\s*[-~到至]\s*(\d{1,2})\s*([单双])?\s*周/);
    if (m) {
      return { start: m.index, end: m.index + m[0].length,
               weeks: m[1] + '-' + m[2] + (m[3] || '') };
    }
    // 1-16单（无周字但有单双）
    m = line.match(/(\d{1,2})\s*[-~]\s*(\d{1,2})\s*([单双])/);
    if (m) {
      return { start: m.index, end: m.index + m[0].length,
               weeks: m[1] + '-' + m[2] + m[3] };
    }
    // 第5周 / 5周
    m = line.match(/(\d{1,2})\s*周\s*([单双])?/);
    if (m) {
      return { start: m.index, end: m.index + m[0].length,
               weeks: m[1] + (m[2] || '') };
    }
    return null;
  }

  function findDay(line) {
    var m;
    m = line.match(/(?:周|星期|礼拜)\s*([一二三四五六日天1-7])/);
    if (m) {
      var k = m[1];
      var d = DAY_MAP[k] || +k;
      if (d >= 1 && d <= 7) {
        return { start: m.index, end: m.index + m[0].length, day: d };
      }
    }
    m = line.match(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i);
    if (m) {
      var dd = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 }[m[1].toLowerCase()];
      return { start: m.index, end: m.index + m[0].length, day: dd };
    }
    return null;
  }

  function findPeriods(line, occupied) {
    // 先把「第X节」的"第""节"在不改变长度的前提下当空白（用等长替换保索引）
    // 直接构造宽松正则即可
    var re = /第?\s*(\d{1,2}|[一二三四五六七八九十]{1,3})\s*节?\s*[-~到至]\s*第?\s*(\d{1,2}|[一二三四五六七八九十]{1,3})\s*节?/g;
    var m;
    while ((m = re.exec(line)) !== null) {
      var a = toNum(m[1]), b = toNum(m[2]);
      if (isNaN(a) || isNaN(b)) continue;
      if (a < 1 || b < 1 || a > 15 || b > 15) continue;
      // 不能与已占用区间重叠
      var s = m.index, e = m.index + m[0].length;
      if (overlaps(occupied, s, e)) continue;
      return { start: s, end: e, start2: Math.min(a, b), end2: Math.max(a, b) };
    }

    // 单节：第3节
    var re2 = /第?\s*(\d{1,2}|[一二三四五六七八九十]{1,3})\s*节/g;
    while ((m = re2.exec(line)) !== null) {
      var n = toNum(m[1]);
      if (isNaN(n) || n < 1 || n > 15) continue;
      var s2 = m.index, e2 = m.index + m[0].length;
      if (overlaps(occupied, s2, e2)) continue;
      return { start: s2, end: e2, start2: n, end2: n };
    }
    return null;
  }

  function overlaps(list, s, e) {
    for (var i = 0; i < list.length; i++) {
      if (s < list[i].end && e > list[i].start) return true;
    }
    return false;
  }

  /* ============ 2. 判定剩余 token 的类型 ============ */

  function asRoom(tok) {
    var t = String(tok).trim();
    if (!t) return false;
    if (/[楼室馆]|教室|实验室|中心|机房|校区/.test(t)) return true;
    if (/^[A-Za-z]{1,4}[-]?\d{2,4}[A-Za-z]?$/.test(t)) return true;
    if (/^\d{3,4}$/.test(t)) return true;
    return false;
  }

  /* ============ 3. 解析一行 ============ */

  function parseLine(raw) {
    var line = String(raw).trim();
    if (!line) return null;
    if (/^[-=_*·\s#]+$/.test(line)) return null;              // 分隔线

    var occupied = [];
    var weeks = '', day = null, period = null;

    // ① 周次（优先，因为含「周」字最明确）
    var w = findWeeks(line);
    if (w) { weeks = w.weeks; occupied.push({ start: w.start, end: w.end }); }

    // ② 星期
    var d = findDay(line);
    if (d) { day = d.day; occupied.push({ start: d.start, end: d.end }); }

    if (!day) return null;    // 没有星期就不是课程行

    // ③ 节次（避开已占用的区间）
    var p = findPeriods(line, occupied);
    if (p) { period = { start: p.start2, end: p.end2 }; occupied.push({ start: p.start, end: p.end }); }

    // ④ 切掉已识别的部分（合并重叠区间，从后往前切）
    occupied.sort(function (a, b) { return a.start - b.start; });
    var merged = [];
    occupied.forEach(function (o) {
      var last = merged[merged.length - 1];
      if (last && o.start <= last.end) {
        last.end = Math.max(last.end, o.end);
      } else {
        merged.push({ start: o.start, end: o.end });
      }
    });

    var rest = line;
    for (var i = merged.length - 1; i >= 0; i--) {
      rest = rest.slice(0, merged[i].start) + ' | ' + rest.slice(merged[i].end);
    }

    // ⑤ 剩余部分 → 课程名 + 教室
    var rawParts = rest.split(/[\t,，;；|、]+|\s{2,}/)
      .map(function (x) { return x.trim(); })
      .filter(function (x) { return x; });

    // 若还没认出节次，从纯数字 token 里拼（CSV: 电路,周一,1,2,302）
    var numeric = [];
    var parts = [];
    rawParts.forEach(function (x) {
      if (!period && /^\d{1,2}$/.test(x) && +x >= 1 && +x <= 15) {
        numeric.push(+x);
      } else {
        parts.push(x);
      }
    });
    if (!period && numeric.length >= 2) {
      period = { start: Math.min(numeric[0], numeric[1]), end: Math.max(numeric[0], numeric[1]) };
      numeric.slice(2).forEach(function (n) { parts.push(String(n)); });
    } else if (!period && numeric.length === 1) {
      period = { start: numeric[0], end: numeric[0] };
    } else if (!period && numeric.length) {
      numeric.forEach(function (n) { parts.push(String(n)); });
    } else if (numeric.length) {
      numeric.forEach(function (n) { parts.push(String(n)); });
    }

    // 如果没有分隔符，尝试按单空格切（但保留整体当名）
    if (parts.length === 1 && /\s/.test(parts[0])) {
      var sub = parts[0].split(/\s+/).filter(function (x) { return x; });
      // 只有明显是教室的才拆出来
      var roomIdx = -1;
      for (var j = sub.length - 1; j >= 1; j--) {
        if (asRoom(sub[j])) { roomIdx = j; break; }
      }
      if (roomIdx > 0) {
        parts = [sub.slice(0, roomIdx).join(' '), sub.slice(roomIdx).join(' ')];
      }
    }

    var name = '', room = '';
    parts.forEach(function (tk) {
      if (!room && asRoom(tk) && name) { room = tk; return; }
      if (!name && asRoom(tk) && parts.length > 1) { room = tk; return; }
      name = name ? (name + ' ' + tk) : tk;
    });

    // 粘连情况：「电子电路N544」
    if (!room && name) {
      var m3 = name.match(/^(.{2,}?)\s*([A-Za-z]?\d{2,4}|.{2,}[楼室馆][^\s]*)$/);
      if (m3) { name = m3[1].trim(); room = m3[2].trim(); }
    }

    name = name.replace(/\s+/g, ' ').trim();
    if (!name) return null;

    var st = period ? period.start : 1;
    var en = period ? period.end : st;

    return {
      name: name,
      teacher: '',
      room: room.trim(),
      day: day,
      start: st,
      end: en,
      weeks: weeks
    };
  }

  /* ============ 4. 整段解析 ============ */

  // 是不是表头 / 说明行（不算解析失败）
  function isHeader(t) {
    if (/^(周次|节次|时间|上午|下午|晚上|备注|教师|地点|课程表|课程名称|上课时间|任课教师)$/.test(t)) return true;
    if (/^(周次|节次|时间)[\s:：]/.test(t) && !/周[一二三四五六日天1-7]/.test(t)) return true;
    if (/^[\u4e00-\u9fa5]{2,6}$/.test(t)) return true;   // 纯短词，如单独一行「星期一」
    return false;
  }

  /* ============ 3.5 矩阵（表格）解析 ============
     教务系统 / 小程序复制出来最常见的是表格：
       节次   周一   周二   周三
       1-2节  电子电路 302      大学物理 101
       3-4节  离散数学 205  英语 语音室2
     每行一个节次，每列一天。  */

  // 整个 cell 就是「周一」
  function cellDay(c) {
    var t = String(c).trim();
    var m = t.match(/^(?:周|星期|礼拜)\s*([一二三四五六日天1-7])$/);
    if (!m) {
      m = t.match(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*$/i);
      if (m) {
        return { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 }[m[1].toLowerCase()];
      }
      return null;
    }
    var k = m[1];
    if (k === '日' || k === '天') return 7;
    return DAY_MAP[k] || +k;
  }

  // 整个 cell 就是「1-2节」
  function cellPeriod(c) {
    var t = String(c).trim().replace(/[第节]/g, '');
    var m = t.match(/^(\d{1,2}|[一二三四五六七八九十]{1,3})\s*[-~到至]\s*(\d{1,2}|[一二三四五六七八九十]{1,3})$/);
    if (m) {
      var a = toNum(m[1]), b = toNum(m[2]);
      if (!isNaN(a) && !isNaN(b)) return { start: Math.min(a, b), end: Math.max(a, b) };
    }
    m = t.match(/^(\d{1,2}|[一二三四五六七八九十]{1,3})$/);
    if (m) {
      var n = toNum(m[1]);
      if (!isNaN(n) && n >= 1 && n <= 15) return { start: n, end: n };
    }
    return null;
  }

  // 「电子电路 明理楼302」→ 名 + 室
  function splitNameRoom(txt) {
    var t = String(txt).trim();
    if (!t) return { name: '', room: '', weeks: '' };

    var weeks = '';
    var mw = t.match(/[(（]?\s*(\d{1,2})\s*[-~]\s*(\d{1,2})\s*([单双])?\s*周?\s*[)）]?/);
    if (mw) {
      weeks = mw[1] + '-' + mw[2] + (mw[3] || '');
      t = (t.slice(0, mw.index) + ' ' + t.slice(mw.index + mw[0].length)).trim();
    }

    // 按空白切
    var sub = t.split(/[\s\u3000]+/).filter(function (x) { return x; });
    if (sub.length === 1) {
      // 粘连：「电子电路N544」
      var m2 = sub[0].match(/^(.{2,}?)\s*([A-Za-z]?\d{2,4}|.{2,}[楼室馆][^\s]*)$/);
      if (m2) return { name: m2[1].trim(), room: m2[2].trim(), weeks: weeks };
      return { name: sub[0], room: '', weeks: weeks };
    }

    // 最后一段像教室 → 拆出来
    var last = sub[sub.length - 1];
    if (asRoom(last)) {
      return { name: sub.slice(0, -1).join(' '), room: last, weeks: weeks };
    }
    return { name: sub.join(' '), room: '', weeks: weeks };
  }

  function parseMatrix(text) {
    var lines = String(text || '').split(/\r?\n/);
    var headerIdx = -1;
    var colDay = {};

    // 找表头行：含 >=2 个「周X」单元格
    for (var i = 0; i < lines.length; i++) {
      var cells = lines[i].split('\t');
      if (cells.length < 2) continue;
      var found = [];
      for (var j = 0; j < cells.length; j++) {
        var d = cellDay(cells[j]);
        if (d) found.push({ col: j, day: d });
      }
      if (found.length >= 2) {
        headerIdx = i;
        found.forEach(function (x) { colDay[x.col] = x.day; });
        break;
      }
    }

    if (headerIdx < 0) return null;   // 不是矩阵格式

    var out = [];
    for (var r = headerIdx + 1; r < lines.length; r++) {
      var cs = lines[r].split('\t');
      if (cs.length < 2) continue;

      var per = cellPeriod(cs[0]);
      if (!per) {
        // 第一列可能不是节次（比如含日期），跳过这行
        continue;
      }

      for (var c = 1; c < cs.length; c++) {
        var day = colDay[c];
        if (!day) continue;
        var txt = cs[c].trim();
        if (!txt) continue;

        // 一个格子里可能塞两门课（换行被压平），先按常见分隔拆
        var segs = txt.split(/[\n；;]+/).filter(function (x) { return x.trim(); });
        segs.forEach(function (seg) {
          var nr = splitNameRoom(seg);
          if (!nr.name) return;
          out.push({
            name: nr.name,
            teacher: '',
            room: nr.room,
            day: day,
            start: per.start,
            end: per.end,
            weeks: nr.weeks
          });
        });
      }
    }

    return out.length ? out : null;
  }

  /* ============ 4. 整段解析 ============ */
  function parseText(text) {
    // ① 先试矩阵（表格粘贴最常见）
    var matrix = parseMatrix(text);
    var out = [];
    var failed = [];

    if (matrix) {
      out = matrix;
    } else {
      // ② 退回到「一行一门课」
      var lines = String(text || '').split(/\r?\n/);
      lines.forEach(function (raw) {
        var t = raw.trim();
        if (!t) return;
        var c = parseLine(t);
        if (c) out.push(c);
        else if (t.length >= 3 && !isHeader(t)) failed.push(t);
      });
    }

    var merged = [];
    out.forEach(function (c) {
      var hit = null;
      for (var i = 0; i < merged.length; i++) {
        var m = merged[i];
        if (m.name === c.name && m.day === c.day && m.room === c.room
            && m.weeks === c.weeks
            && c.start <= m.end + 1 && c.end >= m.start - 1) { hit = m; break; }
      }
      if (hit) {
        hit.start = Math.min(hit.start, c.start);
        hit.end = Math.max(hit.end, c.end);
      } else {
        merged.push({
          name: c.name, teacher: c.teacher, room: c.room,
          day: c.day, start: c.start, end: c.end, weeks: c.weeks
        });
      }
    });

    merged.sort(function (a, b) { return a.day - b.day || a.start - b.start; });

    return { courses: merged, failed: failed, total: out.length };
  }

  global.TTParse = { parseText: parseText, parseLine: parseLine };
})(window);

/* 问 AI · 文档内嵌问答
   依赖：reader.js 已加载（提供底栏样式基础）
   特点：自动带上「当前文档 + 当前读到的那一段」作为上下文，回答有的放矢。 */
(function () {
  'use strict';

  /* ---------------- 配置 ---------------- */
  var CFG_KEY = 'sb-ai-cfg';
  var DEFAULT_CFG = {
    base: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
    key: ''
  };

  function getCfg() {
    try {
      var raw = localStorage.getItem(CFG_KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_CFG));
      var o = JSON.parse(raw);
      return {
        base: o.base || DEFAULT_CFG.base,
        model: o.model || DEFAULT_CFG.model,
        key: o.key || ''
      };
    } catch (e) {
      return JSON.parse(JSON.stringify(DEFAULT_CFG));
    }
  }
  function setCfg(c) {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) {}
  }

  /* ---------------- 样式 ---------------- */
  var CSS = ''
  + '.askmask{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10010;display:none}'
  + '.askmask.on{display:block}'
  + '.askwrap{position:fixed;left:0;right:0;bottom:0;z-index:10011;background:#141821;'
  + 'border-radius:16px 16px 0 0;border-top:1px solid #333b4d;'
  + 'max-height:86vh;display:flex;flex-direction:column;'
  + 'transform:translateY(100%);transition:transform .26s cubic-bezier(.3,.9,.3,1)}'
  + '.askwrap.on{transform:translateY(0)}'
  + '.askhd{padding:13px 15px 10px;border-bottom:1px solid #272d3a;display:flex;align-items:center;gap:9px;flex:0 0 auto}'
  + '.askhd b{font-size:13px;color:#e8ebf2;font-weight:700}'
  + '.askhd .m{margin-left:auto;font-size:10.5px;color:#7c8699}'
  + '.askhd .cfg{border:none;background:none;color:#7c8699;font-size:15px;padding:2px 4px;font-family:inherit}'
  + '.askctx{margin:0;padding:9px 15px;background:rgba(56,208,216,.055);'
  + 'border-bottom:1px solid #272d3a;font-size:10.5px;color:#8f99ab;line-height:1.55;flex:0 0 auto;'
  + 'max-height:76px;overflow:hidden;position:relative}'
  + '.askctx b{color:#38d0d8;font-weight:700}'
  + '.askbody{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:13px 15px 8px;'
  + 'min-height:130px}'
  + '.askempty{font-size:12.5px;color:#7c8699;line-height:1.9;padding:6px 0}'
  + '.askempty b{color:#aab3c4}'
  + '.qa{margin-bottom:14px}'
  + '.qa .q{background:#1e2431;border-radius:11px 11px 4px 11px;padding:9px 12px;'
  + 'font-size:12.5px;color:#dbe2ee;line-height:1.65;margin-bottom:8px;'
  + 'margin-left:38px;word-break:break-word}'
  + '.qa .a{background:#181d28;border:1px solid #272d3a;border-radius:11px 11px 11px 4px;'
  + 'padding:11px 13px;font-size:12.5px;color:#c3cbd9;line-height:1.8;'
  + 'margin-right:26px;word-break:break-word;white-space:pre-wrap}'
  + '.qa .a.err{border-color:rgba(255,122,122,.35);color:#ffb4b4}'
  + '.qa .a .cursor{display:inline-block;width:6px;height:13px;background:#38d0d8;'
  + 'vertical-align:-2px;animation:askblink .9s steps(1) infinite}'
  + '@keyframes askblink{50%{opacity:0}}'
  + '.askin{flex:0 0 auto;border-top:1px solid #272d3a;padding:10px 13px;'
  + 'padding-bottom:calc(10px + env(safe-area-inset-bottom));display:flex;gap:8px;align-items:flex-end;'
  + 'background:#141821}'
  + '.askin textarea{flex:1;background:#1e2431;border:1px solid #333b4d;border-radius:11px;'
  + 'padding:9px 12px;color:#e8ebf2;font-size:13px;font-family:inherit;line-height:1.6;'
  + 'resize:none;max-height:92px;min-height:40px}'
  + '.askin textarea:focus{outline:none;border-color:rgba(56,208,216,.45)}'
  + '.askin button{flex:0 0 52px;height:40px;border-radius:11px;border:none;'
  + 'background:#38d0d8;color:#08131a;font-size:13px;font-weight:700;font-family:inherit}'
  + '.askin button:disabled{opacity:.4}'
  + '.askcfg{padding:16px 15px 22px;overflow-y:auto}'
  + '.askcfg label{display:block;font-size:11.5px;color:#7c8699;margin:0 0 6px 2px;font-weight:600}'
  + '.askcfg input{width:100%;background:#1e2431;border:1px solid #333b4d;border-radius:10px;'
  + 'padding:10px 12px;color:#e8ebf2;font-size:12.5px;font-family:inherit;margin-bottom:14px}'
  + '.askcfg input:focus{outline:none;border-color:rgba(56,208,216,.45)}'
  + '.askcfg .tip{font-size:11.5px;color:#7c8699;line-height:1.85;margin-bottom:16px}'
  + '.askcfg .tip b{color:#aab3c4}'
  + '.askcfg .tip a{color:#38d0d8;text-decoration:none}'
  + '.askcfg .row{display:flex;gap:9px}'
  + '.askcfg .row button{flex:1;height:42px;border-radius:11px;font-family:inherit;'
  + 'font-size:13px;font-weight:600;border:1px solid #333b4d;background:#1e2431;color:#e8ebf2}'
  + '.askcfg .row button.pri{background:rgba(56,208,216,.14);border-color:rgba(56,208,216,.42);color:#38d0d8}';

  var st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);

  /* ---------------- 骨架 ---------------- */
  var mask = document.createElement('div');
  mask.className = 'askmask';
  document.body.appendChild(mask);

  var wrap = document.createElement('div');
  wrap.className = 'askwrap';
  wrap.innerHTML = ''
    + '<div class="askhd"><b>问 AI</b><span class="m" id="askModel"></span>'
    + '<button class="cfg" id="askCfgBtn" title="设置">⚙</button></div>'
    + '<div class="askctx" id="askCtx"></div>'
    + '<div class="askbody" id="askBody"></div>'
    + '<div class="askin" id="askIn">'
    + '<textarea id="askTa" rows="1" placeholder="这一段看不懂？直接问…"></textarea>'
    + '<button id="askSend">发送</button></div>';
  document.body.appendChild(wrap);

  var bodyEl = document.getElementById('askBody');
  var ctxEl = document.getElementById('askCtx');
  var taEl = document.getElementById('askTa');
  var sendBtn = document.getElementById('askSend');
  var inEl = document.getElementById('askIn');
  var modelEl = document.getElementById('askModel');

  /* ---------------- 上下文提取 ---------------- */
  function grabContext() {
    var docTitle = (document.querySelector('h1') ? document.querySelector('h1').textContent : document.title)
      .replace(/\s+/g, ' ').trim().slice(0, 60);

    // 找视口中心附近最近的段落容器
    var cands = [].slice.call(document.querySelectorAll('.step, section, .card, .f'));
    var mid = window.pageYOffset + window.innerHeight * 0.42;
    var best = null, bestDist = Infinity;
    cands.forEach(function (el) {
      var r = el.getBoundingClientRect();
      var top = r.top + window.pageYOffset;
      var h = r.height || 1;
      // 段落覆盖区域与 mid 的距离
      var d;
      if (mid >= top && mid <= top + h) d = 0;
      else d = Math.min(Math.abs(mid - top), Math.abs(mid - (top + h)));
      if (d < bestDist) { bestDist = d; best = el; }
    });

    var snippet = '';
    var label = '';
    if (best) {
      // 优先取小节标题
      var h = best.querySelector('.step-p') || best.querySelector('h2') || best.querySelector('h3');
      if (h) label = h.textContent.replace(/\s+/g, ' ').trim();
      snippet = best.textContent.replace(/\s+/g, ' ').trim().slice(0, 900);
    }
    if (!snippet) {
      snippet = document.body.textContent.replace(/\s+/g, ' ').trim().slice(0, 900);
    }

    return { doc: docTitle, label: label, snippet: snippet };
  }

  var CTX = null;

  function renderCtx() {
    CTX = grabContext();
    var s = '<b>正在读：</b>' + esc(CTX.doc);
    if (CTX.label) s += ' · ' + esc(CTX.label);
    ctxEl.innerHTML = s;
  }

  /* ---------------- 对话 ---------------- */
  var history = [];   // {role, content}

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function addQA(q) {
    var d = document.createElement('div');
    d.className = 'qa';
    d.innerHTML = '<div class="q">' + esc(q) + '</div>'
      + '<div class="a" id="a-' + Date.now() + '"><span class="cursor"></span></div>';
    bodyEl.appendChild(d);
    bodyEl.scrollTop = bodyEl.scrollHeight;
    return d.querySelector('.a');
  }

  function buildMessages(q) {
    var sys = '你是一位耐心的工科学习助教，正在帮一名大二学生（计算机专业）理解课程材料。\n'
      + '回答要求：\n'
      + '1. 直接给答案，不要寒暄、不要说"好问题"这类客套话。\n'
      + '2. 用具体、口语化的中文解释，避免堆砌术语；必须用术语时立刻用大白话解释一遍。\n'
      + '3. 涉及公式或计算时，把每一步写清楚，不要跳步。\n'
      + '4. 如果学生的问题基于原文的误解，先指出误解在哪，再解释正确的。\n'
      + '5. 篇幅控制在 350 字以内，必要时用短列表。\n'
      + '6. 如果材料里没有足够信息回答，就直说"这段材料里没有"，再补充通用知识。';

    var ctxMsg = '【当前阅读材料】\n'
      + '文档：《' + CTX.doc + '》\n'
      + (CTX.label ? '小节：' + CTX.label + '\n' : '')
      + '内容：' + CTX.snippet;

    var msgs = [{ role: 'system', content: sys }];
    // 只保留最近 6 轮，控制 token
    var recent = history.slice(-12);
    msgs = msgs.concat(recent);
    msgs.push({ role: 'system', content: ctxMsg });
    msgs.push({ role: 'user', content: q });
    return msgs;
  }

  function ask(q) {
    var cfg = getCfg();
    if (!cfg.key) { openCfg(); return; }

    addQA(q);
    history.push({ role: 'user', content: q });

    var aEl = bodyEl.querySelector('.qa:last-child .a');
    var buffer = '';
    var done = false;

    sendBtn.disabled = true;

    var payload = {
      model: cfg.model,
      messages: buildMessages(q),
      stream: true,
      temperature: 0.4,
      max_tokens: 900
    };

    fetch(cfg.base, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.key
      },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error('HTTP ' + res.status + (t ? ' · ' + t.slice(0, 160) : ''));
        });
      }
      if (!res.body || !res.body.getReader) {
        // 不支持流式：退回整段
        return res.json().then(function (j) {
          buffer = (j.choices && j.choices[0] && j.choices[0].message.content) || '';
          aEl.textContent = buffer;
          history.push({ role: 'assistant', content: buffer });
          done = true;
        });
      }

      var reader = res.body.getReader();
      var dec = new TextDecoder('utf-8');
      var tail = '';

      function pump() {
        return reader.read().then(function (r) {
          if (r.done) {
            finish();
            return;
          }
          tail += dec.decode(r.value, { stream: true });
          var lines = tail.split('\n');
          tail = lines.pop();               // 留最后不完整的一行
          lines.forEach(function (ln) {
            ln = ln.trim();
            if (!ln || ln.indexOf('data:') !== 0) return;
            var d = ln.slice(5).trim();
            if (d === '[DONE]') { finish(); return; }
            try {
              var j = JSON.parse(d);
              var c = j.choices && j.choices[0];
              if (c && c.delta && c.delta.content) {
                buffer += c.delta.content;
                aEl.textContent = buffer;
                bodyEl.scrollTop = bodyEl.scrollHeight;
              }
            } catch (e) {}
          });
          if (!done) return pump();
        });
      }

      function finish() {
        if (done) return;
        done = true;
        if (buffer) {
          aEl.textContent = buffer;
          history.push({ role: 'assistant', content: buffer });
        } else {
          aEl.innerHTML = '<span style="color:#7c8699">（没有返回内容）</span>';
        }
        sendBtn.disabled = false;
      }

      return pump();
    }).catch(function (err) {
      var msg = String(err && err.message || err);
      var hint = '';
      if (/HTTP 401|unauthorized/i.test(msg)) hint = '\n\nAPI Key 不对，点右上角 ⚙ 重新填。';
      else if (/HTTP 402|insufficient|balance/i.test(msg)) hint = '\n\n账户余额不足，去平台充值。';
      else if (/HTTP 429|rate/i.test(msg)) hint = '\n\n请求太快了，等一会儿再问。';
      else if (/Failed to fetch|NetworkError/i.test(msg)) hint = '\n\n网络不通，或者接口地址填错了。';
      aEl.className = 'a err';
      aEl.textContent = '出错了：' + msg + hint;
      sendBtn.disabled = false;
    });
  }

  /* ---------------- 设置面板 ---------------- */
  function openCfg() {
    var cfg = getCfg();
    bodyEl.innerHTML = ''
      + '<div class="askcfg">'
      + '<div class="tip">'
      + '<b>这里用的是你自己的 AI 接口。</b><br>'
      + '推荐 DeepSeek：<a href="https://platform.deepseek.com/api_keys" target="_blank">platform.deepseek.com</a> '
      + '注册后在「API keys」里创建一个，复制 <b>sk-</b> 开头的字符串粘到下面。<br>'
      + '充 10 块钱大约能问几千次。<br>'
      + 'Key 只存在这台手机上，不会上传到任何服务器。'
      + '</div>'
      + '<label>API Key</label>'
      + '<input id="cfgKey" type="password" placeholder="sk-..." value="' + esc(cfg.key) + '">'
      + '<label>接口地址</label>'
      + '<input id="cfgBase" placeholder="https://api.deepseek.com/chat/completions" value="' + esc(cfg.base) + '">'
      + '<label>模型</label>'
      + '<input id="cfgModel" placeholder="deepseek-chat" value="' + esc(cfg.model) + '">'
      + '<div class="row"><button id="cfgCancel">取消</button>'
      + '<button class="pri" id="cfgSave">保存</button></div>'
      + '</div>';
    inEl.style.display = 'none';
    ctxEl.style.display = 'none';

    document.getElementById('cfgCancel').addEventListener('click', closeCfg);
    document.getElementById('cfgSave').addEventListener('click', function () {
      var k = document.getElementById('cfgKey').value.trim();
      var b = document.getElementById('cfgBase').value.trim() || DEFAULT_CFG.base;
      var m = document.getElementById('cfgModel').value.trim() || DEFAULT_CFG.model;
      setCfg({ key: k, base: b, model: m });
      closeCfg();
      syncModelLabel();
      if (k) {
        say('已保存，可以开始提问了');
      }
    });
  }

  function closeCfg() {
    inEl.style.display = '';
    ctxEl.style.display = '';
    renderBody();
  }

  function syncModelLabel() {
    var c = getCfg();
    modelEl.textContent = c.key ? c.model : '未配置';
  }

  /* ---------------- 空态 ---------------- */
  var CHIPS = ['这段没看懂', '帮我举个例子', '和上一段什么关系', '考试会怎么考'];

  function renderBody() {
    var cfg = getCfg();
    if (!cfg.key) {
      bodyEl.innerHTML = '<div class="askempty">'
        + '<b>还没配置 AI 接口。</b><br>'
        + '点右上角 <b>⚙</b> 填一个 API Key 就能用了。<br><br>'
        + '配置好之后，你可以直接问：<br>'
        + '· 这一段在讲什么<br>'
        + '· 这个公式为什么这么写<br>'
        + '· 帮我举个具体例子<br>'
        + '· 和上一节什么关系'
        + '</div>';
      return;
    }
    if (!history.length) {
      var h = '<div class="askempty"><b>可以直接问，我会带上你正在看的内容。</b><br>'
        + '比如：</div>';
      bodyEl.innerHTML = h + '';
      CHIPS.forEach(function (c) {
        var b = document.createElement('button');
        b.textContent = c;
        b.style.cssText = 'display:inline-block;margin:0 7px 7px 0;padding:7px 12px;'
          + 'border-radius:9px;border:1px solid #333b4d;background:#1e2431;'
          + 'color:#aab3c4;font-size:12px;font-family:inherit';
        b.addEventListener('click', function () {
          taEl.value = c;
          sendBtn.click();
        });
        bodyEl.appendChild(b);
      });
    }
  }

  /* ---------------- 交互 ---------------- */
  function open() {
    renderCtx();
    syncModelLabel();
    renderBody();
    mask.classList.add('on');
    wrap.classList.add('on');
  }
  function close() {
    mask.classList.remove('on');
    wrap.classList.remove('on');
    if (bodyEl.querySelector('.askcfg')) closeCfg();
  }

  mask.addEventListener('click', close);

  document.getElementById('askCfgBtn').addEventListener('click', function () {
    if (bodyEl.querySelector('.askcfg')) closeCfg();
    else openCfg();
  });

  taEl.addEventListener('input', function () {
    taEl.style.height = 'auto';
    taEl.style.height = Math.min(92, taEl.scrollHeight) + 'px';
  });

  taEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });

  sendBtn.addEventListener('click', function () {
    var q = taEl.value.trim();
    if (!q) return;
    if (!getCfg().key) { openCfg(); return; }
    taEl.value = '';
    taEl.style.height = 'auto';
    // 清掉空态
    var em = bodyEl.querySelector('.askempty');
    if (em) bodyEl.innerHTML = '';
    ask(q);
  });

  /* ---------------- 底栏按钮 ---------------- */
  function injectBtn() {
    var nav = document.querySelector('.sbr-nav');
    if (!nav || nav.querySelector('#sbrBtnAsk')) return;

    var b = document.createElement('button');
    b.id = 'sbrBtnAsk';
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.9 8.9 0 01-4-.9L3 21l1.9-4.9A8.4 8.4 0 013 11.5a8.4 8.4 0 019-8.4 8.4 8.4 0 019 8.4z"/></svg>'
      + '<span>问</span>';
    b.addEventListener('click', open);
    nav.appendChild(b);

    // 底栏已有 3 个按钮，改成 4 列均分
    nav.style.display = 'flex';
    [].slice.call(nav.children).forEach(function (c) {
      c.style.flex = '1 1 0';
      c.style.minWidth = '0';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBtn);
  } else {
    injectBtn();
  }
  // reader.js 是 defer，可能晚于本脚本注入底栏，补一次
  window.addEventListener('load', injectBtn);
  setTimeout(injectBtn, 400);
})();

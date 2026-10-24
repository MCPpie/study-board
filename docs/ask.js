/* 问 AI · 文档内嵌问答
   依赖：reader.js 已加载（提供底栏样式基础）
   特点：自动带上「当前文档 + 当前读到的那一段」作为上下文，回答有的放矢。 */
(function () {
  'use strict';

  /* ---------------- 配置 ---------------- */
  var CFG_KEY = 'sb-ai-cfg';

  // 各服务商预设。model 提示里的 {} 会在界面上做说明
  var PROVIDERS = {
    deepseek: {
      name: 'DeepSeek',
      base: 'https://api.deepseek.com/chat/completions',
      model: 'deepseek-chat',
      modelHint: '模型名，一般填 deepseek-chat 就行',
      keyPage: 'https://platform.deepseek.com/api_keys',
      steps: [
        '打开 platform.deepseek.com/api_keys',
        '注册（手机号即可）',
        '点「创建 API key」',
        '复制 <b>sk-</b> 开头那串'
      ],
      note: '充 10 块钱够问几千次。'
    },
    doubao: {
      name: '豆包',
      base: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
      model: '',
      modelHint: '这里要填「接入点 ID」，不是模型名',
      keyPage: 'https://console.volcengine.com/ark',
      steps: [
        '打开 console.volcengine.com/ark（火山方舟）',
        '左侧「在线推理」→「创建推理接入点」',
        '选一个豆包模型，创建后得到 <b>ep-</b> 开头的 ID',
        '左侧「API Key 管理」→ 创建一个，复制'
      ],
      note: '豆包的「模型」要填 <b>ep-</b> 开头的接入点 ID，不是 doubao-pro-32k 这种名字。<br>'
          + '<span style="color:#ffc48a">豆包本身能用（配置对了就能正常回答），'
          + '但它有个缺陷：<b>出错时不返回跨域头</b>，'
          + '所以配错时 App 里只会显示「Failed to fetch」，看不到具体原因。'
          + '想排查就去火山方舟控制台用「在线调试」跑一次，那里能看到真实报错。</span>'
    },
    custom: {
      name: '自定义',
      base: '',
      model: '',
      modelHint: '按你的服务商文档填',
      keyPage: '',
      steps: ['填你所用服务商的接口地址和模型名'],
      note: '支持任何兼容 OpenAI 格式的接口（如硅基流动、Kimi、通义等）。'
    }
  };

  var DEFAULT_CFG = {
    provider: 'deepseek',
    base: PROVIDERS.deepseek.base,
    model: PROVIDERS.deepseek.model,
    key: ''
  };

  function getCfg() {
    var d = JSON.parse(JSON.stringify(DEFAULT_CFG));
    try {
      var raw = localStorage.getItem(CFG_KEY);
      if (!raw) return d;
      var o = JSON.parse(raw);
      return {
        provider: o.provider || d.provider,
        base: o.base || d.base,
        model: o.model || '',
        key: o.key || '',
        think: o.think === true      // 深度思考，默认关闭
      };
    } catch (e) {
      return d;
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
  + '.askhd .cfg.on{color:#38d0d8;text-shadow:0 0 8px rgba(56,208,216,.6)}'
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
  + '.asktoast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%) translateY(10px);'
  + 'z-index:10020;background:#243044;border:1px solid #38506e;color:#e8ebf2;font-size:12px;'
  + 'padding:9px 16px;border-radius:100px;opacity:0;transition:opacity .2s,transform .2s;'
  + 'pointer-events:none;white-space:nowrap;box-shadow:0 6px 20px rgba(0,0,0,.45)}'
  + '.asktoast.on{opacity:1;transform:translateX(-50%) translateY(0)}'
  + '.askcfg .prov{display:flex;gap:7px;margin-bottom:14px;flex-wrap:wrap}'
  + '.askcfg .prov button{padding:8px 15px;border-radius:9px;border:1px solid #333b4d;'
  + 'background:#1e2431;color:#7c8699;font-size:12.5px;font-family:inherit}'
  + '.askcfg .prov button.on{border-color:rgba(56,208,216,.45);background:rgba(56,208,216,.12);'
  + 'color:#38d0d8;font-weight:700}'
  + '.askcfg .row{display:flex;gap:9px;position:sticky;bottom:0;background:#141821;'
  + 'padding:10px 0 calc(4px + env(safe-area-inset-bottom));margin-top:-4px}'
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
    + '<button class="cfg" id="askThinkBtn" title="深度思考">🧠</button>'
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

  var toastEl = null, toastTimer = null;
  function say(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'asktoast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, 1800);
  }

  // 豆包（火山方舟）的报错响应不带跨域头，浏览器只能拿到 Failed to fetch，
  // 所以必须单独提示，否则会被误判成「网络不通」。
  function isVolces(base) {
    return /volces\.com|volcengine/i.test(base || '');
  }

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
      max_tokens: cfg.think ? 4000 : 1200
    };

    if (cfg.think) {
      // 深度思考：交给模型自己推理，不能传 temperature
      payload.thinking = { type: 'enabled' };
      payload.reasoning_effort = 'high';
    } else {
      // 默认：直接回答，快且省
      payload.thinking = { type: 'disabled' };
      payload.temperature = 0.4;
    }

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
      if (/HTTP 401|unauthorized/i.test(msg)) hint = 'API Key 不对，点右上角 ⚙ 重新填。';
      else if (/HTTP 402|insufficient|balance/i.test(msg)) hint = '账户余额不足，去平台充值。';
      else if (/HTTP 404|not found|NotFound|model/i.test(msg)) hint = '模型名或接入点 ID 不对，检查一下。';
      else if (/HTTP 429|rate/i.test(msg)) hint = '请求太快了，等一会儿再问。';
      else if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
        if (isVolces(cfg.base)) {
          hint = '豆包本身能用，但它出错时不返回跨域头，\n'
               + '浏览器拿不到错误内容，只能显示 Failed to fetch。\n'
               + '所以这多半是配置问题，不是网络断：\n'
               + '① API Key 复制不完整，或不属于这个账号\n'
               + '② 模型栏没填 ep- 开头的接入点 ID\n'
               + '③ 接入点还没创建好，或模型没开通\n'
               + '想看到真实报错：去火山方舟控制台的「在线调试」跑一次，\n'
               + '或者先用 DeepSeek 顶着。';
        } else {
          hint = '请求没能发出去。\n'
               + '① 手机没联网，或校园网需要先登录\n'
               + '② 接口地址填错了\n'
               + '③ 当前网络屏蔽了这个域名\n'
               + '点右上角 ⚙ →「测试连接」可以看详细原因。';
        }
      }
      aEl.className = 'a err';
      aEl.textContent = '出错了：' + msg
        + (hint ? '\n\n' + hint : '')
        + '\n\n（接口地址：' + cfg.base + '）';
      sendBtn.disabled = false;
    });
  }

  /* ---------------- 设置面板 ---------------- */
  var curProv = 'deepseek';

  function openCfg() {
    var cfg = getCfg();
    curProv = cfg.provider || 'deepseek';
    if (!PROVIDERS[curProv]) curProv = 'deepseek';

    bodyEl.innerHTML = ''
      + '<div class="askcfg">'
      + '<div class="tip"><b>这里用的是你自己的 AI 接口，Key 只存在这台手机上。</b></div>'
      + '<label>服务商</label>'
      + '<div class="prov" id="cfgProv"></div>'
      + '<div id="cfgGuide"></div>'
      + '<label>API Key</label>'
      + '<input id="cfgKey" type="password" placeholder="粘贴你的 key" value="' + esc(cfg.key) + '">'
      + '<label>接口地址</label>'
      + '<input id="cfgBase" value="' + esc(cfg.base) + '">'
      + '<label>模型 <span id="cfgModelWhat" style="color:#7c8699;font-weight:400">'
      + esc(PROVIDERS[curProv].modelHint) + '</span></label>'
      + '<input id="cfgModel" placeholder="' + esc(PROVIDERS[curProv].model) + '" value="' + esc(cfg.model) + '">'
      + '<button id="cfgTest" style="display:block;width:100%;height:42px;margin:4px 0 12px;'
      + 'border-radius:11px;border:1px solid #333b4d;background:#1e2431;color:#aab3c4;'
      + 'font-size:13px;font-family:inherit">测试连接</button>'
      + '<div id="cfgTestOut" style="display:none;font-size:11.5px;line-height:1.85;'
      + 'color:#aab3c4;background:#0f131b;border:1px solid #272d3a;border-radius:10px;'
      + 'padding:11px 13px;margin-bottom:12px;white-space:pre-wrap;word-break:break-all"></div>'
      + '<div class="row"><button id="cfgCancel">取消</button>'
      + '<button class="pri" id="cfgSave">保存</button></div>'
      + '</div>';
    inEl.style.display = 'none';
    ctxEl.style.display = 'none';

    renderProvTabs(cfg);

    document.getElementById('cfgTest').addEventListener('click', function () {
      runTest();
    });

    document.getElementById('cfgCancel').addEventListener('click', closeCfg);
    document.getElementById('cfgSave').addEventListener('click', function () {
      var k = document.getElementById('cfgKey').value.trim();
      var b = document.getElementById('cfgBase').value.trim();
      var m = document.getElementById('cfgModel').value.trim();
      var pv = PROVIDERS[curProv];
      if (!b) b = pv.base;
      if (curProv !== 'custom' && !m) m = pv.model;

      if (!k) { say('Key 不能空着'); return; }
      if (!m) { say('模型 / 接入点 ID 不能空着'); return; }
      if (!b) { say('接口地址不能空着'); return; }

      setCfg({ provider: curProv, key: k, base: b, model: m });
      closeCfg();
      syncModelLabel();
      say('已保存，可以开始提问了');
    });
  }

  function renderProvTabs(cfg) {
    var box = document.getElementById('cfgProv');
    if (!box) return;
    box.innerHTML = '';
    Object.keys(PROVIDERS).forEach(function (k) {
      var pv = PROVIDERS[k];
      var b = document.createElement('button');
      b.textContent = pv.name;
      if (k === curProv) b.className = 'on';
      b.addEventListener('click', function () {
        curProv = k;
        var baseEl = document.getElementById('cfgBase');
        var modelEl2 = document.getElementById('cfgModel');
        var whatEl = document.getElementById('cfgModelWhat');
        if (baseEl) baseEl.value = pv.base;
        if (modelEl2) { modelEl2.value = pv.model; modelEl2.placeholder = pv.model; }
        if (whatEl) whatEl.textContent = pv.modelHint;
        [].slice.call(box.children).forEach(function (x) {
          x.className = (x === b) ? 'on' : '';
        });
        renderGuide();
      });
      box.appendChild(b);
    });
    renderGuide();
  }

  function renderGuide() {
    var el = document.getElementById('cfgGuide');
    if (!el) return;
    var pv = PROVIDERS[curProv];
    var h = '<div class="tip" style="margin-top:10px">';
    h += '<b>怎么拿到 Key</b><br>';
    pv.steps.forEach(function (st, i) {
      h += (i + 1) + '. ' + st + '<br>';
    });
    if (pv.note) h += '<br>' + pv.note;
    if (pv.keyPage) {
      h += '<br><a href="' + pv.keyPage + '" target="_blank">打开 ' + pv.keyPage.replace(/^https?:\/\//, '').split('/')[0] + ' ›</a>';
    }
    h += '</div>';
    el.innerHTML = h;
  }

  function runTest() {
    var out = document.getElementById('cfgTestOut');
    var btn = document.getElementById('cfgTest');
    if (!out || !btn) return;

    var key = (document.getElementById('cfgKey').value || '').trim();
    var base = (document.getElementById('cfgBase').value || '').trim();
    var model = (document.getElementById('cfgModel').value || '').trim();

    var lines = [];
    function show(color) {
      out.style.display = 'block';
      out.style.color = color || '#aab3c4';
      out.textContent = lines.join('\n');
    }

    lines.push('① 检查表单');
    if (!key) { lines.push('   ✗ API Key 是空的'); show('#ff9d9d'); return; }
    if (!base) { lines.push('   ✗ 接口地址是空的'); show('#ff9d9d'); return; }
    if (!model) { lines.push('   ✗ 模型 / 接入点 ID 是空的'); show('#ff9d9d'); return; }
    if (!/^https:\/\//.test(base)) {
      lines.push('   ✗ 接口地址必须以 https:// 开头');
      show('#ff9d9d'); return;
    }
    lines.push('   ✓ 三项都填了');
    lines.push('   Key 长度 ' + key.length + ' 位，开头 ' + key.slice(0, 4) + '…');
    lines.push('   地址 ' + base);
    lines.push('   模型 ' + model);

    btn.textContent = '测试中…';
    btn.disabled = true;
    show('#8f99ab');

    // 先测一个最简单的 GET，判断域名通不通
    var host;
    try { host = new URL(base).origin; } catch (e) { host = ''; }

    var t0 = Date.now();

    fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: '你好' }],
        max_tokens: 4,
        stream: false
      })
    }).then(function (res) {
      var ms = Date.now() - t0;
      lines.push('');
      lines.push('② 网络连接');
      lines.push('   ✓ 请求已发出（' + ms + 'ms），HTTP ' + res.status);
      return res.text().then(function (t) {
        lines.push('');
        lines.push('③ 服务器返回');
        if (res.ok) {
          lines.push('   ✓ 成功！配置没问题，可以正常提问了。');
          show('#8fe3b8');
        } else {
          var brief = t.replace(/\s+/g, ' ').slice(0, 200);
          lines.push('   ✗ ' + brief);
          var why = '';
          if (res.status === 401 || res.status === 403) {
            why = '→ Key 不对或没有权限。检查是否复制完整、是否有该模型的权限。';
          } else if (res.status === 404) {
            why = '→ 模型名/接入点 ID 不存在。豆包要填 ep- 开头的接入点 ID。';
          } else if (res.status === 429) {
            why = '→ 请求太频繁或额度用完了。';
          } else if (res.status >= 500) {
            why = '→ 服务端出问题了，稍后再试。';
          } else if (/model/i.test(brief)) {
            why = '→ 多半是模型名/接入点填错了。';
          }
          if (why) lines.push('   ' + why);
          show('#ff9d9d');
        }
        btn.textContent = '测试连接';
        btn.disabled = false;
      });
    }).catch(function (err) {
      var ms = Date.now() - t0;
      var name = (err && err.name) || 'Error';
      var msg = (err && err.message) || String(err);
      lines.push('');
      lines.push('② 网络连接');
      lines.push('   ✗ 失败（' + ms + 'ms）');
      lines.push('   类型 ' + name + '：' + msg);
      lines.push('');
      if (isVolces(base)) {
        lines.push('③ 豆包本身能用，但它出错时不返回跨域头');
        lines.push('   服务器报的真实原因，前端拿不到，');
        lines.push('   所以只能显示 Failed to fetch。');
        lines.push('');
        lines.push('   这多半是配置问题，重点查三项：');
        lines.push('   ① API Key 是否完整、是否属于当前账号');
        lines.push('   ② 模型栏是否为 ep- 开头的接入点 ID');
        lines.push('   ③ 接入点是否已创建、模型是否已开通');
      } else {
        lines.push('③ 这说明请求根本没发到服务器，和 Key 无关');
        lines.push('   请依次检查：');
        lines.push('   · 手机能不能上网（打开别的网站试试）');
        lines.push('   · 是否连着校园网但没登录认证');
        lines.push('   · 地址有没有手误（' + host + '）');
        lines.push('   · 换个网络试试：关掉 WiFi 用流量');
      }
      show('#ff9d9d');
      btn.textContent = '测试连接';
      btn.disabled = false;
    });
  }

  function closeCfg() {
    inEl.style.display = '';
    ctxEl.style.display = '';
    renderBody();
  }

  function syncModelLabel() {
    var c = getCfg();
    if (!c.key) { modelEl.textContent = '未配置'; return; }
    var pv = PROVIDERS[c.provider] || PROVIDERS.deepseek;
    var m = c.model || '';
    // 接入点 ID 太长，截短显示
    if (m.length > 16) m = m.slice(0, 12) + '…';
    modelEl.textContent = pv.name + (m ? ' · ' + m : '');
  }

  /* ---------------- 空态 ---------------- */
  var CHIPS = ['这段没看懂', '帮我举个例子', '和上一段什么关系', '考试会怎么考'];

  function renderBody() {
    var cfg = getCfg();
    if (!cfg.key) {
      bodyEl.innerHTML = '<div class="askempty">'
        + '<b>还差一步：填一个 API Key。</b><br>'
        + '支持 DeepSeek、豆包，或任何兼容 OpenAI 格式的接口。'
        + '</div>'
        + '<button id="askSetup" style="display:block;width:100%;height:46px;'
        + 'margin:6px 0 16px;border-radius:11px;border:1px solid rgba(56,208,216,.45);'
        + 'background:rgba(56,208,216,.14);color:#38d0d8;font-size:14px;font-weight:700;'
        + 'font-family:inherit">去填 API Key ›</button>';
      var sb = document.getElementById('askSetup');
      if (sb) sb.addEventListener('click', openCfg);
      return;
    }
    if (!history.length) {
      var h = '<div class="askempty"><b>可以直接问，我会带上你正在看的内容。</b><br>'
        + '比如：</div>';
      h += '<div style="font-size:11px;color:#7c8699;margin-top:2px">'
        + '右上角 💬 可以切换深度思考（默认关，快且省）</div>';
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
    syncThinkBtn();
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

  function syncThinkBtn() {
    var b = document.getElementById('askThinkBtn');
    if (!b) return;
    var on = getCfg().think;
    b.classList.toggle('on', on);
    b.textContent = on ? '🧠' : '💬';
    b.title = on ? '深度思考：已开启（慢、贵，适合难题）' : '深度思考：已关闭（快、便宜）';
  }

  document.getElementById('askThinkBtn').addEventListener('click', function () {
    var c = getCfg();
    c.think = !c.think;
    setCfg(c);
    syncThinkBtn();
    say(c.think ? '已开启深度思考，回答更慢但更准' : '已关闭深度思考，回答更快更省');
  });

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

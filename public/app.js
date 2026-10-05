(function () {
  const $ = (s) => document.querySelector(s);
  const API = (window.API_BASE || '') + '/api/chat';
  const KEY = 'mingpan-chat-v1';
  const list = $('#list'), input = $('#input'), quick = $('#quick'), sendBtn = $('#send');
  const GREETING = [
    '你好呀，我是**玄真大师** 🙏 有缘相见～',
    '把你的**出生年月日、时辰、性别**发给我，我来为你排八字、看大运流年。\n\n比如：「1995年农历八月十五 早上8点 女 成都」\n\n不知道时辰也没关系，说"不清楚"就好；想重点问感情、事业、财运，也可以一起告诉我～',
  ];
  let S = load();
  let busy = false;

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch { return fresh(); } }
  function fresh() { return { items: [], llm: [], pending: null, profile: null, quick: [] }; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }

  // ---------- 渲染 ----------
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function md(src) {
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    let html = '', ul = false;
    String(src).split(/\n+/).forEach((raw) => {
      const l = raw.trim(); if (!l) return;
      if (/^[-*•·]\s+/.test(l)) { if (!ul) { html += '<ul>'; ul = true; } html += `<li>${inline(l.replace(/^[-*•·]\s+/, ''))}</li>`; return; }
      if (ul) { html += '</ul>'; ul = false; }
      const h = l.match(/^#{1,4}\s*(.+)/);
      html += h ? `<div class="st">${inline(h[1])}</div>` : `<p>${inline(l)}</p>`;
    });
    return html + (ul ? '</ul>' : '');
  }
  // 把一段长回答按"## 标题"拆成多个气泡
  const splitSections = (text) => text.split(/\n(?=#{1,4}\s)/).map((s) => s.trim()).filter(Boolean);
  const AVATAR = '<img class="avatar" src="assets/logo.svg" alt="" width="36" height="36" />';
  function row(me, inner, cls = '') {
    const r = document.createElement('div');
    const prev = list.lastElementChild;
    const cont = !me && prev && prev.classList.contains('row') && !prev.classList.contains('me');
    r.className = 'row' + (me ? ' me' : '') + (cont ? ' cont' : '');
    r.innerHTML = (me ? '' : AVATAR) + `<div class="${cls || 'bubble'}">${inner}</div>`;
    list.appendChild(r);
    if (cls === 'card') requestAnimationFrame(() => r.querySelectorAll('[data-w]').forEach((el) => (el.style.width = el.dataset.w + '%')));
    return r;
  }
  const sectionCls = (s) => (/^#{1,4}\s/.test(s) ? 'bubble section' : 'bubble');
  function renderItem(it) {
    if (it.type === 'user') return row(true, esc(it.text).replace(/\n/g, '<br>'));
    if (it.type === 'bot') return splitSections(it.text).map((s) => row(false, md(s), sectionCls(s)));
    if (it.type === 'chart') return row(false, chartCard(it.chart), 'card');
  }
  function renderAll() {
    list.querySelectorAll('.row').forEach((n) => n.remove());
    if (!S.items.length) GREETING.forEach((t) => S.items.push({ type: 'bot', text: t }));
    S.items.forEach(renderItem); renderQuick(S.quick); scroll(true);
  }
  function renderQuick(arr) {
    S.quick = arr || [];
    quick.innerHTML = S.quick.map((q, i) => `<button type="button" class="${q.startsWith('对，') ? 'primary' : ''}" data-i="${i}">${esc(q)}</button>`).join('');
  }
  // ---------- 智能滚动：用户在底部附近才自动跟随；上滑阅读时不打扰，显示"↓ 新消息" ----------
  let follow = true, rafId = 0, lastIntent = 0, touching = false;
  const jump = document.createElement('button');
  jump.type = 'button'; jump.className = 'jump'; jump.textContent = '↓ 新消息'; jump.hidden = true;
  list.parentNode.insertBefore(jump, list.nextSibling);
  const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  const intent = () => { lastIntent = Date.now(); };
  list.addEventListener('touchstart', () => { touching = true; intent(); }, { passive: true });
  list.addEventListener('touchend', () => { touching = false; intent(); }, { passive: true });
  list.addEventListener('wheel', intent, { passive: true });
  list.addEventListener('keydown', intent);
  list.addEventListener('scroll', () => {
    if (nearBottom()) { follow = true; jump.hidden = true; }
    else if (touching || Date.now() - lastIntent < 1200) follow = false; // 只有用户主动滚动才停止跟随
  }, { passive: true });
  const toBottom = () => { rafId = 0; list.scrollTop = list.scrollHeight; };
  const scroll = (force) => {
    if (force === true) follow = true;
    if (!follow) { if (jump.hidden) { jump.style.bottom = (list.parentNode.getBoundingClientRect().bottom - list.getBoundingClientRect().bottom + 12) + 'px'; jump.hidden = false; } return; }
    if (!rafId) rafId = requestAnimationFrame(toBottom); // 每帧最多一次，避免逐字抖动
  };
  jump.onclick = () => { follow = true; jump.hidden = true; list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' }); };

  const GWX = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
  const ZWX = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
  const ZOD = { 鼠: '🐭', 牛: '🐮', 虎: '🐯', 兔: '🐰', 龙: '🐲', 蛇: '🐍', 马: '🐴', 羊: '🐑', 猴: '🐵', 鸡: '🐔', 狗: '🐶', 猪: '🐷' };
  function chartCard(c) {
    const P = c.pillars, wx = (w, t) => `<span class="wx-${w}">${t}</span>`;
    const r = (label, fn, cls = '') => `<div class="rl">${label}</div>` + P.map((p, i) => `<div class="${cls}${i === 2 ? ' day' : ''}">${p.unknown ? '<small>—</small>' : fn(p)}</div>`).join('');
    const total = Object.values(c.wuXingCount).reduce((a, b) => a + b, 0) || 1, maxC = Math.max(...Object.values(c.wuXingCount), 1);
    const cur = c.daYun.find((d) => c.nowYear >= d.startYear && c.nowYear <= d.endYear);
    const time = c.input.timeUnknown ? '时辰不详' : c.input.clockTime.slice(11, 16);
    return `<div class="mp-h"><b>${esc(c.input.name || '缘主')}之命盘<span class="seal">${c.input.gender === '男' ? '乾造' : '坤造'}</span></b><span class="zodiac" aria-label="${c.shengXiao}">${ZOD[c.shengXiao] || ''}</span></div>
      <div class="meta"><em>公历</em> ${c.input.clockTime.slice(0, 10)} ${time}${c.trueSolar ? ` · <em>真太阳时</em> ${c.trueSolar.time.slice(11, 16)}` : ''}<br><em>农历</em> ${c.lunar}<br><em>生肖</em> ${c.shengXiao} · <em>星座</em> ${c.xingZuo}</div>
      <div class="pillars"><div class="hd rl"></div>${P.map((p, i) => `<div class="hd${i === 2 ? ' day' : ''}">${p.label}</div>`).join('')}
        ${r('十神', (p) => `<span class="ss">${p.shiShenGan === '日主' ? (c.input.gender === '男' ? '元男' : '元女') : p.shiShenGan}</span>`)}
        ${r('天干', (p) => wx(p.ganWx, p.gan), 'big')}${r('地支', (p) => wx(p.zhiWx, p.zhi), 'big')}
        ${r('藏干', (p) => p.hideGan.map((g, k) => `${wx({ 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' }[g], g)}<small>${p.shiShenZhi[k]}</small>`).join(''))}
        ${r('纳音', (p) => p.naYin)}</div>
      <div class="sec">五行</div>
      <div class="wx">${Object.entries(c.wuXingCount).map(([k, v]) => `<div class="w"><b class="wx-${k}">${k}</b><div class="t"><i class="bg-${k}" data-w="${v ? Math.round(12 + (v / maxC) * 88) : 0}"></i></div><span class="n">${v}</span></div>`).join('')}</div>
      <div class="kv"><span>日主 <b>${c.dayMaster.gan}${c.dayMaster.wuXing}</b> · ${c.dayMaster.strength}</span><span>喜用 <b>${c.xiYong.join(' ')}</b></span><span>${c.missing.length ? '五行缺 <b>' + c.missing.join(' ') + '</b>' : '五行<b>俱全</b>'}</span><span>${c.yun.startYear}岁${c.yun.startMonth ? c.yun.startMonth + '个月' : ''}起运 · ${c.yun.forward ? '顺行' : '逆行'}</span></div>
      <div class="sec">大运</div>
      <div class="hs">${c.daYun.slice(0, 8).map((d) => `<div class="dy${d === cur ? ' cur' : ''}">${d.startAge}岁<b>${wx(GWX[d.ganZhi[0]], d.ganZhi[0])}${wx(ZWX[d.ganZhi[1]], d.ganZhi[1])}</b>${d.startYear}</div>`).join('')}</div>`;
  }

  // ---------- 发送 ----------
  async function send(text, action) {
    if (busy || (!text && !action)) return;
    busy = true; sendBtn.disabled = true; renderQuick([]);
    if (text) { S.items.push({ type: 'user', text }); S.llm.push({ role: 'user', content: text }); renderItem(S.items[S.items.length - 1]); }
    save(); scroll(true);
    let typing = row(false, '<span class="typing"><i></i><i></i><i></i></span>');
    let stream = null; // { text, rows: [] }
    const dropTyping = () => { if (typing) { typing.remove(); typing = null; } };
    const showTyping = () => { if (!typing) { typing = row(false, '<span class="typing"><i></i><i></i><i></i></span>'); scroll(); } };
    const endStream = () => {
      if (!stream) return;
      if (stream.text.trim()) { S.items.push({ type: 'bot', text: stream.text }); S.llm.push({ role: 'assistant', content: stream.text }); }
      stream.rows.forEach((r) => r.querySelector('.bubble')?.classList.remove('caret'));
      stream = null; save();
    };
    const paint = () => {
      const secs = splitSections(stream.text);
      while (stream.rows.length < secs.length) stream.rows.push(row(false, ''));
      secs.forEach((s, i) => { const b = stream.rows[i].querySelector('.bubble'); b.innerHTML = md(s); b.className = sectionCls(s) + (i === secs.length - 1 ? ' caret' : ''); });
      scroll();
    };
    const on = (ev, d) => {
      if (ev === 'ping') return;
      if (ev === 'delta') { dropTyping(); if (!stream) stream = { text: '', rows: [] }; stream.text += d.text; paint(); return; }
      if (ev === 'bubble') { endStream(); showTyping(); return; }
      endStream();
      if (ev === 'text') { dropTyping(); S.items.push({ type: 'bot', text: d.text }); S.llm.push({ role: 'assistant', content: d.text }); renderItem(S.items[S.items.length - 1]); scroll(); }
      else if (ev === 'chart') { dropTyping(); S.items.push({ type: 'chart', chart: d.chart }); renderItem(S.items[S.items.length - 1]); scroll(); }
      else if (ev === 'pending') S.pending = d.pending;
      else if (ev === 'profile') { S.profile = d.profile; S.pending = null; }
      else if (ev === 'quick') renderQuick(d.replies);
      else if (ev === 'error') { dropTyping(); S.items.push({ type: 'bot', text: d.error }); renderItem(S.items[S.items.length - 1]); }
      save();
    };
    const body = JSON.stringify({ messages: S.llm.slice(-16), pending: S.pending, profile: S.profile, action });
    let got = 0, finished = false; // got：已收到的有效事件数
    const handle = (ev, d) => { if (ev === 'done') finished = true; else if (ev !== 'ping') got++; on(ev, d); };
    const parseSSE = (buf, flush) => {
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0 || (flush && buf.trim() && (i = buf.length) >= 0)) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = (block.match(/^event: (.*)$/m) || [])[1], data = (block.match(/^data: (.*)$/m) || [])[1];
        if (ev && data) { let d; try { d = JSON.parse(data); } catch { continue; } handle(ev, d); }
      }
      return buf;
    };
    const post = async (url) => {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, cache: 'no-store' });
      const ct = r.headers.get('content-type') || '';
      if (!r.ok && !ct.includes('event-stream')) { const j = await r.json().catch(() => ({})); const e = new Error(j.error || ''); e.server = !!j.error; throw e; }
      if (ct.includes('application/json')) { (await r.json()).events.forEach(([e, d]) => handle(e, d)); return; }
      if (!r.body || !r.body.getReader) { parseSSE(await r.text(), true); return; } // 不支持流式读取的内置浏览器
      const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) { const { value, done } = await reader.read(); if (done) break; buf = parseSSE(buf + dec.decode(value, { stream: true })); }
      parseSSE(buf + dec.decode(), true);
    };
    const FRIENDLY = '网络有点不稳定，大师没收到完整回复 🙏 请再发一次试试～（如在微信里打开，也可以点右上角用浏览器打开）';
    try {
      try { await post(API); if (!finished) throw new Error('incomplete'); }
      catch (e) {
        if (e.server) throw e;
        // 流式失败：若还没收到任何内容，改用非流式接口自动重试一次（部分 App 内置浏览器流式 fetch 不稳定）
        if (got === 0) { await new Promise((ok) => setTimeout(ok, 600)); await post(API + '?stream=0'); if (!finished) throw new Error('incomplete'); }
        else throw e;
      }
    } catch (e) { on('error', { error: e.server ? e.message + '，请稍后再试～' : FRIENDLY }); }
    finally { endStream(); dropTyping(); busy = false; sendBtn.disabled = false; save(); scroll(); }
  }

  $('#composer').addEventListener('submit', (e) => { e.preventDefault(); const t = input.value.trim(); if (!t) return; input.value = ''; autosize(); send(t); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#composer').requestSubmit(); } });
  const autosize = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 110) + 'px'; };
  input.addEventListener('input', autosize);
  quick.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const t = S.quick[+b.dataset.i];
    if (t === '对，开始排盘' && S.pending) send(t, 'confirm'); else send(t);
  });
  // 新排盘：不用浏览器弹窗，二次点击确认
  const resetBtn = $('#reset'); let armed = null;
  resetBtn.onclick = () => {
    if (busy) return;
    const trivial = !S.profile && S.items.length <= 2;
    if (!trivial && !armed) { resetBtn.textContent = '确定清空？'; resetBtn.classList.add('warn'); armed = setTimeout(() => { armed = null; resetBtn.textContent = '新排盘'; resetBtn.classList.remove('warn'); }, 3000); return; }
    clearTimeout(armed); armed = null; resetBtn.textContent = '新排盘'; resetBtn.classList.remove('warn');
    S = fresh(); save(); renderAll(); input.focus();
  };
  renderAll();
})();

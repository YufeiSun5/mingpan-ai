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
  function row(me, inner, cls = '') {
    const r = document.createElement('div');
    r.className = 'row' + (me ? ' me' : '');
    r.innerHTML = (me ? '<div class="spacer"></div>' : '<div class="avatar">师</div>') + `<div class="${cls || 'bubble'}">${inner}</div>`;
    list.appendChild(r); return r;
  }
  function renderItem(it) {
    if (it.type === 'user') return row(true, esc(it.text).replace(/\n/g, '<br>'));
    if (it.type === 'bot') return splitSections(it.text).map((s) => row(false, md(s)));
    if (it.type === 'chart') return row(false, chartCard(it.chart), 'card');
  }
  function renderAll() {
    list.querySelectorAll('.row').forEach((n) => n.remove());
    if (!S.items.length) GREETING.forEach((t) => S.items.push({ type: 'bot', text: t }));
    S.items.forEach(renderItem); renderQuick(S.quick); scroll();
  }
  function renderQuick(arr) {
    S.quick = arr || [];
    quick.innerHTML = S.quick.map((q, i) => `<button type="button" class="${q.startsWith('对，') ? 'primary' : ''}" data-i="${i}">${esc(q)}</button>`).join('');
  }
  const scroll = () => requestAnimationFrame(() => (list.scrollTop = list.scrollHeight));

  const GWX = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
  const ZWX = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
  const ZOD = { 鼠: '🐭', 牛: '🐮', 虎: '🐯', 兔: '🐰', 龙: '🐲', 蛇: '🐍', 马: '🐴', 羊: '🐑', 猴: '🐵', 鸡: '🐔', 狗: '🐶', 猪: '🐷' };
  function chartCard(c) {
    const P = c.pillars, wx = (w, t) => `<span class="wx-${w}">${t}</span>`;
    const r = (label, fn, cls = '') => `<div class="rl">${label}</div>` + P.map((p, i) => `<div class="${cls} ${i === 2 ? 'day' : ''}">${p.unknown ? '—' : fn(p)}</div>`).join('');
    const maxC = Math.max(...Object.values(c.wuXingCount), 1);
    const cur = c.daYun.find((d) => c.nowYear >= d.startYear && c.nowYear <= d.endYear);
    return `<div class="mp-h"><b>${esc(c.input.name || '缘主')}的命盘<span class="tag">${c.input.gender === '男' ? '乾造' : '坤造'}</span></b><span style="font-size:22px">${ZOD[c.shengXiao] || ''}</span></div>
      <div class="meta">公历 ${c.input.clockTime.slice(0, c.input.timeUnknown ? 10 : 16)}${c.input.timeUnknown ? '（时辰不详）' : ''}${c.trueSolar ? `<br>真太阳时 ${c.trueSolar.time.slice(11, 16)}（${esc(c.trueSolar.city)}）` : ''}<br>农历 ${c.lunar}<br>生肖${c.shengXiao} · ${c.xingZuo}</div>
      <div class="pillars"><div class="rl hd"></div>${P.map((p) => `<div class="hd">${p.label[0]}</div>`).join('')}
        ${r('十神', (p) => p.shiShenGan)}${r('天干', (p) => wx(p.ganWx, p.gan), 'big')}${r('地支', (p) => wx(p.zhiWx, p.zhi), 'big')}
        ${r('藏干', (p) => p.hideGan.join(''))}${r('纳音', (p) => p.naYin)}</div>
      <div class="wx">${Object.entries(c.wuXingCount).map(([k, v]) => `<div><div class="b"><i class="bg-${k}" style="height:${v ? 15 + (v / maxC) * 85 : 5}%"></i></div>${wx(k, k)}${v}</div>`).join('')}</div>
      <div class="kv"><span>日主 <b>${c.dayMaster.gan}${c.dayMaster.wuXing}</b> ${c.dayMaster.strength}</span><span>喜用 <b>${c.xiYong.join('')}</b></span><span>${c.missing.length ? '缺 <b>' + c.missing.join('') + '</b>' : '五行<b>俱全</b>'}</span><span>${c.yun.startYear}岁起运·${c.yun.forward ? '顺' : '逆'}</span></div>
      <div class="sec">大运</div>
      <div class="hs">${c.daYun.slice(0, 8).map((d) => `<div class="dy ${d === cur ? 'cur' : ''}">${d.startAge}岁<b>${wx(GWX[d.ganZhi[0]], d.ganZhi[0])}${wx(ZWX[d.ganZhi[1]], d.ganZhi[1])}</b>${d.startYear}</div>`).join('')}</div>`;
  }

  // ---------- 发送 ----------
  async function send(text, action) {
    if (busy || (!text && !action)) return;
    busy = true; sendBtn.disabled = true; renderQuick([]);
    if (text) { S.items.push({ type: 'user', text }); S.llm.push({ role: 'user', content: text }); renderItem(S.items[S.items.length - 1]); }
    save(); scroll();
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
      secs.forEach((s, i) => { const b = stream.rows[i].querySelector('.bubble'); b.innerHTML = md(s); b.classList.toggle('caret', i === secs.length - 1); });
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
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: S.llm.slice(-16), pending: S.pending, profile: S.profile, action }) });
      if (!r.ok && !(r.headers.get('content-type') || '').includes('event-stream')) {
        const j = await r.json().catch(() => ({})); throw new Error(j.error || '网络开小差了');
      }
      if ((r.headers.get('content-type') || '').includes('application/json')) {
        (await r.json()).events.forEach(([e, d]) => on(e, d)); // 云函数：非流式回放
      } else {
        const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '';
        for (;;) {
          const { value, done } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i); buf = buf.slice(i + 2);
            const ev = (block.match(/^event: (.*)$/m) || [])[1], data = (block.match(/^data: (.*)$/m) || [])[1];
            if (ev && data) on(ev, JSON.parse(data));
          }
        }
      }
    } catch (e) { on('error', { error: (e.message || '网络开小差了') + '，请再发一次～' }); }
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
  $('#reset').onclick = () => { if (busy) return; if (!S.profile && S.items.length <= 2 || confirm('开始为新的一位排盘？当前对话会清空。')) { S = fresh(); save(); renderAll(); input.focus(); } };
  renderAll();
})();

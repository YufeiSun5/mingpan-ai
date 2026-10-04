(function () {
  const $ = (s) => document.querySelector(s);
  const API = (window.API_BASE || '') + '/api/reading';
  const state = { gender: '女', calendar: 'solar', timeMode: 'exact', topics: new Set() };
  const LUNAR_M = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
  const LUNAR_D = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
  const CITIES = ['北京','上海','天津','重庆','广州','深圳','杭州','南京','苏州','成都','武汉','西安','长沙','郑州','济南','青岛','沈阳','大连','哈尔滨','长春','福州','厦门','合肥','南昌','昆明','贵阳','南宁','海口','三亚','太原','石家庄','兰州','西宁','银川','呼和浩特','乌鲁木齐','拉萨','宁波','温州','东莞','佛山','珠海','香港','澳门','台北'];
  $('#cities').innerHTML = CITIES.map((c) => `<option value="${c}">`).join('');

  const fillDate = () => {
    const y = $('#year'), m = $('#month'), d = $('#day');
    if (!y.options.length) { let h = ''; for (let i = new Date().getFullYear(); i >= 1930; i--) h += `<option value="${i}">${i}年</option>`; y.innerHTML = h; y.value = '1995'; }
    const mv = m.value || '1', dv = d.value || '1';
    const lunar = state.calendar === 'lunar';
    m.innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${lunar ? LUNAR_M[i] + '月' : i + 1 + '月'}</option>`).join('');
    const days = lunar ? 30 : new Date(+y.value, +mv, 0).getDate();
    d.innerHTML = Array.from({ length: days }, (_, i) => `<option value="${i + 1}">${lunar ? LUNAR_D[i] : i + 1 + '日'}</option>`).join('');
    m.value = mv; d.value = Math.min(+dv, days);
    $('#leapWrap').hidden = !lunar;
  };
  fillDate();
  $('#year').onchange = fillDate; $('#month').onchange = fillDate;

  document.querySelectorAll('.seg').forEach((seg) => seg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    state[seg.dataset.name] = b.dataset.v;
    if (seg.dataset.name === 'calendar') fillDate();
    if (seg.dataset.name === 'timeMode') {
      $('#time').hidden = b.dataset.v !== 'exact'; $('#shichen').hidden = b.dataset.v !== 'shichen'; $('#unknownHint').hidden = b.dataset.v !== 'unknown';
    }
  }));
  $('#topics').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    b.classList.toggle('on'); state.topics[b.classList.contains('on') ? 'add' : 'delete'](b.dataset.v);
  });

  const show = (id) => ['formView', 'loadingView', 'resultView'].forEach((v) => ($('#' + v).hidden = v !== id));
  const TIPS = ['正在排四柱八字…', '推算大运流年…', '查看五行喜忌…', '师傅正在为你细批…'];

  $('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { name: f.get('name').trim(), gender: state.gender, calendar: state.calendar, year: +f.get('year'), month: +f.get('month'), day: +f.get('day'), leap: !!f.get('leap'), city: f.get('city').trim(), topics: [...state.topics], question: f.get('question').trim() };
    if (state.timeMode === 'exact') { const [h, mi] = (f.get('time') || '12:00').split(':'); body.hour = +h; body.minute = +mi; }
    else if (state.timeMode === 'shichen') body.shichen = f.get('shichen');
    else body.timeUnknown = true;
    show('loadingView'); window.scrollTo(0, 0);
    let i = 0; const timer = setInterval(() => ($('#loadingText').textContent = TIPS[++i % TIPS.length]), 1800);
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || '出错了');
      render(j); show('resultView'); window.scrollTo(0, 0);
    } catch (err) { alert(err.message || '网络异常，请重试'); show('formView'); }
    finally { clearInterval(timer); }
  });
  $('#again').onclick = () => { show('formView'); window.scrollTo(0, 0); };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function md(src) {
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    let html = '', list = false;
    src.split(/\n+/).forEach((raw) => {
      const l = raw.trim(); if (!l) return;
      if (/^[-*•]\s+/.test(l)) { if (!list) { html += '<ul>'; list = true; } html += `<li>${inline(l.replace(/^[-*•]\s+/, ''))}</li>`; return; }
      if (list) { html += '</ul>'; list = false; }
      const h = l.match(/^#{1,4}\s*(.+)/);
      html += h ? `<h2>${inline(h[1])}</h2>` : `<p>${inline(l)}</p>`;
    });
    return html + (list ? '</ul>' : '');
  }

  function render({ chart: c, reading, source }) {
    const P = c.pillars, wx = (w, t) => `<span class="wx-${w}">${t}</span>`;
    const row = (label, fn, cls = '') => `<div class="rl">${label}</div>` + P.map((p, i) => `<div class="${cls} ${i === 2 ? 'day' : ''}">${p.unknown ? '—' : fn(p)}</div>`).join('');
    const maxC = Math.max(...Object.values(c.wuXingCount), 1);
    const curDy = c.daYun.find((d) => c.nowYear >= d.startYear && c.nowYear <= d.endYear);
    $('#mingpan').innerHTML = `
      <div class="mp-head"><h2>${esc(c.input.name || '缘主')} 的命盘<span class="tag">${c.input.gender === '男' ? '乾造' : '坤造'}</span></h2><div style="font-size:26px">${zodiacEmoji(c.shengXiao)}</div></div>
      <div class="mp-meta">公历：${c.input.clockTime.slice(0, c.input.timeUnknown ? 10 : 16)}${c.input.timeUnknown ? '（时辰不详）' : ''}<br>
        ${c.trueSolar ? `真太阳时：${c.trueSolar.time.slice(0, 16)}（${c.trueSolar.city} ${c.trueSolar.offsetMinutes >= 0 ? '+' : ''}${c.trueSolar.offsetMinutes}分）<br>` : ''}
        农历：${c.lunar}<br>生肖：${c.shengXiao}　星座：${c.xingZuo}　命宫：${c.mingGong}　胎元：${c.taiYuan}</div>
      <div class="pillars">
        <div class="rl hd"></div>${P.map((p) => `<div class="hd">${p.label}</div>`).join('')}
        ${row('十神', (p) => p.shiShenGan)}
        ${row('天干', (p) => wx(p.ganWx, p.gan), 'big')}
        ${row('地支', (p) => wx(p.zhiWx, p.zhi), 'big')}
        ${row('藏干', (p) => p.hideGan.map((g, i) => `${g}<small>${p.shiShenZhi[i]}</small>`).join('<br>'))}
        ${row('纳音', (p) => p.naYin)}
        ${row('星运', (p) => p.diShi)}
      </div>
      <div class="sec">五行分布 · 日主 ${wx(c.dayMaster.wuXing, c.dayMaster.gan + c.dayMaster.wuXing)} ${c.dayMaster.strength}</div>
      <div class="wx">${Object.entries(c.wuXingCount).map(([k, v]) => `<div><div class="b"><i class="bg-${k}" style="height:${v ? 15 + (v / maxC) * 85 : 4}%"></i></div><div class="n">${wx(k, k)} ${v}</div></div>`).join('')}</div>
      <div class="kv" style="margin-top:10px"><span>喜用 <b>${c.xiYong.join(' ')}</b></span><span>忌 <b>${c.jiShen.join(' ')}</b></span>${c.missing.length ? `<span>五行缺 <b>${c.missing.join(' ')}</b></span>` : '<span>五行<b>俱全</b></span>'}<span>${c.yun.startYear}岁${c.yun.startMonth}个月起运 · ${c.yun.forward ? '顺' : '逆'}行</span></div>
      <div class="sec">大运</div>
      <div class="hs">${c.daYun.slice(0, 8).map((d) => `<div class="dy ${d === curDy ? 'cur' : ''}">${d.startAge}岁<b>${wx(GW(d.ganZhi[0]), d.ganZhi[0])}${wx(ZW(d.ganZhi[1]), d.ganZhi[1])}</b>${d.startYear}<br>${d.shiShen}</div>`).join('')}</div>
      <div class="sec">流年</div>
      <div class="ln">${c.liuNian.map((y) => `<div class="${y.past ? 'past' : ''} ${y.current ? 'cur' : ''} ${!y.past && y.favorable > 0 ? 'good' : ''}">${y.year}<b>${y.ganZhi}</b>${y.shiShen}</div>`).join('')}</div>`;
    $('#reading').innerHTML = `<div class="card-title"><span>批</span>师傅详批</div>` + md(reading) + `<div class="src">${source === 'template' ? '模板解读' : 'AI 解读'}</div>`;
  }
  const GWX = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
  const ZWX = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
  const GW = (g) => GWX[g], ZW = (z) => ZWX[z];
  const zodiacEmoji = (s) => ({ 鼠: '🐭', 牛: '🐮', 虎: '🐯', 兔: '🐰', 龙: '🐲', 蛇: '🐍', 马: '🐴', 羊: '🐑', 猴: '🐵', 鸡: '🐔', 狗: '🐶', 猪: '🐷' }[s] || '');
})();

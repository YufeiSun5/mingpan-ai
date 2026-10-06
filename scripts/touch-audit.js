// 触控审计：多尺寸 + 触屏模拟，程序化测量所有可点控件的尺寸与相邻间距，并截图
const { chromium } = require('/workspace/bazi-web/node_modules/playwright-core');
const URL = process.argv[2] || 'http://localhost:3000', PRE = process.argv[3] || 'touch-local';
const OUT = '/workspace/bazi-web/screenshots/' + PRE + '-';
const VPS = [
  ['320', 320, 568, true], ['360', 360, 740, true], ['390', 390, 844, true], ['412', 412, 915, true],
  ['fold-673', 673, 841, true], ['tablet-820', 820, 1180, true], ['desktop-touch-1280', 1280, 800, false], ['desktop-mouse-1440', 1440, 900, false, false],
];
const MEASURE = () => {
  const SEL = 'button, a[href], input:not([type=hidden]):not([type=checkbox]), select, textarea, summary, label.chk';
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && e.closest('[hidden]') === null; };
  const sheet = document.querySelector('.sheet');
  const all = [...(sheet || document).querySelectorAll(SEL)].filter(vis);
  // 命盘神煞格内的释义小签（.sha-chip）：用户要求六列全量显示且每个可点，物理上做不到 44px；
  // 误触有兜底（弹层列出该列全部神煞及释义），故单列统计、不计入 44px 硬指标。
  const chips = all.filter((e) => e.classList.contains('sha-chip'));
  const els = all.filter((e) => !e.classList.contains('sha-chip'));
  window.__chips = chips.length ? `${chips.length} chips, min ${Math.min(...chips.map((e) => Math.round(e.getBoundingClientRect().height * 10) / 10))}px tall (exempt, tip shows whole column)` : '';
  const name = (e) => { const c = e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''; const t = (e.innerText || e.getAttribute('aria-label') || e.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 14); return `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${c} "${t}"`; };
  // textarea 的点击区是整个输入框
  const rectOf = (e) => (e.tagName === 'TEXTAREA' && e.closest('.field') ? e.closest('.field') : e).getBoundingClientRect();
  const items = els.map((e) => { const r = rectOf(e); return { e, n: name(e), r, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, g: sheet ? 'sheet' : (e.closest('.list') ? 'list' : e.closest('.side') ? 'side' : e.closest('.jump-anchor') ? 'jump' : 'chrome') } });
  const small = items.filter((x) => x.w < 44 || x.h < 44).map((x) => `${x.n} ${x.w}x${x.h}`);
  const minW = items.reduce((m, x) => (x.w < m.w ? x : m), items[0]); const minH = items.reduce((m, x) => (x.h < m.h ? x : m), items[0]);
  const tight = []; let minGap = Infinity, minGapPair = '';
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    const cross = a.g !== b.g; if (cross && (['list', 'side', 'jump'].includes(a.g) || ['list', 'side', 'jump'].includes(b.g))) continue;
    if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
    const dx = Math.max(0, b.r.left - a.r.right, a.r.left - b.r.right), dy = Math.max(0, b.r.top - a.r.bottom, a.r.top - b.r.bottom);
    const gap = Math.max(dx, dy);
    if (gap > 60) continue;
    if (gap < minGap) { minGap = gap; minGapPair = `${a.n} ↔ ${b.n}`; }
    if (gap < 8) tight.push(`${a.n} ↔ ${b.n}: ${gap.toFixed(1)}px`);
  }
  const minS = items.reduce((m, x) => (Math.min(x.w, x.h) < Math.min(m.w, m.h) ? x : m), items[0]);
  return { chips: window.__chips, minS: `${minS.n} ${minS.w}x${minS.h}`, n: items.length, coarse: matchMedia('(pointer:coarse)').matches, minW: minW && `${minW.n} ${minW.w}x${minW.h}`, minH: minH && `${minH.n} ${minH.w}x${minH.h}`, minSide: Math.min(...items.map((x) => Math.min(x.w, x.h))), small, minGap: Math.round(minGap * 10) / 10, minGapPair, tight };
};

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  // 1) 准备数据：两位命主 + 一段包含所有卡片类型的对话
  const ctx0 = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p0 = await ctx0.newPage();
  await p0.goto(URL); await p0.evaluate(() => localStorage.clear()); await p0.reload();
  await p0.waitForFunction(() => localStorage.getItem('mingpan-token'), null, { timeout: 15000 }); await p0.waitForTimeout(800);
  const seed = await p0.evaluate(async () => {
    const tok = localStorage.getItem('mingpan-token');
    const post = (body) => fetch('/api/v1/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(body) }).then((r) => r.json());
    const me = await post({ profile: { gender: '女', calendar: 'solar', year: 1995, month: 9, day: 4, time: { type: 'exact', hour: 8, minute: 0 }, city: '成都', label: '我' } });
    const hb = await post({ profile: { gender: '男', calendar: 'solar', year: 1993, month: 4, day: 12, time: { type: 'shichen', shichen: '申' }, label: '老公' } });
    const bz = (c) => c.pillars.map((x) => x.gan + x.zhi).join(' ');
    const old = { ...me.profile, day: 3 };
    const long = Array.from({ length: 6 }, (_, i) => `### 第${i + 1}段\n你这个盘啊，日主坐下有根，性子稳，做事有章法。感情上慢热，但一旦认定就很长情。这几年运势在往上走，适合把握机会，别太犹豫。`).join('\n\n');
    const items = [
      { type: 'user', text: '1995年9月3号早上8点 女 成都，想问感情' },
      { type: 'confirm', status: 'confirmed', stale: true, profile: old, id: me.profile.id },
      { type: 'chart', chart: hb.chart, stale: true },
      { type: 'bot', text: long },
      { type: 'user', text: '记错了应该是4号' },
      { type: 'bot', text: '哦，4号，不是3号啊。日子一变，日柱就跟着变，盘得重排。我把改动标在下面了，你看一眼没问题就点「按这个重排」。' },
      { type: 'confirm', status: 'editing', correction: { id: me.profile.id, changed: { date: '3号' } }, profile: { ...me.profile, correction: { id: me.profile.id, changed: { date: '3号' } } }, id: me.profile.id },
      { type: 'confirm', status: 'confirmed', profile: me.profile, id: me.profile.id },
      { type: 'chart', chart: me.chart },
      { type: 'bot', text: long },
      { type: 'user', text: '帮我老公也看看吧' },
      { type: 'confirm', status: 'moved', profile: hb.profile, id: hb.profile.id },
      { type: 'switch', profileId: hb.profile.id, label: '老公' },
      { type: 'user', text: '那我和老公合不合？' },
      { type: 'compat', card: { a: { label: '我', bazi: bz(me.chart) }, b: { label: '老公', bazi: bz(hb.chart) }, good: ['日干相生', '五行互补'], bad: ['夫妻宫相刑'] } },
      { type: 'bot', text: long },
    ];
    const st = { v: 2, cid: me.cid, profileId: me.profile.id, label: '我', items, llm: [], pending: null, profile: me.profile, quick: ['我的事业怎么样', '今年要注意什么', '感情呢'], stream: null };
    return { tok, st, mig: localStorage.getItem('mingpan-migrated') };
  });
  await ctx0.close();
  const results = [];
  for (const [tag, w, h, mobile, touch = true] of (process.env.ONLY ? VPS.filter((v) => v[0] === process.env.ONLY) : VPS)) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: touch, locale: 'zh-CN' });
    await ctx.addInitScript(([s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('mingpan-token', s.tok); localStorage.setItem('mingpan-migrated', '1'); localStorage.setItem('mingpan-v3', JSON.stringify({ active: s.st.cid, convs: { [s.st.cid]: s.st }, order: [s.st.cid] })); sessionStorage.setItem('seeded', '1'); } }, [seed]);
    const p = await ctx.newPage(); const errs = [];
    p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    await p.goto(URL); await p.waitForTimeout(1500);
    const shot = (n) => p.screenshot({ path: `${OUT}${tag}-${n}.png` });
    const r = { tag, w, h };
    // A) 对话：更正卡片展开成表单 + 旧盘展开
    await p.evaluate(() => { document.querySelectorAll('.old-chart details').forEach((d) => (d.open = true)); });
    await p.click('.cf-card.is-corr .cf-act .ghost');
    await p.waitForTimeout(300);
    await p.evaluate(() => document.querySelector('.cf.edit')?.scrollIntoView({ block: 'start' }));
    await shot('a-edit-card');
    r.chat = await p.evaluate(MEASURE);
    // 卡片里取消 → 看完成态卡片、切换、合盘、快捷回复与回到底部按钮
    await p.click('.cf.edit .cf-act .ghost'); await p.waitForTimeout(200);
    await p.evaluate(() => document.querySelector('.cf-card.is-corr')?.scrollIntoView({ block: 'center' }));
    await shot('b-corr-card');
    await p.evaluate(() => document.querySelector('.row-switch')?.scrollIntoView({ block: 'center' }));
    await p.waitForTimeout(500);
    await shot('c-switch-jump');
    r.chat2 = await p.evaluate(MEASURE);
    // B) 命主面板：列表 → 管理 → 改称呼 → 删除确认
    await p.click('.who-btn'); await p.waitForSelector('.sheet'); await p.waitForTimeout(400);
    await shot('d-sheet'); r.sheet = await p.evaluate(MEASURE);
    await p.click('.pf:not(.on) .pf-manage'); await p.waitForTimeout(250);
    await shot('e-manage'); r.manage = await p.evaluate(MEASURE);
    await p.click('.act-group:not(.danger-zone) .act:last-child'); await p.waitForTimeout(250);
    await shot('f-rename'); r.rename = await p.evaluate(MEASURE);
    await p.click('.sh-form .big.ghost'); await p.waitForTimeout(150);
    await p.click('.act.danger'); await p.waitForTimeout(250);
    await shot('g-delete-confirm'); r.del = await p.evaluate(MEASURE);
    r.delText = await p.$eval('.sh-confirm .q', (e) => e.innerText);
    await p.click('.sh-confirm .big.ghost'); await p.waitForTimeout(150);
    r.backAfterCancel = await p.$eval('.sheet-h b', (e) => e.innerText);
    // 软键盘弹出（Android resizes-content：视口变矮）时改称呼表单仍完整可见
    if (mobile && w <= 412) {
      await p.click('.act-group:not(.danger-zone) .act:last-child'); await p.waitForTimeout(200);
      await p.setViewportSize({ width: w, height: Math.round(h * 0.52) }); await p.waitForTimeout(400);
      r.kbVisible = await p.evaluate(() => { const b = [...document.querySelectorAll('.sh-form .big')].map((e) => e.getBoundingClientRect()); return b.every((x) => x.bottom <= innerHeight && x.top >= 0); });
      await shot('h-rename-keyboard');
    }
    if (process.env.FUNC) {
      await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(200);
      await p.click('.sh-form .big.ghost').catch(() => {}); await p.waitForTimeout(150);
      await p.click('.act-group:not(.danger-zone) .act:last-child'); await p.fill('#pf-name', '先生'); await p.click('.sh-form .big.primary');
      await p.waitForSelector('.act.danger'); r.afterRename = await p.$eval('.sheet-h b', (e) => e.innerText);
      await p.click('.act.danger'); await p.click('.sh-confirm .big.danger');
      await p.waitForSelector('.pf-list'); await p.waitForTimeout(400);
      r.afterDelete = await p.$$eval('.pf-list .pf b', (x) => x.map((e) => e.innerText.replace(/\s+/g, ' ')));
      await shot('i-after-delete');
      console.log('FUNC', r.tag, 'rename→', r.afterRename, '| list after delete:', r.afterDelete);
    }
    r.errs = errs;
    results.push(r);
    await ctx.close();
  }
  await b.close();
  const views = ['chat', 'chat2', 'sheet', 'manage', 'rename', 'del'];
  let gMin = Infinity, gMinWhat = '', gGap = Infinity, gGapWhat = '';
  for (const r of results) {
    console.log(`\n== ${r.tag} (${r.w}x${r.h}) coarse=${r.chat.coarse} errs=${r.errs.length} kbVisible=${r.kbVisible ?? '-'} del="${r.delText}" cancel→${r.backAfterCancel}`);
    for (const v of views) {
      const m = r[v];
      console.log(`  ${v.padEnd(6)} n=${m.n}${m.chips ? ' [' + m.chips + ']' : ''} minSide=${m.minSide.toFixed(1)} (${m.minS}) | minGap=${m.minGap} (${m.minGapPair})${m.small.length ? ' SMALL:' + m.small.join('; ') : ''}${m.tight.length ? ' TIGHT:' + m.tight.join('; ') : ''}`);
      if (m.minSide < gMin) { gMin = m.minSide; gMinWhat = `${r.tag}/${v}: ${m.minS}`; }
      if (m.minGap < gGap) { gGap = m.minGap; gGapWhat = `${r.tag}/${v}: ${m.minGapPair}`; }
    }
  }
  console.log(`\nSMALLEST hit area side: ${gMin.toFixed(1)}px — ${gMinWhat}\nSMALLEST gap: ${gGap}px — ${gGapWhat}`);
})().catch((e) => { console.error(e); process.exit(1); });

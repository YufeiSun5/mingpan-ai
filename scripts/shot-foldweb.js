// 宽屏折叠视角截图：node scripts/shot-foldweb.js [url] [prefix] [widths]
const { chromium } = require('playwright-core');
const URL = process.argv[2] || 'http://localhost:3000';
const PRE = process.argv[3] || 'foldweb-local';
const WS = (process.argv[4] || '900,1024,1280,1440,1920').split(',').map(Number);
const OUT = `/workspace/bazi-web/screenshots/${PRE}-`;
const H = { 900: 800, 1024: 700, 1280: 800, 1440: 900, 1920: 1080 };
const hs = (p) => p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
  frame: (() => { const r = document.querySelector('.shell').getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)}`; })(),
  app: Math.round(document.querySelector('.app').getBoundingClientRect().width),
  side: (() => { const s = document.querySelector('.side'); return s ? Math.round(s.getBoundingClientRect().width) : 0; })(),
  bubble: Math.max(0, ...[...document.querySelectorAll('.row:not(.me) .bubble')].map((b) => Math.round(b.getBoundingClientRect().width))),
  sideCard: (() => { const c = document.querySelector('.side-card'); return c ? Math.round(c.getBoundingClientRect().width) : 0; })(),
  cf: (() => { const c = document.querySelector('.cf-card'); return c ? Math.round(c.getBoundingClientRect().width) : 0; })() }));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const p = await ctx.newPage();
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(800);
  for (const w of WS) { await p.setViewportSize({ width: w, height: H[w] || 900 }); await p.waitForTimeout(250); await p.screenshot({ path: `${OUT}${w}-0-welcome.png` }); }
  await p.fill('#input', '1992年3月8日 下午3点 男 北京'); await p.click('#send');
  await p.waitForSelector('.cf-card .cf-act .primary', { timeout: 90000 }); await p.waitForTimeout(600);
  for (const w of WS) { await p.setViewportSize({ width: w, height: H[w] || 900 }); await p.waitForTimeout(250); console.log(w, 'pre', JSON.stringify(await hs(p))); await p.screenshot({ path: `${OUT}${w}-1-prechart.png` }); }
  // 编辑态（两列字段）
  const edit = await p.$('.cf-card .cf-act button:not(.primary)');
  if (edit) { await edit.click(); await p.waitForTimeout(300);
    for (const w of [1024, 1440]) if (WS.includes(w)) { await p.setViewportSize({ width: w, height: H[w] }); await p.waitForTimeout(200); await p.screenshot({ path: `${OUT}${w}-2-edit.png` }); } }
  await p.click('.cf-card .cf-act .primary');
  await p.waitForSelector('.mp-grid', { state: 'attached', timeout: 120000 });
  await p.waitForFunction(() => !document.querySelector('#send')?.disabled, null, { timeout: 180000 }).catch(() => {});
  await p.waitForTimeout(800);
  for (const w of WS) { await p.setViewportSize({ width: w, height: H[w] || 900 }); await p.waitForTimeout(300); console.log(w, 'chart', JSON.stringify(await hs(p))); await p.screenshot({ path: `${OUT}${w}-3-chart.png` }); }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });

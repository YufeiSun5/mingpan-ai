// 宜居城市卡片截图：node scripts/shot-cities.js [url] [prefix]
// 流程：建档 → 详批 → 点「我适合住哪个城市？」→ 截图（手机 / 320 / 宽屏）→「也看看国外的城市」→ 截图
const { chromium } = require('playwright-core');
const URL = process.argv[2] || 'http://localhost:3000';
const PRE = process.argv[3] || 'cities-local';
const OUT = `/workspace/bazi-web/screenshots/${PRE}-`;
const idle = (p) => p.waitForFunction(() => !document.querySelector('#send')?.disabled && !document.querySelector('.typing') && !document.querySelector('.caret'), null, { timeout: 240000 });
async function shots(p, tag) {
  for (const [w, h] of [[390, 844], [320, 640], [1440, 900]]) {
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(350);
    const card = (await p.$$('.row-cities')).pop();
    await card.evaluate((el) => el.scrollIntoView({ block: 'start' })); await p.waitForTimeout(200);
    const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      card: Math.round([...document.querySelectorAll('.ct-card')].pop().getBoundingClientRect().width),
      over: [...document.querySelectorAll('.ct-card *')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').length,
      quick: [...document.querySelectorAll('.quick button')].map((b) => { const r = b.getBoundingClientRect(); return `${b.textContent}:${Math.round(r.width)}x${Math.round(r.height)}`; }) }));
    console.log(tag, w, JSON.stringify(m));
    await p.screenshot({ path: `${OUT}${tag}-${w}.png` });
    await card.screenshot({ path: `${OUT}${tag}-${w}-card.png` });
  }
  await p.setViewportSize({ width: 390, height: 844 });
}
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(800);
  await p.fill('#input', '1995年9月8日 早上8点 女 成都'); await p.click('#send');
  await p.waitForSelector('.cf-card .cf-act .primary', { timeout: 90000 }); await p.waitForTimeout(400);
  await p.click('.cf-card .cf-act .primary');
  await p.waitForSelector('.mp-grid', { state: 'attached', timeout: 120000 });
  await p.waitForSelector('.quick button', { timeout: 300000 }); await idle(p);
  const chips = await p.$$eval('.quick button', (bs) => bs.map((x) => x.textContent));
  console.log('reading chips', chips.join(' / '));
  const pick = async (t) => { await p.click(`.quick button:has-text("${t}")`); await p.waitForSelector('.row-cities', { timeout: 60000 }); await p.waitForTimeout(500); await p.waitForSelector('.quick button', { timeout: 240000 }); await idle(p); await p.waitForTimeout(500); };
  await pick('我适合住哪个城市');
  await shots(p, 'cn');
  const t1 = await p.evaluate(() => [...document.querySelectorAll('.row:not(.me) .bubble')].slice(-6).map((x) => x.textContent).join('\n'));
  console.log('--- prose(cn) ---\n' + t1.slice(-1200));
  await pick('也看看国外的城市');
  await shots(p, 'abroad');
  const t2 = await p.evaluate(() => [...document.querySelectorAll('.row:not(.me) .bubble')].slice(-6).map((x) => x.textContent).join('\n'));
  console.log('--- prose(abroad) ---\n' + t2.slice(-1200));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });

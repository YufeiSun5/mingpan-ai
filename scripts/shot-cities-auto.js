// 详批后自动出现宜居城市卡片：node scripts/shot-cities-auto.js [url] [prefix]
// 校验：详批结束即有 1 张城市卡（不用点追问）；追问一句普通问题不再自动出卡；「也看看国外的城市」出海外卡；更正生辰后新盘再自动出一次
const { chromium } = require('playwright-core');
const URL = process.argv[2] || 'http://localhost:3000';
const PRE = process.argv[3] || 'cities-auto-local';
const OUT = `/workspace/bazi-web/screenshots/${PRE}-`;
const idle = (p) => p.waitForFunction(() => !document.querySelector('#send')?.disabled && !document.querySelector('.typing') && !document.querySelector('.caret'), null, { timeout: 300000 });
const nCards = (p) => p.$$eval('.row-cities', (x) => x.length);
const cards = (p) => p.$$eval('.ct-card', (cs) => cs.map((c) => [...c.querySelectorAll('.ct-t b')].map((b) => b.textContent).join('/')));
async function shots(p, tag) {
  for (const [w, h] of [[390, 844], [320, 640], [1440, 900]]) {
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(350);
    const card = (await p.$$('.row-cities')).pop();
    await card.evaluate((el) => el.scrollIntoView({ block: 'start' })); await p.waitForTimeout(200);
    const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      quick: [...document.querySelectorAll('.quick button')].map((b) => b.textContent) }));
    console.log(tag, w, JSON.stringify(m));
    await p.screenshot({ path: `${OUT}${tag}-${w}.png` });
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
  await p.waitForSelector('.quick button', { timeout: 300000 }); await idle(p); await p.waitForTimeout(600);
  console.log('after reading: cityCards=', await nCards(p), JSON.stringify(await cards(p)));
  console.log('chips:', (await p.$$eval('.quick button', (bs) => bs.map((x) => x.textContent))).join(' / '));
  await shots(p, 'auto');
  // 普通追问：不应再自动出卡
  await p.fill('#input', '我今年财运怎么样？'); await p.click('#send');
  await p.waitForTimeout(1500); await idle(p); await p.waitForTimeout(500);
  console.log('after followup: cityCards=', await nCards(p));
  // 也看看国外
  await p.click('.quick button:has-text("国外"), .quick button:has-text("国内")').catch(async () => { await p.fill('#input', '也看看国外的城市'); await p.click('#send'); });
  await p.waitForFunction((n) => document.querySelectorAll('.row-cities').length > n, 1, { timeout: 90000 }); await idle(p); await p.waitForTimeout(500);
  console.log('after abroad ask: cityCards=', await nCards(p), JSON.stringify(await cards(p)));
  await shots(p, 'abroad');
  const all = await p.evaluate(() => document.querySelector('.list')?.innerText || document.body.innerText);
  const leak = all.match(/IP|ip地址|定位|网络|所在(地区|城市|位置)|离你(现在)?(很)?近|你那边|你现在(所在|在的)|根据你的(位置|地区)/g);
  console.log('LEAK CHECK:', leak ? leak.join(',') : 'none');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });

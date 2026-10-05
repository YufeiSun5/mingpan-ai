// 聊天界面手机视口截图（使用真实后端）：node scripts/screenshot.js [url]
// 需要本机 Chrome/Chromium（CHROME_PATH 可指定）
const { chromium } = require('playwright-core');
const path = require('path');
const URL = process.argv[2] || 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'screenshots');
const PREFIX = process.env.SHOT_PREFIX || 'v2-';
const shot = (page, name, full) => page.screenshot({ path: `${OUT}/${PREFIX}${name}.png`, fullPage: !!full });
const expand = (page) => page.evaluate(() => { const a = document.querySelector('.app'), l = document.querySelector('#list'); a.style.setProperty('height', 'auto', 'important'); a.style.overflow = 'visible'; l.style.overflow = 'visible'; }); // 用 CSSOM 修改，不违反 CSP
const doneTurn = (page) => page.waitForFunction(() => !document.querySelector('#send').disabled, null, { timeout: 180000 });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN' });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error' || /Content Security Policy/i.test(m.text())) problems.push(m.text()); });
  page.on('requestfailed', (r) => problems.push('FAILED ' + r.url()));
  page.on('request', (r) => { if (!r.url().startsWith(new globalThis.URL(URL).origin) && !r.url().startsWith('data:')) problems.push('EXTERNAL ' + r.url()); });
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForTimeout(1200);
  await shot(page, '01-chat-greeting');

  await page.fill('#input', '1995年农历八月十五早上8点 女 成都，想问感情');
  await page.click('#send');
  await page.waitForSelector('#quick button.primary', { timeout: 60000 });
  await shot(page, '02-chat-confirm');

  await page.click('#quick button.primary');
  await page.waitForSelector('.caret', { timeout: 120000 });
  await page.waitForTimeout(9000);
  await shot(page, '03-chat-streaming');
  await doneTurn(page);
  await page.waitForTimeout(500);
  await page.evaluate(() => { const l = document.querySelector('#list'); l.style.scrollBehavior = 'auto'; const c = document.querySelector('.card').closest('.row'); l.scrollTop = c.offsetTop - 70; });
  await page.waitForTimeout(400);
  await shot(page, '04-chat-mingpan-card');
  await page.evaluate(() => { const l = document.querySelector('#list'); const c = document.querySelector('.card').closest('.row'); l.scrollTop = c.offsetTop + c.offsetHeight - 60; });
  await page.waitForTimeout(400);
  await shot(page, '05-chat-reading');

  await page.fill('#input', '我明年能结婚吗？');
  await page.click('#send');
  await page.waitForTimeout(300); await doneTurn(page); await page.waitForTimeout(500);
  await shot(page, '06-chat-followup');

  await expand(page); await page.waitForTimeout(300);
  await shot(page, '07-chat-full-conversation', true);
  console.log('页面问题：', problems.length ? problems : '无（无外部请求、无 CSP 报错）');
  await browser.close();
  console.log('截图已保存到', OUT);
})().catch((e) => { console.error(e); process.exit(1); });

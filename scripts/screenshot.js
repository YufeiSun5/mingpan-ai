// 聊天界面手机视口截图（使用真实后端）：node scripts/screenshot.js [url]
// 需要本机 Chrome/Chromium（CHROME_PATH 可指定）
const { chromium } = require('playwright-core');
const path = require('path');
const URL = process.argv[2] || 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'screenshots');
const shot = (page, name, full) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: !!full });
const expand = (page) => page.addStyleTag({ content: '.app{height:auto!important;min-height:100dvh}.list{overflow:visible!important}' });
const doneTurn = (page) => page.waitForFunction(() => !document.querySelector('#send').disabled, null, { timeout: 180000 });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN' });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await shot(page, '01-chat-greeting');

  await page.fill('#input', '1995年农历八月十五早上8点 女 成都，想问感情');
  await page.click('#send');
  await page.waitForSelector('#quick button.primary', { timeout: 60000 });
  await shot(page, '02-chat-confirm');

  await page.click('#quick button.primary');
  await page.waitForSelector('.caret', { timeout: 120000 });
  await page.waitForTimeout(6000);
  await shot(page, '03-chat-streaming');
  await doneTurn(page);
  await page.waitForTimeout(500);
  await shot(page, '04-chat-reading-end');

  await page.fill('#input', '我明年能结婚吗？');
  await page.click('#send');
  await page.waitForTimeout(300); await doneTurn(page); await page.waitForTimeout(500);
  await shot(page, '05-chat-followup');

  await expand(page); await page.waitForTimeout(300);
  await shot(page, '06-chat-full-conversation', true);
  await browser.close();
  console.log('截图已保存到', OUT);
})().catch((e) => { console.error(e); process.exit(1); });

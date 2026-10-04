// 手机视口截图：node scripts/screenshot.js [url]   需要本机有 Chrome/Chromium（CHROME_PATH 可指定）
const { chromium } = require('playwright-core');
const path = require('path');
const URL = process.argv[2] || 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'screenshots');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN' });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.screenshot({ path: `${OUT}/01-form.png`, fullPage: true });

  // 样例1：2000-01-01 12:00 男，公历，精确时间
  await page.click('[data-name=gender] [data-v=男]');
  await page.fill('[name=name]', '阿杰');
  await page.selectOption('#year', '2000'); await page.selectOption('#month', '1'); await page.selectOption('#day', '1');
  await page.fill('#time', '12:00');
  await page.click('#topics [data-v=事业]'); await page.click('#topics [data-v=财运]');
  await page.fill('[name=question]', '明年适合自己创业吗？');
  await page.screenshot({ path: `${OUT}/02-form-filled.png`, fullPage: true });
  await page.click('.submit');
  await page.waitForSelector('#resultView:not([hidden])', { timeout: 120000 });
  await page.screenshot({ path: `${OUT}/03-result-2000-male.png`, fullPage: true });
  await page.screenshot({ path: `${OUT}/03a-result-2000-male-top.png` });

  // 样例2：农历1995年八月十五 辰时 女，问感情
  await page.click('#again');
  await page.click('[data-name=gender] [data-v=女]');
  await page.fill('[name=name]', '小鱼');
  await page.click('[data-name=calendar] [data-v=lunar]');
  await page.selectOption('#year', '1995'); await page.selectOption('#month', '8'); await page.selectOption('#day', '15');
  await page.click('[data-name=timeMode] [data-v=shichen]'); await page.selectOption('#shichen', '辰');
  await page.click('#topics [data-v=事业]'); await page.click('#topics [data-v=财运]'); await page.click('#topics [data-v=感情]');
  await page.fill('[name=question]', '什么时候能遇到正缘？');
  await page.click('.submit');
  await page.waitForSelector('#resultView:not([hidden])', { timeout: 120000 });
  await page.screenshot({ path: `${OUT}/04-result-1995-female-lunar.png`, fullPage: true });
  await browser.close();
  console.log('截图已保存到', OUT);
})().catch((e) => { console.error(e); process.exit(1); });

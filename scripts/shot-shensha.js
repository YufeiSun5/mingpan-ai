// 参照案例排盘截图 + 横向滚动检测
const { chromium } = require('playwright-core');
const fs = require('fs');
const URL = process.argv[2] || 'http://localhost:3000';
const PRE = process.argv[3] || 'shensha-local';
const OUT = `/workspace/bazi-web/screenshots/${PRE}-`;
const VPS = [
  ['320', 320, 640], ['390', 390, 844], ['412', 412, 915],
  ['fold', 673, 841], ['desk', 1280, 900],
];

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN' });
  const p = await ctx.newPage();
  await p.goto(URL);
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForTimeout(800);

  // 走确认卡：发一句带生辰
  await p.fill('#input', '2002年7月28日早上7点04分 女，帮我排盘');
  await p.click('#send');
  await p.waitForSelector('.cf-card, #quick button.primary, .sh-form', { timeout: 60000 });
  await p.waitForTimeout(500);

  // 若有确认表单字段则填准
  const hasForm = await p.$('.cf-card, .sh-form');
  if (hasForm) {
    // try set fields if present
    await p.evaluate(() => {
      const set = (sel, v) => { const el = document.querySelector(sel); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } };
      set('input[name=year], #year', '2002');
      set('input[name=month], #month', '7');
      set('input[name=day], #day', '28');
      set('input[name=hour], #hour', '7');
      set('input[name=minute], #minute', '4');
    });
    // gender 女
    const female = await p.$('button:has-text("女"), .seg button:has-text("女")');
    if (female) await female.click();
  }
  // 确认
  const conf = await p.$('#quick button.primary, .cf-card button.primary, button:has-text("确认"), button:has-text("就这样")');
  if (conf) await conf.click();
  await p.waitForSelector('.mp-grid, .chart.mp', { timeout: 120000 });
  await p.waitForTimeout(800);

  // 展开神煞
  const bar = await p.$('button.sha-bar');
  if (bar) await bar.click();
  await p.waitForTimeout(300);

  // 滚动到命盘卡
  await p.evaluate(() => {
    const l = document.querySelector('#list');
    const c = document.querySelector('.chart.mp')?.closest('.row') || document.querySelector('.chart.mp');
    if (l && c) { l.style.scrollBehavior = 'auto'; l.scrollTop = (c.offsetTop || 0) - 60; }
  });
  await p.waitForTimeout(200);

  // 提取比对文本
  const info = await p.evaluate(() => {
    const root = document.querySelector('.chart.mp');
    const text = root ? root.innerText : '';
    const sha = [...document.querySelectorAll('.sha-chip')].map((e) => e.textContent);
    return { text: text.slice(0, 1200), sha, hasKun: /坤造/.test(text), qiYun: (text.match(/起运[^\n]*/)||[])[0], jiao: (text.match(/交运[^\n]*/)||[])[0] };
  });
  console.log(JSON.stringify(info, null, 2));

  for (const [tag, w, h] of VPS) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(250);
    await p.evaluate(() => {
      const l = document.querySelector('#list');
      const c = document.querySelector('.chart.mp')?.closest('.row') || document.querySelector('.chart.mp');
      if (l && c) { l.scrollTop = (c.offsetTop || 0) - 40; }
    });
    const hscroll = await p.evaluate(() => {
      const de = document.documentElement, b = document.body;
      const page = Math.max(de.scrollWidth, b.scrollWidth) > Math.max(de.clientWidth, b.clientWidth) + 1;
      const grid = document.querySelector('.mp-grid');
      const g = grid ? grid.scrollWidth > grid.clientWidth + 1 : false;
      return { page, grid, sw: de.scrollWidth, cw: de.clientWidth };
    });
    console.log(tag, 'hscroll', hscroll);
    await p.screenshot({ path: `${OUT}${tag}.png` });
    // crop chart only
    const box = await p.evaluate(() => {
      const el = document.querySelector('.chart.mp');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(r.width, window.innerWidth), height: Math.min(r.height, window.innerHeight - Math.max(0, r.y)) };
    });
    if (box && box.width > 40 && box.height > 40) {
      await p.screenshot({ path: `${OUT}${tag}-chart.png`, clip: box });
    }
  }

  // tap a 神煞
  await p.setViewportSize({ width: 390, height: 844 });
  const shaBtn = await p.$('.side .sha-chip, .row-chart .sha-chip');
  if (shaBtn) {
    await shaBtn.click();
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}tip.png` });
    const ok = await p.$('.sha-tip-ok');
    if (ok) await ok.click();
  }

  fs.writeFileSync(`${OUT}meta.json`, JSON.stringify(info, null, 2));
  await b.close();
  console.log('done', OUT);
})().catch((e) => { console.error(e); process.exit(1); });

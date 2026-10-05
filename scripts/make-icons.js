// 用本机 Chrome 把 SVG 渲染为 PNG 图标与分享图：node scripts/make-icons.js
const { chromium } = require('playwright-core');
const fs = require('fs'); const path = require('path');
const A = path.join(__dirname, '..', 'public', 'assets');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const icon = fs.readFileSync(path.join(A, 'icon.svg'), 'utf8');
  for (const s of [32, 180, 192, 512]) {
    const p = await b.newPage({ viewport: { width: s, height: s } });
    await p.setContent(`<html><body style="margin:0">${icon.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body></html>`);
    await p.screenshot({ path: path.join(A, s === 180 ? 'apple-touch-icon.png' : `icon-${s}.png`), omitBackground: true }); await p.close();
  }
  const logo = fs.readFileSync(path.join(A, 'logo.svg'), 'utf8');
  const font = fs.readFileSync(path.join(A, 'xz-display.woff2')).toString('base64');
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.setContent(`<html><head><style>@font-face{font-family:X;src:url(data:font/woff2;base64,${font})}
    body{margin:0;width:1200px;height:630px;display:flex;align-items:center;justify-content:center;gap:56px;background:radial-gradient(circle at 30% 20%,#fbf6ec,#efe3cc);font-family:X,serif;color:#2a2420}
    .t h1{font-size:92px;letter-spacing:18px;margin:0}.t p{font-size:38px;letter-spacing:10px;color:#a3242a;margin:18px 0 0}.t small{display:block;margin-top:26px;font-size:26px;letter-spacing:6px;color:#8c7a6a}
    .f{position:absolute;inset:22px;border:3px solid #b8935a;border-radius:10px}.f2{position:absolute;inset:34px;border:1px solid #e3cc98;border-radius:6px}</style></head>
    <body><div class="f"></div><div class="f2"></div>${logo.replace('<svg ', '<svg width="300" height="300" ')}<div class="t"><h1>玄真国学</h1><p>传统文化 · 生辰解读</p><small>四柱 · 五行 · 大运流年　仅供娱乐参考</small></div></body></html>`);
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(A, 'og.png') });
  await b.close(); console.log('icons ok');
})();

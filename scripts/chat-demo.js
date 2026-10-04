// 端到端聊天演示：node scripts/chat-demo.js [baseUrl]  → samples/chat-transcript.md
const fs = require('fs'); const path = require('path');
const BASE = process.argv[2] || 'http://localhost:3000';
const turns = [
  { text: '你好，想找大师算一算' },
  { text: '我是95年农历八月十五早上8点出生的，女生，在成都，最近想问问感情' },
  { text: '对，开始排盘', action: 'confirm' },
  { text: '我明年能结婚吗？' },
  { text: '2019年是不是不太顺？' },
];
const S = { llm: [], pending: null, profile: null };
let md = `# 聊天演示记录\n\n生成于 ${new Date().toLocaleString('zh-CN')}，服务 ${BASE}\n\n`;
async function turn({ text, action }) {
  S.llm.push({ role: 'user', content: text });
  md += `**👤 用户：** ${text}${action ? `（点击快捷按钮，action=${action}）` : ''}\n\n`;
  const t0 = Date.now(); let first = 0;
  const r = await fetch(BASE + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: S.llm.slice(-16), pending: S.pending, profile: S.profile, action }) });
  const txt = await r.text();
  let stream = '';
  const flush = () => { if (stream.trim()) { md += `**🧙 大师：**\n\n${stream.trim()}\n\n`; S.llm.push({ role: 'assistant', content: stream }); } stream = ''; };
  for (const block of txt.split('\n\n')) {
    const ev = (block.match(/^event: (.*)$/m) || [])[1], data = (block.match(/^data: (.*)$/m) || [])[1];
    if (!ev || !data || ev === 'ping') continue;
    const d = JSON.parse(data);
    if (ev === 'delta') { stream += d.text; continue; }
    flush();
    if (ev === 'text') { md += `**🧙 大师：** ${d.text.replace(/\n/g, '  \n')}\n\n`; S.llm.push({ role: 'assistant', content: d.text }); }
    if (ev === 'chart') md += `> 📜 **[命盘卡片]** ${d.chart.pillars.map((p) => p.ganZhi).join(' ')}｜${d.chart.lunar}｜日主${d.chart.dayMaster.gan}${d.chart.dayMaster.wuXing}${d.chart.dayMaster.strength}｜喜用${d.chart.xiYong.join('')}｜当前大运${d.chart.daYun.find((x) => d.chart.nowYear >= x.startYear && d.chart.nowYear <= x.endYear)?.ganZhi}\n\n`;
    if (ev === 'pending') S.pending = d.pending;
    if (ev === 'profile') { S.profile = d.profile; S.pending = null; }
    if (ev === 'quick') md += `> 快捷回复：${d.replies.map((q) => `［${q}］`).join(' ')}\n\n`;
    if (ev === 'error') md += `> ⚠️ ${d.error}\n\n`;
    if (ev === 'done' && d.source) md += `<sub>来源：${d.source}</sub>\n\n`;
  }
  flush();
  const ms = Date.now() - t0;
  md += `<sub>本轮耗时 ${(ms / 1000).toFixed(1)}s</sub>\n\n---\n\n`;
  console.log(`[${(ms / 1000).toFixed(1)}s] ${text}`);
}
(async () => { for (const t of turns) await turn(t); fs.mkdirSync(path.join(__dirname, '..', 'samples'), { recursive: true }); fs.writeFileSync(path.join(__dirname, '..', 'samples', 'chat-transcript.md'), md); console.log('saved samples/chat-transcript.md'); })();

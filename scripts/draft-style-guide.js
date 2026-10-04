#!/usr/bin/env node
// 用法：node scripts/draft-style-guide.js <文件夹> [输出文件]
// 读取文件夹（含子目录）里所有 .txt/.md，交给大模型总结文风，输出到 style/style-guide.draft.md（不会覆盖正式文件）。
// 需要先配置 LLM（如 DEEPSEEK_API_KEY）。
require('../lib/env');
const fs = require('fs');
const path = require('path');
const { chat, getProvider } = require('../lib/llm');
const { readTemplate, fill } = require('../lib/prompt');

const dir = process.argv[2];
const out = process.argv[3] || path.join(__dirname, '..', 'style', 'style-guide.draft.md');
if (!dir) { console.error('用法：npm run draft-style -- <聊天记录文件夹> [输出文件]'); process.exit(1); }
const p = getProvider();
if (!p.available) { console.error(`未配置 ${p.name} 的 API Key，无法起草。请先设置环境变量（见 .env.example）。`); process.exit(1); }

const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const fp = path.join(d, f); fs.statSync(fp).isDirectory() ? walk(fp) : /\.(txt|md)$/i.test(f) && files.push(fp); } })(dir);
if (!files.length) { console.error('文件夹里没有 .txt / .md 文件'); process.exit(1); }
const MAX = +(process.env.STYLE_CORPUS_MAX_CHARS || 40000);
let corpus = '', used = 0;
for (const f of files.sort()) {
  const t = fs.readFileSync(f, 'utf8').replace(/1[3-9]\d{9}/g, '[手机号]').trim();
  if (corpus.length + t.length > MAX) { corpus += '\n-----\n' + t.slice(0, MAX - corpus.length); used++; break; }
  corpus += '\n-----\n' + t; used++;
}
(async () => {
  const tpl = readTemplate('style-draft.md');
  console.log(`读取 ${used}/${files.length} 个文件，共 ${corpus.length} 字，调用 ${p.name}/${p.model} ...`);
  const text = await chat([{ role: 'system', content: tpl.system }, { role: 'user', content: fill(tpl.user, { CORPUS: corpus }) }], { temperature: 0.4 });
  fs.writeFileSync(out, `<!-- 由 draft-style-guide.js 于 ${new Date().toLocaleString('zh-CN')} 根据 ${used} 个文件自动起草。请人工检查后改名为 style-guide.md 生效。 -->\n` + text);
  console.log('已写入', out);
})().catch((e) => { console.error('失败：', e.message); process.exit(1); });

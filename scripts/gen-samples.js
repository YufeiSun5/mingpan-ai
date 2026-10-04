// 用真实大模型生成样例解读：node scripts/gen-samples.js  → samples/*.md
require('../lib/env');
const fs = require('fs'); const path = require('path');
const { handleReading } = require('../lib/handler');
const { getLastUsage } = require('../lib/llm');
const { chartToText } = require('../lib/prompt');
const cases = [
  { file: '2000-01-01-男-事业财运', body: { name: '阿杰', gender: '男', year: 2000, month: 1, day: 1, hour: 12, minute: 0, topics: ['事业', '财运'] } },
  { file: '农历1995-08-15-辰时-女-感情', body: { name: '小鱼', gender: '女', calendar: 'lunar', year: 1995, month: 8, day: 15, shichen: '辰', topics: ['感情'] } },
];
(async () => {
  for (const c of cases) {
    const t0 = Date.now();
    const r = await handleReading(c.body);
    const ms = Date.now() - t0, u = getLastUsage();
    const out = `<!-- 模型：${r.source}｜耗时 ${(ms / 1000).toFixed(1)}s｜tokens 输入 ${u?.prompt_tokens} / 输出 ${u?.completion_tokens}｜生成于 ${new Date().toLocaleString('zh-CN')} -->\n\n# 排盘数据\n\n\`\`\`\n${chartToText(r.chart)}\n\`\`\`\n\n# 解读\n\n${r.reading}\n`;
    fs.writeFileSync(path.join(__dirname, '..', 'samples', c.file + '.md'), out);
    console.log(c.file, r.source, ms + 'ms', u?.prompt_tokens, u?.completion_tokens, r.llmError || '');
  }
})();

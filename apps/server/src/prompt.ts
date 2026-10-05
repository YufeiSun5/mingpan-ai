import { proText } from '@mingpan/core';
import * as fs from 'fs';
import * as path from 'path';
const ROOT = path.join(__dirname, '..');

function readTemplate(file) {
  const raw = fs.readFileSync(path.join(ROOT, 'prompts', file), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const [, sys = '', user = ''] = raw.split(/===SYSTEM===|===USER===/);
  return { system: sys.trim(), user: user.trim() };
}
const fill = (s, vars) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? ''));

function loadStyle() {
  const dir = path.join(ROOT, 'style');
  const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, '').trim();
  let guide = '';
  try { guide = strip(fs.readFileSync(path.join(dir, 'style-guide.md'), 'utf8')); } catch {}
  const max = +(process.env.STYLE_MAX_EXAMPLES || 3);
  const maxChars = +(process.env.STYLE_EXAMPLE_MAX_CHARS || 2500);
  let examples = [];
  try {
    examples = fs.readdirSync(path.join(dir, 'examples')).filter((f) => /\.(md|txt)$/i.test(f)).sort().slice(0, max)
      .map((f, i) => `--- 范例${i + 1} ---\n` + strip(fs.readFileSync(path.join(dir, 'examples', f), 'utf8')).replace(/\p{Extended_Pictographic}\uFE0F?/gu, '').slice(0, maxChars));
  } catch {}
  return { guide: guide || '温和、亲切、吉祥。', examples: examples.join('\n\n') || '（暂无范例）' };
}

function chartToText(c) {
  const L = [];
  L.push(`性别：${c.input.gender}　生肖：${c.shengXiao}　星座：${c.xingZuo}`);
  L.push(`公历：${c.input.clockTime}${c.trueSolar ? `（真太阳时 ${c.trueSolar.time}，${c.trueSolar.city}）` : ''}${c.input.timeUnknown ? '（出生时辰不详，时柱不参与论断）' : ''}`);
  L.push(`农历：${c.lunar}`);
  L.push('四柱：');
  c.pillars.forEach((p) => {
    if (p.unknown) return L.push(`  ${p.label}：不详`);
    L.push(`  ${p.label}：${p.ganZhi}（天干${p.gan}${p.ganWx}·${p.shiShenGan}；地支${p.zhi}${p.zhiWx}，藏干${p.hideGan.join('')}·${p.shiShenZhi.join('/')}；纳音${p.naYin}；${p.diShi}）`);
  });
  L.push(`日主：${c.dayMaster.gan}${c.dayMaster.wuXing}（${c.dayMaster.yinYang}），${c.dayMaster.strength}（同党力量占比${Math.round(c.dayMaster.ratio * 100)}%）`);
  L.push(`五行个数：${Object.entries(c.wuXingCount).map(([k, v]) => k + v).join(' ')}${c.missing.length ? `；缺${c.missing.join('、')}` : ''}`);
  L.push(`喜用神：${c.xiYong.join('、')}；忌神：${c.jiShen.join('、')}`);
  L.push(`起运：出生后${c.yun.startYear}年${c.yun.startMonth}个月起运（${c.yun.startDate}），大运${c.yun.forward ? '顺' : '逆'}排`);
  L.push('大运：' + c.daYun.slice(0, 8).map((d) => `${d.ganZhi}(${d.startYear}-${d.endYear}，${d.startAge}-${d.endAge}岁，${d.shiShen})`).join('；'));
  const cur = c.daYun.find((d) => c.nowYear >= d.startYear && c.nowYear <= d.endYear);
  if (cur) { const i = c.daYun.indexOf(cur); L.push(`当前大运：${cur.ganZhi}（${cur.startYear}年起至${cur.endYear}年，${cur.shiShen}）${i > 0 ? `；上一步大运：${c.daYun[i - 1].ganZhi}（${c.daYun[i - 1].startYear}-${c.daYun[i - 1].endYear}）` : ''}；下一步大运：${c.daYun[i + 1].ganZhi}（${c.daYun[i + 1].startYear}年起）`); }
  L.push(`月令（月支）：${c.pillars[1].zhi}，十神${c.pillars[1].shiShenZhi[0]}`);
  L.push('开运参考（按喜用神计算，开运建议须以此为准）：' + c.luck.map((l) => `${l.wuXing}——颜色${l.colors.join('/')}，方位${l.direction}，数字${l.numbers.join('/')}，物品${l.items}`).join('；'));
  L.push('流年（虚岁）：');
  c.liuNian.forEach((y) => L.push(`  ${y.year} ${y.ganZhi} ${y.age}岁 ${y.shiShen} 大运${y.daYun}${c.daYun.some((d) => d.startYear === y.year) ? '（本年换入此大运）' : ''}${y.relations.length ? ' ' + y.relations.join('、') : ''} ${y.favorable > 0 ? '喜' : y.favorable < 0 ? '忌' : '平'}${y.current ? ' ←今年' : ''}`));
  if (c.extraLiuNian?.length) {
    L.push('追问涉及的其他流年：');
    c.extraLiuNian.forEach((y) => L.push(`  ${y.year} ${y.ganZhi} ${y.age}岁 ${y.shiShen} 大运${y.daYun}${y.relations.length ? ' ' + y.relations.join('、') : ''} ${y.favorable > 0 ? '喜' : y.favorable < 0 ? '忌' : '平'}`));
  }
  if (c.pro) L.push(proText(c.pro));
  return L.join('\n');
}

function questionsText(q) {
  const topics = (q?.topics || []).join('、') || '综合运势';
  return `关注：${topics}${q?.text ? `\n补充描述：${q.text}` : ''}`;
}

function buildReadingMessages(chart, questions, extra: any = {}) {
  const t = readTemplate('reading.md');
  const style = loadStyle();
  const vars = { STYLE_GUIDE: style.guide, EXAMPLES: style.examples, CHART: chartToText(chart), QUESTIONS: questionsText(questions), NAME: chart.input.name || '这位朋友', NOW_YEAR: chart.nowYear, ...extra };
  return [{ role: 'system', content: fill(t.system, vars) }, { role: 'user', content: fill(t.user, vars) }];
}

export { buildReadingMessages, chartToText, readTemplate, fill, loadStyle };

// 合盘 / 合婚：两张命盘之间的关系，全部由程序计算（日干合冲生克、年支生肖、日支夫妻宫、五行互补），再交给模型解读
import type { Chart } from './types';
import { GAN_HE, GAN_CHONG, LIU_HE, SAN_HE, LIU_CHONG, HAI, PO, XING3, pairHas, pairKey } from './pro';

const WX_SHENG: Record<string, string> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const WX_KE: Record<string, string> = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
const ZODIAC: Record<string, string> = { 子: '鼠', 丑: '牛', 寅: '虎', 卯: '兔', 辰: '龙', 巳: '蛇', 午: '马', 未: '羊', 申: '猴', 酉: '鸡', 戌: '狗', 亥: '猪' };

function zhiRel(a: string, b: string): string[] {
  const out: string[] = [];
  if (a === b) out.push('同支');
  const lh = pairKey(LIU_HE, a, b); if (lh) out.push(`六合（合${lh}）`);
  for (const [g, w] of Object.entries(SAN_HE)) if (a !== b && g.includes(a) && g.includes(b)) out.push(`三合（同属${g}${w}局）`);
  if (pairHas(LIU_CHONG, a, b)) out.push('六冲');
  for (const [x, y, z, n] of XING3) if (a !== b && [x, y, z].includes(a) && [x, y, z].includes(b)) out.push(`相刑（${n}）`);
  if ((a === '子' && b === '卯') || (a === '卯' && b === '子')) out.push('相刑（无礼之刑）');
  if (a === b && '辰午酉亥'.includes(a)) out.push('自刑');
  if (pairHas(HAI, a, b)) out.push('相害');
  if (pairHas(PO, a, b)) out.push('相破');
  return out;
}
function ganRel(a: string, wa: string, b: string, wb: string): string {
  const h = pairKey(GAN_HE, a, b); if (h) return `天干五合（${a}${b}合${h}）`;
  if (pairHas(GAN_CHONG, a, b)) return `天干相冲（${a}${b}冲）`;
  if (wa === wb) return `同为${wa}，比和`;
  if (WX_SHENG[wa] === wb) return `${a}${wa}生${b}${wb}（前者生扶后者）`;
  if (WX_SHENG[wb] === wa) return `${b}${wb}生${a}${wa}（后者生扶前者）`;
  if (WX_KE[wa] === wb) return `${a}${wa}克${b}${wb}（前者克制后者）`;
  if (WX_KE[wb] === wa) return `${b}${wb}克${a}${wa}（后者克制前者）`;
  return '无明显生克';
}
const topWx = (c: Chart) => Object.entries(c.wuXingPower).sort((x, y) => y[1] - x[1]).map(([k]) => k);

export interface CompatResult { lines: string[]; good: string[]; bad: string[] }
/** 两人关系；nameA / nameB 用于文本里的称呼 */
export function compatRelations(a: Chart, b: Chart, nameA = '甲方', nameB = '乙方'): CompatResult {
  const good: string[] = [], bad: string[] = [], lines: string[] = [];
  const dA = a.pillars[2], dB = b.pillars[2], yA = a.pillars[0], yB = b.pillars[0];
  const g = ganRel(dA.gan, dA.ganWx, dB.gan, dB.ganWx);
  lines.push(`日干（${nameA}${dA.gan}${dA.ganWx}·${nameB}${dB.gan}${dB.ganWx}）：${g}`);
  if (/五合|生扶|比和/.test(g)) good.push(`日干${g.replace(/（.*$/, '')}`); else if (/相冲|克制/.test(g)) bad.push(`日干${g.replace(/（.*$/, '')}`);
  const yr = zhiRel(yA.zhi, yB.zhi);
  lines.push(`年支生肖（${nameA}属${ZODIAC[yA.zhi]}${yA.zhi}·${nameB}属${ZODIAC[yB.zhi]}${yB.zhi}）：${yr.length ? yr.join('、') : '无合冲刑害'}`);
  yr.forEach((r) => (/合/.test(r) ? good : /冲|刑|害|破/.test(r) ? bad : []).push?.(`生肖${r}`));
  const dr = zhiRel(dA.zhi, dB.zhi);
  lines.push(`日支·夫妻宫（${nameA}${dA.zhi}·${nameB}${dB.zhi}）：${dr.length ? dr.join('、') : '无合冲刑害'}`);
  dr.forEach((r) => (/合/.test(r) ? good : /冲|刑|害|破/.test(r) ? bad : []).push?.(`夫妻宫${r}`));
  // 五行互补：一方的旺五行恰是另一方的喜用 → 互补；一方的旺五行是另一方的忌神 → 相耗
  const tA = topWx(a).slice(0, 2), tB = topWx(b).slice(0, 2);
  const helpsA = tB.filter((w) => a.xiYong.includes(w as any)), helpsB = tA.filter((w) => b.xiYong.includes(w as any));
  const hurtsA = tB.filter((w) => a.jiShen.includes(w as any)), hurtsB = tA.filter((w) => b.jiShen.includes(w as any));
  lines.push(`五行：${nameA}喜${a.xiYong.join('')}忌${a.jiShen.join('')}，旺${tA.join('')}；${nameB}喜${b.xiYong.join('')}忌${b.jiShen.join('')}，旺${tB.join('')}`);
  if (helpsA.length) good.push(`${nameB}旺的${helpsA.join('')}正是${nameA}的喜用`);
  if (helpsB.length) good.push(`${nameA}旺的${helpsB.join('')}正是${nameB}的喜用`);
  if (hurtsA.length) bad.push(`${nameB}旺的${hurtsA.join('')}是${nameA}的忌神`);
  if (hurtsB.length) bad.push(`${nameA}旺的${hurtsB.join('')}是${nameB}的忌神`);
  const fillA = a.missing.filter((w) => (b.wuXingCount as any)[w] >= 2), fillB = b.missing.filter((w) => (a.wuXingCount as any)[w] >= 2);
  if (fillA.length) good.push(`${nameA}命里缺${fillA.join('')}，${nameB}命里正好有`);
  if (fillB.length) good.push(`${nameB}命里缺${fillB.join('')}，${nameA}命里正好有`);
  // 日主强弱搭配
  lines.push(`日主强弱：${nameA}${a.dayMaster.strength}，${nameB}${b.dayMaster.strength}`);
  lines.push(`有利：${good.length ? good.join('；') : '无特别突出的相合'}`);
  lines.push(`不利：${bad.length ? bad.join('；') : '无明显冲克'}`);
  return { lines, good, bad };
}
export const briefBazi = (c: Chart) => c.pillars.map((p) => (p.unknown ? '??' : p.gan + p.zhi)).join(' ');

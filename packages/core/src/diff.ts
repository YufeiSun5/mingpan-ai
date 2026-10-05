// 生辰更正后的对比：字段差异（给确认卡片标注"原：3号"）与命盘差异（由程序计算，不交给模型）
import type { Chart, Profile } from './types';

const CN_M = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const CN_D = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
const pad = (n?: number) => String(n ?? 0).padStart(2, '0');
export const timeLabel = (p: Profile) => (!p.time || p.time.type === 'unknown' ? '时辰不详' : p.time.type === 'shichen' ? `${p.time.shichen}时` : `${pad(p.time.hour)}:${pad(p.time.minute)}`);
const dayLabel = (p: Profile) => (p.calendar === 'lunar' ? CN_D[(p.day || 1) - 1] : `${p.day}号`);
const monthLabel = (p: Profile) => (p.calendar === 'lunar' ? `${p.leap ? '闰' : ''}${CN_M[(p.month || 1) - 1]}月` : `${p.month}月`);

/** 时间的规范化表示（数据库 JSONB 会重排键顺序，不能直接比较 JSON 字符串） */
export const timeKey = (t?: Profile['time']) => (!t || t.type === 'unknown' ? 'unknown' : t.type === 'shichen' ? `s:${t.shichen}` : `e:${t.hour ?? 0}:${t.minute ?? 0}`);
/** 卡片上的字段键：gender | calendar | date | time | city | label */
export type FieldKey = 'gender' | 'calendar' | 'date' | 'time' | 'city' | 'label';
/** 比较两份生辰，返回 {字段: 原来的显示文本}（只含有变化的字段） */
export function profileChanges(prev: Profile, next: Profile): Partial<Record<FieldKey, string>> {
  const out: Partial<Record<FieldKey, string>> = {};
  if (prev.gender !== next.gender && prev.gender) out.gender = prev.gender;
  if ((prev.calendar || 'solar') !== (next.calendar || 'solar')) out.calendar = prev.calendar === 'lunar' ? '农历' : '公历';
  if (prev.year !== next.year || prev.month !== next.month || prev.day !== next.day || !!prev.leap !== !!next.leap) {
    out.date = prev.year !== next.year ? `${prev.year}年${monthLabel(prev)}${dayLabel(prev)}` : prev.month !== next.month || !!prev.leap !== !!next.leap ? `${monthLabel(prev)}${dayLabel(prev)}` : dayLabel(prev);
  }
  if (timeKey(prev.time) !== timeKey(next.time)) out.time = timeLabel(prev);
  if ((prev.city || '') !== (next.city || '')) out.city = prev.city || '未填';
  return out;
}
/** 一句话描述字段更正（大师口吻用） */
export function changeSentence(prev: Profile, next: Profile): string {
  const c = profileChanges(prev, next);
  const parts: string[] = [];
  if (c.date) parts.push(`${prev.year !== next.year ? `${next.year}年${monthLabel(next)}${dayLabel(next)}` : prev.month !== next.month || !!prev.leap !== !!next.leap ? `${monthLabel(next)}${dayLabel(next)}` : dayLabel(next)}，不是${c.date}`);
  if (c.time) parts.push(`${timeLabel(next)}，不是${c.time}`);
  if (c.gender) parts.push(`${next.gender}命，不是${c.gender}命`);
  if (c.calendar) parts.push(`${next.calendar === 'lunar' ? '农历' : '公历'}，不是${c.calendar}`);
  if (c.city) parts.push(`生在${next.city || '（未填）'}，不是${c.city}`);
  return parts.join('；');
}

/** 命盘差异：四柱、日主、十神、身强弱、格局、喜用忌、大运起运与顺逆 */
export function chartDiff(a: Chart, b: Chart): { changed: boolean; lines: string[]; same: string[] } {
  const lines: string[] = [], same: string[] = [];
  a.pillars.forEach((p, i) => {
    const q = b.pillars[i];
    const pa = p.unknown ? '不详' : p.gan + p.zhi, pb = q.unknown ? '不详' : q.gan + q.zhi;
    if (pa !== pb) {
      const ss = i === 2 ? '' : !p.unknown && !q.unknown && p.shiShenGan !== q.shiShenGan ? `，天干十神${p.shiShenGan}→${q.shiShenGan}` : '';
      lines.push(`${p.label}：${pa} → ${pb}${ss}`);
    } else same.push(p.label);
  });
  const da = a.dayMaster, db = b.dayMaster;
  if (da.gan !== db.gan) lines.push(`日主：${da.gan}${da.wuXing} → ${db.gan}${db.wuXing}（四柱十神随之全部重算）`);
  if (da.strength !== db.strength) lines.push(`身强弱：${da.strength} → ${db.strength}`);
  const ga = a.pro?.geJu?.name, gb = b.pro?.geJu?.name;
  if (ga && gb && ga !== gb) lines.push(`格局：${ga} → ${gb}`);
  const xa = a.xiYong.join(''), xb = b.xiYong.join(''), ja = a.jiShen.join(''), jb = b.jiShen.join('');
  if (xa !== xb || ja !== jb) lines.push(`喜用神：${xa} → ${xb}；忌神：${ja} → ${jb}`); else same.push(`喜用神（${xb}）`);
  if (a.yun.forward !== b.yun.forward) lines.push(`大运：${a.yun.forward ? '顺排' : '逆排'} → ${b.yun.forward ? '顺排' : '逆排'}，整套大运都换了`);
  else {
    const dyA = a.daYun.map((d) => d.ganZhi).join(''), dyB = b.daYun.map((d) => d.ganZhi).join('');
    if (dyA !== dyB) lines.push(`大运：${a.daYun.slice(0, 3).map((d) => d.ganZhi).join('、')}… → ${b.daYun.slice(0, 3).map((d) => d.ganZhi).join('、')}…`);
    else if (a.daYun[0]?.startAge !== b.daYun[0]?.startAge) lines.push(`起运：${a.daYun[0]?.startAge}岁 → ${b.daYun[0]?.startAge}岁（每步大运交接的年份跟着挪了）`);
  }
  const curA = a.daYun.find((d) => a.nowYear >= d.startYear && a.nowYear <= d.endYear), curB = b.daYun.find((d) => b.nowYear >= d.startYear && b.nowYear <= d.endYear);
  if (curA && curB && (curA.ganZhi !== curB.ganZhi || curA.shiShen !== curB.shiShen) && !lines.some((l) => l.startsWith('大运'))) lines.push(`当前大运：${curA.ganZhi}（${curA.shiShen}）→ ${curB.ganZhi}（${curB.shiShen}）`);
  if ((a.trueSolar?.time || '') !== (b.trueSolar?.time || '') && b.trueSolar) lines.push(`真太阳时：按${b.trueSolar.city}校正为 ${b.trueSolar.time.slice(11, 16)}`);
  return { changed: lines.some((l) => !l.startsWith('真太阳时')), lines, same };
}
/** 大师口吻的命盘变化说明（开场白用） */
export function chartDiffText(a: Chart, b: Chart): string {
  const d = chartDiff(a, b);
  if (!d.changed) return `我对了一下，八字本身没有变化（四柱还是 ${b.pillars.filter((p) => !p.unknown).map((p) => p.gan + p.zhi).join(' ')}），之前看的那些依然作数。${d.lines.length ? `\n\n· ${d.lines.join('\n· ')}` : ''}`;
  const keep = d.same.filter((x) => /柱$/.test(x));
  return `跟原来那张盘比，变化在这几处：\n\n· ${d.lines.join('\n· ')}${keep.length ? `\n\n${keep.join('、')}没变。` : ''}`;
}

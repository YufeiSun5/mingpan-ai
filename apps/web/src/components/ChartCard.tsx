import type { Chart, Pillar } from '@mingpan/core';
import { Bar } from './Grow';
const GWX: Record<string, string> = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const ZWX: Record<string, string> = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
const SS_SHORT: Record<string, string> = { 比肩: '比', 劫财: '劫', 食神: '食', 伤官: '伤', 偏财: '才', 正财: '财', 七杀: '杀', 正官: '官', 偏印: '枭', 正印: '印' };
const GOOD = /贵人|禄|文昌|将星|金舆|天喜|红鸾|德/;
const W = ({ c }: { c: string }) => <span className={`wx-${GWX[c] || ZWX[c]}`}>{c}</span>;
const GZ = ({ gz }: { gz: string }) => <><W c={gz[0]} /><W c={gz[1]} /></>;

function Grid({ c, rows, pro }: { c: Chart; pro?: boolean; rows: [string, (p: Pillar, i: number) => React.ReactNode, string?][] }) {
  return (
    <div className={`pillars${pro ? ' pro' : ''}`}>
      <div className="rl hd" />
      {c.pillars.map((p, i) => <div key={i} className={`c hd${i === 2 ? ' day' : ''}`}>{pro ? p.label : p.label.slice(0, 1) + '柱'}</div>)}
      {rows.map(([label, fn, cls]) => [
        <div key={label} className="rl">{label}</div>,
        ...c.pillars.map((p, i) => <div key={label + i} className={`c${i === 2 ? ' day' : ''} ${cls || ''}`}>{p.unknown ? <i className="na">—</i> : fn(p, i)}</div>),
      ])}
    </div>
  );
}

export function ChartCard({ c, open }: { c: Chart; open?: boolean }) {
  const pro = c.pro;
  const cur = c.daYun.find((d) => c.nowYear >= d.startYear && c.nowYear <= d.endYear);
  const time = c.input.timeUnknown ? '时辰不详' : c.input.clockTime.slice(11, 16);
  const state = Object.fromEntries((pro?.wuXing || []).map((w) => [w.wx, w]));
  return (
    <div className="chart">
      <div className="mp-h">
        <div>
          <div className="mp-t">{c.input.name || '命盘'}<span className="seal">{c.input.gender === '男' ? '乾造' : '坤造'}</span></div>
          <div className="meta">公历 {c.input.clockTime.slice(0, 10)} {time}{c.trueSolar ? ` · 真太阳时 ${c.trueSolar.time.slice(11, 16)}` : ''}<br />农历 {c.lunar} · 属{c.shengXiao}</div>
        </div>
        {pro && <div className="gj"><b>{pro.geJu.name}</b><span>{pro.strength.label} {pro.strength.score}</span></div>}
      </div>
      <Grid c={c} rows={[
        ['主星', (p, i) => <span className="ss">{i === 2 ? (c.input.gender === '男' ? '元男' : '元女') : p.shiShenGan}</span>],
        ['天干', (p) => <W c={p.gan} />, 'big'],
        ['地支', (p) => <W c={p.zhi} />, 'big'],
        ['藏干', (p) => p.hideGan.map((g, k) => <span className="hg" key={k}><W c={g} /><small>{SS_SHORT[p.shiShenZhi[k]] || ''}</small></span>)],
        ...(pro ? [['神煞', (_p: Pillar, i: number) => (pro.pillars[i].shenSha.length
          ? pro.pillars[i].shenSha.map((n) => <span key={n} className={`sha ${GOOD.test(n) ? 'ji' : n === '空亡' || n === '羊刃' ? 'xiong' : ''}`}>{n}</span>)
          : <i className="na">—</i>), 'shas'] as [string, (p: Pillar, i: number) => React.ReactNode, string]] : []),
      ]} />
      <div className="wxc">{(Object.entries(c.wuXingCount) as [string, number][]).map(([k, v]) => <span key={k} className={`chip bg-${k}`}><b>{k}</b>{v}{state[k] && <em>{state[k].state}</em>}</span>)}</div>
      <div className="kv">
        <span>日主 <b>{c.dayMaster.gan}{c.dayMaster.wuXing}</b></span>
        {pro ? <><span>用神 <b>{pro.wushen.用神}</b>{pro.wushen.喜神 && <> 喜 <b>{pro.wushen.喜神}</b></>}</span><span>忌 <b className="neg">{[pro.wushen.忌神, pro.wushen.仇神].filter(Boolean).join('')}</b></span></> : <span>喜用 <b>{c.xiYong.join('')}</b></span>}
        <span>{c.missing.length ? <>缺 <b>{c.missing.join('')}</b></> : '五行俱全'}</span>
      </div>
      <div className="sec">大运<small>{pro ? pro.qiYun.replace('出生后', '').replace(/\d+小时/, '') : ''}</small></div>
      <div className="hs">{c.daYun.slice(0, 9).map((d) => (
        <div key={d.ganZhi} className={`dy${d === cur ? ' cur' : ''}`}><small>{d.startAge}岁</small><b><GZ gz={d.ganZhi} /></b><small>{d.shiShen}</small><small>{d.startYear}</small></div>
      ))}</div>
      {pro && (
        <details className="more" open={open}>
          <summary>展开专业排盘</summary>
          <Grid c={c} pro rows={[
            ['副星', (p) => p.shiShenZhi.map((s, k) => <span key={k}>{s}</span>), 'sm'],
            ['星运', (_p, i) => pro.pillars[i].xingYun, 'sm'],
            ['自坐', (_p, i) => pro.pillars[i].ziZuo, 'sm'],
            ['空亡', (_p, i) => pro.pillars[i].kongWang, 'sm'],
            ['纳音', (p) => p.naYin, 'sm'],
          ]} />
          <div className="sec">干支关系</div>
          <div className="rel">{[...pro.relations.gan, ...pro.relations.zhi].map((r) => <span key={r}>{r}</span>)}{!pro.relations.gan.length && !pro.relations.zhi.length && <span>无明显合冲</span>}</div>
          <div className="sec">五行力量<small>{pro.monthLing}</small></div>
          <div className="wx">{pro.wuXing.map((w) => <div className="w" key={w.wx}><b className={`wx-${w.wx}`}>{w.wx}</b><em>{w.state}</em><Bar pct={Math.max(3, w.pct)} className={`bg-${w.wx}`} /><span className="n">{w.pct}%</span></div>)}</div>
          <div className="sec">五神 · 格局</div>
          <div className="kv"><span>格局 <b>{pro.geJu.name}</b></span><span>{pro.geJu.note}</span>{Object.entries(pro.wushen).map(([k, v]) => <span key={k}>{k} <b>{v || '—'}</b></span>)}</div>
          <div className="sec">宫位 · 起运</div>
          <div className="kv">{pro.palaces.map((x) => <span key={x.k}>{x.k} <b>{x.v}</b> {x.ny}</span>)}<span>{pro.qiYun}</span><span>{pro.jiaoYun}</span></div>
          <div className="sec">流年</div>
          <div className="ln">
            <div className="lh"><span>年份</span><span>干支</span><span>十神</span><span>关系</span></div>
            {c.liuNian.map((y) => (
              <div key={y.year} className={`${y.current ? 'cur' : ''}${y.favorable > 0 ? ' fav' : y.favorable < 0 ? ' unfav' : ''}`}>
                <span>{y.year}<small>{y.age}岁</small></span><span><GZ gz={y.ganZhi} /></span><span>{y.shiShen}</span><span>{y.relations.join(' ') || '—'}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

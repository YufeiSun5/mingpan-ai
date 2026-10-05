import { useEffect, useMemo, useRef, useState } from 'react';
import type { Chart, DaYun, LiuNian, ProColumn } from '@mingpan/core';
import { Bar } from './Grow';

const W = ({ c }: { c: string }) => <span className={`wx-${{ 甲:'木',乙:'木',丙:'火',丁:'火',戊:'土',己:'土',庚:'金',辛:'金',壬:'水',癸:'水',子:'水',丑:'土',寅:'木',卯:'木',辰:'土',巳:'火',午:'火',未:'土',申:'金',酉:'金',戌:'土',亥:'水' }[c] || ''}`}>{c || '—'}</span>;

const emptyCol = (label: string): ProColumn => ({
  label, gan: '', zhi: '', ganWx: '', zhiWx: '', zhuXing: '—', hide: [],
  xingYun: '—', ziZuo: '—', kongWang: '—', xunShou: '—', naYin: '—', shenSha: [], unknown: true,
});

function Header({ c }: { c: Chart }) {
  const clock = c.input.clockTime; // YYYY-MM-DD HH:mm:ss
  const solar = `${clock.slice(0, 4)}年${+clock.slice(5, 7)}月${+clock.slice(8, 10)}日 ${c.input.timeUnknown ? '时辰不详' : clock.slice(11, 16)}`;
  // "壬午年（二〇〇二年）六月十九 辰时" → "二〇〇二年六月十九 辰时"
  const lunar = (c.lunar.match(/（([^）]+)）\s*(.*)$/) || [, '', c.lunar]).slice(1).join('').replace(/\s+/g, ' ').trim();
  const seal = c.input.gender === '男' ? '乾造' : '坤造';
  return (
    <div className="mp-head">
      <div className="mp-name">{c.input.name || '命盘'}<span className="seal">{seal}</span></div>
      <div className="mp-meta"><span>公历 {solar}</span><span>农历 {lunar}</span></div>
    </div>
  );
}

function Grid({ cols, shenOpen }: { cols: ProColumn[]; shenOpen: boolean }) {
  const labels = ['主星', '天干', '地支', '藏干', '星运', '自坐', '空亡', '旬首', '纳音', '神煞'];
  const cell = (col: ProColumn, row: string) => {
    if (col.unknown && row !== '主星') return <span className="na">—</span>;
    switch (row) {
      case '主星': return <span className="zx">{col.zhuXing}</span>;
      case '天干': return <span className="big"><W c={col.gan} /></span>;
      case '地支': return <span className="big"><W c={col.zhi} /></span>;
      case '藏干': return (
        <span className="hide">
          {(col.hide.length ? col.hide : [{ gan: '', ss: '' }]).map((h, i) => (
            <i key={i}><W c={h.gan} /><em>{h.ss}</em></i>
          ))}
        </span>
      );
      case '星运': return col.xingYun;
      case '自坐': return col.ziZuo;
      case '空亡': return col.kongWang;
      case '旬首': return <span className="ny"><W c={col.xunShou?.[0]} /><W c={col.xunShou?.[1]} /></span>;
      case '纳音': return <span className="ny-t">{col.naYin}</span>;
      case '神煞': {
        const list = col.shenSha || [];
        const show = shenOpen ? list : list.slice(0, 3);
        return (
          <span className="sha-list">
            {show.length ? show.map((n) => <i key={n}>{n}</i>) : <i className="na">—</i>}
            {!shenOpen && list.length > 3 && <i className="more-n">+{list.length - 3}</i>}
          </span>
        );
      }
      default: return null;
    }
  };
  return (
    <div className="mp-grid" role="table" aria-label="专业命盘">
      <div className="mp-row hd" role="row">
        <div className="mp-lab" role="columnheader" />
        {cols.map((c) => <div key={c.label} className="mp-cel hd" role="columnheader">{c.label.replace('柱', '')}</div>)}
      </div>
      {labels.map((row) => (
        <div key={row} className={`mp-row${row === '天干' || row === '地支' ? ' tall' : ''}${row === '藏干' || row === '神煞' ? ' multi' : ''}`} role="row">
          <div className="mp-lab" role="rowheader">{row}</div>
          {cols.map((c) => <div key={c.label + row} className="mp-cel" role="cell">{cell(c, row)}</div>)}
        </div>
      ))}
    </div>
  );
}

function Palace({ c }: { c: Chart }) {
  const pal = (c.pro?.palaces || []).filter((p) => p.k !== '胎息');
  return (
    <div className="mp-extra">
      <div className="mp-pal">
        {pal.map((p) => <span key={p.k}><b>{p.k}</b><i><W c={p.v[0]} /><W c={p.v[1]} /></i><em>{p.ny}</em></span>)}
      </div>
      <div className="mp-yunline"><b>起运</b>{c.pro?.qiYun}</div>
      <div className="mp-yunline"><b>交运</b>{c.pro?.jiaoYun}</div>
      <div className="mp-yunline"><b>人元司令</b>{c.pro?.renYuan || '—'}</div>
    </div>
  );
}

function YunStrip({ items, activeKey, onPick, kind }: {
  items: { key: string; year: number; age: number; ganZhi: string; shiShen: string; current?: boolean }[];
  activeKey: string; onPick: (k: string) => void; kind: 'dy' | 'ln';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current; if (!root) return;
    const el = root.querySelector('.on') as HTMLElement | null;
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [activeKey]);
  return (
    <div className={`mp-strip ${kind}`} ref={ref} role="listbox" aria-label={kind === 'dy' ? '大运' : '流年'}>
      {items.map((it) => (
        <button type="button" role="option" aria-selected={it.key === activeKey} key={it.key}
          className={`mp-pill${it.key === activeKey ? ' on' : ''}${it.current ? ' cur' : ''}`}
          onClick={() => onPick(it.key)}>
          <small>{it.year}</small>
          {kind === 'dy' && <small className="age">{it.age}岁</small>}
          <b>{it.ganZhi ? <><W c={it.ganZhi[0]} /><W c={it.ganZhi[1]} /></> : '小运'}</b>
          <em>{it.shiShen}</em>
          {kind === 'ln' && <small className="age">{it.age}岁</small>}
        </button>
      ))}
    </div>
  );
}

export function ChartCard({ c, open }: { c: Chart; open?: boolean }) {
  const pro = c.pro;
  const dyList = useMemo(() => {
    const xs: DaYun[] = [];
    if (c.xiaoYun) xs.push({ ...c.xiaoYun, xiao: true });
    xs.push(...c.daYun);
    return xs;
  }, [c]);
  const curDyIdx = Math.max(0, dyList.findIndex((d) => !d.xiao && c.nowYear >= d.startYear && c.nowYear <= d.endYear));
  const [dyKey, setDyKey] = useState(() => {
    const d = dyList[curDyIdx] || dyList[0];
    return d ? `${d.startYear}` : '';
  });
  const dy = dyList.find((d) => `${d.startYear}` === dyKey) || dyList[curDyIdx] || dyList[0];
  const lnList: LiuNian[] = (dy as any)?.liuNian || c.liuNian;
  const [lnYear, setLnYear] = useState(() => {
    const hit = lnList.find((y) => y.year === c.nowYear);
    return hit ? hit.year : (lnList.find((y) => y.current)?.year || lnList[0]?.year || c.nowYear);
  });
  // 切换大运时：若新年份不在该运内，落到该运内的"当前年"或第一年
  useEffect(() => {
    if (!dy) return;
    const list: LiuNian[] = (dy as any).liuNian || [];
    if (!list.length) return;
    if (!list.some((y) => y.year === lnYear)) {
      const cur = list.find((y) => y.year === c.nowYear) || list[0];
      setLnYear(cur.year);
    }
  }, [dyKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const ln = lnList.find((y) => y.year === lnYear) || lnList[0];
  const [shenOpen, setShenOpen] = useState(!!open);
  const [moreOpen, setMoreOpen] = useState(!!open);

  const cols: ProColumn[] = useMemo(() => {
    if (!pro) return [];
    const lnCol = ln?.col || emptyCol('流年');
    const dyCol = dy?.xiao ? emptyCol('大运') : (dy?.col || emptyCol('大运'));
    // 覆盖 label
    return [
      { ...lnCol, label: '流年' },
      { ...dyCol, label: '大运' },
      ...pro.pillars.map((p) => ({ ...p, label: p.label })),
    ];
  }, [pro, ln, dy]);

  if (!pro) return null;

  const dyItems = dyList.map((d) => ({
    key: `${d.startYear}`, year: d.startYear, age: d.startAge,
    ganZhi: d.ganZhi, shiShen: d.xiao ? '小运' : d.shiShen,
    current: !d.xiao && c.nowYear >= d.startYear && c.nowYear <= d.endYear,
  }));
  const lnItems = lnList.map((y) => ({
    key: `${y.year}`, year: y.year, age: y.age, ganZhi: y.ganZhi, shiShen: y.shiShen, current: y.year === c.nowYear,
  }));

  return (
    <div className="chart mp">
      <Header c={c} />
      <Grid cols={cols} shenOpen={shenOpen} />
      <button type="button" className="sha-bar" aria-expanded={shenOpen} onClick={() => setShenOpen((v) => !v)}>{shenOpen ? '收起神煞' : '展开神煞'}</button>
      <Palace c={c} />
      <div className="mp-sec">大运</div>
      <YunStrip kind="dy" items={dyItems} activeKey={dyKey} onPick={setDyKey} />
      <div className="mp-sec">流年<small>{dy?.xiao ? '起运前' : `${dy?.startYear}–${dy?.endYear}`}</small></div>
      <YunStrip kind="ln" items={lnItems} activeKey={`${lnYear}`} onPick={(k) => setLnYear(+k)} />

      <details className="more" open={moreOpen} onToggle={(e) => setMoreOpen((e.target as HTMLDetailsElement).open)}>
        <summary>五行 · 格局 · 关系</summary>
        <div className="sec">五行力量<small>{pro.monthLing}</small></div>
        <div className="wx">{pro.wuXing.map((w) => <div className="w" key={w.wx}><b className={`wx-${w.wx}`}>{w.wx}</b><em>{w.state}</em><Bar pct={Math.max(3, w.pct)} className={`bg-${w.wx}`} /><span className="n">{w.pct}%</span></div>)}</div>
        <div className="sec">五神 · 格局</div>
        <div className="kv"><span>格局 <b>{pro.geJu.name}</b></span><span>{pro.geJu.note}</span>{Object.entries(pro.wushen).map(([k, v]) => <span key={k}>{k} <b>{v || '—'}</b></span>)}</div>
        <div className="sec">干支关系</div>
        <div className="rel">{[...pro.relations.gan, ...pro.relations.zhi].map((r) => <span key={r}>{r}</span>)}{!pro.relations.gan.length && !pro.relations.zhi.length && <span>无明显合冲</span>}</div>
        <div className="wxc" style={{ marginTop: 10 }}>{(Object.entries(c.wuXingCount) as [string, number][]).map(([k, v]) => <span key={k} className={`chip bg-${k}`}><b>{k}</b>{v}</span>)}</div>
        <div className="kv" style={{ marginTop: 8 }}>
          <span>日主 <b>{c.dayMaster.gan}{c.dayMaster.wuXing}</b></span>
          <span>用神 <b>{pro.wushen.用神}</b>{pro.wushen.喜神 && <> 喜 <b>{pro.wushen.喜神}</b></>}</span>
          <span>忌 <b className="neg">{[pro.wushen.忌神, pro.wushen.仇神].filter(Boolean).join('')}</b></span>
        </div>
      </details>
    </div>
  );
}

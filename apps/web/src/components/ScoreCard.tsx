import type { ScoreCard as SC } from '@mingpan/core';
import { Bar, Ring } from './Grow';
const V = { ok: '宜', caution: '慎', no: '不宜' } as const;
export function ScoreCard({ sc }: { sc: SC }) {
  return (
    <>
      <div className="sc-h">
        <Ring value={sc.health} level={sc.level} />
        <div className="sc-t">
          <div className="sc-l">问题健康度<span className={`vd vd-${sc.verdict}`}>{V[sc.verdict]}</span></div>
          <div className="sc-n">{sc.note}</div>
        </div>
      </div>
      <div className="sc-p">{sc.period} · 命盘评分</div>
      <div className="dims">
        {sc.dims.map((d) => (
          <div className="dm" key={d.k}>
            <div className="dm-h"><b>{d.k}</b><Bar pct={d.score} className={d.score >= 75 ? 'g' : d.score >= 55 ? 'm' : 'l'} /><span>{d.score}</span></div>
            <p>{d.reason}</p>
          </div>
        ))}
      </div>
    </>
  );
}

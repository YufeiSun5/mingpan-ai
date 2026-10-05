// 展示组件：只接收数据与回调，不含网络/存储逻辑（便于 Taro 小程序复用结构）
import { memo } from 'react';
import { splitBubbles, hasHeadings, type ChatItem } from '@mingpan/core';
import { Rich } from './Rich';
import { ChartCard } from './ChartCard';
import { ConfirmCard } from './ConfirmCard';
import type { Profile } from '@mingpan/core';

const Avatar = () => <img className="avatar" src="/assets/logo.svg" alt="" width={36} height={36} />;
interface RowProps { me?: boolean; cont?: boolean; cls?: string; rowCls?: string; children: React.ReactNode }
const Row = ({ me, cont, cls = 'bubble', rowCls = '', children }: RowProps) => (
  <div className={`row${me ? ' me' : ''}${cont ? ' cont' : ''} ${rowCls}`}>{!me && <Avatar />}<div className={cls}>{children}</div></div>
);
const sectionCls = (s: string) => (/^#{1,4}\s/.test(s) ? 'bubble section' : 'bubble');

const bazi = (c: ChatItem & { type: 'chart' }) => c.chart.pillars.map((p) => (p.unknown ? '—' : p.gan + p.zhi)).join(' ');
interface ItemProps { it: ChatItem; cont: boolean; busy?: boolean; locked?: boolean; onConfirm?: (p: Profile, id?: string) => Promise<string | null>; onSwitch?: (pid: string) => void }
export const Item = memo(function Item({ it, cont, busy = false, locked = false, onConfirm, onSwitch }: ItemProps) {
  if (it.type === 'confirm') return <Row cont={cont} cls={`card cf-card${it.status !== 'editing' ? ' is-done' : ''}${it.correction && it.status === 'editing' ? ' is-corr' : ''}`} rowCls="row-confirm"><ConfirmCard profile={it.profile} status={it.status} stale={it.stale} correction={it.correction} busy={busy} locked={locked} onConfirm={(p) => (onConfirm ? onConfirm(p, it.id) : Promise.resolve(null))} onSwitch={it.id && onSwitch ? () => onSwitch(it.id!) : undefined} /></Row>;
  if (it.type === 'user') return <Row me>{it.text.split('\n').map((l, i) => <span key={i}>{i > 0 && <br />}{l}</span>)}</Row>;
  if (it.type === 'chart' && it.stale) return <Row cont={cont} cls="card old-chart" rowCls="row-oldchart"><details><summary><span className="tag">旧盘</span><span className="oc-bz">{bazi(it)}</span><span className="oc-more">展开对比</span></summary><ChartCard c={it.chart} /></details></Row>;
  if (it.type === 'chart') return <Row cont={cont} cls="card" rowCls="row-chart"><ChartCard c={it.chart} /></Row>;
  if (it.type === 'switch') return <Row cont={cont} cls="card sw-card" rowCls="row-switch"><button type="button" className="sw-btn" disabled={busy} onClick={() => onSwitch?.(it.profileId)}><span>切换到「{it.label}」的命盘</span><b>→</b></button></Row>;
  if (it.type === 'compat') return <Row cont={cont} cls="card hp-card" rowCls="row-compat"><div className="hp-h">合盘</div><div className="hp-p"><b>{it.card.a.label}</b><span>{it.card.a.bazi}</span></div><div className="hp-p"><b>{it.card.b.label}</b><span>{it.card.b.bazi}</span></div>{(it.card.good.length > 0 || it.card.bad.length > 0) && <div className="hp-tags">{it.card.good.map((g) => <i key={g} className="g">{g}</i>)}{it.card.bad.map((g) => <i key={g} className="b">{g}</i>)}</div>}</Row>;
  return <>{splitBubbles(it.text).map((s, i) => <Row key={i} cont={cont || i > 0} cls={sectionCls(s)}><Rich text={s} /></Row>)}</>;
});

export function Streaming({ text, cont }: { text: string; cont: boolean }) {
  const parts = splitBubbles(text);
  return <>{parts.map((s, i) => <Row key={i} cont={cont || i > 0} cls={sectionCls(s) + (i === parts.length - 1 ? ' caret' : '')}><Rich text={s} /></Row>)}</>;
}
export const Typing = ({ cont }: { cont: boolean }) => <Row cont={cont}><span className="typing"><i /><i /><i /></span></Row>;
export { hasHeadings };

export function QuickReplies({ items, onPick }: { items: string[]; onPick: (t: string) => void }) {
  return <div className="quick">{items.map((q) => <button type="button" key={q} onClick={() => onPick(q)}>{q}</button>)}</div>;
}

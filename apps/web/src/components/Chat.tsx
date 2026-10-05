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

interface ItemProps { it: ChatItem; cont: boolean; busy?: boolean; locked?: boolean; onConfirm?: (p: Profile, id?: string) => Promise<string | null> }
export const Item = memo(function Item({ it, cont, busy = false, locked = false, onConfirm }: ItemProps) {
  if (it.type === 'confirm') return <Row cont={cont} cls={`card cf-card${it.status === 'confirmed' ? ' is-done' : ''}`} rowCls="row-confirm"><ConfirmCard profile={it.profile} status={it.status} busy={busy} locked={locked} onConfirm={(p) => (onConfirm ? onConfirm(p, it.id) : Promise.resolve(null))} /></Row>;
  if (it.type === 'user') return <Row me>{it.text.split('\n').map((l, i) => <span key={i}>{i > 0 && <br />}{l}</span>)}</Row>;
  if (it.type === 'chart') return <Row cont={cont} cls="card" rowCls="row-chart"><ChartCard c={it.chart} /></Row>;
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

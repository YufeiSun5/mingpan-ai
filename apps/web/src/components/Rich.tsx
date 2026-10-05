import { parseBlocks, type Inline } from '@mingpan/core';
const Inl = ({ parts }: { parts: Inline[] }) => <>{parts.map((p, i) => (p.strong ? <strong key={i}>{p.text}</strong> : <span key={i}>{p.text}</span>))}</>;
/** 轻量 Markdown（段落 / 二级标题 / 列表 / 加粗）—— 不使用 innerHTML */
export function Rich({ text }: { text: string }) {
  return <>{parseBlocks(text).map((b, i) => b.type === 'ul'
    ? <ul key={i}>{b.items.map((it, j) => <li key={j}><Inl parts={it} /></li>)}</ul>
    : b.type === 'h' ? <div key={i} className="st"><Inl parts={b.inl} /></div> : <p key={i}><Inl parts={b.inl} /></p>)}</>;
}

// 文本工具：把回复切成气泡、把轻量 Markdown 解析成与平台无关的块（Web/小程序各自渲染）
export const hasHeadings = (t: string) => /(^|\n)#{1,4}\s/.test(t);
export function splitBubbles(text: string): string[] {
  if (hasHeadings(text)) return text.split(/\n(?=#{1,4}\s)/).map((s) => s.trim()).filter(Boolean);
  const paras = text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  if (paras.length <= 1 || text.length < 90) return [text.trim()].filter(Boolean);
  const n = Math.min(3, paras.length), per = Math.ceil(paras.length / n), out: string[] = [];
  for (let i = 0; i < paras.length; i += per) out.push(paras.slice(i, i + per).join('\n\n'));
  return out;
}
export interface Inline { text: string; strong?: boolean }
export type Block = { type: 'p' | 'h'; inl: Inline[] } | { type: 'ul'; items: Inline[][] };
export function parseInline(s: string): Inline[] {
  const out: Inline[] = []; const re = /\*\*(.+?)\*\*/g; let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(s))) { if (m.index > last) out.push({ text: s.slice(last, m.index) }); out.push({ text: m[1], strong: true }); last = m.index + m[0].length; }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}
export function parseBlocks(src: string): Block[] {
  const blocks: Block[] = []; let ul: Inline[][] | null = null;
  for (const raw of String(src).split(/\n+/)) {
    const l = raw.trim(); if (!l) continue;
    if (/^[-*•·]\s+/.test(l)) { if (!ul) { ul = []; blocks.push({ type: 'ul', items: ul }); } ul.push(parseInline(l.replace(/^[-*•·]\s+/, ''))); continue; }
    ul = null;
    const h = l.match(/^#{1,4}\s*(.+)/);
    blocks.push(h ? { type: 'h', inl: parseInline(h[1]) } : { type: 'p', inl: parseInline(l) });
  }
  return blocks;
}

import { useEffect, useState } from 'react';
/** 进入视图后从 0 动画到目标宽度（CSSOM 设置样式，不违反 CSP） */
export function Bar({ pct, className }: { pct: number; className?: string }) {
  const [w, setW] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => requestAnimationFrame(() => setW(pct))); return () => cancelAnimationFrame(id); }, [pct]);
  return <div className="t"><i className={className} style={{ width: `${w}%` }} /></div>;
}
export function Ring({ value, level }: { value: number; level: string }) {
  const [p, setP] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => requestAnimationFrame(() => setP(value))); return () => cancelAnimationFrame(id); }, [value]);
  return <div className={`ring lv-${level}`} style={{ ['--p' as any]: p }}><span>{value}</span></div>;
}

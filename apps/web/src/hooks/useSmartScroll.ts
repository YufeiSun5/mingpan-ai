// 智能滚动：用户在底部附近才自动跟随；主动上滑后停止跟随并显示"↓ 新消息"；rAF 节流
import { useCallback, useEffect, useRef, useState } from 'react';
export function useSmartScroll(threshold = 80) {
  const ref = useRef<HTMLElement | null>(null);
  const follow = useRef(true), raf = useRef(0), lastIntent = useRef(0), touching = useRef(false);
  const [showJump, setShowJump] = useState(false);
  const near = () => { const el = ref.current; return !el || el.scrollHeight - el.scrollTop - el.clientHeight < threshold; };
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const intent = () => { lastIntent.current = Date.now(); };
    const ts = () => { touching.current = true; intent(); }, te = () => { touching.current = false; intent(); };
    const onScroll = () => {
      if (near()) { follow.current = true; setShowJump(false); }
      else if (touching.current || Date.now() - lastIntent.current < 1200) follow.current = false;
    };
    // 折叠屏展开/收起、旋转：保持"在底部"的状态
    const ro = new ResizeObserver(() => { if (follow.current) el.scrollTop = el.scrollHeight; });
    ro.observe(el);
    el.addEventListener('touchstart', ts, { passive: true }); el.addEventListener('touchend', te, { passive: true });
    el.addEventListener('wheel', intent, { passive: true }); el.addEventListener('keydown', intent); el.addEventListener('scroll', onScroll, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener('touchstart', ts); el.removeEventListener('touchend', te); el.removeEventListener('wheel', intent); el.removeEventListener('keydown', intent); el.removeEventListener('scroll', onScroll); };
  }, []);
  /** 内容变化后调用；force=true 时强制回到底部（例如用户自己发消息） */
  const onContent = useCallback((force = false) => {
    if (force) follow.current = true;
    if (!follow.current) { setShowJump(true); return; }
    if (!raf.current) raf.current = requestAnimationFrame(() => { raf.current = 0; const el = ref.current; if (el) el.scrollTop = el.scrollHeight; });
  }, []);
  const jump = useCallback(() => { follow.current = true; setShowJump(false); ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' }); }, []);
  return { ref, showJump, onContent, jump };
}

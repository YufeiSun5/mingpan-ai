import { useRef, useState } from 'react';
export function Composer({ disabled, onSend }: { disabled: boolean; onSend: (t: string) => void }) {
  const [v, setV] = useState('');
  const ta = useRef<HTMLTextAreaElement>(null);
  const autosize = () => { const el = ta.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 136) + 'px'; };
  const submit = (e?: React.FormEvent) => { e?.preventDefault(); const t = v.trim(); if (!t || disabled) return; setV(''); requestAnimationFrame(autosize); onSend(t); };
  return (
    <form className="composer" autoComplete="off" onSubmit={submit}>
      <div className="field">
        <textarea id="input" ref={ta} rows={1} maxLength={300} value={v} placeholder="发送出生日期、时辰、性别…" enterKeyHint="send" aria-label="输入消息"
          onChange={(e) => { setV(e.target.value); autosize(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }} />
      </div>
      <button id="send" type="submit" aria-label="发送" disabled={disabled}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" /></svg>
      </button>
    </form>
  );
}

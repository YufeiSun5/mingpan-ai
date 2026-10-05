// 命主切换面板：列表（点整行切换）→「管理」→ 改称呼 / 删除（单独的危险区 + 二次确认）。纯展示 + 回调。
import { useEffect, useRef, useState } from 'react';
import type { ProfileSummary } from '@mingpan/core';
import { dateText, timeText } from './ConfirmCard';

interface Props {
  open: boolean; profiles: ProfileSummary[]; activeId?: string; draft: boolean; busy: boolean;
  onClose: () => void; onPick: (id: string) => void; onAdd: () => void;
  onRename: (id: string, label: string) => Promise<void>; onDelete: (id: string) => Promise<void>;
}
type View = { v: 'list' } | { v: 'manage' | 'rename' | 'delete'; id: string };
const initial = (l: string) => (l || '我').slice(0, 1);
const who = (p: ProfileSummary) => (p.label === '我' ? '我' : p.label);

/** 软键盘/浏览器工具栏遮挡时，把面板抬到可视区域之上（iOS 不会缩小布局视口） */
function useKeyboardInset(on: boolean, el: React.RefObject<HTMLDivElement>) {
  useEffect(() => {
    const vv = window.visualViewport; const node = el.current;
    if (!on || !vv || !node) return;
    const upd = () => {
      node.style.setProperty('--kb', `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`);
      node.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    };
    upd(); vv.addEventListener('resize', upd); vv.addEventListener('scroll', upd);
    return () => { vv.removeEventListener('resize', upd); vv.removeEventListener('scroll', upd); };
  }, [on, el]);
}

export function ProfileSheet({ open, profiles, activeId, draft, busy, onClose, onPick, onAdd, onRename, onDelete }: Props) {
  const [view, setView] = useState<View>({ v: 'list' });
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [working, setWorking] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useKeyboardInset(open, wrap);
  useEffect(() => { if (!open) { setView({ v: 'list' }); setErr(''); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (view.v === 'list') onClose(); else setView(view.v === 'manage' ? { v: 'list' } : { v: 'manage', id: view.id }); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open, onClose, view]);
  useEffect(() => { if (view.v !== 'list' && !profiles.some((p) => p.id === view.id)) setView({ v: 'list' }); }, [profiles, view]);
  if (!open) return null;
  const run = async (fn: () => Promise<void>) => {
    setErr(''); setWorking(true);
    try { await fn(); } catch (e) { setErr((e as Error).message || '操作失败，请稍后再试'); } finally { setWorking(false); }
  };
  const cur = view.v !== 'list' ? profiles.find((p) => p.id === view.id) : undefined;
  const back = () => { setErr(''); setView(view.v === 'manage' || !cur ? { v: 'list' } : { v: 'manage', id: cur.id }); };
  const title = view.v === 'list' ? '命主' : view.v === 'manage' ? `管理「${cur ? who(cur) : ''}」` : view.v === 'rename' ? '改称呼' : '删除命盘';

  return (
    <div className="sheet-wrap" ref={wrap} onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-h">
          {view.v !== 'list' && <button type="button" className="sh-btn back" onClick={back}>‹ 返回</button>}
          <b>{title}</b>
          {view.v === 'list' && <span className="sheet-sub">每个人的盘和对话分开存放</span>}
          <button type="button" className="sh-btn close" onClick={onClose}>关闭</button>
        </div>

        {view.v === 'list' && <>
          <ul className="pf-list">
            {draft && <li className="pf on"><div className="pf-pick static"><span className="pf-av new">＋</span><span className="pf-main"><b>新命主</b><small>还没排盘，在对话里发生辰就行</small></span></div></li>}
            {profiles.map((p) => (
              <li key={p.id} className={`pf${p.id === activeId ? ' on' : ''}`}>
                <button type="button" className="pf-pick" disabled={busy} aria-current={p.id === activeId ? 'true' : undefined} onClick={() => onPick(p.id)}>
                  <span className="pf-av">{initial(p.label)}</span>
                  <span className="pf-main">
                    <b>{who(p)}{p.name && p.name !== p.label ? <em> · {p.name}</em> : null}{p.id === activeId && <i className="cur">当前</i>}</b>
                    <span className="pf-bz">{p.bazi}</span>
                    <small>{p.data.gender} · {dateText(p.data)} · {timeText(p.data.time)}</small>
                  </span>
                </button>
                <button type="button" className="pf-manage" aria-label={`管理「${who(p)}」`} onClick={() => { setErr(''); setView({ v: 'manage', id: p.id }); }}>管理</button>
              </li>
            ))}
          </ul>
          <button type="button" className="pf-add" disabled={busy} onClick={onAdd}>＋ 添加命主<small>给家人、朋友单独排一盘</small></button>
        </>}

        {cur && view.v !== 'list' && (
          <div className="pf-card">
            <span className="pf-av">{initial(cur.label)}</span>
            <span className="pf-main"><b>{who(cur)}{cur.id === activeId && <i className="cur">当前</i>}</b><span className="pf-bz">{cur.bazi}</span><small>{cur.data.gender} · {dateText(cur.data)} · {timeText(cur.data.time)}</small></span>
          </div>
        )}

        {cur && view.v === 'manage' && (
          <div className="act-list">
            <div className="act-group">
              {cur.id !== activeId && <button type="button" className="act" disabled={busy} onClick={() => onPick(cur.id)}>切换到「{who(cur)}」<i>›</i></button>}
              <button type="button" className="act" onClick={() => { setName(cur.label); setErr(''); setView({ v: 'rename', id: cur.id }); }}>改称呼<i>›</i></button>
            </div>
            <div className="act-group danger-zone">
              <button type="button" className="act danger" disabled={busy} onClick={() => { setErr(''); setView({ v: 'delete', id: cur.id }); }}>删除命盘和聊天记录</button>
            </div>
          </div>
        )}

        {cur && view.v === 'rename' && (
          <form className="sh-form" onSubmit={(e) => { e.preventDefault(); run(async () => { await onRename(cur.id, name.trim() || cur.label); setView({ v: 'manage', id: cur.id }); }); }}>
            <label className="sh-label" htmlFor="pf-name">这是谁的盘</label>
            <input id="pf-name" autoFocus onFocus={(e) => { const f = e.currentTarget.form; setTimeout(() => f?.scrollIntoView({ block: 'end', behavior: 'smooth' }), 350); }} maxLength={8} value={name} enterKeyHint="done" onChange={(e) => setName(e.target.value)} placeholder="如 老公、妈妈、朋友" />
            <div className="sh-row">
              <button type="button" className="big ghost" disabled={working} onClick={back}>取消</button>
              <button type="submit" className="big primary" disabled={working || !name.trim()}>{working ? '保存中…' : '保存'}</button>
            </div>
          </form>
        )}

        {cur && view.v === 'delete' && (
          <div className="sh-confirm" role="alertdialog" aria-labelledby="del-q" aria-describedby="del-d">
            <p id="del-q" className="q">删除「{who(cur)}」的命盘和聊天记录？</p>
            <p id="del-d" className="d">删除后无法恢复。{cur.id === activeId ? '当前正在看的就是这一位，删除后会切到其他命主。' : ''}</p>
            <div className="sh-row">
              <button type="button" className="big ghost" disabled={working} autoFocus onClick={back}>取消</button>
              <button type="button" className="big danger" disabled={working || busy} onClick={() => run(async () => { await onDelete(cur.id); setView({ v: 'list' }); })}>{working ? '删除中…' : '删除'}</button>
            </div>
          </div>
        )}
        {err && <p className="cf-err">{err}</p>}
      </div>
    </div>
  );
}

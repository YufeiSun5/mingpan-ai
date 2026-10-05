// 命主切换面板：列出所有命主（称呼 + 简要八字），可切换、添加、改称呼、删除。纯展示 + 回调。
import { useEffect, useState } from 'react';
import type { ProfileSummary } from '@mingpan/core';
import { dateText, timeText } from './ConfirmCard';

interface Props {
  open: boolean; profiles: ProfileSummary[]; activeId?: string; draft: boolean; busy: boolean;
  onClose: () => void; onPick: (id: string) => void; onAdd: () => void;
  onRename: (id: string, label: string) => Promise<void>; onDelete: (id: string) => Promise<void>;
}
const initial = (l: string) => (l || '我').slice(0, 1);

export function ProfileSheet({ open, profiles, activeId, draft, busy, onClose, onPick, onAdd, onRename, onDelete }: Props) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [del, setDel] = useState<string | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { if (!open) { setRenaming(null); setDel(null); setErr(''); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  const run = async (fn: () => Promise<void>) => { setErr(''); try { await fn(); } catch (e) { setErr((e as Error).message || '操作失败，请稍后再试'); } };

  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="命主" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-h"><b>命主</b><span>每个人的盘和对话分开存放</span><button type="button" className="x" aria-label="关闭" onClick={onClose}>×</button></div>
        <ul className="pf-list">
          {draft && <li className="pf on"><span className="pf-av new">＋</span><div className="pf-main"><b>新命主</b><small>还没排盘，在对话里发生辰就行</small></div></li>}
          {profiles.map((p) => (
            <li key={p.id} className={`pf${p.id === activeId ? ' on' : ''}`}>
              {renaming === p.id ? (
                <form className="pf-edit" onSubmit={(e) => { e.preventDefault(); run(async () => { await onRename(p.id, name.trim() || p.label); setRenaming(null); }); }}>
                  <input autoFocus maxLength={8} value={name} aria-label="称呼" onChange={(e) => setName(e.target.value)} placeholder="称呼，如 老公、妈妈" />
                  <button type="submit" className="mini primary">保存</button>
                  <button type="button" className="mini" onClick={() => setRenaming(null)}>取消</button>
                </form>
              ) : del === p.id ? (
                <div className="pf-edit warn">
                  <span>删除「{p.label}」？命盘和对话都会清掉</span>
                  <button type="button" className="mini danger" onClick={() => run(async () => { await onDelete(p.id); setDel(null); })}>删除</button>
                  <button type="button" className="mini" onClick={() => setDel(null)}>取消</button>
                </div>
              ) : (
                <>
                  <button type="button" className="pf-pick" disabled={busy} onClick={() => onPick(p.id)}>
                    <span className="pf-av">{initial(p.label)}</span>
                    <span className="pf-main">
                      <b>{p.label === '我' ? '我' : p.label}{p.name && p.name !== p.label ? <em> · {p.name}</em> : null}{p.id === activeId && <i className="cur">当前</i>}</b>
                      <span className="pf-bz">{p.bazi}</span>
                      <small>{p.data.gender} · {dateText(p.data)} · {timeText(p.data.time)}</small>
                    </span>
                  </button>
                  <span className="pf-ops">
                    <button type="button" className="mini" onClick={() => { setRenaming(p.id); setName(p.label); setDel(null); }}>改称呼</button>
                    <button type="button" className="mini" onClick={() => { setDel(p.id); setRenaming(null); }}>删除</button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
        {err && <p className="cf-err">{err}</p>}
        <button type="button" className="pf-add" disabled={busy} onClick={onAdd}>＋ 添加命主<small>给家人、朋友单独排一盘</small></button>
      </div>
    </div>
  );
}

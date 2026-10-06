import { useCallback, useEffect, useMemo, useState } from 'react';
import { GREETINGS, type ChatItem, type Chart, type Profile } from '@mingpan/core';
import { useChat } from './hooks/useChat';
import { useSmartScroll } from './hooks/useSmartScroll';
import { Item, Streaming, Typing, QuickReplies } from './components/Chat';
import { Composer } from './components/Composer';
import { ChartCard } from './components/ChartCard';
import { ProfileSheet } from './components/ProfileSheet';

export function App() {
  const { state, busy, send, confirmProfile, profiles, switchTo, addNew, renameProfile, removeProfile } = useChat();
  const [sheet, setSheet] = useState(false);
  const { ref, showJump, onContent, jump } = useSmartScroll();
  const greeting = useMemo<ChatItem[]>(() => (profiles.length && !state.profileId
    ? [{ type: 'bot', text: '好，再排一位。这次是给谁看呀？' }, { type: 'bot', text: '把TA的**出生年月日、时辰、性别**发我，顺便说一声是你的谁（比如老公、妈妈、朋友），我单独给TA建一份命盘，跟之前的分开放。' }]
    : GREETINGS[Math.floor(Math.random() * GREETINGS.length)].map((text) => ({ type: 'bot', text }))) as ChatItem[], [state.cid, profiles.length > 0, state.profileId]);
  const items = state.items.length ? state.items : greeting;
  const latestChart = useMemo(() => [...state.items].reverse().find((x) => x.type === 'chart' && !x.stale) as { chart: Chart } | undefined, [state.items]);
  const lastIsBot = items.length > 0 && items[items.length - 1].type !== 'user';

  useEffect(() => { onContent(); }, [state.items.length, state.stream, busy, onContent]);
  useEffect(() => { onContent(true); }, [onContent]);

  const onSend = (t: string) => { onContent(true); send(t); };
  const onPick = (t: string) => { onContent(true); send(t); };
  const onConfirm = useCallback((p: Profile, id?: string) => { onContent(true); return confirmProfile(p, id); }, [confirmProfile, onContent]);
  const editingCard = state.items.some((x) => x.type === 'confirm' && x.status === 'editing');
  // 只有最近一张已确认的卡片可以修改（更早的生辰卡片只读）
  const lastConfirmIdx = useMemo(() => { let k = -1; state.items.forEach((x, i) => { if (x.type === 'confirm' && x.status === 'confirmed') k = i; }); return k; }, [state.items]);
  const onSwitch = useCallback(async (pid: string) => { setSheet(false); await switchTo(pid); onContent(true); }, [switchTo, onContent]);
  const onAdd = async () => { setSheet(false); await addNew(); onContent(true); };
  const who = state.profileId ? (state.label || '我') : '新命主';
  return (
    <div className={`shell${latestChart ? ' has-chart' : ''}`}>
      <div className="app">
        <header className="bar">
          <img className="avatar lg" src="/assets/logo.svg" alt="玄真" width={38} height={38} />
          <div className="who"><b>玄真大师</b><span><i className="dot" />在线 · 传统文化 · 生辰解读</span></div>
          <button className="who-btn" type="button" aria-haspopup="dialog" aria-expanded={sheet} disabled={busy} onClick={() => setSheet(true)}>
            <span className="pf-av sm">{who === '新命主' ? '＋' : who.slice(0, 1)}</span><span className="who-l">{who}</span><span className="caret-d" aria-hidden="true">▾</span>
          </button>
        </header>
        <main className="list" ref={ref as React.RefObject<HTMLElement>} aria-live="polite" tabIndex={-1}>
          <section className="hero">
            <img src="/assets/logo.svg" alt="" width={52} height={52} />
            <h1>玄真 · 国学命理</h1>
            <p>以传统历法排四柱 · 观五行大运流年</p>
            <div className="hero-rule"><i /><span>仅供娱乐参考</span><i /></div>
            {!state.items.length && <ul className="hero-tips" aria-label="使用方式">
              <li><b>一 · 报生辰</b><span>公历农历皆可，时辰不详也能排</span></li>
              <li><b>二 · 核对排盘</b><span>确认无误后排出专业细盘</span></li>
              <li><b>三 · 随时追问</b><span>事业感情、大运流年、多人合盘</span></li>
            </ul>}
          </section>
          {items.map((it, i) => <Item key={i} it={it} cont={i > 0 && items[i - 1].type !== 'user' && it.type !== 'user'} busy={busy} locked={it.type === 'confirm' && it.status === 'confirmed' && i !== lastConfirmIdx} onConfirm={onConfirm} onSwitch={onSwitch} />)}
          {state.stream !== null && <Streaming text={state.stream} cont={lastIsBot} />}
          {busy && state.stream === null && <Typing cont={lastIsBot} />}
        </main>
        <div className="jump-anchor">{showJump && <button type="button" className="jump" onClick={jump}>↓ 新消息</button>}</div>
        {!busy && !editingCard && state.quick.length > 0 && <QuickReplies items={state.quick} onPick={onPick} />}
        <Composer disabled={busy} onSend={onSend} />
        <footer className="foot"><a href="/terms.html">用户协议与隐私说明</a><span className="foot-t"><span className="long">内容由 AI 基于传统文化生成，</span><span className="short">AI 生成 · </span>仅供娱乐参考</span></footer>
      </div>
      <ProfileSheet open={sheet} profiles={profiles} activeId={state.profileId} draft={!state.profileId} busy={busy} onClose={() => setSheet(false)} onPick={onSwitch} onAdd={onAdd} onRename={renameProfile} onDelete={removeProfile} />
      {latestChart && <aside className="side" aria-label="命盘"><div className="side-in"><div className="card side-card"><ChartCard c={latestChart.chart} open /></div></div></aside>}
    </div>
  );
}

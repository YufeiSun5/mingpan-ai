import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GREETINGS, type ChatItem, type Chart, type Profile } from '@mingpan/core';
import { useChat } from './hooks/useChat';
import { useSmartScroll } from './hooks/useSmartScroll';
import { Item, Streaming, Typing, QuickReplies } from './components/Chat';
import { Composer } from './components/Composer';
import { ChartCard } from './components/ChartCard';

export function App() {
  const { state, busy, send, reset, confirmProfile } = useChat();
  const { ref, showJump, onContent, jump } = useSmartScroll();
  const [armed, setArmed] = useState(false);
  const armTimer = useRef<number>();
  const greeting = useMemo<ChatItem[]>(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)].map((text) => ({ type: 'bot', text })), [state.cid]);
  const items = state.items.length ? state.items : greeting;
  const latestChart = useMemo(() => [...state.items].reverse().find((x) => x.type === 'chart') as { chart: Chart } | undefined, [state.items]);
  const lastIsBot = items.length > 0 && items[items.length - 1].type !== 'user';

  useEffect(() => { onContent(); }, [state.items.length, state.stream, busy, onContent]);
  useEffect(() => { onContent(true); }, [onContent]);

  const onSend = (t: string) => { onContent(true); send(t); };
  const onPick = (t: string) => { onContent(true); send(t); };
  const onConfirm = useCallback((p: Profile, id?: string) => { onContent(true); return confirmProfile(p, id); }, [confirmProfile, onContent]);
  const editingCard = state.items.some((x) => x.type === 'confirm' && x.status === 'editing');
  // 只有最近一张已确认的卡片可以修改（更早的生辰卡片只读）
  const lastConfirmIdx = useMemo(() => { let k = -1; state.items.forEach((x, i) => { if (x.type === 'confirm' && x.status === 'confirmed') k = i; }); return k; }, [state.items]);
  const onReset = () => {
    if (busy) return;
    const trivial = !state.profile && state.items.length === 0;
    if (!trivial && !armed) { setArmed(true); armTimer.current = window.setTimeout(() => setArmed(false), 3000); return; }
    clearTimeout(armTimer.current); setArmed(false); reset();
  };

  return (
    <div className={`shell${latestChart ? ' has-chart' : ''}`}>
      <div className="app">
        <header className="bar">
          <img className="avatar lg" src="/assets/logo.svg" alt="玄真" width={38} height={38} />
          <div className="who"><b>玄真大师</b><span><i className="dot" />在线 · 传统文化 · 生辰解读</span></div>
          <button className={`reset${armed ? ' warn' : ''}`} type="button" onClick={onReset}>{armed ? '确定清空？' : '新排盘'}</button>
        </header>
        <main className="list" ref={ref as React.RefObject<HTMLElement>} aria-live="polite" tabIndex={-1}>
          <section className="hero">
            <img src="/assets/logo.svg" alt="" width={52} height={52} />
            <h1>玄真 · 国学命理</h1>
            <p>以传统历法排四柱 · 观五行大运流年</p>
            <div className="hero-rule"><i /><span>仅供娱乐参考</span><i /></div>
          </section>
          {items.map((it, i) => <Item key={i} it={it} cont={i > 0 && items[i - 1].type !== 'user' && it.type !== 'user'} busy={busy} locked={it.type === 'confirm' && it.status === 'confirmed' && i !== lastConfirmIdx} onConfirm={onConfirm} />)}
          {state.stream !== null && <Streaming text={state.stream} cont={lastIsBot} />}
          {busy && state.stream === null && <Typing cont={lastIsBot} />}
        </main>
        <div className="jump-anchor">{showJump && <button type="button" className="jump" onClick={jump}>↓ 新消息</button>}</div>
        {!busy && !editingCard && state.quick.length > 0 && <QuickReplies items={state.quick} onPick={onPick} />}
        <Composer disabled={busy} onSend={onSend} />
        <footer className="foot"><a href="/terms.html">用户协议与隐私说明</a> · 内容由 AI 基于传统文化生成，仅供娱乐参考</footer>
      </div>
      {latestChart && <aside className="side" aria-label="命盘"><div className="side-in"><div className="card side-card"><ChartCard c={latestChart.chart} open /></div></div></aside>}
    </div>
  );
}

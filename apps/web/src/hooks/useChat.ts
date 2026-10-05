// 聊天数据逻辑（与展示组件分离，便于小程序 Taro 复用同一套 core）
import { useCallback, useEffect, useRef, useState } from 'react';
import { addUser, applyEvent, createClient, freshState, migrateState, FRIENDLY_ERROR, type ChatState, type ApiError } from '@mingpan/core';
import { webTransport } from '../transport';

const KEY = 'mingpan-chat-v2', OLD_KEY = 'mingpan-chat-v1', TOKEN = 'mingpan-token', MIGRATED = 'mingpan-migrated';
const ls = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* */ } }, del: (k: string) => { try { localStorage.removeItem(k); } catch { /* */ } } };

export const client = createClient({
  base: (window as any).API_BASE || '', transport: webTransport,
  getToken: () => ls.get(TOKEN), setToken: (t) => ls.set(TOKEN, t),
});

function load(): ChatState {
  const raw = ls.get(KEY) || ls.get(OLD_KEY);
  try { return raw ? migrateState(JSON.parse(raw)) : freshState(); } catch { return freshState(); }
}

export function useChat() {
  const [state, setState] = useState<ChatState>(load);
  const [busy, setBusy] = useState(false);
  const ref = useRef(state);
  // 同步计算新状态（函数式 setState 的 updater 是惰性执行的，紧接着读取 ref 会拿到旧值）
  const update = useCallback((fn: (s: ChatState) => ChatState) => { const n = fn(ref.current); ref.current = n; setState(n); }, []);

  useEffect(() => { if (state.stream === null) ls.set(KEY, JSON.stringify(state)); }, [state]);

  // 匿名身份 + 首次把旧版本地历史迁移到服务端
  useEffect(() => {
    (async () => {
      try {
        { const r = await client.session(); ls.set(TOKEN, r.token); } // 每次进入都校验：失效令牌会被换新
        if (!ls.get(MIGRATED)) {
          const s = ref.current;
          if (s.items.length || s.profile) await client.migrate({ cid: s.cid, items: s.items.filter((x) => x.type !== 'chart'), llm: s.llm, profile: s.profile });
          ls.set(MIGRATED, '1'); ls.del(OLD_KEY);
        }
      } catch { /* 离线或服务端未就绪：下次再试 */ }
    })();
  }, []);

  const send = useCallback(async (text: string, action?: 'confirm') => {
    if (busy || (!text && !action)) return;
    setBusy(true);
    if (text) update((s) => addUser(s, text));
    const s = ref.current;
    try {
      await client.chat({ cid: s.cid, messages: s.llm.slice(-16), pending: s.pending, profile: s.profile, action, nowYear: new Date().getFullYear() }, (e) => update((st) => applyEvent(st, e)));
    } catch (e) {
      const err = e as ApiError;
      update((st) => applyEvent(st, ['error', { error: err.server ? `${err.message}，请稍后再试` : FRIENDLY_ERROR }]));
    } finally {
      update((st) => applyEvent(st, ['done', {}]));
      setBusy(false);
    }
  }, [busy, update]);

  const reset = useCallback(() => update(() => freshState()), [update]);
  return { state, busy, send, reset };
}

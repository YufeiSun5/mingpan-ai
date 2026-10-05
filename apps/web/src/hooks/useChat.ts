// 聊天数据逻辑（与展示组件分离，便于小程序 Taro 复用同一套 core）
import { useCallback, useEffect, useRef, useState } from 'react';
import { addUser, applyEvent, createClient, freshState, migrateState, profileConfirmed, FRIENDLY_ERROR, type ChatState, type ApiError, type Profile } from '@mingpan/core';
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
      await client.chat({ cid: s.cid, messages: s.llm.slice(-16), pending: s.pending, profile: s.profile, action, nowYear: new Date().getFullYear(), ui: 'card' }, (e) => update((st) => applyEvent(st, e)));
    } catch (e) {
      const err = e as ApiError;
      update((st) => applyEvent(st, ['error', { error: err.server ? `${err.message}，请稍后再试` : FRIENDLY_ERROR }]));
    } finally {
      update((st) => applyEvent(st, ['done', {}]));
      setBusy(false);
    }
  }, [busy, update]);

  const ensureToken = async () => { if (!ls.get(TOKEN)) { const r = await client.session(); ls.set(TOKEN, r.token); } };
  const fail = (e: unknown) => {
    const err = e as ApiError;
    update((st) => applyEvent(st, ['error', { error: err.server ? `${err.message}` : FRIENDLY_ERROR }]));
    return err;
  };

  /**
   * 确认生辰 / 修改生辰：走 POST（新建）或 PATCH（修改）/api/v1/profiles，再请求 /api/v1/profiles/:id/reading 流式详批。
   * 这是软件操作，不产生用户气泡；服务端会记一条 system 事件供模型上下文使用。
   * 校验失败时抛出错误信息（由卡片就地显示），不进对话。
   */
  const confirmProfile = useCallback(async (profile: Profile, id?: string): Promise<string | null> => {
    if (busy) return null;
    setBusy(true);
    const nowYear = new Date().getFullYear();
    try {
      await ensureToken();
      const s = ref.current;
      let r;
      try { r = id ? await client.updateProfile(id, profile, s.cid, nowYear) : await client.createProfile(profile, s.cid, nowYear); }
      catch (e) { const err = e as ApiError; if (err.status === 422 || err.status === 400) return err.message; fail(e); return null; }
      update((st) => profileConfirmed(st, r));
      try { await client.reading(r.profile.id, { cid: s.cid, nowYear, messages: ref.current.llm.filter((m) => m.role === 'user').slice(-3) }, (e) => update((st) => applyEvent(st, e))); }
      catch (e) { fail(e); }
      return null;
    } catch (e) { fail(e); return null; }
    finally { update((st) => applyEvent(st, ['done', {}])); setBusy(false); }
  }, [busy, update]);

  /** 新排盘：服务端新建对话，拿到新的 cid（离线时退回本地生成） */
  const reset = useCallback(async () => {
    let cid: string | null = null;
    try { await ensureToken(); cid = (await client.newConversation()).cid; } catch { /* 离线 */ }
    update(() => { const f = freshState(); if (cid) f.cid = cid; return f; });
  }, [update]);
  return { state, busy, send, reset, confirmProfile };
}

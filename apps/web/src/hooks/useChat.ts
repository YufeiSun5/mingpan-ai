// 聊天数据逻辑（与展示组件分离，便于小程序 Taro 复用同一套 core）
// 多命主：每位命主一个独立对话（cid），本地缓存各对话的聊天记录；切换命主时加载对应对话、命盘与记忆，严格分开。
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addUser, applyEvent, createClient, freshState, migrateState, profileConfirmed, profileMoved, stateFromServer, FRIENDLY_ERROR,
  type ChatState, type ApiError, type Profile, type ProfileSummary, type ChatEvent,
} from '@mingpan/core';
import { webTransport } from '../transport';

const KEY = 'mingpan-v3', V2 = 'mingpan-chat-v2', OLD_KEY = 'mingpan-chat-v1', TOKEN = 'mingpan-token', MIGRATED = 'mingpan-migrated';
const MAX_CACHED = 12;
const ls = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); return true; } catch { return false; } }, del: (k: string) => { try { localStorage.removeItem(k); } catch { /* */ } } };

export const client = createClient({
  base: (window as any).API_BASE || '', transport: webTransport,
  getToken: () => ls.get(TOKEN), setToken: (t) => ls.set(TOKEN, t),
});

interface Book { active: string; convs: Record<string, ChatState>; order: string[] }
function load(): Book {
  try {
    const raw = ls.get(KEY);
    if (raw) {
      const b = JSON.parse(raw);
      const convs: Record<string, ChatState> = {};
      for (const [k, v] of Object.entries(b.convs || {})) convs[k] = migrateState(v);
      if (convs[b.active]) return { active: b.active, convs, order: (b.order || Object.keys(convs)).filter((k: string) => convs[k]) };
    }
    const old = ls.get(V2) || ls.get(OLD_KEY); // 旧版：单一对话
    const s = old ? migrateState(JSON.parse(old)) : freshState();
    return { active: s.cid, convs: { [s.cid]: s }, order: [s.cid] };
  } catch { const s = freshState(); return { active: s.cid, convs: { [s.cid]: s }, order: [s.cid] }; }
}
function save(b: Book) {
  // 只缓存最近的若干个对话（已建档的对话随时可以从服务端重建）
  const order = b.order.filter((k) => b.convs[k]).slice(-MAX_CACHED);
  if (!order.includes(b.active)) order.push(b.active);
  const convs: Record<string, ChatState> = {};
  for (const k of order) if (b.convs[k] && b.convs[k].stream === null) convs[k] = b.convs[k];
  if (!ls.set(KEY, JSON.stringify({ active: b.active, convs, order }))) { // 空间不够：只留当前对话
    ls.set(KEY, JSON.stringify({ active: b.active, convs: { [b.active]: b.convs[b.active] }, order: [b.active] }));
  }
}

export function useChat() {
  const [book, setBook] = useState<Book>(load);
  const [busy, setBusy] = useState(false);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const ref = useRef(book);
  const commit = useCallback((b: Book) => { ref.current = b; setBook(b); }, []);
  /** 更新指定对话（流式过程中即使切换了界面，也写回正确的对话） */
  const update = useCallback((cid: string, fn: (s: ChatState) => ChatState) => {
    const b = ref.current; const cur = b.convs[cid]; if (!cur) return;
    commit({ ...b, convs: { ...b.convs, [cid]: fn(cur) } });
  }, [commit]);
  const activate = useCallback((cid: string, s?: ChatState) => {
    const b = ref.current;
    commit({ active: cid, convs: s ? { ...b.convs, [cid]: s } : b.convs, order: [...b.order.filter((k) => k !== cid), cid] });
  }, [commit]);

  const state = book.convs[book.active];
  useEffect(() => { if (state && state.stream === null) save(book); }, [book, state]);

  const refreshProfiles = useCallback(async () => {
    try { const r = await client.listProfiles(); setProfiles(r.profiles); return r.profiles; } catch { return null; }
  }, []);

  // 匿名身份 + 首次把旧版本地历史迁移到服务端 + 拉取命主列表
  useEffect(() => {
    (async () => {
      try {
        { const r = await client.session(); ls.set(TOKEN, r.token); } // 每次进入都校验：失效令牌会被换新
        if (!ls.get(MIGRATED)) {
          const s = ref.current.convs[ref.current.active];
          if (s.items.length || s.profile) await client.migrate({ cid: s.cid, items: s.items.filter((x) => x.type !== 'chart'), llm: s.llm, profile: s.profile });
          ls.set(MIGRATED, '1'); ls.del(OLD_KEY); ls.del(V2);
        }
        const list = await refreshProfiles();
        // 本地对话的命主称呼以服务端为准
        if (list) {
          const b = ref.current; let changed = false; const convs = { ...b.convs };
          for (const [k, s] of Object.entries(convs)) {
            const p = list.find((x) => x.id === s.profileId);
            if (p && p.label !== s.label) { convs[k] = { ...s, label: p.label, profile: s.profile ? { ...s.profile, label: p.label } : s.profile }; changed = true; }
          }
          if (changed) commit({ ...b, convs });
        }
      } catch { /* 离线或服务端未就绪：下次再试 */ }
    })();
  }, [refreshProfiles, commit]);

  const ensureToken = async () => { if (!ls.get(TOKEN)) { const r = await client.session(); ls.set(TOKEN, r.token); } };
  const failTo = (cid: string) => (e: unknown) => {
    const err = e as ApiError;
    update(cid, (st) => applyEvent(st, ['error', { error: err.server ? `${err.message}` : FRIENDLY_ERROR }]));
    return err;
  };

  const send = useCallback(async (text: string, action?: 'confirm') => {
    if (busy || (!text && !action)) return;
    setBusy(true);
    const cid = ref.current.active;
    if (text) update(cid, (s) => addUser(s, text));
    const s = ref.current.convs[cid];
    try {
      await client.chat({ cid, profileId: s.profileId, messages: s.llm.slice(-16), pending: s.pending, profile: s.profile, action, nowYear: new Date().getFullYear(), ui: 'card' }, (e) => update(cid, (st) => applyEvent(st, e)));
    } catch (e) {
      const err = e as ApiError;
      update(cid, (st) => applyEvent(st, ['error', { error: err.server ? `${err.message}，请稍后再试` : FRIENDLY_ERROR }]));
    } finally {
      update(cid, (st) => applyEvent(st, ['done', {}]));
      setBusy(false);
    }
  }, [busy, update]);

  /**
   * 确认 / 更正生辰：POST（新建，可能为另一位命主开新对话）或 PATCH（更正已有档案，重排并记历史版本），
   * 再请求 /api/v1/profiles/:id/reading 流式详批。这是软件操作，不产生用户气泡；服务端记 system 事件供模型上下文。
   * 校验失败时返回错误信息（由卡片就地显示），不进对话。
   */
  const confirmProfile = useCallback(async (profile: Profile, id?: string): Promise<string | null> => {
    if (busy) return null;
    setBusy(true);
    const nowYear = new Date().getFullYear();
    let cid = ref.current.active;
    try {
      await ensureToken();
      const s = ref.current.convs[cid];
      let r;
      try { r = id ? await client.updateProfile(id, profile, cid, nowYear) : await client.createProfile(profile, cid, nowYear); }
      catch (e) { const err = e as ApiError; if (err.status === 422 || err.status === 400) return err.message; failTo(cid)(e); return null; }
      if (r.switched && r.cid) { // 为另一位命主建档：原对话卡片标记为"已单独建档"，切到新命主的对话
        const { from, to } = profileMoved(s, r);
        const b = ref.current;
        commit({ active: r.cid, convs: { ...b.convs, [cid]: from, [r.cid]: to }, order: [...b.order.filter((k) => k !== r.cid), r.cid] });
        cid = r.cid;
      } else update(cid, (st) => profileConfirmed(st, r));
      refreshProfiles();
      const msgs = r.recast || r.switched ? [] : ref.current.convs[cid].llm.filter((m) => m.role === 'user').slice(-3);
      try { await client.reading(r.profile.id, { cid, nowYear, messages: msgs, recast: !!r.recast }, (e) => update(cid, (st) => applyEvent(st, e))); }
      catch (e) { failTo(cid)(e); }
      return null;
    } catch (e) { failTo(cid)(e); return null; }
    finally { update(cid, (st) => applyEvent(st, ['done', {}])); setBusy(false); }
  }, [busy, update, commit, refreshProfiles]);

  /** 切换命主：本地有缓存直接切；否则从服务端重建（命盘 + 对话原文） */
  const switchTo = useCallback(async (pid: string): Promise<string | null> => {
    if (busy) return null;
    const b = ref.current;
    const local = Object.values(b.convs).filter((s) => s.profileId === pid).pop();
    const p = profiles.find((x) => x.id === pid);
    if (local && (!p?.cid || p.cid === local.cid)) { activate(local.cid); return null; }
    try {
      await ensureToken();
      const d = await client.getProfile(pid, new Date().getFullYear());
      const cid = d.cid || (await client.newConversation()).cid; // 旧档案还没绑定对话：首次聊天时服务端会绑定
      const msgs = d.cid ? (await client.messages(d.cid)).messages : [];
      activate(cid, stateFromServer({ id: d.id, label: d.label, profile: d.profile, chart: d.chart, cid }, msgs));
      return null;
    } catch (e) { return (e as ApiError).message || '加载失败，请稍后再试'; }
  }, [busy, profiles, activate]);

  /** 添加命主：新开一个空对话（之前的命主都还在列表里） */
  const addNew = useCallback(async () => {
    if (busy) return;
    let cid: string | null = null;
    try { await ensureToken(); cid = (await client.newConversation()).cid; } catch { /* 离线 */ }
    const f = freshState(); if (cid) f.cid = cid;
    activate(f.cid, f);
  }, [busy, activate]);

  const renameProfile = useCallback(async (pid: string, label: string) => {
    const r = await client.renameProfile(pid, label);
    setProfiles((ps) => ps.map((x) => (x.id === pid ? { ...x, label: r.label } : x)));
    const b = ref.current; const convs = { ...b.convs };
    for (const [k, s] of Object.entries(convs)) if (s.profileId === pid) convs[k] = { ...s, label: r.label, profile: s.profile ? { ...s.profile, label: r.label } : s.profile };
    commit({ ...b, convs });
  }, [commit]);

  const removeProfile = useCallback(async (pid: string) => {
    await client.deleteProfile(pid);
    const list = (await refreshProfiles()) || profiles.filter((x) => x.id !== pid);
    const b = ref.current; const convs = { ...b.convs };
    for (const [k, s] of Object.entries(convs)) if (s.profileId === pid) delete convs[k];
    if (convs[b.active]) { commit({ ...b, convs, order: b.order.filter((k) => convs[k]) }); return; }
    const next = list[0];
    const cached = next && Object.values(convs).find((s) => s.profileId === next.id);
    if (cached) { commit({ active: cached.cid, convs, order: b.order.filter((k) => convs[k]) }); return; }
    const f = freshState();
    commit({ active: f.cid, convs: { ...convs, [f.cid]: f }, order: [...b.order.filter((k) => convs[k]), f.cid] });
    if (next) switchTo(next.id);
  }, [commit, refreshProfiles, profiles, switchTo]);

  return { state, busy, send, confirmProfile, profiles, switchTo, addNew, renameProfile, removeProfile, refreshProfiles };
}
export type { ChatEvent };

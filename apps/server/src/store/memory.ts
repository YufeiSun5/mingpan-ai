// 内存驱动：仅用于本地开发 / 单元测试（STORE_DRIVER=memory）
import type { Memory, Store, StoredMessage, User } from './types';
export function createMemoryStore(): Store {
  const users = new Map<string, User>(), profiles = new Map<string, any[]>(), convs = new Map<string, Map<string, StoredMessage[]>>(), mem = new Map<string, Memory>();
  let seq = 0;
  const conv = (uid: string) => { if (!convs.has(uid)) convs.set(uid, new Map()); return convs.get(uid)!; };
  const now = () => new Date().toISOString();
  const s: Store = {
    driver: 'memory', async init() {}, async close() {},
    async ensureUser(id) { const u = users.get(id) || { id, kind: 'anon', createdAt: now(), lastSeenAt: now() }; u.lastSeenAt = now(); users.set(id, u); return u; },
    async getUser(id) { return users.get(id) || null; },
    async listUsers(limit, offset) { const all = [...users.values()]; return { total: all.length, users: all.slice(offset, offset + limit).map((u) => ({ ...u, messages: [...conv(u.id).values()].flat().length, profiles: (profiles.get(u.id) || []).length })) }; },
    async deleteUser(id) { users.delete(id); profiles.delete(id); convs.delete(id); mem.delete(id); },
    async findUserByWechat(o) { return [...users.values()].find((u) => u.wechatOpenid === o) || null; },
    async linkWechat(id, o) { const u = users.get(id); if (u) { u.wechatOpenid = o; u.kind = 'wechat'; } },
    async saveProfile(uid, key, data, chart) { const l = profiles.get(uid) || []; let p = l.find((x) => x.key === key); if (!p) { p = { id: 'p' + ++seq, key }; l.push(p); } Object.assign(p, { data, chart, updatedAt: now() }); profiles.set(uid, l); return p.id; },
    async getProfiles(uid) { return (profiles.get(uid) || []).map((p) => ({ id: p.id, data: p.data, updatedAt: p.updatedAt })); },
    async ensureConversation(uid, cid) { if (!conv(uid).has(cid)) conv(uid).set(cid, []); },
    async hasConversation(uid, cid) { return conv(uid).has(cid); },
    async appendMessages(uid, cid, msgs) { await s.ensureConversation(uid, cid); conv(uid).get(cid)!.push(...msgs.map((m) => ({ ...m, id: ++seq, createdAt: now() }))); },
    async getMessages(uid, cid, after = 0) { return (conv(uid).get(cid) || []).filter((m) => m.id! > after); },
    async listConversations(uid) { return [...conv(uid).entries()].map(([id, m]) => ({ id, updatedAt: m[m.length - 1]?.createdAt || now(), tokens: m.reduce((a, b) => a + b.tokens, 0), messages: m.length })); },
    async deleteMessages(uid, cid, upto) { const l = conv(uid).get(cid) || []; const keep = l.filter((m) => m.id! > upto); conv(uid).set(cid, keep); return l.length - keep.length; },
    async rawTokens(uid) { return [...conv(uid).values()].flat().reduce((a, b) => a + b.tokens, 0); },
    async getMemory(uid) { return structuredClone(mem.get(uid) || { facts: {}, longTerm: '', convSummaries: {}, tokens: 0 }); },
    async saveMemory(uid, m) { mem.set(uid, structuredClone(m)); },
    async exportUser(uid) { const user = users.get(uid); if (!user) return null; return { user, profiles: profiles.get(uid) || [], memory: mem.get(uid), conversations: Object.fromEntries(conv(uid)) }; },
  };
  return s;
}

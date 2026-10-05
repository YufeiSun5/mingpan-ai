// 内存驱动：仅用于本地开发 / 单元测试（STORE_DRIVER=memory）
import type { Memory, ProfileRow, Store, StoredMessage, User } from './types';
export function createMemoryStore(): Store {
  const users = new Map<string, User>(), profiles = new Map<string, any[]>(), convs = new Map<string, Map<string, StoredMessage[]>>(), mem = new Map<string, Memory>();
  let seq = 0;
  const convProfile = new Map<string, string>();
  const pub = (p: any): ProfileRow | null => (p ? { id: p.id, data: p.data, chart: p.chart, label: p.label, cid: p.cid, version: p.version, updatedAt: p.updatedAt, createdAt: p.createdAt } : null);
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
    async saveProfile(uid, key, data, chart) { const l = profiles.get(uid) || []; const p = l.find((x) => x.key === key); if (p) { Object.assign(p, { data, chart, updatedAt: now() }); return p.id; } return (await s.createProfile(uid, { birthKey: key, data, chart, label: data?.label || '', cid: null })).id; },
    async createProfile(uid, x) { const l = profiles.get(uid) || []; const p = { id: 'p' + ++seq, key: x.birthKey, data: x.data, chart: x.chart, label: x.label, cid: x.cid, version: 1, updatedAt: now(), createdAt: now(), versions: [{ version: 1, data: x.data, chart: x.chart, createdAt: now() }] }; l.push(p); profiles.set(uid, l); if (x.cid) { await s.ensureConversation(uid, x.cid); convProfile.set(uid + '/' + x.cid, p.id); } return pub(p)!; },
    async findProfile(uid, key, label) { return pub((profiles.get(uid) || []).find((x) => x.key === key && x.label === label)); },
    async getProfiles(uid) { return (profiles.get(uid) || []).map((p) => pub(p)!); },
    async getProfile(uid, id) { return pub((profiles.get(uid) || []).find((x) => x.id === id)); },
    async updateProfile(uid, id, key, data, chart) { const p = (profiles.get(uid) || []).find((x) => x.id === id); if (p) { p.version++; Object.assign(p, { key, data, chart, updatedAt: now() }); p.versions.push({ version: p.version, data, chart, createdAt: now() }); } return id; },
    async renameProfile(uid, id, label, name) { const p = (profiles.get(uid) || []).find((x) => x.id === id); if (p) { p.label = label; if (name !== undefined) p.data = { ...p.data, name }; } },
    async deleteProfile(uid, id) { const l = profiles.get(uid) || []; const p = l.find((x) => x.id === id); if (!p) return; if (p.cid) conv(uid).delete(p.cid); profiles.set(uid, l.filter((x) => x.id !== id)); },
    async bindConversation(uid, id, cid) { const p = (profiles.get(uid) || []).find((x) => x.id === id); if (p) p.cid = cid; await s.ensureConversation(uid, cid); convProfile.set(uid + '/' + cid, id); },
    async getVersions(uid, id) { const p = (profiles.get(uid) || []).find((x) => x.id === id); return p ? p.versions : []; },
    async conversationProfile(uid, cid) { return convProfile.get(uid + '/' + cid) || null; },
    async ensureConversation(uid, cid, pid = null) { if (!conv(uid).has(cid)) conv(uid).set(cid, []); if (pid) convProfile.set(uid + '/' + cid, pid); },
    async deleteConversation(uid, cid) { conv(uid).delete(cid); },
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

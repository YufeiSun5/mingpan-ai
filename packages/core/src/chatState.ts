// 聊天状态机（纯函数，无 DOM）：Web 与小程序共用
import type { Chart, ChatEvent, ChatItem, LlmMessage, Profile, ProfileSummary } from './types';

/** 一个对话 = 一位命主（profileId / label）；尚未建档的新对话 profileId 为空 */
export interface ChatState { v: 2; cid: string; items: ChatItem[]; llm: LlmMessage[]; pending: Profile | null; profile: Profile | null; quick: string[]; stream: string | null; profileId?: string; label?: string }
export const newCid = () => Array.from({ length: 16 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
export const freshState = (): ChatState => ({ v: 2, cid: newCid(), items: [], llm: [], pending: null, profile: null, quick: [], stream: null });

/** 结束流式气泡：把累计文本落到 items */
export function endStream(s: ChatState): ChatState {
  if (s.stream === null) return s;
  const t = s.stream; const n = { ...s, stream: null };
  if (t.trim()) { n.items = [...s.items, { type: 'bot', text: t }]; n.llm = [...s.llm, { role: 'assistant', content: t }]; }
  return n;
}
export function addUser(s: ChatState, text: string): ChatState {
  return { ...s, quick: [], items: [...s.items, { type: 'user', text }], llm: [...s.llm, { role: 'user', content: text }] };
}
/** 应用一个服务端事件 */
export function applyEvent(s0: ChatState, [ev, d]: ChatEvent): ChatState {
  if (ev === 'ping' || ev === 'done' || ev === 'crisis') return ev === 'done' ? endStream(s0) : s0;
  if (ev === 'delta') return { ...s0, stream: (s0.stream ?? '') + (d as { text: string }).text };
  const s = endStream(s0);
  switch (ev) {
    case 'bubble': return s;
    case 'text': return { ...s, items: [...s.items, { type: 'bot', text: d.text }], llm: [...s.llm, { role: 'assistant', content: d.text }] };
    case 'chart': return { ...s, items: [...s.items, { type: 'chart', chart: d.chart }] };
    case 'pending': {
      if (!d.pending?.awaitingConfirm) return { ...s, pending: d.pending };
      // 待确认 / 更正：在大师这一轮里放一张可编辑卡片（替换掉之前未确认的卡片）
      const items = s.items.filter((x) => !(x.type === 'confirm' && x.status === 'editing'));
      const c = d.pending.correction;
      return { ...s, pending: d.pending, quick: [], items: [...items, { type: 'confirm', profile: d.pending, status: 'editing', ...(c ? { id: c.id, correction: c } : {}) }] };
    }
    case 'switch': return { ...s, items: [...s.items, { type: 'switch', profileId: d.profileId, label: d.label }] };
    case 'compat': return { ...s, items: [...s.items, { type: 'compat', card: d }] };
    case 'profile': return { ...s, profile: d.profile, pending: null };
    case 'quick': return { ...s, quick: d.replies || [] };
    case 'error': return { ...s, items: [...s.items, { type: 'bot', text: d.error }] };
    default: return s;
  }
}
export interface ProfileResult { profile: Profile & { id: string }; chart: Chart; intro: string; cid?: string; switched?: boolean; recast?: boolean; version?: number }
/**
 * 生辰已确认（POST/PATCH /api/v1/profiles 返回后）：卡片折叠为摘要，插入开场白与命盘。不产生用户气泡。
 * recast（更正后重排）：之前的卡片与旧盘标记为"已更正"保留对比；送给模型的历史从这里重新开始，旧盘上的结论不再进入上下文。
 */
export function profileConfirmed(s0: ChatState, r: ProfileResult): ChatState {
  const s = endStream(s0);
  let idx = -1;
  s.items.forEach((x, i) => { if (x.type === 'confirm' && (x.status === 'editing' || (!r.recast && x.id === r.profile.id))) idx = i; });
  const prev = idx >= 0 ? s.items[idx] : null;
  const card: ChatItem = { type: 'confirm', profile: r.profile, status: 'confirmed', id: r.profile.id, ...(r.recast && prev?.type === 'confirm' && prev.correction ? { correction: prev.correction } : {}) };
  let items = s.items.slice();
  if (idx >= 0) items[idx] = card; else items.push(card);
  if (r.recast) items = items.map((x, i) => (i !== idx && (x.type === 'chart' || (x.type === 'confirm' && x.status === 'confirmed' && x.id === r.profile.id)) ? { ...x, stale: true } : x));
  const llm: LlmMessage[] = r.recast ? [{ role: 'assistant', content: r.intro }] : [...s.llm, { role: 'assistant', content: r.intro }];
  return { ...s, quick: [], pending: null, profile: r.profile, profileId: r.profile.id, label: r.profile.label, items: [...items, { type: 'bot', text: r.intro }, { type: 'chart', chart: r.chart }], llm };
}
/** 为另一位命主建档后：原对话里的卡片改为"已单独建档"，返回新命主的对话状态 */
export function profileMoved(s0: ChatState, r: ProfileResult): { from: ChatState; to: ChatState } {
  const s = endStream(s0);
  const items = s.items.map((x) => (x.type === 'confirm' && x.status === 'editing' ? { ...x, profile: r.profile, status: 'moved' as const, id: r.profile.id, cid: r.cid } : x));
  const from = { ...s, items, pending: null, quick: [] };
  const to: ChatState = { ...freshState(), cid: r.cid!, profileId: r.profile.id, label: r.profile.label, profile: r.profile,
    items: [{ type: 'confirm', profile: r.profile, status: 'confirmed', id: r.profile.id }, { type: 'bot', text: r.intro }, { type: 'chart', chart: r.chart }],
    llm: [{ role: 'assistant', content: r.intro }] };
  return { from, to };
}
/** 换设备 / 本地没有缓存时：用服务端档案与对话原文重建聊天记录 */
export function stateFromServer(p: { id: string; label: string; profile: Profile; chart: Chart; cid: string }, messages: { role: string; content: string }[]): ChatState {
  const s = freshState();
  s.cid = p.cid; s.profileId = p.id; s.label = p.label; s.profile = { ...p.profile, id: p.id, label: p.label };
  s.items = [{ type: 'confirm', profile: s.profile, status: 'confirmed', id: p.id }, { type: 'chart', chart: p.chart }];
  for (const m of messages) {
    if (m.role === 'user') { s.items.push({ type: 'user', text: m.content }); s.llm.push({ role: 'user', content: m.content }); }
    else if (m.role === 'assistant') { s.items.push({ type: 'bot', text: m.content }); s.llm.push({ role: 'assistant', content: m.content }); }
  }
  return s;
}
/** 命主在列表里的一行描述 */
export const profileBrief = (p: ProfileSummary) => p.bazi || `${p.data.year || ''}`;

/** 从 v1（旧版 localStorage）迁移 */
export function migrateState(raw: any): ChatState {
  if (!raw || typeof raw !== 'object') return freshState();
  const s = freshState();
  if (raw.cid) s.cid = String(raw.cid);
  s.items = Array.isArray(raw.items) ? raw.items.filter((x: any) => x && ['user', 'bot', 'chart', 'confirm', 'switch', 'compat'].includes(x.type)  /* 旧版评分卡不再展示 */) : [];
  if (typeof raw.profileId === 'string') s.profileId = raw.profileId; else if (raw.profile?.id) s.profileId = raw.profile.id;
  if (typeof raw.label === 'string') s.label = raw.label; else if (raw.profile?.label) s.label = raw.profile.label;
  s.llm = Array.isArray(raw.llm) ? raw.llm.filter((m: any) => m && typeof m.content === 'string') : [];
  s.pending = raw.pending || null; s.profile = raw.profile || null; s.quick = Array.isArray(raw.quick) ? raw.quick : [];
  return s;
}
export const FRIENDLY_ERROR = '哎，网络好像有点不稳，我这边没收到完整的回复。你再发一次试试？在微信里打开的话，也可以点右上角换浏览器打开。';
export const GREETINGS: [string, string][] = [
  ['你好，我是**玄真**，在这儿给人看八字也有些年头了。', '把你的**出生年月日、时辰、性别**发我就行，比如「1995年农历八月十五 早上8点 女 成都」。\n\n时辰记不清也没关系，说"不清楚"就好。想重点问感情、事业还是财运，也可以一起说。'],
  ['来啦？我是**玄真**。', '先把**生日、出生时间和性别**告诉我吧，公历农历都行，比如「1992年3月8日 下午3点 男 北京」。\n\n心里有什么想问的，也可以一并说，我好有个侧重。'],
  ['嗯，你好呀，我是**玄真**。', '咱们先排个盘——发我**出生年月日、时辰、性别**，出生城市有的话更准一些。\n\n不知道几点出生也行，我按三柱先给你看。'],
];

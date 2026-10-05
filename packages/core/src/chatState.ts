// 聊天状态机（纯函数，无 DOM）：Web 与小程序共用
import type { ChatEvent, ChatItem, LlmMessage, Profile } from './types';

export interface ChatState { v: 2; cid: string; items: ChatItem[]; llm: LlmMessage[]; pending: Profile | null; profile: Profile | null; quick: string[]; stream: string | null }
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
    case 'pending': return { ...s, pending: d.pending };
    case 'profile': return { ...s, profile: d.profile, pending: null };
    case 'quick': return { ...s, quick: d.replies || [] };
    case 'error': return { ...s, items: [...s.items, { type: 'bot', text: d.error }] };
    default: return s;
  }
}
/** 从 v1（旧版 localStorage）迁移 */
export function migrateState(raw: any): ChatState {
  if (!raw || typeof raw !== 'object') return freshState();
  const s = freshState();
  if (raw.cid) s.cid = String(raw.cid);
  s.items = Array.isArray(raw.items) ? raw.items.filter((x: any) => x && ['user', 'bot', 'chart'].includes(x.type)  /* 旧版评分卡不再展示 */) : [];
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

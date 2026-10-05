// 用户记忆：结构化事实 + 对话滚动摘要 + 长期摘要；每用户硬上限 128k tokens（估算）。
// 组装顺序：system + 命盘 + 事实 + 长期摘要 + 本次对话摘要 + 最近若干轮原文。
import { getStore, type Memory } from './store';
import { chat, getProvider } from './llm';

export const USER_BUDGET = +(process.env.MEMORY_USER_BUDGET || 128000);
const CONV_RAW_LIMIT = +(process.env.MEMORY_CONV_RAW_LIMIT || 12000);
const KEEP_RECENT = +(process.env.MEMORY_KEEP_RECENT || 8);
const CONTEXT_LIMIT = +(process.env.MEMORY_CONTEXT_LIMIT || 6000);
const LONG_TERM_CHARS = 1500;

/** 粗略 token 估算：中日韩字符≈1 token，其余≈4 字符/token */
export function estTokens(s: string): number {
  if (!s) return 0;
  let cjk = 0; for (const ch of s) if (/[\u3000-\u9fff\uff00-\uffef]/.test(ch)) cjk++;
  return cjk + Math.ceil((s.length - cjk) / 4);
}
const j = (x: any) => JSON.stringify(x);
const memTokens = (m: Memory) => estTokens(j(m.facts)) + estTokens(m.longTerm) + Object.values(m.convSummaries).reduce((a, s) => a + s.tokens, 0);
export const chartSummaryOf = (c: any) => `${c.pillars.map((p: any) => (p.unknown ? '时柱不详' : p.gan + p.zhi)).join(' ')}；${c.input.gender}；日主${c.dayMaster.gan}${c.dayMaster.wuXing}${c.dayMaster.strength}；${c.pro?.geJu?.name || ''}；喜用${c.xiYong.join('')} 忌${c.jiShen.join('')}`;
/** 每位命主独立的事实区（严格隔离：A 的问答、事件、长期印象不会进入 B 的上下文） */
export function profileFacts(m: Memory, pid: string): any {
  const f = m.facts || (m.facts = {});
  const ps = f.profiles || (f.profiles = {});
  return ps[pid] || (ps[pid] = { qa: [], events: [], prefs: [], longTerm: '', superseded: [] });
}
const firstSentences = (t: string, n = 90) => { const s = t.replace(/\s+/g, ' ').trim(); const m = s.match(/^.{20,}?[。！？!?]/); return (m ? m[0] : s).slice(0, n); };

/** 每轮结束后：记录消息、更新事实，必要时异步压缩 */
export async function recordTurn(uid: string, cid: string, turn: { user?: string; assistant?: string; profile?: any; chart?: any; score?: any; pid?: string | null }) {
  const store = getStore();
  const pid = turn.pid || await store.conversationProfile(uid, cid).catch(() => null);
  const msgs = [];
  if (turn.user) msgs.push({ role: 'user' as const, content: turn.user, tokens: estTokens(turn.user) });
  if (turn.assistant) msgs.push({ role: 'assistant' as const, content: turn.assistant, tokens: estTokens(turn.assistant), meta: turn.score ? { score: turn.score } : null });
  await store.appendMessages(uid, cid, msgs);
  const m = await store.getMemory(uid);
  const f = m.facts || (m.facts = {});
  if (turn.profile) {
    f.birth = turn.profile;
    if (turn.chart) {
      const c = turn.chart;
      f.chartSummary = chartSummaryOf(c);
      const key = [turn.profile.gender, turn.profile.calendar, turn.profile.year, turn.profile.month, turn.profile.day, j(turn.profile.time || null)].join('|');
      await store.saveProfile(uid, key, turn.profile, c);
    }
  }
  if (turn.user && turn.assistant && !turn.chart) {
    const qa = { q: turn.user.slice(0, 80), a: firstSentences(turn.assistant), h: turn.score?.health, at: new Date().toISOString().slice(0, 10) };
    if (pid) { const pf = profileFacts(m, pid); pf.qa = [...(pf.qa || []), qa].slice(-40); }
    else f.qa = [...(f.qa || []), qa].slice(-40);
  }
  m.tokens = memTokens(m);
  await store.saveMemory(uid, m);
  compress(uid, cid).catch((e) => console.error('[memory] compress', e.message));
}

/**
 * 生辰确认 / 更正 / 为他人建档：在对话里记一条 system 类型事件（供模型上下文，不是用户消息），并更新该命主的结构化事实。
 * superseded：更正生辰时传入旧生辰与旧盘——旧结论标记为作废，本对话较早的摘要归档，之后的上下文只以新盘为准。
 */
export async function recordProfileEvent(uid: string, cid: string | null, pid: string | null, profile: any, chart: any, text: string, opts: { label?: string; superseded?: { line: string; chart: any } } = {}) {
  const store = getStore();
  const m = await store.getMemory(uid);
  if (cid && opts.superseded) {
    const prev = await store.getMessages(uid, cid, m.convSummaries[cid]?.lastId || 0).catch(() => []);
    const lastId = prev.length ? prev[prev.length - 1].id! : m.convSummaries[cid]?.lastId || 0;
    const old = m.convSummaries[cid]?.text || '';
    m.convSummaries[cid] = { text: '', lastId, tokens: 0, updatedAt: new Date().toISOString() };
    if (pid) {
      const pf = profileFacts(m, pid);
      pf.superseded = [...(pf.superseded || []), { at: new Date().toISOString().slice(0, 16), birth: opts.superseded.line, chart: chartSummaryOf(opts.superseded.chart), summary: old.slice(0, 400), qa: (pf.qa || []).length }].slice(-5);
      pf.qa = []; // 旧盘上的问答结论作废，不再进入上下文
    }
  }
  if (cid) await store.appendMessages(uid, cid, [{ role: 'system', content: text, tokens: estTokens(text), meta: { event: 'profile', pid } }]);
  if (!profile || !chart) { /* 仅记事件 */ }
  else if (pid) {
    const pf = profileFacts(m, pid);
    pf.birth = profile; pf.chartSummary = chartSummaryOf(chart);
    if (opts.label !== undefined) pf.label = opts.label;
  } else {
    const f = m.facts || (m.facts = {});
    f.birth = profile; f.chartSummary = chartSummaryOf(chart);
  }
  m.tokens = memTokens(m);
  await store.saveMemory(uid, m);
}
/** 删除命主：清掉它的事实区与对话摘要 */
export async function forgetProfile(uid: string, pid: string, cid: string | null) {
  const store = getStore();
  const m = await store.getMemory(uid);
  if (m.facts?.profiles) delete m.facts.profiles[pid];
  if (cid) delete m.convSummaries[cid];
  m.tokens = memTokens(m);
  await store.saveMemory(uid, m);
}

async function llmJSON(system: string, user: string, maxTokens = 900): Promise<any> {
  if (!getProvider().available) return null;
  const out = await chat([{ role: 'system', content: system }, { role: 'user', content: user }], { json: true, temperature: 0.2, maxTokens });
  const mm = String(out).match(/\{[\s\S]*\}/); return mm ? JSON.parse(mm[0]) : null;
}

const running = new Set<string>();
export const isCompressing = (uid: string) => running.has(uid);
/** 对话原文超过阈值：把较早的轮次压缩进对话摘要；再合并进长期摘要；最后执行 128k 预算 */
export async function compress(uid: string, cid: string, force = false) {
  if (running.has(uid)) return; running.add(uid);
  try {
    const store = getStore();
    const m = await store.getMemory(uid);
    const cs = m.convSummaries[cid];
    const raw = await store.getMessages(uid, cid, cs?.lastId || 0);
    const rawTok = raw.reduce((a, b) => a + b.tokens, 0);
    if ((rawTok > CONV_RAW_LIMIT || force) && raw.length > KEEP_RECENT) {
      const old = raw.slice(0, raw.length - KEEP_RECENT);
      const dialog = old.map((x) => `${x.role === 'user' ? '客户' : x.role === 'system' ? '（事件）' : '大师'}：${x.content.slice(0, 1500)}`).join('\n');
      const r = await llmJSON('你是记忆整理助手。把命理咨询对话压缩成要点，供以后继续对话使用。只输出 JSON：{"summary":"300字内，按时间顺序概括客户问了什么、大师的主要结论和建议","events":["客户自述的人生事件，如2019年换工作，最多5条"],"prefs":["客户的偏好或关注点，最多3条"]}',
        `【已有摘要】${cs?.text || '无'}\n【新对话】\n${dialog}`);
      const text = (r?.summary ? String(r.summary) : old.filter((x) => x.role === 'user').map((x) => x.content.slice(0, 40)).join('；')).slice(0, 800);
      m.convSummaries[cid] = { text: cs ? `${cs.text}\n${text}`.slice(-1600) : text, lastId: old[old.length - 1].id!, tokens: 0, updatedAt: new Date().toISOString() };
      m.convSummaries[cid].tokens = estTokens(m.convSummaries[cid].text);
      const pid = await store.conversationProfile(uid, cid).catch(() => null);
      const f = pid ? profileFacts(m, pid) : m.facts;
      if (Array.isArray(r?.events)) f.events = [...new Set([...(f.events || []), ...r.events.map(String)])].slice(-30);
      if (Array.isArray(r?.prefs)) f.prefs = [...new Set([...(f.prefs || []), ...r.prefs.map(String)])].slice(-10);
      const lt = await llmJSON('你是记忆整理助手。合并客户的长期印象。只输出 JSON：{"longTerm":"不超过600字，客户是谁、关心什么、问过的重要问题和大师给过的关键结论"}',
        `【原长期印象】${(pid ? f.longTerm : m.longTerm) || '无'}\n【新增对话摘要】${text}`, 800).catch(() => null);
      if (pid) f.longTerm = String(lt?.longTerm || `${f.longTerm || ''}\n${text}`).slice(-LONG_TERM_CHARS);
      else m.longTerm = String(lt?.longTerm || `${m.longTerm}\n${text}`).slice(-LONG_TERM_CHARS);
    }
    await enforceBudget(uid, m);
  } finally { running.delete(uid); }
}

/** 128k 预算：先删已被摘要覆盖的旧原文 → 再把最旧的对话摘要并入长期摘要 → 再裁剪问答记录；出生信息与命盘摘要永不删除 */
export async function enforceBudget(uid: string, m?: Memory) {
  const store = getStore();
  m = m || await store.getMemory(uid);
  let total = memTokens(m) + await store.rawTokens(uid);
  const convs = await store.listConversations(uid);
  for (const c of convs) { // 1) 已摘要的原文
    if (total <= USER_BUDGET) break;
    const s = m.convSummaries[c.id]; if (!s?.lastId) continue;
    const before = await store.rawTokens(uid); await store.deleteMessages(uid, c.id, s.lastId); total -= before - await store.rawTokens(uid);
  }
  const ids = Object.entries(m.convSummaries).sort((a, b) => a[1].updatedAt.localeCompare(b[1].updatedAt)).map(([k]) => k);
  for (const id of ids) { // 2) 最旧摘要 → 长期摘要
    if (total <= USER_BUDGET) break;
    const s = m.convSummaries[id]; delete m.convSummaries[id];
    m.longTerm = `${m.longTerm}\n${s.text.slice(0, 200)}`.slice(-LONG_TERM_CHARS);
    total -= s.tokens;
  }
  while (total > USER_BUDGET && m.facts.qa?.length) { m.facts.qa.shift(); total -= 30; } // 3) 问答记录
  for (const c of convs) { // 4) 仍超：删除最旧对话的最早原文（保留最近 KEEP_RECENT 条）
    if (total <= USER_BUDGET) break;
    const msgs = await store.getMessages(uid, c.id);
    if (msgs.length <= KEEP_RECENT) continue;
    const cut = msgs[msgs.length - KEEP_RECENT - 1];
    total -= msgs.slice(0, msgs.length - KEEP_RECENT).reduce((a, b) => a + b.tokens, 0);
    await store.deleteMessages(uid, c.id, cut.id!);
  }
  m.tokens = memTokens(m);
  await store.saveMemory(uid, m);
  return total;
}

/** 组装注入 system 的记忆块（受 CONTEXT_LIMIT 控制）。按命主严格隔离：只带当前命主的事实、问答与长期印象。 */
export async function memoryContext(uid: string, cid: string, pidIn?: string | null): Promise<string> {
  const store = getStore();
  const m = await store.getMemory(uid);
  const pid = pidIn || await store.conversationProfile(uid, cid).catch(() => null);
  const events = (await store.getMessages(uid, cid, m.convSummaries[cid]?.lastId || 0).catch(() => [])).filter((x) => x.role === 'system').slice(-3).map((x) => x.content);
  const legacy = m.facts || {};
  const pf = pid ? (legacy.profiles?.[pid] || {}) : legacy;
  // 旧版本（多命主之前）的长期印象只属于"我"
  const own = !pid || !pf.label || pf.label === '我';
  const facts: any = {};
  if (pid && pf.label) facts.命主 = pf.label === '我' ? '客户本人' : `客户的${pf.label}`;
  if (pf.birth) facts.出生信息 = pf.birth;
  if (pf.chartSummary) facts.命盘摘要 = pf.chartSummary;
  const ev = pf.events?.length ? pf.events : own && pid ? legacy.events : null;
  if (ev?.length) facts.客户自述事件 = ev;
  const pr = pf.prefs?.length ? pf.prefs : own && pid ? legacy.prefs : null;
  if (pr?.length) facts.偏好 = pr;
  if (pf.qa?.length) facts.近期问答要点 = pf.qa.slice(-8).map((x: any) => `${x.q} → ${x.a}`);
  const core = Object.keys(facts).length ? `【客户档案（以往对话记录，供参考，命盘以本次排盘数据为准）】\n${j(facts)}` : '';
  const sup = pf.superseded?.length
    ? `【已作废的旧盘——严禁引用】客户更正过生辰。以下旧盘及基于它的所有结论全部作废，不得再引用、对比或沿用，一切以当前命盘为准：\n${pf.superseded.map((x: any) => `· ${x.at} 前按「${x.birth}」排的 ${x.chart}`).join('\n')}`
    : '';
  const ltText = pid ? (pf.longTerm || (own ? m.longTerm : '')) : m.longTerm;
  let lt = ltText ? `【长期印象】\n${ltText}` : '';
  const conv = m.convSummaries[cid]?.text ? `【本次对话较早部分摘要】\n${m.convSummaries[cid].text}` : '';
  while (estTokens([core, lt, conv].join('\n\n')) > CONTEXT_LIMIT && lt.length > 50) lt = '【长期印象】\n…' + lt.slice(Math.floor(lt.length * 0.3));
  const evs = events.length ? `【本次对话中的操作记录】\n${events.join('\n')}` : '';
  return [core, sup, lt, conv, evs].filter(Boolean).join('\n\n');
}

// 入口：Express（容器 / 云托管）。REST API v1：/api/v1/*（Bearer token 鉴权，兼容小程序）；旧版 /api/chat 保留兼容。
import './env';
import express, { type Request, type Response, type NextFunction } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { handleReading, handleChart } from './handler';
import { handleChat, runReading, runCompat, validateProfile, profileLine, readingIntro, sanitize, whoOf } from './chat';
import { chartDiffText, changeSentence, briefBazi, timeKey, recommendCities, cityChartBrief, PREF_KEYS } from '@mingpan/core';
import { geoOfReq } from './geo';
import { getProvider } from './llm';
import * as rateLimit from './ratelimit';
import { securityHeaders } from './security';
import { getStore } from './store';
import { identify, makeToken, newUid, setCookie, clearCookie, isAdmin, verifyToken } from './identity';
import { memoryContext, recordTurn, enforceBudget, recordProfileEvent, forgetProfile } from './memory';

const app = express();
app.disable('x-powered-by');
const tp = process.env.TRUST_PROXY ?? '1';
app.set('trust proxy', /^\d+$/.test(tp) ? +tp : tp === 'false' ? false : tp);
app.use(securityHeaders);
const store = getStore();
const CID_RE = /^[A-Za-z0-9_-]{8,64}$/;

// ---------- 静态资源（apps/web 构建产物） ----------
const WEB = process.env.WEB_DIR || path.join(__dirname, '..', '..', 'web', 'dist');
app.get('/favicon.ico', (req, res) => res.type('image/png').sendFile(path.join(WEB, 'assets/icon-32.png'), { maxAge: '7d' }));
app.use(express.static(WEB, {
  index: 'index.html',
  setHeaders(res, file) {
    if (/[\\/]static[\\/]/.test(file)) res.set('Cache-Control', 'public, max-age=31536000, immutable'); // 带 hash 的构建产物
    else if (/[\\/]assets[\\/]/.test(file)) res.set('Cache-Control', 'public, max-age=604800');
    else res.set('Cache-Control', 'no-cache');
    if (/\.webmanifest$/.test(file)) res.type('application/manifest+json');
  },
}));

const json = (limit: number | string) => express.json({ limit });
const smallJson = json(rateLimit.MAX_BODY_BYTES);
const limiter = (bucket: 'llm' | 'light') => (req: Request, res: Response, next: NextFunction) => {
  const r = rateLimit.check(req.ip, bucket);
  if (r.ok) return next();
  res.set('Retry-After', String(r.retryAfter)).status(429).json({ error: r.reason });
};
const limited = limiter('llm'), light = limiter('light');
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { const out = await fn(req, res); if (out !== undefined && !res.headersSent) res.json(out); }
  catch (e) { console.error(e); if (!res.headersSent) res.status(e.status || 500).json({ error: e.status ? e.message : '服务器开小差了，请稍后再试' }); }
};
const needUser = (req: Request) => { const uid = identify(req); if (!uid) throw Object.assign(new Error('未登录或身份已失效'), { status: 401 }); return uid; };

// ---------- 会话 / 身份 ----------
app.post('/api/v1/session', wrap(async (req, res) => {
  let uid = identify(req);
  if (!uid || !(await store.getUser(uid))) {
    const r = rateLimit.check(req.ip); // 只有签发新身份时计入限流
    if (!r.ok) throw Object.assign(new Error(r.reason), { status: 429 });
    uid = newUid();
  }
  await store.ensureUser(uid);
  const token = makeToken(uid);
  setCookie(req, res, token);
  return { uid, token };
}));
// 微信小程序登录占位：wx.login 拿 code → 服务端 code2session 换 openid → 绑定/创建用户（需配置 WECHAT_APPID / WECHAT_SECRET）
app.post('/api/v1/auth/wechat', smallJson, limited, wrap(async (req) => {
  const { WECHAT_APPID: appid, WECHAT_SECRET: secret } = process.env;
  if (!appid || !secret) throw Object.assign(new Error('小程序登录尚未开通'), { status: 501 });
  const code = String(req.body?.code || ''); if (!/^[\w-]{10,64}$/.test(code)) throw Object.assign(new Error('code 无效'), { status: 400 });
  const r: any = await (await fetch(`https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`)).json();
  if (!r.openid) throw Object.assign(new Error('微信登录失败'), { status: 502 });
  let user = await store.findUserByWechat(r.openid);
  if (!user) { const cur = identify(req); const uid = cur && (await store.getUser(cur)) ? cur : newUid(); user = await store.ensureUser(uid); await store.linkWechat(uid, r.openid, r.unionid); }
  return { uid: user.id, token: makeToken(user.id) };
}));

// ---------- 聊天 ----------
type Emit = (e: string, d: any) => void;
async function runChat(req: Request, emit: Emit) {
  const body = req.body || {};
  const uid = identify(req);
  const cid = typeof body.cid === 'string' && CID_RE.test(body.cid) ? body.cid : null;
  let memory = '', current = null, profiles = [];
  if (uid) {
    await store.ensureUser(uid);
    profiles = (await store.getProfiles(uid).catch(() => [])).map((p) => ({ id: p.id, label: p.label || '我', data: p.data, cid: p.cid }));
    // 当前命主：客户端给的 profileId（或旧版 profile.id），否则看这个对话绑定的命主
    const pidWanted = typeof body.profileId === 'string' ? body.profileId : typeof body.profile?.id === 'string' ? body.profile.id : null;
    const bound = cid ? await store.conversationProfile(uid, cid).catch(() => null) : null;
    current = profiles.find((p) => p.id === (bound || pidWanted)) || null;
    if (current && cid && !bound && !current.cid) await store.bindConversation(uid, current.id, cid).catch(() => {}); // 旧版档案：首次使用时绑定到当前对话
    if (cid) memory = await memoryContext(uid, cid, current?.id).catch(() => '');
  }
  // 收集本轮产出，结束后写入记忆
  let text = '', profile = null, chart = null, score = null;
  const tap: Emit = (e, d) => {
    if (e === 'delta') text += d.text; else if (e === 'text') text += (text ? '\n\n' : '') + d.text;
    else if (e === 'profile') profile = d.profile; else if (e === 'chart') chart = d.chart;
    emit(e, d);
  };
  const onScore = (sc) => { // 评分只留在服务端（日志 + 数据库），绝不下发给客户端
    score = sc;
    console.log(`[score] health=${sc.health} verdict=${sc.verdict} flags=${sc.flags.join(',') || '-'} ${sc.dims.map((x) => x.k + x.score).join(' ')}`);
  };
  try { await handleChat(body, (e, d) => { if (e !== 'score') tap(e, d); }, { memory, onScore, current, profiles, geo: geoOfReq(req) }); }
  catch (e) { console.error(e); tap('error', { error: '大师走神了，请再发一次～' }); tap('done', {}); }
  if (uid && cid) {
    const lastUser = [...(body.messages || [])].reverse().find((m) => m?.role === 'user')?.content;
    recordTurn(uid, cid, { user: typeof lastUser === 'string' ? lastUser.slice(0, 500) : undefined, assistant: text, profile, chart, score, pid: current?.id })
      .catch((e) => console.error('[memory] record', e.message));
  }
}

// 事件流通用执行器：SSE（默认）| ?stream=0 一次性 JSON | ?mode=poll 轮询（小程序 wx.request 不支持流式时）
const jobs = new Map<string, { events: [string, any][]; done: boolean; at: number }>();
setInterval(() => { const t = Date.now(); for (const [k, v] of jobs) if (t - v.at > 600000) jobs.delete(k); }, 60000).unref();

async function eventRoute(req: Request, res: Response, tag: string, run: (emit: Emit) => Promise<void>) {
  const t0 = Date.now();
  const mode = req.query.stream === '0' ? 'json' : req.query.mode === 'poll' ? 'poll' : 'sse';
  if (mode === 'json') {
    const events: [string, any][] = [];
    await run((e, d) => events.push([e, d]));
    console.log(`${tag} json ${Date.now() - t0}ms events=${events.length}`);
    return res.set('Cache-Control', 'no-store').json({ events });
  }
  if (mode === 'poll') {
    const id = crypto.randomBytes(9).toString('base64url');
    const job = { events: [] as [string, any][], done: false, at: Date.now() };
    jobs.set(id, job);
    run((e, d) => { if (e !== 'ping') job.events.push([e, d]); }).finally(() => { job.done = true; console.log(`${tag} poll ${Date.now() - t0}ms events=${job.events.length}`); });
    return res.json({ jobId: id });
  }
  res.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(': ok\n\n'); // 立即首字节，避免移动网络 / 内置浏览器判定超时
  let closed = false, n = 0; res.on('close', () => (closed = true));
  const ping = setInterval(() => { if (!closed) res.write(': ping\n\n'); }, 5000);
  try { await run((e, d) => { if (!closed) { n++; res.write(`event: ${e}\ndata: ${JSON.stringify(d)}\n\n`); } }); }
  finally { clearInterval(ping); console.log(`${tag} sse ${Date.now() - t0}ms events=${n}${closed ? ' CLIENT_CLOSED_EARLY' : ''}`); res.end(); }
}
const chatRoute = (req: Request, res: Response) => eventRoute(req, res, `[chat] ${req.ip} ${req.body?.action || (req.body?.profile ? 'followup' : 'extract')}`, (emit) => runChat(req, emit));
app.post('/api/v1/chat', smallJson, limited, chatRoute);
app.post('/api/chat', smallJson, limited, chatRoute); // 兼容旧前端缓存
app.get(['/api/v1/jobs/:id', '/api/v1/chat/jobs/:id'], (req, res) => {
  const job = jobs.get(String(req.params.id)); if (!job) return res.status(404).json({ error: '任务不存在或已过期' });
  const after = Math.max(0, +(req.query.after || 0) || 0);
  res.set('Cache-Control', 'no-store').json({ events: job.events.slice(after), next: job.events.length, done: job.done });
});

// ---------- 对话 / 生辰档案（确认排盘是软件操作，不是聊天消息） ----------
const optCid = (v: any) => (typeof v === 'string' && CID_RE.test(v) ? v : null);
const nowYearOf = (b: any) => (+b?.nowYear >= 1900 && +b?.nowYear <= 2200 ? +b.nowYear : new Date().getFullYear());
const birthKey = (p: any) => [p.gender, p.calendar || 'solar', p.year, p.month, p.day, p.leap ? 1 : 0, timeKey(p.time), p.city || ''].join('|');

const newConvId = () => crypto.randomBytes(12).toString('base64url');
const cleanLabel = (v: any) => (typeof v === 'string' ? v.trim().replace(/[<>]/g, '').slice(0, 8) : '');
const summaryOf = (p: any) => ({ id: p.id, label: p.label || '我', name: p.data?.name || '', data: { ...p.data, label: p.label || '我', id: p.id }, cid: p.cid, version: p.version, bazi: p.chart ? briefBazi(p.chart) : '', updatedAt: p.updatedAt });

app.post('/api/v1/conversations', light, wrap(async (req) => {
  const uid = needUser(req); await store.ensureUser(uid);
  const cid = newConvId();
  await store.ensureConversation(uid, cid);
  return { cid };
}));
// 对话原文（换设备 / 切换命主时重建聊天记录）；system 事件不展示给用户
app.get('/api/v1/conversations/:cid/messages', wrap(async (req) => {
  const uid = needUser(req); const cid = String(req.params.cid);
  if (!CID_RE.test(cid)) throw Object.assign(new Error('对话不存在'), { status: 404 });
  const msgs = await store.getMessages(uid, cid);
  return { cid, profileId: await store.conversationProfile(uid, cid), messages: msgs.filter((m) => m.role !== 'system').slice(-120).map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt })) };
}));
app.get('/api/v1/profiles', wrap(async (req) => ({ profiles: (await store.getProfiles(needUser(req))).map(summaryOf) })));
app.get('/api/v1/profiles/:id', wrap(async (req) => {
  const uid = needUser(req);
  const p = await store.getProfile(uid, String(req.params.id)); if (!p) throw Object.assign(new Error('档案不存在'), { status: 404 });
  const v = validateProfile(p.data, nowYearOf(req.query));
  const versions = (await store.getVersions(uid, p.id)).map((x) => ({ version: x.version, data: x.data, bazi: x.chart ? briefBazi(x.chart) : '', createdAt: x.createdAt }));
  return { ...summaryOf(p), profile: { ...p.data, id: p.id, label: p.label || '我' }, chart: v.chart || p.chart, versions };
}));
// 确认生辰（软件操作）：校验 → 排盘 → 建档。当前对话已属于别的命主时，为新命主单独开一个对话（返回新的 cid）
app.post('/api/v1/profiles', smallJson, light, wrap(async (req, res) => {
  const uid = needUser(req); await store.ensureUser(uid);
  const raw = req.body?.profile || {};
  const v = validateProfile(raw, nowYearOf(req.body));
  if (v.error) { res.status(422); return { error: v.error }; }
  const all = await store.getProfiles(uid);
  const label = cleanLabel(raw.label) || (all.some((p) => (p.label || '我') === '我') ? '' : '我');
  if (!label) { res.status(422); return { error: '请填一下这是谁的盘（比如 老公、妈妈、朋友）' }; }
  const data = { ...v.profile, label }; delete data.newPerson; delete data.correction;
  const cid = optCid(req.body?.cid);
  const bound = cid ? await store.conversationProfile(uid, cid) : null;
  let prof = await store.findProfile(uid, birthKey(data), label);
  let targetCid: string;
  if (prof) { // 重复确认同一个人：沿用原档案与原对话
    targetCid = prof.cid || (cid && (!bound || bound === prof.id) ? cid : newConvId());
    if (!prof.cid) await store.bindConversation(uid, prof.id, targetCid);
  } else {
    targetCid = cid && !bound ? cid : newConvId();
    prof = await store.createProfile(uid, { birthKey: birthKey(data), data, chart: v.chart, label, cid: targetCid });
  }
  const line = profileLine(data);
  await recordProfileEvent(uid, targetCid, prof.id, data, v.chart, `用户确认了生辰信息（命主：${label === '我' ? '本人' : label}）：${line}`, { label });
  if (cid && targetCid !== cid) await recordProfileEvent(uid, cid, bound, null, null, `用户为「${label}」新建了单独的命盘档案（在另一个对话里解读；这里不要混用两人的命盘）`).catch(() => {});
  console.log(`[profile] create ${uid} ${prof.id} label=${label} cid=${targetCid}${targetCid !== cid ? ' (new conversation)' : ''}`);
  const intro = label === '我' ? readingIntro(data, v.chart) : readingIntro(data, v.chart).replace('你的盘排出来了，你先看看', `${whoOf(label)}的盘排出来了，你先看看`);
  return { profile: { ...data, id: prof.id, label }, chart: v.chart, intro, cid: targetCid, switched: !!cid && targetCid !== cid };
}));
// 改称呼（不重排）或更正生辰（重排 + 记一个历史版本 + 程序计算的新旧盘差异）
app.patch('/api/v1/profiles/:id', smallJson, light, wrap(async (req, res) => {
  const uid = needUser(req);
  const cur = await store.getProfile(uid, String(req.params.id));
  if (!cur) { res.status(404); return { error: '档案不存在' }; }
  if (!req.body?.profile) {
    const label = cleanLabel(req.body?.label) || cur.label || '我';
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 12) : undefined;
    await store.renameProfile(uid, cur.id, label, name);
    const m = await store.getMemory(uid); if (m.facts?.profiles?.[cur.id]) { m.facts.profiles[cur.id].label = label; await store.saveMemory(uid, m); }
    return summaryOf({ ...cur, label, data: name === undefined ? cur.data : { ...cur.data, name } });
  }
  const patch = req.body.profile || {};
  const nowYear = nowYearOf(req.body);
  const v = validateProfile({ ...cur.data, ...patch, time: patch.time || cur.data.time }, nowYear);
  if (v.error) { res.status(422); return { error: v.error }; }
  const label = cur.label || '我';
  const data = { ...v.profile, label }; delete data.newPerson; delete data.correction;
  const prev = validateProfile(cur.data, nowYear);
  const prevChart = prev.chart || cur.chart;
  const same = birthKey(data) === birthKey(cur.data);
  if (!same) await store.updateProfile(uid, cur.id, birthKey(data), data, v.chart);
  const cid = optCid(req.body?.cid) || cur.cid;
  const oldLine = profileLine(cur.data), newLine = profileLine(data);
  await recordProfileEvent(uid, cid, cur.id, data, v.chart, same ? `用户核对了生辰信息（无变化）：${newLine}` : `用户更正了生辰信息：${oldLine} → ${newLine}。旧盘及基于旧盘的结论作废，以新盘为准。`,
    { label, superseded: same ? undefined : { line: oldLine, chart: prevChart } });
  const diff = same ? '' : chartDiffText(prevChart, v.chart);
  const ts = v.chart.trueSolar;
  const intro = same ? '生辰没有变化，盘还是原来那张。' : `好，按${changeSentence(cur.data, data).split('；').map((x) => x.split('，不是')[0]).join('、')}重新排了一盘。\n\n${diff}${ts && !diff.includes('真太阳时') ? `\n\n（按${ts.city}真太阳时校正：${ts.time.slice(11, 16)}）` : ''}\n\n下面按新盘重新给你细看一遍。`;
  console.log(`[profile] update ${uid} ${cur.id} ${same ? '(same)' : `v${cur.version + 1}`}`);
  return { profile: { ...data, id: cur.id, label }, chart: v.chart, intro, cid, version: same ? cur.version : cur.version + 1, recast: !same, previous: same ? null : { profile: cur.data, bazi: briefBazi(prevChart) } };
}));
app.delete('/api/v1/profiles/:id', light, wrap(async (req) => {
  const uid = needUser(req);
  const p = await store.getProfile(uid, String(req.params.id)); if (!p) return { ok: true };
  await store.deleteProfile(uid, p.id);
  await forgetProfile(uid, p.id, p.cid);
  console.log(`[profile] delete ${uid} ${p.id}`);
  return { ok: true };
}));
app.get('/api/v1/profiles/:id/versions', wrap(async (req) => {
  const uid = needUser(req);
  return { versions: (await store.getVersions(uid, String(req.params.id))).map((x) => ({ version: x.version, data: x.data, bazi: x.chart ? briefBazi(x.chart) : '', createdAt: x.createdAt })) };
}));
// 宜居城市（纯程序排序，不调模型）：body { abroad?, prefer?: string[], exclude?: string[], countries?: string[] }
// 所在地区只在服务端用于就近排序，不出现在返回里
app.post('/api/v1/profiles/:id/cities', smallJson, limited, wrap(async (req) => {
  const uid = needUser(req);
  const p = await store.getProfile(uid, String(req.params.id)).catch(() => null);
  if (!p) throw Object.assign(new Error('档案不存在'), { status: 404 });
  const v = validateProfile(p.data, nowYearOf(req.body));
  if (v.error) throw Object.assign(new Error(v.error), { status: 422 });
  const b = req.body || {};
  const strs = (x: any, ok?: string[]) => (Array.isArray(x) ? x.filter((s) => typeof s === 'string' && s.length <= 12 && (!ok || ok.includes(s))).slice(0, 20) : []);
  const g = geoOfReq(req);
  const anchor = g?.country ? (g.lat != null ? { lat: g.lat, lng: g.lng!, country: g.country } : g.country !== '中国' ? { lat: 0, lng: 0, country: g.country } : null) : null;
  const abroad = b.abroad === true; // 海外模式需显式请求；所在地区只用于就近排序
  const r = recommendCities(v.chart, { anchor, abroad, prefer: strs(b.prefer, PREF_KEYS), exclude: strs(b.exclude), countries: strs(b.countries) });
  return { brief: cityChartBrief(v.chart), abroad: r.abroad, cities: r.cities.map(({ score, ...c }) => c) };
}));
// 详批：SSE / ?stream=0 / ?mode=poll；recast=true 表示更正生辰后的重新解读
app.post('/api/v1/profiles/:id/reading', smallJson, limited, async (req, res) => {
  const uid = identify(req);
  if (!uid) return res.status(401).json({ error: '未登录或身份已失效' });
  const p = await store.getProfile(uid, String(req.params.id)).catch(() => null);
  if (!p) return res.status(404).json({ error: '档案不存在' });
  const cid = optCid(req.body?.cid) || p.cid;
  const v = validateProfile(p.data, nowYearOf(req.body)); // 按当前年份重新排盘（流年随年份变化）
  if (v.error) return res.status(422).json({ error: v.error });
  const { messages } = sanitize(req.body || {});
  const memory = cid ? await memoryContext(uid, cid, p.id).catch(() => '') : '';
  const recast = !!req.body?.recast && p.version > 1;
  await eventRoute(req, res, `[reading] ${req.ip}${recast ? ' recast' : ''}`, async (emit) => {
    let text = '', score = null;
    const tap: Emit = (e, d) => { if (e === 'delta') text += d.text; emit(e, d); };
    try { await runReading({ ...v.profile, label: p.label || '我' }, v.chart, messages, tap, { memory, recast, onScore: (sc) => { score = sc; console.log(`[score] health=${sc.health} verdict=${sc.verdict} flags=${sc.flags.join(',') || '-'} ${sc.dims.map((x) => x.k + x.score).join(' ')}`); } }); }
    catch (e) { console.error(e); emit('error', { error: '大师走神了，请再试一次～' }); emit('done', {}); }
    if (cid && text) recordTurn(uid, cid, { assistant: text, score, pid: p.id }).catch((e) => console.error('[memory] record', e.message));
  });
});
// 合盘：两位已有命主（a 为当前对话的命主），事件同 chat
app.post('/api/v1/compat', smallJson, limited, async (req, res) => {
  const uid = identify(req);
  if (!uid) return res.status(401).json({ error: '未登录或身份已失效' });
  const [a, b] = await Promise.all([store.getProfile(uid, String(req.body?.a || '')), store.getProfile(uid, String(req.body?.b || ''))]).catch(() => [null, null]);
  if (!a || !b || a.id === b.id) return res.status(404).json({ error: '需要两位不同的命主' });
  const cid = optCid(req.body?.cid) || a.cid;
  const q = typeof req.body?.question === 'string' ? req.body.question.slice(0, 300) : '我们俩合不合？';
  const memory = cid ? await memoryContext(uid, cid, a.id).catch(() => '') : '';
  await eventRoute(req, res, `[compat] ${req.ip}`, async (emit) => {
    let text = '';
    const tap: Emit = (e, d) => { if (e === 'delta') text += d.text; emit(e, d); };
    try { await runCompat({ ...a, label: a.label || '我' }, { ...b, label: b.label || '我' }, q, [{ role: 'user', content: q }], tap, { memory, nowYear: nowYearOf(req.body) }); }
    catch (e) { console.error(e); emit('error', { error: '大师走神了，请再试一次～' }); emit('done', {}); }
    if (cid && text) recordTurn(uid, cid, { user: q, assistant: text, pid: a.id }).catch(() => {});
  });
});

// ---------- 我的数据 ----------
app.get('/api/v1/me', wrap(async (req) => {
  const uid = needUser(req);
  const [user, profiles, convs, mem] = await Promise.all([store.getUser(uid), store.getProfiles(uid), store.listConversations(uid), store.getMemory(uid)]);
  return { user, profiles: profiles.map((p) => ({ id: p.id, data: p.data, updatedAt: p.updatedAt })), conversations: convs, memoryTokens: mem.tokens, rawTokens: convs.reduce((a, c) => a + c.tokens, 0) };
}));
app.get('/api/v1/me/export', wrap(async (req, res) => { const uid = needUser(req); res.set('Content-Disposition', 'attachment; filename="mingpan-my-data.json"'); return store.exportUser(uid); }));
app.delete('/api/v1/me', wrap(async (req, res) => { const uid = needUser(req); await store.deleteUser(uid); clearCookie(req, res); return { ok: true }; }));
// 首次访问：把旧版浏览器本地历史迁移到服务端
app.post('/api/v1/me/migrate', json('512kb'), limited, wrap(async (req) => {
  const uid = needUser(req); await store.ensureUser(uid);
  const b = req.body || {};
  const cid = typeof b.cid === 'string' && CID_RE.test(b.cid) ? b.cid : null;
  if (!cid || (await store.hasConversation(uid, cid))) return { ok: true, imported: 0 };
  const llm = (Array.isArray(b.llm) ? b.llm : []).filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-200);
  const { estTokens } = await import('./memory');
  await store.appendMessages(uid, cid, llm.map((m: any) => ({ role: m.role, content: m.content.slice(0, 6000), tokens: estTokens(m.content.slice(0, 6000)), meta: { migrated: true } })));
  if (b.profile && typeof b.profile === 'object') { const m = await store.getMemory(uid); m.facts.birth = b.profile; await store.saveMemory(uid, m); }
  await enforceBudget(uid);
  return { ok: true, imported: llm.length };
}));

// ---------- 管理（ADMIN_TOKEN） ----------
const admin = (req: Request, res: Response, next: NextFunction) => (isAdmin(req) ? next() : res.status(404).json({ error: 'not found' }));
app.get('/api/v1/admin/users', admin, wrap(async (req) => store.listUsers(Math.min(200, +(req.query.limit || 50)), +(req.query.offset || 0))));
app.get('/api/v1/admin/users/:id', admin, wrap(async (req) => { const d = await store.exportUser(String(req.params.id)); if (!d) throw Object.assign(new Error('用户不存在'), { status: 404 }); return d; }));
app.delete('/api/v1/admin/users/:id', admin, wrap(async (req) => { await store.deleteUser(String(req.params.id)); return { ok: true }; }));

// ---------- 其他 ----------
app.post('/api/reading', smallJson, limited, wrap(async (req) => handleReading(req.body)));
app.post('/api/chart', smallJson, wrap(async (req) => handleChart(req.body)));
app.get(['/api/health', '/api/v1/health'], (req, res) => { const p = getProvider(); res.json({ ok: true, provider: p.name, model: p.model, llm: p.available, store: store.driver }); });
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: '请求内容过长' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: '请求格式错误' });
  next(err);
});

const port = +(process.env.PORT || process.env.FC_SERVER_PORT || 3000);
store.init().then(() => {
  app.listen(port, () => { const p = getProvider(); console.log(`八字网页已启动 http://localhost:${port}  LLM=${p.name}/${p.model} ${p.available ? '已配置' : '未配置Key→模板模式'}  store=${store.driver}  web=${fs.existsSync(WEB) ? 'ok' : 'missing'}`); });
}).catch((e) => { console.error('[store] 初始化失败', e); process.exit(1); });
export { app, verifyToken };

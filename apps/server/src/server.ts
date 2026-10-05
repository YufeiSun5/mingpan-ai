// 入口：Express（容器 / 云托管）。REST API v1：/api/v1/*（Bearer token 鉴权，兼容小程序）；旧版 /api/chat 保留兼容。
import './env';
import express, { type Request, type Response, type NextFunction } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { handleReading, handleChart } from './handler';
import { handleChat, runReading, validateProfile, profileLine, readingIntro, sanitize } from './chat';
import { getProvider } from './llm';
import * as rateLimit from './ratelimit';
import { securityHeaders } from './security';
import { getStore } from './store';
import { identify, makeToken, newUid, setCookie, clearCookie, isAdmin, verifyToken } from './identity';
import { memoryContext, recordTurn, enforceBudget, recordProfileEvent } from './memory';

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
const limited = (req: Request, res: Response, next: NextFunction) => {
  const r = rateLimit.check(req.ip);
  if (r.ok) return next();
  res.set('Retry-After', String(r.retryAfter)).status(429).json({ error: r.reason });
};
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
  let memory = '';
  if (uid && cid) { await store.ensureUser(uid); memory = await memoryContext(uid, cid).catch(() => ''); }
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
  try { await handleChat(body, (e, d) => { if (e !== 'score') tap(e, d); }, { memory, onScore }); }
  catch (e) { console.error(e); tap('error', { error: '大师走神了，请再发一次～' }); tap('done', {}); }
  if (uid && cid) {
    const lastUser = [...(body.messages || [])].reverse().find((m) => m?.role === 'user')?.content;
    recordTurn(uid, cid, { user: typeof lastUser === 'string' ? lastUser.slice(0, 500) : undefined, assistant: text, profile, chart, score })
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
const birthKey = (p: any) => [p.gender, p.calendar, p.year, p.month, p.day, p.leap ? 1 : 0, JSON.stringify(p.time || null), p.city || ''].join('|');

app.post('/api/v1/conversations', limited, wrap(async (req) => {
  const uid = needUser(req); await store.ensureUser(uid);
  const cid = crypto.randomBytes(12).toString('base64url');
  await store.ensureConversation(uid, cid);
  return { cid };
}));
app.get('/api/v1/profiles', wrap(async (req) => ({ profiles: await store.getProfiles(needUser(req)) })));
app.post('/api/v1/profiles', smallJson, limited, wrap(async (req, res) => {
  const uid = needUser(req); await store.ensureUser(uid);
  const v = validateProfile(req.body?.profile, nowYearOf(req.body));
  if (v.error) { res.status(422); return { error: v.error }; }
  const id = await store.saveProfile(uid, birthKey(v.profile), v.profile, v.chart);
  await recordProfileEvent(uid, optCid(req.body?.cid), v.profile, v.chart, `用户确认了生辰信息：${profileLine(v.profile)}`);
  console.log(`[profile] create ${uid} ${id}`);
  return { profile: { ...v.profile, id }, chart: v.chart, intro: readingIntro(v.profile, v.chart) };
}));
app.patch('/api/v1/profiles/:id', smallJson, limited, wrap(async (req, res) => {
  const uid = needUser(req);
  const cur = await store.getProfile(uid, String(req.params.id));
  if (!cur) { res.status(404); return { error: '档案不存在' }; }
  const patch = req.body?.profile || {};
  const v = validateProfile({ ...cur.data, ...patch, time: patch.time || cur.data.time }, nowYearOf(req.body));
  if (v.error) { res.status(422); return { error: v.error }; }
  const id = await store.updateProfile(uid, cur.id, birthKey(v.profile), v.profile, v.chart);
  await recordProfileEvent(uid, optCid(req.body?.cid), v.profile, v.chart, `用户修改并确认了生辰信息：${profileLine(v.profile)}`);
  console.log(`[profile] update ${uid} ${id}`);
  return { profile: { ...v.profile, id }, chart: v.chart, intro: readingIntro(v.profile, v.chart) };
}));
// 详批：SSE / ?stream=0 / ?mode=poll
app.post('/api/v1/profiles/:id/reading', smallJson, limited, async (req, res) => {
  const uid = identify(req);
  if (!uid) return res.status(401).json({ error: '未登录或身份已失效' });
  const p = await store.getProfile(uid, String(req.params.id)).catch(() => null);
  if (!p) return res.status(404).json({ error: '档案不存在' });
  const cid = optCid(req.body?.cid);
  const v = validateProfile(p.data, nowYearOf(req.body)); // 按当前年份重新排盘（流年随年份变化）
  if (v.error) return res.status(422).json({ error: v.error });
  const { messages } = sanitize(req.body || {});
  const memory = cid ? await memoryContext(uid, cid).catch(() => '') : '';
  await eventRoute(req, res, `[reading] ${req.ip}`, async (emit) => {
    let text = '', score = null;
    const tap: Emit = (e, d) => { if (e === 'delta') text += d.text; emit(e, d); };
    try { await runReading(v.profile, v.chart, messages, tap, { memory, onScore: (sc) => { score = sc; console.log(`[score] health=${sc.health} verdict=${sc.verdict} flags=${sc.flags.join(',') || '-'} ${sc.dims.map((x) => x.k + x.score).join(' ')}`); } }); }
    catch (e) { console.error(e); emit('error', { error: '大师走神了，请再试一次～' }); emit('done', {}); }
    if (cid && text) recordTurn(uid, cid, { assistant: text, score }).catch((e) => console.error('[memory] record', e.message));
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

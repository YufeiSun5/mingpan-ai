// 本地 / 容器（云托管、函数计算 Web 函数）入口
require('./lib/env');
const express = require('express');
const path = require('path');
const { handleReading, handleChart } = require('./lib/handler');
const { handleChat } = require('./lib/chat');
const { getProvider } = require('./lib/llm');
const rateLimit = require('./lib/ratelimit');
const { securityHeaders } = require('./lib/security');

const app = express();
app.disable('x-powered-by');
// 位于反向代理 / 云网关 / 隧道之后：信任 1 跳代理，限流才能拿到真实客户端 IP，req.secure 才能识别 HTTPS
const tp = process.env.TRUST_PROXY ?? '1';
app.set('trust proxy', /^\d+$/.test(tp) ? +tp : tp === 'false' ? false : tp);
app.use(securityHeaders);
app.use(express.json({ limit: rateLimit.MAX_BODY_BYTES }));
if (process.env.CORS_ORIGIN) app.use((req, res, next) => { // 仅在前后端分离部署时开启跨域（填前端域名）
  res.set('Access-Control-Allow-Origin', process.env.CORS_ORIGIN);
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.get('/favicon.ico', (req, res) => res.type('image/png').sendFile(path.join(__dirname, 'public/assets/icon-32.png'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, file) {
    if (/\.(html|js|css)$/.test(file) && !/[\\/]assets[\\/]/.test(file)) res.set('Cache-Control', 'no-cache');
    else if (/[\\/]assets[\\/]/.test(file)) res.set('Cache-Control', 'public, max-age=604800');
    else res.set('Cache-Control', 'public, max-age=3600');
    if (/\.webmanifest$/.test(file)) res.type('application/manifest+json');
  },
}));

const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req.body)); }
  catch (e) { console.error(e); res.status(e.status || 500).json({ error: e.status ? e.message : '服务器开小差了，请稍后再试' }); }
};
const limited = (req, res, next) => {
  const r = rateLimit.check(req.ip);
  if (r.ok) return next();
  res.set('Retry-After', String(r.retryAfter)).status(429).json({ error: r.reason });
};
app.post('/api/reading', limited, wrap(handleReading));
// 聊天接口：SSE 流式（event: text/delta/bubble/chart/pending/profile/quick/done/error）
app.post('/api/chat', limited, async (req, res) => {
  const t0 = Date.now(), tag = `[chat] ${req.ip} ${req.body?.action || (req.body?.profile ? 'followup' : 'extract')}`;
  // ?stream=0：非流式，一次性返回全部事件（部分 App 内置浏览器对流式 fetch 支持不好时的兜底）
  if (req.query.stream === '0') {
    const events = [];
    try { await handleChat(req.body, (e, d) => events.push([e, d])); }
    catch (e) { console.error(e); events.push(['error', { error: '大师走神了，请再发一次～' }], ['done', {}]); }
    console.log(`${tag} json ${Date.now() - t0}ms events=${events.length}`);
    return res.set('Cache-Control', 'no-store').json({ events });
  }
  res.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(': ok\n\n'); // 立即下发首字节，避免移动网络 / 内置浏览器把"有响应头无数据"的连接当作超时
  let closed = false, n = 0; res.on('close', () => (closed = true));
  const emit = (event, data) => { if (!closed) { n++; res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } };
  const ping = setInterval(() => { if (!closed) res.write(': ping\n\n'); }, 5000);
  try { await handleChat(req.body, emit); }
  catch (e) { console.error(e); emit('error', { error: '大师走神了，请再发一次～' }); emit('done', {}); }
  finally { clearInterval(ping); console.log(`${tag} sse ${Date.now() - t0}ms events=${n}${closed ? ' CLIENT_CLOSED_EARLY' : ''}`); res.end(); }
});
app.post('/api/chart', wrap(handleChart));
app.use((err, req, res, next) => { // 请求体过大 / JSON 格式错误
  if (err.type === 'entity.too.large') return res.status(413).json({ error: '请求内容过长' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: '请求格式错误' });
  next(err);
});
app.get('/api/health', (req, res) => { const p = getProvider(); res.json({ ok: true, provider: p.name, model: p.model, llm: p.available }); });

const port = +(process.env.PORT || process.env.FC_SERVER_PORT || 3000);
app.listen(port, () => { const p = getProvider(); console.log(`八字网页已启动 http://localhost:${port}  LLM=${p.name}/${p.model} ${p.available ? '已配置' : '未配置Key→模板模式'}`); });

// 本地 / 容器（云托管、函数计算 Web 函数）入口
require('./lib/env');
const express = require('express');
const path = require('path');
const { handleReading, handleChart } = require('./lib/handler');
const { handleChat } = require('./lib/chat');
const { getProvider } = require('./lib/llm');
const rateLimit = require('./lib/ratelimit');

const app = express();
// 部署在反向代理/云网关后面时设置 TRUST_PROXY=1，才能拿到真实客户端 IP
if (process.env.TRUST_PROXY) app.set('trust proxy', +process.env.TRUST_PROXY || process.env.TRUST_PROXY);
app.use(express.json({ limit: rateLimit.MAX_BODY_BYTES }));
app.use((req, res, next) => { // 前后端分离部署时允许跨域
  res.set('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

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
  res.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  let closed = false; res.on('close', () => (closed = true));
  const emit = (event, data) => { if (!closed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  const ping = setInterval(() => emit('ping', {}), 15000);
  try { await handleChat(req.body, emit); }
  catch (e) { console.error(e); emit('error', { error: '大师走神了，请再发一次～' }); emit('done', {}); }
  finally { clearInterval(ping); res.end(); }
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

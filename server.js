// 本地 / 容器（云托管、函数计算 Web 函数）入口
require('./lib/env');
const express = require('express');
const path = require('path');
const { handleReading, handleChart } = require('./lib/handler');
const { getProvider } = require('./lib/llm');

const app = express();
app.use(express.json({ limit: '50kb' }));
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
app.post('/api/reading', wrap(handleReading));
app.post('/api/chart', wrap(handleChart));
app.get('/api/health', (req, res) => { const p = getProvider(); res.json({ ok: true, provider: p.name, model: p.model, llm: p.available }); });

const port = +(process.env.PORT || process.env.FC_SERVER_PORT || 3000);
app.listen(port, () => { const p = getProvider(); console.log(`八字网页已启动 http://localhost:${port}  LLM=${p.name}/${p.model} ${p.available ? '已配置' : '未配置Key→模板模式'}`); });

// 阿里云函数计算 FC 3.0「事件函数 + HTTP 触发器」入口，handler: functions/aliyun-fc/index.handler
// （更简单的做法：用「Web 函数」直接运行 `node server.js`，监听 9000 端口，见 README）
const { handleReading, handleChart } = require('../../apps/server/dist/handler');
const rateLimit = require('../../apps/server/dist/ratelimit');
const { handleChat } = require('../../apps/server/dist/chat');
// 云函数不支持 SSE：聊天接口把事件收集成数组一次性返回 { events: [[event, data], ...] }，前端会自动回放
const chatCollect = async (b) => { const events = []; await handleChat(b, (e, d) => e !== 'ping' && events.push([e, d])); return { events }; };
const CORS = { 'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json; charset=utf-8' };
exports.handler = async (event) => {
  const ev = JSON.parse(event.toString());
  const method = ev.requestContext?.http?.method || 'POST';
  if (method === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  try {
    let body = ev.body || '{}';
    if (ev.isBase64Encoded) body = Buffer.from(body, 'base64').toString('utf8');
    if (Buffer.byteLength(String(body)) > rateLimit.MAX_BODY_BYTES) return { statusCode: 413, headers: CORS, body: JSON.stringify({ error: '请求内容过长' }) };
    const PATH = ev.rawPath || '';
    const fn = PATH.endsWith('/chart') ? handleChart : /\/chat$/.test(PATH) ? chatCollect : handleReading;
    if (fn !== handleChart) { const r = rateLimit.check(ev.requestContext?.http?.sourceIp || (ev.headers?.['x-forwarded-for'] || '').split(',')[0].trim()); if (!r.ok) return { statusCode: 429, headers: CORS, body: JSON.stringify({ error: r.reason }) }; }
    return { statusCode: 200, headers: CORS, body: JSON.stringify(await fn(JSON.parse(body))) };
  } catch (e) {
    return { statusCode: e.status || 500, headers: CORS, body: JSON.stringify({ error: e.status ? e.message : '服务器开小差了' }) };
  }
};

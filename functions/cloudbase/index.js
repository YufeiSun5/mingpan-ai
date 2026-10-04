// 腾讯云 CloudBase 云函数入口（通过「HTTP 访问服务」触发）。
// 部署时把整个项目（含 lib/ prompts/ style/ node_modules）作为函数代码上传，入口 functions/cloudbase/index.main
const { handleReading, handleChart } = require('../../lib/handler');
const rateLimit = require('../../lib/ratelimit');
const { handleChat } = require('../../lib/chat');
// 云函数不支持 SSE：聊天接口把事件收集成数组一次性返回 { events: [[event, data], ...] }，前端会自动回放
const chatCollect = async (b) => { const events = []; await handleChat(b, (e, d) => e !== 'ping' && events.push([e, d])); return { events }; };
const CORS = { 'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json; charset=utf-8' };
exports.main = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  try {
    let body = event.body || '{}';
    if (event.isBase64Encoded) body = Buffer.from(body, 'base64').toString('utf8');
    if (Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body)) > rateLimit.MAX_BODY_BYTES) return { statusCode: 413, headers: CORS, body: JSON.stringify({ error: '请求内容过长' }) };
    body = typeof body === 'string' ? JSON.parse(body) : body;
    const PATH = event.path || '';
    const fn = PATH.endsWith('/chart') ? handleChart : /\/chat$/.test(PATH) ? chatCollect : handleReading;
    if (fn !== handleChart) { const r = rateLimit.check((event.headers?.['x-forwarded-for'] || event.requestContext?.sourceIp || '').split(',')[0].trim()); if (!r.ok) return { statusCode: 429, headers: CORS, body: JSON.stringify({ error: r.reason }) }; }
    return { statusCode: 200, headers: CORS, body: JSON.stringify(await fn(body)) };
  } catch (e) {
    return { statusCode: e.status || 500, headers: CORS, body: JSON.stringify({ error: e.status ? e.message : '服务器开小差了' }) };
  }
};

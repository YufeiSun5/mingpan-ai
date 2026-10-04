// 腾讯云 CloudBase 云函数入口（通过「HTTP 访问服务」触发）。
// 部署时把整个项目（含 lib/ prompts/ style/ node_modules）作为函数代码上传，入口 functions/cloudbase/index.main
const { handleReading, handleChart } = require('../../lib/handler');
const CORS = { 'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json; charset=utf-8' };
exports.main = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  try {
    let body = event.body || '{}';
    if (event.isBase64Encoded) body = Buffer.from(body, 'base64').toString('utf8');
    body = typeof body === 'string' ? JSON.parse(body) : body;
    const fn = (event.path || '').endsWith('/chart') ? handleChart : handleReading;
    return { statusCode: 200, headers: CORS, body: JSON.stringify(await fn(body)) };
  } catch (e) {
    return { statusCode: e.status || 500, headers: CORS, body: JSON.stringify({ error: e.status ? e.message : '服务器开小差了' }) };
  }
};

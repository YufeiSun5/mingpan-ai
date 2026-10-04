// 阿里云函数计算 FC 3.0「事件函数 + HTTP 触发器」入口，handler: functions/aliyun-fc/index.handler
// （更简单的做法：用「Web 函数」直接运行 `node server.js`，监听 9000 端口，见 README）
const { handleReading, handleChart } = require('../../lib/handler');
const CORS = { 'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json; charset=utf-8' };
exports.handler = async (event) => {
  const ev = JSON.parse(event.toString());
  const method = ev.requestContext?.http?.method || 'POST';
  if (method === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  try {
    let body = ev.body || '{}';
    if (ev.isBase64Encoded) body = Buffer.from(body, 'base64').toString('utf8');
    const fn = (ev.rawPath || '').endsWith('/chart') ? handleChart : handleReading;
    return { statusCode: 200, headers: CORS, body: JSON.stringify(await fn(JSON.parse(body))) };
  } catch (e) {
    return { statusCode: e.status || 500, headers: CORS, body: JSON.stringify({ error: e.status ? e.message : '服务器开小差了' }) };
  }
};

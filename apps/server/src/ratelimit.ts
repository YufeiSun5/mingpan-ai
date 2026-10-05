// 简单的内存级按 IP 限流（单实例有效；多实例/云函数冷启动会各自计数，足以挡住普通刷接口）。
// RATE_LIMIT_PER_MIN（默认 8）、RATE_LIMIT_PER_DAY（默认 100）、MAX_BODY_BYTES（默认 64KB，含聊天历史）
const perMin = +(process.env.RATE_LIMIT_PER_MIN || 8);
const perDay = +(process.env.RATE_LIMIT_PER_DAY || 100);
const hits = new Map<string, number[]>(); // ip -> [timestamps]
const DAY = 86400000, MIN = 60000;

function check(ip = 'unknown') {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < DAY);
  const lastMin = arr.filter((t) => now - t < MIN).length;
  if (lastMin >= perMin) return { ok: false, retryAfter: Math.ceil((MIN - (now - arr.filter((t) => now - t < MIN)[0])) / 1000), reason: '请求太频繁了，请稍等一分钟再试' };
  if (arr.length >= perDay) return { ok: false, retryAfter: 3600, reason: '今日次数已用完，请明天再来' };
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 10000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > DAY) hits.delete(k);
  return { ok: true };
}
const MAX_BODY_BYTES = +(process.env.MAX_BODY_BYTES || 65536);
export { check, MAX_BODY_BYTES };

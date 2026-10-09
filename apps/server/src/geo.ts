// 请求来源的大致地区（仅服务端内部使用，只用于宜居城市的"就近优先"排序）。
// 原始 IP 不进入提示词、不下发客户端、不写入记忆；对外只返回粗粒度的坐标 / 国家。
import type { Request } from 'express';
import { placeCoord } from '@mingpan/core';

let q: any = null, failed = false;
function query() {
  if (q || failed) return q;
  try { const M = require('ip2region'); const Q = M.default || M; q = new Q(); }
  catch (e: any) { failed = true; console.error('[geo] ip2region unavailable', e.message); }
  return q;
}
const PRIVATE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|fc|fd|fe80:)/i;
/** 客户端 IP：优先 Cloudflare 头，其次 trust proxy 解析后的 req.ip */
export function clientIp(req: Request): string {
  const cf = req.headers['cf-connecting-ip'];
  const ip = (typeof cf === 'string' && cf.trim()) || req.ip || '';
  return ip.replace(/^::ffff:/, '');
}
export interface GeoHint { country: string; lat?: number; lng?: number }
const cache = new Map<string, GeoHint | null>();
export function geoOfReq(req: Request): GeoHint | null {
  const ip = clientIp(req);
  if (!ip || PRIVATE.test(ip)) return null;
  if (cache.has(ip)) return cache.get(ip)!;
  let out: GeoHint | null = null;
  try {
    const r = query()?.search(ip);
    if (r && r.country && r.country !== '0' && r.country !== '保留' && r.country !== '局域网') {
      const country = /香港|澳门|台湾/.test(r.country + r.province) ? '中国' : r.country;
      const c = country === '中国' ? placeCoord(r.city || '') || placeCoord(r.province || '') : null;
      out = c ? { country, lat: c.lat, lng: c.lng } : { country };
    }
  } catch { out = null; }
  if (cache.size > 5000) cache.clear();
  cache.set(ip, out);
  return out;
}

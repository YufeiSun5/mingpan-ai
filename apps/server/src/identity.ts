// 匿名身份：签名 token（HMAC-SHA256）。Web 同时写 httpOnly Cookie；小程序/APP 用 Authorization: Bearer <token>。
import * as crypto from 'crypto';
import type { Request, Response } from 'express';

const SECRET = process.env.SESSION_SECRET || (() => { const s = crypto.randomBytes(32).toString('hex'); console.warn('[identity] 未设置 SESSION_SECRET，使用临时密钥（重启后旧 token 失效）'); return s; })();
const COOKIE = 'mp_token';
const sign = (uid: string) => crypto.createHmac('sha256', SECRET).update(uid).digest('base64url').slice(0, 32);
export const newUid = () => crypto.randomBytes(12).toString('base64url');
export const makeToken = (uid: string) => `${uid}.${sign(uid)}`;
export function verifyToken(t?: string | null): string | null {
  if (!t || typeof t !== 'string' || t.length > 200) return null;
  const i = t.lastIndexOf('.'); if (i <= 0) return null;
  const uid = t.slice(0, i), sig = t.slice(i + 1), exp = sign(uid);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(uid) || sig.length !== exp.length) return null;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp)) ? uid : null;
}
function cookieToken(req: Request) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)mp_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
/** 从 Authorization 头或 Cookie 识别用户 */
export function identify(req: Request): string | null {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return verifyToken(h.slice(7).trim());
  return verifyToken(cookieToken(req));
}
export function setCookie(req: Request, res: Response, token: string) {
  res.append('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${req.secure ? '; Secure' : ''}`);
}
export function clearCookie(req: Request, res: Response) { res.append('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${req.secure ? '; Secure' : ''}`); }
export function isAdmin(req: Request) {
  const want = process.env.ADMIN_TOKEN, h = req.headers.authorization || '';
  if (!want || want.length < 16 || !h.startsWith('Bearer ')) return false;
  const got = Buffer.from(h.slice(7).trim()), exp = Buffer.from(want);
  return got.length === exp.length && crypto.timingSafeEqual(got, exp);
}

// API 客户端：传输层可插拔（Web 用 fetch 流；小程序用 wx.request + enableChunked 或非流式）
import type { Chart, ChatEvent, ChatRequest, Profile } from './types';
import { SSEParser } from './sse';

export interface TransportRequest { url: string; method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; headers: Record<string, string>; body?: string }
export interface Transport {
  /** 流式：逐块回调文本；不支持流式的环境可以一次性回调全部文本 */
  stream?(req: TransportRequest, onChunk: (text: string) => void): Promise<{ status: number; contentType: string; text?: string }>;
  /** 普通请求 */
  request(req: TransportRequest): Promise<{ status: number; contentType: string; text: string }>;
}
export class ApiError extends Error { constructor(message: string, public status = 0, public server = false) { super(message); } }

export interface ClientOptions { base?: string; transport: Transport; getToken?: () => string | null; setToken?: (t: string) => void }

export function createClient(opts: ClientOptions) {
  const base = (opts.base || '').replace(/\/$/, '');
  const headers = (): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const t = opts.getToken?.(); if (t) h.Authorization = `Bearer ${t}`;
    return h;
  };
  const json = async <T>(method: TransportRequest['method'], path: string, body?: unknown): Promise<T> => {
    const r = await opts.transport.request({ url: base + path, method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) });
    let j: any = {}; try { j = JSON.parse(r.text || '{}'); } catch { /* */ }
    if (r.status >= 400) throw new ApiError(j.error || '请求失败', r.status, !!j.error);
    return j as T;
  };

  type Mode = 'auto' | 'stream' | 'json' | 'poll';
  /**
   * 事件流通用请求。mode: 'stream'（SSE）| 'json'（一次性返回全部事件）| 'poll'（轮询，小程序不支持流式时）。
   * auto：先流式；未收到任何事件就失败时，自动用 json 模式重试一次。
   */
  async function events(path: string, body: unknown, onEvent: (e: ChatEvent) => void, mode: Mode = 'auto') {
    let got = 0, finished = false;
    const handle = (e: ChatEvent) => { if (e[0] === 'done') finished = true; else if (e[0] !== 'ping') got++; onEvent(e); };
    const q = (k: string) => path + (path.includes('?') ? '&' : '?') + k;
    const viaJson = async () => { (await json<{ events: ChatEvent[] }>('POST', q('stream=0'), body)).events.forEach(handle); };
    const viaPoll = async () => {
      const { jobId } = await json<{ jobId: string }>('POST', q('mode=poll'), body);
      let after = 0;
      for (let i = 0; i < 400; i++) {
        const r = await json<{ events: ChatEvent[]; next: number; done: boolean }>('GET', `/api/v1/jobs/${jobId}?after=${after}`);
        r.events.forEach(handle); after = r.next;
        if (r.done) return;
        await new Promise((ok) => setTimeout(ok, 700));
      }
    };
    const viaStream = async () => {
      if (!opts.transport.stream) return viaJson();
      const p = new SSEParser(handle);
      const r = await opts.transport.stream({ url: base + path, method: 'POST', headers: { ...headers(), Accept: 'text/event-stream' }, body: JSON.stringify(body) }, (t) => p.push(t));
      if (r.status >= 400 && !r.contentType.includes('event-stream')) {
        let j: any = {}; try { j = JSON.parse(r.text || '{}'); } catch { /* */ }
        throw new ApiError(j.error || '请求失败', r.status, !!j.error);
      }
      if (r.contentType.includes('application/json') && r.text) { JSON.parse(r.text).events.forEach(handle); return; }
      p.end();
    };
    if (mode === 'json') await viaJson();
    else if (mode === 'poll') await viaPoll();
    else {
      try { await viaStream(); if (!finished) throw new ApiError('incomplete'); }
      catch (e) {
        if ((e as ApiError).server || mode === 'stream' || got > 0) throw e;
        await new Promise((ok) => setTimeout(ok, 600));
        await viaJson();
      }
    }
    if (!finished) throw new ApiError('incomplete');
  }
  const chat = (req: ChatRequest, onEvent: (e: ChatEvent) => void, mode: Mode = 'auto') => events('/api/v1/chat', req, onEvent, mode);
  type ProfileResult = { profile: Profile & { id: string }; chart: Chart; intro: string };

  return {
    chat,
    session: () => json<{ token: string; uid: string }>('POST', '/api/v1/session'),
    me: () => json<any>('GET', '/api/v1/me'),
    exportMe: () => json<any>('GET', '/api/v1/me/export'),
    deleteMe: () => json<{ ok: boolean }>('DELETE', '/api/v1/me'),
    migrate: (data: unknown) => json<{ ok: boolean; imported: number }>('POST', '/api/v1/me/migrate', data),
    events,
    /** 新建对话（"新排盘"） */
    newConversation: () => json<{ cid: string }>('POST', '/api/v1/conversations'),
    /** 确认生辰：校验 → 排盘 → 存档，返回规范化生辰 + 命盘 */
    createProfile: (profile: Profile, cid?: string, nowYear?: number) => json<ProfileResult>('POST', '/api/v1/profiles', { profile, cid, nowYear }),
    /** 修改生辰（PATCH），返回新的命盘 */
    updateProfile: (id: string, profile: Partial<Profile>, cid?: string, nowYear?: number) => json<ProfileResult>('PATCH', `/api/v1/profiles/${encodeURIComponent(id)}`, { profile, cid, nowYear }),
    listProfiles: () => json<{ profiles: { id: string; data: Profile; updatedAt: string }[] }>('GET', '/api/v1/profiles'),
    /** 详批（流式 / json / poll） */
    reading: (id: string, body: { cid?: string; nowYear?: number; messages?: ChatRequest['messages'] }, onEvent: (e: ChatEvent) => void, mode: Mode = 'auto') =>
      events(`/api/v1/profiles/${encodeURIComponent(id)}/reading`, body, onEvent, mode),
  };
}
export type ApiClient = ReturnType<typeof createClient>;

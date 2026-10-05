// API 客户端：传输层可插拔（Web 用 fetch 流；小程序用 wx.request + enableChunked 或非流式）
import type { Chart, ChatEvent, ChatRequest, Profile, ProfileSummary } from './types';
import type { ProfileResult } from './chatState';
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
    /** 命主列表（含称呼、简要八字、所属对话 cid） */
    listProfiles: () => json<{ profiles: ProfileSummary[] }>('GET', '/api/v1/profiles'),
    /** 命主详情：生辰、按当前年份重排的命盘、历史版本 */
    getProfile: (id: string, nowYear?: number) => json<ProfileSummary & { profile: Profile; chart: Chart; versions: { version: number; data: Profile; bazi: string; createdAt: string }[] }>('GET', `/api/v1/profiles/${encodeURIComponent(id)}${nowYear ? `?nowYear=${nowYear}` : ''}`),
    /** 改称呼 / 名字（不重排） */
    renameProfile: (id: string, label: string, name?: string) => json<ProfileSummary>('PATCH', `/api/v1/profiles/${encodeURIComponent(id)}`, { label, name }),
    /** 删除命主（连同其对话与记忆） */
    deleteProfile: (id: string) => json<{ ok: boolean }>('DELETE', `/api/v1/profiles/${encodeURIComponent(id)}`),
    /** 生辰历史版本（更正前的旧盘） */
    versions: (id: string) => json<{ versions: { version: number; data: Profile; bazi: string; createdAt: string }[] }>('GET', `/api/v1/profiles/${encodeURIComponent(id)}/versions`),
    /** 对话原文（重建聊天记录用） */
    messages: (cid: string) => json<{ cid: string; profileId: string | null; messages: { role: string; content: string; createdAt: string }[] }>('GET', `/api/v1/conversations/${encodeURIComponent(cid)}/messages`),
    /** 详批（流式 / json / poll）；recast＝更正生辰后的重新解读 */
    reading: (id: string, body: { cid?: string; nowYear?: number; messages?: ChatRequest['messages']; recast?: boolean }, onEvent: (e: ChatEvent) => void, mode: Mode = 'auto') =>
      events(`/api/v1/profiles/${encodeURIComponent(id)}/reading`, body, onEvent, mode),
    /** 合盘（两位已有命主），事件同 chat */
    compat: (body: { a: string; b: string; question?: string; cid?: string; nowYear?: number }, onEvent: (e: ChatEvent) => void, mode: Mode = 'auto') => events('/api/v1/compat', body, onEvent, mode),
  };
}
export type ApiClient = ReturnType<typeof createClient>;

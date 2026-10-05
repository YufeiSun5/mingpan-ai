// 浏览器传输层：fetch + ReadableStream；不支持流读取的内置浏览器退化为一次性读取
import type { Transport } from '@mingpan/core';
export const webTransport: Transport = {
  async request(req) {
    const r = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, cache: 'no-store', credentials: 'same-origin' });
    return { status: r.status, contentType: r.headers.get('content-type') || '', text: await r.text() };
  },
  async stream(req, onChunk) {
    const r = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, cache: 'no-store', credentials: 'same-origin' });
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('event-stream')) return { status: r.status, contentType: ct, text: await r.text() };
    if (!r.body || !r.body.getReader) { onChunk(await r.text()); return { status: r.status, contentType: ct }; }
    const reader = r.body.getReader(), dec = new TextDecoder();
    for (;;) { const { value, done } = await reader.read(); if (done) break; onChunk(dec.decode(value, { stream: true })); }
    const tail = dec.decode(); if (tail) onChunk(tail);
    return { status: r.status, contentType: ct };
  },
};

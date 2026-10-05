// 增量 SSE 解析（与平台无关：浏览器 fetch 流、小程序 enableChunked 分块都可用）
import type { ChatEvent } from './types';
export class SSEParser {
  private buf = '';
  constructor(private onEvent: (e: ChatEvent) => void) {}
  push(chunk: string) { this.buf += chunk; this.drain(false); }
  end() { this.drain(true); }
  private drain(flush: boolean) {
    for (;;) {
      let i = this.buf.indexOf('\n\n');
      if (i < 0) { if (!flush || !this.buf.trim()) return; i = this.buf.length; }
      const block = this.buf.slice(0, i); this.buf = this.buf.slice(i + 2);
      const ev = (block.match(/^event: (.*)$/m) || [])[1], data = (block.match(/^data: (.*)$/m) || [])[1];
      if (!ev || !data) continue;
      try { this.onEvent([ev, JSON.parse(data)] as ChatEvent); } catch { /* 忽略坏块 */ }
    }
  }
}

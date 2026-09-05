import { treaty } from '@elysiajs/eden';
import type { App } from '@formatavern/backend'; // type-only — never a value import
import type { StreamEvent } from '@formatavern/shared';

export const api = treaty<App>(window.location.origin); // relative origin per ADR-004; SPA-only so window exists

export interface StreamCallbacks {
  onEvent(e: StreamEvent): void;
  onChunk?(bytes: number, deltaMs: number): void; // raw arrival telemetry (buffering detector)
}

export async function readTestStream(
  cb: StreamCallbacks,
  opts?: { script?: string; signal?: AbortSignal }
) {
  const url = '/api/chat/test-stream' + (opts?.script ? `?script=${encodeURIComponent(opts.script)}` : '');
  const res = await fetch(url, { method: 'POST', signal: opts?.signal });
  if (!res.ok || !res.body) throw new Error(`stream failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  let last = performance.now();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const now = performance.now();
    cb.onChunk?.(value.byteLength, Math.round(now - last));
    last = now;

    buf += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf('\n\n')) !== -1) {
      const frameText = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const data = frameText.split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (data) cb.onEvent(JSON.parse(data) as StreamEvent);
    }
  }
  buf += decoder.decode(); // flush
}

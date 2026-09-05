import { treaty } from '@elysiajs/eden';
import type { App } from '@formatavern/backend'; // type-only — never a value import
import type { ChatStreamEvent, StreamEvent } from '@formatavern/shared';

export const api = treaty<App>(typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:3000');

export interface StreamCallbacks {
  onEvent(e: StreamEvent): void;
  onChunk?(bytes: number, deltaMs: number): void;
}

export async function readSse<T = ChatStreamEvent>(
  url: string,
  init: RequestInit | undefined,
  cb: (event: T) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(url, { ...init, signal });
  if (!res.ok) {
    let errorDetail: any = null;
    try {
      errorDetail = await res.json();
    } catch {
      // ignore
    }
    const err = new Error(errorDetail?.error?.message ?? `SSE request failed with status ${res.status}`);
    (err as any).status = res.status;
    (err as any).details = errorDetail;
    throw err;
  }
  if (!res.body) {
    throw new Error('SSE response body is null');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buf.indexOf('\n\n')) !== -1) {
        const frameText = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const data = frameText
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
          .join('\n');
        if (data) {
          cb(JSON.parse(data) as T);
        }
      }
    }
    buf += decoder.decode();
    if (buf.trim().length > 0) {
      const data = buf
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (data) {
        cb(JSON.parse(data) as T);
      }
    }
  } finally {
    reader.releaseLock();
  }
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

  try {
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
        const data = frameText
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
          .join('\n');
        if (data) cb.onEvent(JSON.parse(data) as StreamEvent);
      }
    }
    buf += decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

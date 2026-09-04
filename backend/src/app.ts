import { Elysia } from 'elysia';
import {
  SHARED_VERSION,
  TEST_STREAM_WORDS,
  TEST_STREAM_INTERVAL_MS,
  type HealthResponse,
  type StreamEvent
} from '@formatavern/shared';
import type { AppDeps } from './db/contracts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)); // no Bun.sleep here (purity rule)

export function createApp({ repos }: AppDeps) {
  return new Elysia({ prefix: '/api' })
    .get('/health', (): HealthResponse => ({
      ok: true,
      service: 'formatavern-backend',
      sharedVersion: SHARED_VERSION,
      timestamp: Date.now(),
      db: {
        schemaVersion: repos.schemaVersion(),
        characters: repos.characters.count(),
        personas: repos.personas.count()
      }
    }))
    .post('/chat/test-stream', ({ request }) => {
      const encoder = new TextEncoder();
      let cancelled = false;
      const frame = (e: StreamEvent) => encoder.encode(`data: ${JSON.stringify(e)}\n\n`);

      const onAbort = () => {
        if (!cancelled) {
          cancelled = true;
          console.log('[test-stream] client disconnected');
        }
      };
      request.signal.addEventListener('abort', onAbort);

      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            for (let i = 0; i < TEST_STREAM_WORDS.length; i++) {
              if (cancelled || request.signal.aborted) return;
              controller.enqueue(frame({ type: 'token', text: (i === 0 ? '' : ' ') + TEST_STREAM_WORDS[i] }));
              if (i < TEST_STREAM_WORDS.length - 1) await sleep(TEST_STREAM_INTERVAL_MS);
            }
            if (!cancelled && !request.signal.aborted) {
              controller.enqueue(frame({ type: 'done', finishReason: 'stop' }));
              controller.close();
            }
          } finally {
            request.signal.removeEventListener('abort', onAbort);
          }
        },
        cancel() {
          if (!cancelled) {
            cancelled = true;
            console.log('[test-stream] client disconnected');
          }
        }
      });

      return new Response(body, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        }
      });
    });
}

export type App = ReturnType<typeof createApp>;

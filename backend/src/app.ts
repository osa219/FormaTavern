import { Elysia } from 'elysia';
import {
  SHARED_VERSION,
  ENVELOPE_SCRIPT_IDS,
  type HealthResponse,
  type StreamEvent
} from '@formatavern/shared';
import type { AppDeps } from './db/contracts';

export function createApp({ repos, providers }: AppDeps) {
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
    .post('/chat/test-stream', ({ query, request, set }) => {
      const script = (query?.script as string | undefined) ?? 'envelope-directive';
      if (!ENVELOPE_SCRIPT_IDS.includes(script as any)) {
        set.status = 400;
        return {
          error: `Invalid script "${script}". Valid scripts: ${ENVELOPE_SCRIPT_IDS.join(', ')}`
        };
      }

      const encoder = new TextEncoder();
      const frame = (e: StreamEvent) => encoder.encode(`data: ${JSON.stringify(e)}\n\n`);

      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            const stream = providers.mock.generate(
              {
                model: `mock:${script}`,
                history: [{ role: 'user', content: 'begin' }]
              },
              request.signal
            );

            for await (const ev of stream) {
              controller.enqueue(frame(ev));
            }
          } catch {
            // iterator never throws out per P3
          } finally {
            controller.close();
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

import { Elysia } from 'elysia';
import {
  SHARED_VERSION,
  ENVELOPE_SCRIPT_IDS,
  type HealthResponse,
  type StreamEvent
} from '@formatavern/shared';
import type { Repositories } from './db/contracts';
import type { GenerationHub, ProviderRegistry } from './engine/contracts';
import { ApiError } from './engine/errors';
import { createCharactersRouter } from './routes/characters';
import { createPersonasRouter } from './routes/personas';
import { createSettingsRouter } from './routes/settings';
import { createChatsRouter } from './routes/chats';
import { createMessagesRouter } from './routes/messages';

export interface AppDeps {
  repos: Repositories;
  hub: GenerationHub;
  providers: ProviderRegistry;
  options?: {
    nodeEnv?: string;
  };
}

export function createApp({ repos, hub, providers, options }: AppDeps) {
  const charactersRouter = createCharactersRouter(repos);
  const personasRouter = createPersonasRouter(repos);
  const settingsRouter = createSettingsRouter(repos);
  const chatsRouter = createChatsRouter({ repos, hub, providers });
  const messagesRouter = createMessagesRouter({ repos, hub, providers });

  return new Elysia({ prefix: '/api' })
    .onError(({ code, error, set, path }) => {
      if (error instanceof ApiError) {
        set.status = error.status;
        return {
          error: {
            code: error.code,
            message: error.message,
            details: error.details
          }
        };
      }

      if (code === 'VALIDATION') {
        set.status = 422;
        return {
          error: {
            code: 'validation_failed',
            message: error.message,
            details: (error as any).all ?? error.message
          }
        };
      }

      if (code === 'NOT_FOUND') {
        if (path.startsWith('/api')) {
          set.status = 404;
          return {
            error: {
              code: 'not_found',
              message: 'Resource not found'
            }
          };
        }
        return;
      }

      console.error('[server error]:', error);
      set.status = 500;
      return {
        error: {
          code: 'internal',
          message: 'Internal server error'
        }
      };
    })
    .get('/health', () => ({
      ok: true,
      service: 'formatavern-backend',
      sharedVersion: SHARED_VERSION,
      timestamp: Date.now(),
      db: {
        schemaVersion: repos.schemaVersion(),
        characters: repos.characters.count(),
        personas: repos.personas.count()
      },
      activeGenerations: hub.activeCount ? hub.activeCount() : 0
    }))
    .post('/chat/test-stream', ({ query, request, set }) => {
      const isProduction =
        options?.nodeEnv === 'production' || process.env.NODE_ENV === 'production';
      if (isProduction) {
        set.status = 404;
        return {
          error: {
            code: 'not_found',
            message: 'Resource not found'
          }
        };
      }

      const script = (query?.script as string | undefined) ?? 'envelope-directive';
      if (!ENVELOPE_SCRIPT_IDS.includes(script as any)) {
        set.status = 400;
        return {
          error: {
            code: 'validation_failed',
            message: `Invalid script "${script}". Valid scripts: ${ENVELOPE_SCRIPT_IDS.join(', ')}`
          }
        };
      }

      const resolution = providers.resolve({ provider: { id: 'mock' } });
      const encoder = new TextEncoder();
      const frame = (e: StreamEvent) => encoder.encode(`data: ${JSON.stringify(e)}\n\n`);

      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            const stream = resolution.provider.generate(
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
            // iterator never throws out
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
    })
    .use(charactersRouter)
    .use(personasRouter)
    .use(settingsRouter)
    .use(chatsRouter)
    .use(messagesRouter);
}

export type App = ReturnType<typeof createApp>;

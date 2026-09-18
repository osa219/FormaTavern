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
import { createCharactersRouter, createTagsRouter } from './routes/characters';
import { createPersonasRouter } from './routes/personas';
import { createSettingsRouter } from './routes/settings';
import { createProviderConfigsRouter } from './routes/providerConfigs';
import { createChatsRouter } from './routes/chats';
import { createMessagesRouter } from './routes/messages';
import { createAssetsRouter } from './routes/assets';
import { createAuthRouter, isPublicAuthPath, InboundAuditor, type AuthDeps } from './routes/auth';
import { effectiveClientIp, isLoopbackIp } from './routes/ip';
import type { AssetStore } from './assets/contracts';

export interface AppDeps {
  repos: Repositories;
  hub: GenerationHub;
  providers: ProviderRegistry;
  assets?: AssetStore;
  options?: {
    nodeEnv?: string;
    auth?: {
      enabled: boolean;
      verifyPin?: (candidate: string) => boolean;
      signToken?: () => string;
      verifyToken?: (token: string) => boolean;
      trustedProxies?: string[];
      rateLimitWindowMs?: number;
      rateLimitMaxFails?: number;
    };
    resolveIp?: (req: Request) => string | null;
    auditor?: InboundAuditor;
  };
}

export function createApp({ repos, hub, providers, assets, options }: AppDeps) {
  const charactersRouter = createCharactersRouter({ repos, assets, providers });
  const tagsRouter = createTagsRouter(repos);
  const personasRouter = createPersonasRouter(repos);
  const settingsRouter = createSettingsRouter(repos);
  const providerConfigsRouter = createProviderConfigsRouter({ repos, providers });
  const chatsRouter = createChatsRouter({ repos, hub, providers });
  const messagesRouter = createMessagesRouter({ repos, hub, providers });
  const assetsRouter = createAssetsRouter(assets);

  const authDeps: AuthDeps = {
    enabled: options?.auth?.enabled ?? false,
    verifyPin: options?.auth?.verifyPin,
    signToken: options?.auth?.signToken,
    verifyToken: options?.auth?.verifyToken,
    resolveIp: options?.resolveIp,
    trustedProxies: options?.auth?.trustedProxies,
    rateLimitWindowMs: options?.auth?.rateLimitWindowMs,
    rateLimitMaxFails: options?.auth?.rateLimitMaxFails
  };
  const authRouter = createAuthRouter(authDeps);
  const auditor = options?.auditor ?? new InboundAuditor();

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
    .onRequest(({ request }) => {
      const url = new URL(request.url);
      const path = url.pathname;

      // Effective client IP resolution respecting trustedProxies (Invariant N5)
      const remote = options?.resolveIp ? options.resolveIp(request) : null;
      const xff = request.headers.get('x-forwarded-for');
      const clientIp = effectiveClientIp(
        remote,
        xff,
        options?.auth?.trustedProxies ?? ['127.0.0.1', '::1']
      );
      const rawUa = request.headers.get('user-agent');

      const isLoopback = isLoopbackIp(clientIp);

      // Public auth endpoints are always accessible without tokens
      if (isPublicAuthPath(path)) {
        if (!isLoopback) auditor.audit(clientIp, request.method, path, rawUa);
        return;
      }

      // Loopback traffic and disabled-auth installations bypass authentication
      const authEnabled = options?.auth?.enabled ?? false;
      if (!authEnabled || isLoopback) {
        if (!isLoopback) auditor.audit(clientIp, request.method, path, rawUa);
        return;
      }

      // Valid Bearer tokens grant access to protected routes
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ') && options?.auth?.verifyToken) {
        const token = authHeader.slice(7).trim();
        if (options.auth.verifyToken(token)) {
          if (!isLoopback) auditor.audit(clientIp, request.method, path, rawUa);
          return;
        }
      }

      // Blocked unauthenticated request: fire audit after 401 verdict.
      // Loopback traffic stays silent by construction since it bypassed above.
      auditor.auditBlocked(clientIp, request.method, path, rawUa);

      return Response.json(
        {
          error: {
            code: 'auth_required',
            message: 'Authentication required'
          }
        },
        { status: 401 }
      );
    })
    .use(authRouter)
    .get('/health', ({ request }): HealthResponse | { ok: true } => {
      const authEnabled = options?.auth?.enabled ?? false;
      const remote = options?.resolveIp ? options.resolveIp(request) : null;
      const xff = request.headers.get('x-forwarded-for');
      const clientIp = effectiveClientIp(
        remote,
        xff,
        options?.auth?.trustedProxies ?? ['127.0.0.1', '::1']
      );

      const isAuthed = !authEnabled || isLoopbackIp(clientIp) || (() => {
        const authHeader = request.headers.get('authorization');
        if (authHeader?.startsWith('Bearer ') && options?.auth?.verifyToken) {
          return options.auth.verifyToken(authHeader.slice(7).trim());
        }
        return false;
      })();

      if (!isAuthed) {
        return { ok: true };
      }

      return {
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
      };
    })
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
    .use(tagsRouter)
    .use(personasRouter)
    .use(settingsRouter)
    .use(providerConfigsRouter)
    .use(chatsRouter)
    .use(messagesRouter)
    .use(assetsRouter);
}

export type App = ReturnType<typeof createApp>;

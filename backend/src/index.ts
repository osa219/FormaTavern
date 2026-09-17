import { Elysia } from 'elysia';
import { existsSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { staticPlugin } from '@elysiajs/static';
import { createApp } from './app';
import { DB_PATH, ASSETS_DIR, ensureDataDirs } from './db/paths';
import { openDatabase } from './db/connection';
import { runMigrations } from './db/migrate';
import { createRepositories } from './db/repositories';
import { seed } from './db/seeds/seed';
import { seedProviderConfigs } from './db/seeds/providerConfigs';
import { recoverStaleGenerations } from './engine/recovery';
import { GenerationHubImpl } from './engine/hub';
import { ProviderRegistryImpl } from './engine/providers';
import { FsAssetStore } from './assets/store';

const HOST = process.env.FORMATAVERN_HOST ?? '127.0.0.1';
const PORT = Number(process.env.FORMATAVERN_PORT ?? 3000);
const PROD = process.env.NODE_ENV === 'production';
const LOG_SILENT = process.env.FORMATAVERN_LOG === 'silent';
const DEV_LOG = !PROD && !LOG_SILENT;
const BUILD_DIR = resolve(import.meta.dir, '../../frontend/build');

if (HOST === '0.0.0.0') {
  console.warn(`[SECURITY WARNING] Server is bound to 0.0.0.0 without in-app authentication.
Any device on your local network can access chats and API keys.
Use Tailscale or Cloudflare Tunnel for secure remote access.`);
}

// 1. Ensure directory structures
ensureDataDirs();

// 2. Open SQLite database & apply pragmas
const db = openDatabase(DB_PATH);

// 3. Run migrations
const { from, to } = runMigrations(db);

// 4. Repositories & boot recovery
const repos = createRepositories(db);
const recoveryResult = recoverStaleGenerations(repos);

// 5. Seed if empty
const seedResult = seed(repos);
const pcSeed = seedProviderConfigs(repos);

const dbFileName = basename(DB_PATH);
let dbLog = `[db] ${dbFileName}  migrations: ${from} → ${to}`;
if (seedResult.seeded) {
  dbLog += `  seeded: ${seedResult.characters} characters, ${seedResult.personas} persona`;
}
if (pcSeed.seeded) {
  dbLog += `  provider configs: ${pcSeed.configs} seeded from legacy settings`;
}
dbLog += `  recovered ${recoveryResult.recoveredCount} stale generations`;
if (!LOG_SILENT) {
  console.log(dbLog);
}

// 6. Hub & Providers
const hub = new GenerationHubImpl();

// Known secrets for S8 redaction of generation error messages. Populated
// after settings/providerConfigs load below; emit runs at request time,
// so late population is safe.
const knownSecrets: string[] = [];
const redactSecrets = (msg: string): string => {
  let out = msg;
  for (const s of knownSecrets) {
    if (s && s.length >= 4) {
      out = out.split(s).join('[redacted]');
    }
  }
  return out;
};

if (DEV_LOG) {
  const origRegister = hub.register.bind(hub);
  hub.register = (input) => {
    const started = performance.now();
    const shortChat = input.chatId.length > 8 ? input.chatId.slice(-8) : input.chatId;
    let completionTokens = 0;

    const reg = origRegister(input);
    console.log(`  \x1b[35m[generation]\x1b[0m Chat ..${shortChat} → registered`);

    const origEmit = reg.emit;
    reg.emit = (ev) => {
      if (ev.type === 'usage') {
        completionTokens = ev.completionTokens;
      } else if (ev.type === 'done') {
        const elapsed = ((performance.now() - started) / 1000).toFixed(2);
        const tokensInfo = completionTokens > 0 ? ` (${completionTokens} tokens)` : '';
        console.log(`  \x1b[35m[generation]\x1b[0m Chat ..${shortChat} → \x1b[32mcompleted\x1b[0m in ${elapsed}s${tokensInfo}`);
      } else if (ev.type === 'error') {
        const elapsed = ((performance.now() - started) / 1000).toFixed(2);
        console.log(`  \x1b[35m[generation]\x1b[0m Chat ..${shortChat} → \x1b[31merror\x1b[0m in ${elapsed}s: ${redactSecrets(ev.error.message)}`);
      }
      origEmit(ev);
    };
    return reg;
  };

  const origAbort = hub.abort.bind(hub);
  hub.abort = (messageId, reason) => {
    const res = origAbort(messageId, reason);
    if (res) {
      const shortMsg = messageId.length > 8 ? messageId.slice(-8) : messageId;
      console.log(`  \x1b[33m[generation]\x1b[0m Message ..${shortMsg} → aborted (${reason})`);
    }
    return res;
  };
}

const providers = new ProviderRegistryImpl();

const settings = repos.settings.getAll();
const configs = repos.providerConfigs.list();

const hasOpenRouterKey = Boolean(
  configs.some((c) => c.providerType === 'openrouter' && (c.apiKey?.trim().length ?? 0) > 0) ||
    (settings.openrouter?.apiKey && settings.openrouter.apiKey.trim().length > 0) ||
    process.env.OPENROUTER_API_KEY
);
const hasCustom = Boolean(
  configs.some((c) => c.providerType === 'custom' && (c.baseUrl?.trim().length ?? 0) > 0) ||
    (settings.custom?.baseUrl && settings.custom.baseUrl.trim().length > 0)
);
const hasGeminiKey = Boolean(
  configs.some(
    (c) =>
      (c.providerType === 'gemini' || c.providerType === 'gemini-interactions') &&
      (c.apiKey?.trim().length ?? 0) > 0
  ) ||
    (settings.gemini?.apiKey && settings.gemini.apiKey.trim().length > 0) ||
    process.env.GEMINI_API_KEY
);

const activeConfigId = settings.provider?.activeConfigId;
const activeConfig = activeConfigId ? repos.providerConfigs.get(activeConfigId) : null;
const activeLabel = activeConfig
  ? `active: "${activeConfig.name}" (${activeConfig.providerType}/${activeConfig.model ?? 'default'})`
  : `active: ${settings.provider?.id ?? 'mock'}`;

for (const s of [
  ...configs.map((c) => c.apiKey),
  settings.openrouter?.apiKey,
  settings.custom?.apiKey,
  settings.gemini?.apiKey,
  process.env.OPENROUTER_API_KEY,
  process.env.GEMINI_API_KEY
]) {
  if (typeof s === 'string' && s.length >= 4) {
    knownSecrets.push(s);
    const trimmed = s.trim();
    if (trimmed.length >= 4 && trimmed !== s) {
      knownSecrets.push(trimmed);
    }
  }
}

if (!LOG_SILENT) {
  console.log(
    `[providers] ${activeLabel} | openrouter ${hasOpenRouterKey ? 'ready' : 'disabled (no key)'}, custom ${hasCustom ? 'ready' : 'disabled (no base URL)'}, gemini ${hasGeminiKey ? 'ready' : 'disabled (no key)'}`
  );
}

// 7. Graceful shutdown
const shutdown = async () => {
  try {
    await hub.abortAll('shutdown');
  } catch {}
  try {
    db.close();
  } catch {}
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// 8. Assemble Elysia app
const assets = new FsAssetStore(ASSETS_DIR);
const app = createApp({
  repos,
  hub,
  providers,
  assets,
  options: {
    nodeEnv: process.env.NODE_ENV
  }
});

if (PROD && !existsSync(BUILD_DIR)) {
  throw new Error(`Production build missing: ${BUILD_DIR}. Run 'bun run build'.`);
}

const requestStartTimes = new WeakMap<Request, number>();

const parseStatusCode = (status: unknown): number => {
  if (typeof status === 'number') return status;
  if (typeof status === 'string') {
    const parsed = parseInt(status, 10);
    if (!isNaN(parsed)) return parsed;
    const statusMap: Record<string, number> = {
      OK: 200,
      Created: 201,
      'No Content': 204,
      'Bad Request': 400,
      Unauthorized: 401,
      Forbidden: 403,
      'Not Found': 404,
      Conflict: 409,
      'Internal Server Error': 500
    };
    return statusMap[status] ?? 200;
  }
  return 200;
};

const statusColor = (status: number) => {
  if (status >= 500) return `\x1b[31m${status}\x1b[0m`;
  if (status >= 400) return `\x1b[33m${status}\x1b[0m`;
  if (status >= 300) return `\x1b[36m${status}\x1b[0m`;
  return `\x1b[32m${status}\x1b[0m`;
};

const server = new Elysia();

if (DEV_LOG) {
  server
    .onRequest(({ request }) => {
      requestStartTimes.set(request, performance.now());
    })
    .onAfterResponse(({ request, set, responseValue }) => {
      try {
        const url = new URL(request.url);
        // Suppress asset polling, icons, and health check pings
        if (
          url.pathname.startsWith('/assets') ||
          url.pathname === '/favicon.ico' ||
          url.pathname === '/api/health'
        ) {
          return;
        }

        const startTime = requestStartTimes.get(request);
        requestStartTimes.delete(request);
        const duration = startTime ? (performance.now() - startTime).toFixed(1) : '?';

        const rawStatus = (responseValue as Response | undefined)?.status ?? set.status ?? 200;
        const statusCode = parseStatusCode(rawStatus);
        const method = request.method.padEnd(6);

        console.log(`  \x1b[2m[api]\x1b[0m ${method} ${url.pathname} ${statusColor(statusCode)} \x1b[2m(${duration}ms)\x1b[0m`);
      } catch {
        // Defensive: malformed URLs or unexpected exceptions do not disrupt server
      }
    });
}

if (!PROD) {
  // Dev-only redirect: visiting port 3000 root in a browser opens the Vite dev server
  server.get('/', ({ redirect }) => redirect('http://127.0.0.1:5173/'));
}

server
  .use(app)
  .use(
    staticPlugin({
      assets: ASSETS_DIR,
      prefix: '/assets',
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff'
      }
    })
  )
  .all('*', ({ request, set }) => {
    const url = new URL(request.url);

    // API and asset requests that were not matched must 404 with JSON, never HTML
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/assets/')) {
      set.status = 404;
      return { error: 'Not Found' };
    }

    if (!PROD) {
      set.status = 404;
      return { error: 'Not Found' };
    }

    const relPath = url.pathname.slice(1);
    const filePath = resolve(BUILD_DIR, relPath);

    // Traversal guard: prevent directory traversal outside BUILD_DIR
    if (!filePath.startsWith(BUILD_DIR)) {
      set.status = 403;
      return 'Forbidden';
    }

    if (relPath && existsSync(filePath) && !statSync(filePath).isDirectory()) {
      return Bun.file(filePath);
    }

    return new Response(Bun.file(join(BUILD_DIR, 'index.html')), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  });

server.listen({ hostname: HOST, port: PORT });

if (DEV_LOG) {
  const displayHost = HOST === '0.0.0.0' ? '127.0.0.1' : HOST;
  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
  const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
  const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

  console.log(`
  ${bold('FormaTavern')} ${dim('— LLM Roleplay Studio')}
  ${dim('──────────────────────────────────────────────')}
  ➜ ${bold('Web UI:')}   ${cyan('http://127.0.0.1:5173/')}  ${dim('(Vite dev server)')}
  ➜ ${bold('API:')}      ${green(`http://${displayHost}:${PORT}/`)}    ${dim(`(Elysia backend${HOST === '0.0.0.0' ? ' [0.0.0.0]' : ''})`)}
  ${dim('──────────────────────────────────────────────')}
`);
} else if (!LOG_SILENT) {
  console.log(`[formatavern] prod backend → http://${HOST}:${PORT}`);
}

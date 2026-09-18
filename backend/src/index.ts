import { Elysia } from 'elysia';
import { existsSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { staticPlugin } from '@elysiajs/static';
import { createApp } from './app';
import { resolveStoragePath, ensureDataDirs } from './db/paths';
import { openDatabase } from './db/connection';
import { runMigrations } from './db/migrate';
import { createRepositories } from './db/repositories';
import { seed } from './db/seeds/seed';
import { seedProviderConfigs } from './db/seeds/providerConfigs';
import { recoverStaleGenerations } from './engine/recovery';
import { GenerationHubImpl } from './engine/hub';
import { ProviderRegistryImpl } from './engine/providers';
import { FsAssetStore } from './assets/store';
import { loadServerConfig } from './config/loader';
import { listLanCandidates, pickPrimary, detectTailscale, resolveBackendBind } from './config/network';
import { formatBanner } from './config/banner';
import { createHmacToken, verifyHmacToken, verifyPinTimingSafe } from './routes/auth';

// 1. Load server configuration (Precedence: CLI > Env > config.yaml > Defaults)
const configResult = loadServerConfig();
const config = configResult.config;
if (configResult.warnings.length > 0) {
  for (const warning of configResult.warnings) {
    console.warn(`\x1b[33m[config warning]\x1b[0m ${warning}`);
  }
}

const PROD = process.env.NODE_ENV === 'production';
const LOG_SILENT = process.env.FORMATAVERN_LOG === 'silent';
const DEV_LOG = !PROD && !LOG_SILENT;
const BUILD_DIR = resolve(import.meta.dir, '../../frontend/build');

// 2. Ensure directory structures using resolved config paths
const dbPath = resolveStoragePath(config.storage?.dataPath ?? './formatavern.db');
const assetsDir = resolveStoragePath(config.storage?.assetsPath ?? './data/assets');
ensureDataDirs(assetsDir);

// 3. Open SQLite database & apply pragmas
const db = openDatabase(dbPath);

// 4. Run migrations
const { from, to } = runMigrations(db);

// 5. Repositories & boot recovery
const repos = createRepositories(db);
const recoveryResult = recoverStaleGenerations(repos);

// 6. Seed if empty
const seedResult = seed(repos);
const pcSeed = seedProviderConfigs(repos);

const dbFileName = basename(dbPath);
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
const assets = new FsAssetStore(assetsDir);
let server: Elysia;

const authSecret = new Uint8Array(32);
crypto.getRandomValues(authSecret);

const authOptions = {
  enabled: config.security.authMode === 'pin',
  verifyPin: (cand: string) => verifyPinTimingSafe(cand, config.security.pin ?? ''),
  signToken: () => createHmacToken(authSecret),
  verifyToken: (tok: string) => verifyHmacToken(authSecret, tok),
  trustedProxies: config.security.trustedProxies
};

const app = createApp({
  repos,
  hub,
  providers,
  assets,
  options: {
    nodeEnv: process.env.NODE_ENV,
    auth: authOptions,
    resolveIp: (req) =>
      (server as any)?.server?.requestIP?.(req)?.address ??
      (server as any)?.requestIP?.(req)?.address ??
      null
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

server = new Elysia();

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
      assets: assetsDir,
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

const bindHost = resolveBackendBind(config.network.mode, config.network.host, !PROD);
const bindPort = config.network.port;

try {
  server.listen({ hostname: bindHost, port: bindPort });
} catch (err: any) {
  const code = err?.code ?? err?.errno ?? '';
  if (code === 'EADDRINUSE' || String(err).includes('EADDRINUSE') || String(err).includes('address already in use')) {
    console.error(`\x1b[31m[ERROR]\x1b[0m Port ${bindPort} is already in use. → bun run stop, or port: in config.yaml / --port.`);
    process.exit(1);
  }
  if (
    code === 'EACCES' ||
    code === 'WSAEACCES' ||
    String(err).includes('EACCES') ||
    String(err).includes('10013') ||
    String(err).includes('Access denied')
  ) {
    console.error(`\x1b[31m[ERROR]\x1b[0m Access denied binding ${bindHost}:${bindPort}. → allow bun.exe in Defender/Avast-AVG Web Shield (Private networks); or --port 3005/8080 (Hyper-V exclusion range: netsh interface ipv4 show excludedportrange protocol=tcp).`);
    process.exit(1);
  }
  throw err;
}

if (!LOG_SILENT) {
  const candidates = listLanCandidates(bindPort);
  const primaryCandidate = pickPrimary(candidates);
  const tailscaleCandidate = detectTailscale(candidates);

  const activeSources = Array.from(new Set(Object.values(configResult.sourceMap))).filter(
    (s) => s !== 'default'
  );
  const sourceSummary =
    activeSources.length > 0
      ? activeSources.map((s) => (s === 'file' ? 'config.yaml' : s)).join(' + ')
      : undefined;

  const banner = formatBanner({
    config,
    candidates,
    primaryCandidate,
    tailscaleCandidate,
    isDev: !PROD,
    isTty: process.stdout.isTTY ?? false,
    columns: process.stdout.columns ?? 80,
    sourceSummary
  });
  console.log(banner);
}

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
import { recoverStaleGenerations } from './engine/recovery';
import { GenerationHubImpl } from './engine/hub';
import { ProviderRegistryImpl } from './engine/providers';

const HOST = process.env.FORMATAVERN_HOST ?? '127.0.0.1';
const PORT = Number(process.env.FORMATAVERN_PORT ?? 3000);
const PROD = process.env.NODE_ENV === 'production';
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

const dbFileName = basename(DB_PATH);
let dbLog = `[db] ${dbFileName}  migrations: ${from} → ${to}`;
if (seedResult.seeded) {
  dbLog += `  seeded: ${seedResult.characters} characters, ${seedResult.personas} persona`;
}
dbLog += `  recovered ${recoveryResult.recoveredCount} stale generations`;
console.log(dbLog);

// 6. Hub & Providers
const hub = new GenerationHubImpl();
const providers = new ProviderRegistryImpl();

const settings = repos.settings.getAll();
const hasOpenRouterKey = Boolean(
  (settings.openrouter?.apiKey && settings.openrouter.apiKey.trim().length > 0) ||
    process.env.OPENROUTER_API_KEY
);
console.log(`[providers] mock ready, openrouter ${hasOpenRouterKey ? 'ready' : 'disabled (no key)'}`);

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
const app = createApp({
  repos,
  hub,
  providers,
  options: {
    nodeEnv: process.env.NODE_ENV
  }
});

if (PROD && !existsSync(BUILD_DIR)) {
  throw new Error(`Production build missing: ${BUILD_DIR}. Run 'bun run build'.`);
}

const server = new Elysia()
  .use(app)
  .use(
    staticPlugin({
      assets: ASSETS_DIR,
      prefix: '/assets',
      headers: {
        'Cache-Control': 'public, max-age=3600'
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
console.log(`[formatavern] ${PROD ? 'prod' : 'dev'} backend → http://${HOST}:${PORT}`);

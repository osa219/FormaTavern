import { Elysia } from 'elysia';
import { existsSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { createApp } from './app';
import { DB_PATH, ensureDataDirs } from './db/paths';
import { openDatabase } from './db/connection';
import { runMigrations } from './db/migrate';
import { createRepositories } from './db/repositories';
import { seed } from './db/seeds/seed';
import { createProviders } from './providers';

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

// 3. Graceful shutdown to flush WAL
const shutdown = () => {
  try {
    db.close();
  } catch {}
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// 4. Run migrations
const { from, to } = runMigrations(db);

// 5. Initialize repositories & seed if empty
const repos = createRepositories(db);
const seedResult = seed(repos);

const dbFileName = basename(DB_PATH);
let dbLog = `[db] ${dbFileName}  migrations: ${from} → ${to}`;
if (seedResult.seeded) {
  dbLog += `  seeded: ${seedResult.characters} characters, ${seedResult.personas} persona`;
}
console.log(dbLog);

// 6. Initialize providers
const providers = createProviders({ openRouterApiKey: process.env.OPENROUTER_API_KEY });
console.log(`[providers] mock ready, openrouter ${providers.openrouter ? 'ready' : 'disabled (no key)'}`);

// 7. Assemble Elysia app
const app = createApp({ repos, providers });
if (PROD && !existsSync(BUILD_DIR)) {
  throw new Error(`Production build missing: ${BUILD_DIR}. Run 'bun run build'.`);
}

const server = new Elysia()
  .use(app)
  .all('*', ({ request, set }) => {
    if (!PROD) {
      set.status = 404;
      return { error: 'Not Found' };
    }

    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
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

/**
 * Launches FormaTavern in LAN broadcast dev mode.
 * Spawns the backend (listening on 127.0.0.1) and frontend (Vite listening on 0.0.0.0:5173).
 *
 * Usage: `bun run dev:lan`
 */

const env = {
  ...process.env,
  FORMATAVERN_NETWORK_MODE: 'lan'
};

const backend = Bun.spawn(['bun', '--watch', 'backend/src/index.ts'], {
  env,
  stdio: ['inherit', 'inherit', 'inherit']
});

const frontend = Bun.spawn(['bun', 'run', '--cwd', 'frontend', 'dev'], {
  env,
  stdio: ['inherit', 'inherit', 'inherit']
});

const killChildren = () => {
  try {
    backend.kill();
  } catch {}
  try {
    frontend.kill();
  } catch {}
};

process.on('SIGINT', () => {
  killChildren();
  process.exit(0);
});

process.on('SIGTERM', () => {
  killChildren();
  process.exit(0);
});

// Wait for either child to exit
Promise.race([backend.exited, frontend.exited]).then((code) => {
  killChildren();
  process.exit(code ?? 1);
});

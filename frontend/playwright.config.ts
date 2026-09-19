import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync } from 'node:fs';

// Local hard gate for mobile invariants M1–M4 (proposal:
// docs/history/reports/mobile-ux-optimization-proposal.md).
// Execution: `bun run test:mobile` from the repo root (builds the frontend,
// then runs this config with `bun x playwright`). Serves the production
// backend (static frontend/build + SPA fallback) against a scratch DB so the
// developer's database is never touched. Loopback stays PIN-free.

const scratchDir = mkdtempSync(join(tmpdir(), 'formatavern-mobile-smoke-'));
const PORT = Number(process.env.FORMATAVERN_SMOKE_PORT ?? 4317);
// PIN-free scratch config: loopback stays ungated so the smoke asserts layout,
// never auth. Every other setting falls back to schema defaults.
const scratchConfig = join(scratchDir, 'config.yaml');
writeFileSync(scratchConfig, 'security:\n  authMode: none\n', 'utf-8');

export default defineConfig({
  testDir: './e2e',
  // `.e2e.ts` suffix keeps these out of `bun test`, which also scans `*.spec.ts`.
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure'
  },
  webServer: {
    command: `bun src/index.ts --port ${PORT}`,
    cwd: '../backend',
    env: {
      NODE_ENV: 'production',
      FORMATAVERN_LOG: 'silent',
      FORMATAVERN_CONFIG_PATH: scratchConfig,
      FORMATAVERN_DB_PATH: join(scratchDir, 'smoke.db'),
      FORMATAVERN_ASSETS_DIR: join(scratchDir, 'assets')
    },
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    {
      name: 'mobile-390',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } }
    },
    {
      name: 'edge-700',
      use: { ...devices['Desktop Chrome'], viewport: { width: 700, height: 844 } }
    },
    {
      name: 'desktop-1280',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }
    }
  ]
});

import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const REPO_ROOT = join(import.meta.dir, '../../..');
export const DB_PATH = process.env.FORMATAVERN_DB_PATH ?? join(REPO_ROOT, 'formatavern.db');
export const ASSETS_DIR = process.env.FORMATAVERN_ASSETS_DIR ?? join(REPO_ROOT, 'data', 'assets');

export function ensureDataDirs() {
  for (const d of ['characters', 'backgrounds', 'fonts']) {
    mkdirSync(join(ASSETS_DIR, d), { recursive: true });
  }
}

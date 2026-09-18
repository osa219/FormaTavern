import { join, resolve, isAbsolute } from 'node:path';
import { mkdirSync } from 'node:fs';

const REPO_ROOT = join(import.meta.dir, '../../..');
export const DB_PATH = process.env.FORMATAVERN_DB_PATH ?? join(REPO_ROOT, 'formatavern.db');
export const ASSETS_DIR = process.env.FORMATAVERN_ASSETS_DIR ?? join(REPO_ROOT, 'data', 'assets');

export function resolveStoragePath(p: string): string {
  return isAbsolute(p) ? p : resolve(REPO_ROOT, p);
}

export function ensureDataDirs(targetDir: string = ASSETS_DIR) {
  for (const d of ['characters', 'backgrounds', 'fonts']) {
    mkdirSync(join(targetDir, d), { recursive: true });
  }
}

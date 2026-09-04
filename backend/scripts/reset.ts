import { DB_PATH } from '../src/db/paths';
import { unlinkSync, existsSync } from 'node:fs';

const isProd = process.env.NODE_ENV === 'production';
const hasYes = process.argv.includes('--yes');

if (isProd && !hasYes) {
  console.error('[reset] Refusing to reset database in production without --yes');
  process.exit(1);
}

const files = [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`];

for (const file of files) {
  if (existsSync(file)) {
    try {
      unlinkSync(file);
      console.log(`[reset] Removed ${file}`);
    } catch (err: any) {
      if (err.code === 'EBUSY' || err.code === 'EPERM') {
        console.error(`[reset] File ${file} is locked by another process.`);
        console.error('[reset] Hint: Stop running servers (bun run dev / bun run start) or SQLite tools before resetting.');
      } else {
        console.error(`[reset] Failed to remove ${file}:`, err.message);
      }
      process.exit(1);
    }
  }
}

console.log('[reset] Database reset complete.');

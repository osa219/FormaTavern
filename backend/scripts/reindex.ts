import { DB_PATH } from '../src/db/paths';
import { openDatabase } from '../src/db/connection';

import { reindexCharactersFts } from '../src/db/fts';

let db;
try {
  db = openDatabase(DB_PATH);
} catch (err: any) {
  console.error(`[reindex] Failed to open database ${DB_PATH}:`, err.message);
  process.exit(1);
}

try {
  const result = reindexCharactersFts(db);
  if (result.skipped) {
    console.log('[reindex] FTS5 not supported by current SQLite runtime; search fallback active.');
    process.exit(0);
  }

  console.log(`[reindex] Successfully indexed ${result.count} characters in ${result.elapsedMs.toFixed(1)}ms`);
} catch (err: any) {
  console.error('[reindex] Reindexing failed:', err.message);
  process.exit(1);
} finally {
  db.close();
}

import { DB_PATH } from '../src/db/paths';
import { openDatabase } from '../src/db/connection';

let db;
try {
  db = openDatabase(DB_PATH);
} catch (err: any) {
  console.error(`[reindex] Failed to open database ${DB_PATH}:`, err.message);
  process.exit(1);
}

try {
  const startTime = performance.now();
  const ftsRow = db.query(`SELECT 1 FROM pragma_compile_options WHERE compile_options = 'ENABLE_FTS5';`).get();
  const hasFts5 = Boolean(ftsRow);

  if (!hasFts5) {
    console.log('[reindex] FTS5 not supported by current SQLite runtime; search fallback active.');
    process.exit(0);
  }

  db.transaction(() => {
    db.run(`DROP TABLE IF EXISTS characters_fts;`);
    db.run(`CREATE VIRTUAL TABLE characters_fts USING fts5(
      id UNINDEXED, name, tagline, description, creator, tags,
      tokenize = 'unicode61 remove_diacritics 2'
    );`);
    db.run(`INSERT INTO characters_fts(id, name, tagline, description, creator, tags)
      SELECT c.id, c.name, coalesce(c.tagline, ''), c.description, coalesce(c.creator, ''),
             coalesce((SELECT group_concat(tag, ' ') FROM character_tags WHERE character_id = c.id), '')
      FROM characters c;`);
    db.run(`INSERT INTO characters_fts(characters_fts) VALUES('optimize');`);
  })();

  const countRow = db.query('SELECT COUNT(*) as count FROM characters_fts;').get() as { count: number };
  const elapsed = (performance.now() - startTime).toFixed(1);
  console.log(`[reindex] Successfully indexed ${countRow.count} characters in ${elapsed}ms`);
} catch (err: any) {
  console.error('[reindex] Reindexing failed:', err.message);
  process.exit(1);
} finally {
  db.close();
}

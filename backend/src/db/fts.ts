import type { Database } from 'bun:sqlite';

export interface ReindexResult {
  count: number;
  elapsedMs: number;
  skipped?: boolean;
}

/**
 * Rebuilds the characters_fts table from the characters and character_tags tables.
 * Safe to call during bulk import completion or manual reindexing.
 */
export function reindexCharactersFts(db: Database): ReindexResult {
  const startTime = performance.now();
  const ftsRow = db.query(`SELECT 1 FROM pragma_compile_options WHERE compile_options = 'ENABLE_FTS5';`).get();
  const hasFts5 = Boolean(ftsRow);

  if (!hasFts5) {
    return { count: 0, elapsedMs: 0, skipped: true };
  }

  db.transaction(() => {
    db.run(`DROP TABLE IF EXISTS characters_fts;`);
    db.run(`CREATE VIRTUAL TABLE characters_fts USING fts5(
      id UNINDEXED, name, character_name, tagline, description, showcase, creator, tags,
      tokenize = 'unicode61 remove_diacritics 2'
    );`);
    db.run(`INSERT INTO characters_fts(id, name, character_name, tagline, description, showcase, creator, tags)
      SELECT c.id, c.name, coalesce(c.character_name, ''), coalesce(c.tagline, ''), c.description, coalesce(c.showcase, ''), coalesce(c.creator, ''),
             coalesce((SELECT group_concat(tag, ' ') FROM character_tags WHERE character_id = c.id), '')
      FROM characters c;`);
    db.run(`INSERT INTO characters_fts(characters_fts) VALUES('optimize');`);
  })();

  const countRow = db.query('SELECT COUNT(*) as count FROM characters_fts;').get() as { count: number };
  const elapsedMs = performance.now() - startTime;
  return { count: countRow.count, elapsedMs };
}

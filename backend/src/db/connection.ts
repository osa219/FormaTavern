import { Database } from 'bun:sqlite';

export function openDatabase(path: string): Database {
  const db = new Database(path, { create: true, strict: true });
  if (path !== ':memory:') {
    const { journal_mode } = db.query('PRAGMA journal_mode = WAL;').get() as { journal_mode: string };
    if (journal_mode !== 'wal') throw new Error(`Expected WAL, got '${journal_mode}' for ${path}`);
  }
  db.run('PRAGMA synchronous = NORMAL;');
  db.run('PRAGMA foreign_keys = ON;');
  db.run('PRAGMA busy_timeout = 5000;');
  const { foreign_keys } = db.query('PRAGMA foreign_keys;').get() as { foreign_keys: number };
  if (foreign_keys !== 1) throw new Error('foreign_keys pragma did not take effect');
  return db;
}

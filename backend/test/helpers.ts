import { openDatabase } from '../src/db/connection';
import type { Database } from 'bun:sqlite';
import { unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface TestDbInstance {
  db: Database;
  path: string;
  cleanup: () => void;
}

export function openTestDb(mode: ':memory:' | 'file' = ':memory:'): TestDbInstance {
  if (mode === ':memory:') {
    const db = openDatabase(':memory:');
    return {
      db,
      path: ':memory:',
      cleanup: () => {
        try {
          db.close();
        } catch {}
      }
    };
  }

  const path = join(tmpdir(), `formatavern-test-${randomUUID()}.db`);
  const db = openDatabase(path);

  return {
    db,
    path,
    cleanup: () => {
      try {
        db.close();
      } catch {}
      for (const suffix of ['', '-wal', '-shm']) {
        const file = path + suffix;
        if (existsSync(file)) {
          try {
            unlinkSync(file);
          } catch {}
        }
      }
    }
  };
}

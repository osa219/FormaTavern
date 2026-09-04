import { describe, it, expect, afterEach } from 'bun:test';
import { runMigrations, migrations, type Migration } from '../src/db/migrate';
import { openTestDb, type TestDbInstance } from './helpers';

describe('Database Migrations', () => {
  let inst: TestDbInstance;

  afterEach(() => {
    inst?.cleanup();
  });

  it('runs migrations on fresh database from v0 to v2 and alters schema', () => {
    inst = openTestDb(':memory:');
    const res = runMigrations(inst.db);
    expect(res).toEqual({ from: 0, to: 2 });

    const { user_version } = inst.db.query('PRAGMA user_version;').get() as { user_version: number };
    expect(user_version).toBe(2);

    const columns = inst.db.query('PRAGMA table_info(messages);').all() as Array<{
      name: string;
      notnull: number;
      dflt_value: string | null;
    }>;

    const colMap = new Map(columns.map((c) => [c.name, c]));
    expect(colMap.has('narrative_role')).toBe(true);
    expect(colMap.has('sender_name')).toBe(true);
    expect(colMap.has('segments')).toBe(true);
    expect(colMap.has('state')).toBe(true);

    const narrativeRole = colMap.get('narrative_role')!;
    expect(narrativeRole.notnull).toBe(1);
    expect(narrativeRole.dflt_value).toBe("'character'");
  });

  it('is idempotent on subsequent migration runs', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const second = runMigrations(inst.db);
    expect(second).toEqual({ from: 2, to: 2 });
  });

  it('upgrades v1 database to v2 and backfills user messages', () => {
    inst = openTestDb(':memory:');
    // Run v1 only
    const v1Only = migrations.slice(0, 1);
    runMigrations(inst.db, v1Only);

    const now = Date.now();
    // Insert prerequisites
    inst.db.run(
      `INSERT INTO characters (id, name, style, created_at, updated_at) VALUES ('c1', 'Hero', '{}', ?, ?)`,
      [now, now]
    );
    inst.db.run(
      `INSERT INTO personas (id, name, created_at, updated_at) VALUES ('p1', 'Player', ?, ?)`,
      [now, now]
    );
    inst.db.run(
      `INSERT INTO chats (id, title, primary_character_id, active_persona_id, created_at, updated_at) VALUES ('chat1', 'Chat', 'c1', 'p1', ?, ?)`,
      [now, now]
    );

    // Insert user and assistant messages under v1 schema
    inst.db.run(
      `INSERT INTO messages (id, chat_id, role, content, status, created_at) VALUES ('m1', 'chat1', 'user', 'Hello', 'complete', ?)`,
      [now]
    );
    inst.db.run(
      `INSERT INTO messages (id, chat_id, role, content, status, created_at) VALUES ('m2', 'chat1', 'assistant', 'Greetings', 'complete', ?)`,
      [now + 1]
    );

    // Run full migrations (upgrades to v2)
    const upgrade = runMigrations(inst.db);
    expect(upgrade).toEqual({ from: 1, to: 2 });

    const m1 = inst.db.query(`SELECT narrative_role FROM messages WHERE id = 'm1';`).get() as {
      narrative_role: string;
    };
    expect(m1.narrative_role).toBe('persona');

    const m2 = inst.db.query(`SELECT narrative_role FROM messages WHERE id = 'm2';`).get() as {
      narrative_role: string;
    };
    expect(m2.narrative_role).toBe('character');
  });

  it('rolls back failed migration without altering user_version or leaving partial schema', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);

    const failingV3: Migration = {
      version: 3,
      name: 'failing_migration',
      up: (db) => {
        db.run(`CREATE TABLE test_rollback (id TEXT PRIMARY KEY);`);
        throw new Error('Simulation of unexpected migration failure');
      }
    };

    expect(() => runMigrations(inst.db, [...migrations, failingV3])).toThrow(
      'Simulation of unexpected migration failure'
    );

    const { user_version } = inst.db.query('PRAGMA user_version;').get() as { user_version: number };
    expect(user_version).toBe(2);

    const tableCheck = inst.db
      .query(`SELECT name FROM sqlite_master WHERE type='table' AND name='test_rollback';`)
      .get();
    expect(tableCheck).toBeNull();
  });

  it('refuses to open if user_version is newer than supported migrations', () => {
    inst = openTestDb(':memory:');
    inst.db.run('PRAGMA user_version = 99;');
    expect(() => runMigrations(inst.db)).toThrow(/Database is schema v99; this build supports up to v2/);
  });

  it('rejects non-contiguous migration sequences before running', () => {
    inst = openTestDb(':memory:');
    const nonContiguous: Migration[] = [
      migrations[0],
      { version: 3, name: 'skipped_v2', up: () => {} }
    ];
    expect(() => runMigrations(inst.db, nonContiguous)).toThrow(/Migrations must be contiguous from 1/);
  });
});

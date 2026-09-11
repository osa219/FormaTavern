import { describe, it, expect, afterEach } from 'bun:test';
import { runMigrations, migrations, type Migration } from '../src/db/migrate';
import { openTestDb, type TestDbInstance } from './helpers';

describe('Database Migrations', () => {
  let inst: TestDbInstance;

  afterEach(() => {
    inst?.cleanup();
  });

  it('runs migrations on fresh database from v0 to v5 and alters schema', () => {
    inst = openTestDb(':memory:');
    const res = runMigrations(inst.db);
    expect(res).toEqual({ from: 0, to: 5 });

    const { user_version } = inst.db.query('PRAGMA user_version;').get() as { user_version: number };
    expect(user_version).toBe(5);

    const msgCols = inst.db.query('PRAGMA table_info(messages);').all() as Array<{ name: string }>;
    const msgColMap = new Set(msgCols.map((c) => c.name));
    expect(msgColMap.has('narrative_role')).toBe(true);
    expect(msgColMap.has('sender_name')).toBe(true);
    expect(msgColMap.has('segments')).toBe(true);
    expect(msgColMap.has('state')).toBe(true);

    const chatCols = inst.db.query('PRAGMA table_info(chats);').all() as Array<{ name: string }>;
    const chatColMap = new Set(chatCols.map((c) => c.name));
    expect(chatColMap.has('active_leaf_id')).toBe(true);

    const charCols = inst.db.query('PRAGMA table_info(characters);').all() as Array<{ name: string }>;
    const charColMap = new Set(charCols.map((c) => c.name));
    expect(charColMap.has('tagline')).toBe(true);
    expect(charColMap.has('creator')).toBe(true);
    expect(charColMap.has('showcase')).toBe(true);
    expect(charColMap.has('custom_css')).toBe(true);

    const tagTable = inst.db
      .query(`SELECT name FROM sqlite_master WHERE type='table' AND name='character_tags';`)
      .get();
    expect(tagTable).not.toBeNull();

    const indexes = inst.db.query('SELECT name FROM sqlite_master WHERE type="index";').all() as Array<{
      name: string;
    }>;
    const indexNames = new Set(indexes.map((i) => i.name));
    expect(indexNames.has('idx_messages_streaming')).toBe(true);
    expect(indexNames.has('idx_messages_parent_id_id')).toBe(true);
    expect(indexNames.has('idx_character_tags_tag')).toBe(true);
    expect(indexNames.has('idx_characters_name_nocase')).toBe(true);

    const searchSetting = inst.db
      .query(`SELECT value FROM settings WHERE key = 'search_backend';`)
      .get() as { value: string };
    expect(searchSetting).not.toBeNull();
    expect(['"fts5"', '"like"']).toContain(searchSetting.value);
  });

  it('is idempotent on subsequent migration runs', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const second = runMigrations(inst.db);
    expect(second).toEqual({ from: 5, to: 5 });
  });

  it('upgrades v2 database to v5 and backfills active_leaf_id and tags', () => {
    inst = openTestDb(':memory:');
    // Run v1 and v2
    const v2Only = migrations.slice(0, 2);
    runMigrations(inst.db, v2Only);

    const now = Date.now();
    inst.db.run(
      `INSERT INTO characters (id, name, style, created_at, updated_at, metadata) VALUES ('c1', 'Hero', '{}', ?, ?, ?)`,
      [now, now, JSON.stringify({ creator: 'Alice', tags: ['brave', 'warrior'] })]
    );
    inst.db.run(
      `INSERT INTO personas (id, name, created_at, updated_at) VALUES ('p1', 'Player', ?, ?)`,
      [now, now]
    );
    inst.db.run(
      `INSERT INTO chats (id, title, primary_character_id, active_persona_id, created_at, updated_at) VALUES ('chat1', 'Chat', 'c1', 'p1', ?, ?)`,
      [now, now]
    );

    // Insert messages m1 (older) and m2 (newer)
    inst.db.run(
      `INSERT INTO messages (id, chat_id, role, narrative_role, content, status, created_at) VALUES ('01M1', 'chat1', 'user', 'persona', 'Hello', 'complete', ?)`,
      [now]
    );
    inst.db.run(
      `INSERT INTO messages (id, chat_id, role, narrative_role, content, status, created_at) VALUES ('01M2', 'chat1', 'assistant', 'character', 'Greetings', 'complete', ?)`,
      [now + 1]
    );

    // Run full migrations (upgrades to v5)
    const upgrade = runMigrations(inst.db);
    expect(upgrade).toEqual({ from: 2, to: 5 });

    const chat1 = inst.db.query(`SELECT active_leaf_id FROM chats WHERE id = 'chat1';`).get() as {
      active_leaf_id: string;
    };
    expect(chat1.active_leaf_id).toBe('01M2');

    const hero = inst.db.query(`SELECT creator, custom_css FROM characters WHERE id = 'c1';`).get() as {
      creator: string;
      custom_css: string | null;
    };
    expect(hero.creator).toBe('Alice');
    expect(hero.custom_css).toBeNull();

    const tags = inst.db.query(`SELECT tag FROM character_tags WHERE character_id = 'c1' ORDER BY tag ASC;`).all() as Array<{ tag: string }>;
    expect(tags.map((t) => t.tag)).toEqual(['brave', 'warrior']);

    const fkCheck = inst.db.query('PRAGMA foreign_key_check;').all();
    expect(fkCheck).toEqual([]);
  });

  it('deletes chat with active_leaf_id set without FK cycle error (SET NULL + CASCADE)', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);

    const now = Date.now();
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
    inst.db.run(
      `INSERT INTO messages (id, chat_id, role, narrative_role, content, status, created_at) VALUES ('01M1', 'chat1', 'user', 'persona', 'Hello', 'complete', ?)`,
      [now]
    );
    inst.db.run(`UPDATE chats SET active_leaf_id = '01M1' WHERE id = 'chat1';`);

    // Verify foreign keys check passes with cycle
    expect(inst.db.query('PRAGMA foreign_key_check;').all()).toEqual([]);

    // Delete chat: should cascade messages and set null on active_leaf_id without error
    expect(() => {
      inst.db.run(`DELETE FROM chats WHERE id = 'chat1';`);
    }).not.toThrow();

    const msgCount = (
      inst.db.query(`SELECT COUNT(*) as count FROM messages WHERE chat_id = 'chat1';`).get() as {
        count: number;
      }
    ).count;
    expect(msgCount).toBe(0);

    const chatCount = (
      inst.db.query(`SELECT COUNT(*) as count FROM chats WHERE id = 'chat1';`).get() as {
        count: number;
      }
    ).count;
    expect(chatCount).toBe(0);
  });

  it('rolls back failed migration without altering user_version or leaving partial schema', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);

    const failingV6: Migration = {
      version: 6,
      name: 'failing_migration',
      up: (db) => {
        db.run(`CREATE TABLE test_rollback (id TEXT PRIMARY KEY);`);
        throw new Error('Simulation of unexpected migration failure');
      }
    };

    expect(() => runMigrations(inst.db, [...migrations, failingV6])).toThrow(
      'Simulation of unexpected migration failure'
    );

    const { user_version } = inst.db.query('PRAGMA user_version;').get() as { user_version: number };
    expect(user_version).toBe(5);

    const tableCheck = inst.db
      .query(`SELECT name FROM sqlite_master WHERE type='table' AND name='test_rollback';`)
      .get();
    expect(tableCheck).toBeNull();
  });

  it('refuses to open if user_version is newer than supported migrations', () => {
    inst = openTestDb(':memory:');
    inst.db.run('PRAGMA user_version = 99;');
    expect(() => runMigrations(inst.db)).toThrow(/Database is schema v99; this build supports up to v5/);
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

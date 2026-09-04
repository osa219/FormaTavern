import { describe, it, expect, afterEach } from 'bun:test';
import { runMigrations } from '../src/db/migrate';
import { openTestDb, type TestDbInstance } from './helpers';
import { openDatabase } from '../src/db/connection';
import { unlinkSync, existsSync } from 'node:fs';

describe('Database Foreign Keys & Schema Integrity', () => {
  let inst: TestDbInstance;

  afterEach(() => {
    inst?.cleanup();
  });

  function seedPrereqs(db: any) {
    const now = Date.now();
    db.run(
      `INSERT INTO characters (id, name, style, created_at, updated_at) VALUES ('c1', 'Eldrin', '{}', ?, ?)`,
      [now, now]
    );
    db.run(
      `INSERT INTO personas (id, name, is_default, created_at, updated_at) VALUES ('p1', 'Traveler', 1, ?, ?)`,
      [now, now]
    );
  }

  it('rejects chat insertion with nonexistent primary_character_id (FK RESTRICT)', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    seedPrereqs(inst.db);

    const now = Date.now();
    expect(() => {
      inst.db.run(
        `INSERT INTO chats (id, title, primary_character_id, active_persona_id, created_at, updated_at) VALUES ('chat1', 'Test', 'ghost', 'p1', ?, ?)`,
        [now, now]
      );
    }).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('prevents deletion of character or persona referenced by a chat (ON DELETE RESTRICT)', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    seedPrereqs(inst.db);

    const now = Date.now();
    inst.db.run(
      `INSERT INTO chats (id, title, primary_character_id, active_persona_id, created_at, updated_at) VALUES ('chat1', 'Test', 'c1', 'p1', ?, ?)`,
      [now, now]
    );

    expect(() => {
      inst.db.run(`DELETE FROM characters WHERE id = 'c1'`);
    }).toThrow(/FOREIGN KEY constraint failed/);

    expect(() => {
      inst.db.run(`DELETE FROM personas WHERE id = 'p1'`);
    }).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('cascades deletion from chat to messages (ON DELETE CASCADE)', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    seedPrereqs(inst.db);

    const now = Date.now();
    inst.db.run(
      `INSERT INTO chats (id, title, primary_character_id, active_persona_id, created_at, updated_at) VALUES ('chat1', 'Test', 'c1', 'p1', ?, ?)`,
      [now, now]
    );
    inst.db.run(
      `INSERT INTO messages (id, chat_id, role, content, status, created_at) VALUES ('m1', 'chat1', 'user', 'Hi', 'complete', ?)`,
      [now]
    );

    inst.db.run(`DELETE FROM chats WHERE id = 'chat1'`);
    const count = inst.db.query(`SELECT count(*) as count FROM messages WHERE chat_id = 'chat1'`).get() as {
      count: number;
    };
    expect(count.count).toBe(0);
  });

  it('cascades deletion through the message tree (root -> A -> A1, A2; root -> B)', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    seedPrereqs(inst.db);

    const now = Date.now();
    inst.db.run(
      `INSERT INTO chats (id, title, primary_character_id, active_persona_id, created_at, updated_at) VALUES ('chat1', 'Tree', 'c1', 'p1', ?, ?)`,
      [now, now]
    );

    inst.db.run(
      `INSERT INTO messages (id, chat_id, parent_id, role, content, status, created_at) VALUES ('root', 'chat1', NULL, 'system', 'Root', 'complete', ?)`,
      [now]
    );
    inst.db.run(
      `INSERT INTO messages (id, chat_id, parent_id, role, content, status, created_at) VALUES ('A', 'chat1', 'root', 'user', 'Branch A', 'complete', ?)`,
      [now + 1]
    );
    inst.db.run(
      `INSERT INTO messages (id, chat_id, parent_id, role, content, status, created_at) VALUES ('A1', 'chat1', 'A', 'assistant', 'Leaf A1', 'complete', ?)`,
      [now + 2]
    );
    inst.db.run(
      `INSERT INTO messages (id, chat_id, parent_id, role, content, status, created_at) VALUES ('A2', 'chat1', 'A', 'assistant', 'Leaf A2', 'complete', ?)`,
      [now + 3]
    );
    inst.db.run(
      `INSERT INTO messages (id, chat_id, parent_id, role, content, status, created_at) VALUES ('B', 'chat1', 'root', 'user', 'Branch B', 'complete', ?)`,
      [now + 4]
    );

    // Delete A -> A, A1, A2 gone; root and B remain
    inst.db.run(`DELETE FROM messages WHERE id = 'A'`);
    const remainingAfterA = inst.db
      .query(`SELECT id FROM messages ORDER BY id ASC`)
      .all() as Array<{ id: string }>;
    expect(remainingAfterA.map((r) => r.id)).toEqual(['B', 'root']);

    // Delete root -> all gone
    inst.db.run(`DELETE FROM messages WHERE id = 'root'`);
    const count = inst.db.query(`SELECT count(*) as count FROM messages`).get() as { count: number };
    expect(count.count).toBe(0);
  });

  it('enforces partial unique index on personas.is_default (at most one default)', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    seedPrereqs(inst.db); // already inserted p1 with is_default = 1

    const now = Date.now();
    expect(() => {
      inst.db.run(
        `INSERT INTO personas (id, name, is_default, created_at, updated_at) VALUES ('p2', 'Second Default', 1, ?, ?)`,
        [now, now]
      );
    }).toThrow(/UNIQUE constraint failed/);
  });

  it('enforces CHECK constraint on messages.status', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    seedPrereqs(inst.db);

    const now = Date.now();
    inst.db.run(
      `INSERT INTO chats (id, title, primary_character_id, active_persona_id, created_at, updated_at) VALUES ('chat1', 'Test', 'c1', 'p1', ?, ?)`,
      [now, now]
    );

    expect(() => {
      inst.db.run(
        `INSERT INTO messages (id, chat_id, role, content, status, created_at) VALUES ('m_bad', 'chat1', 'user', 'Hi', 'pending', ?)`,
        [now]
      );
    }).toThrow(/CHECK constraint failed/);
  });

  it('enables WAL on file database and verifies non-blocking readers', () => {
    inst = openTestDb('file');
    runMigrations(inst.db);
    seedPrereqs(inst.db);

    const { journal_mode } = inst.db.query('PRAGMA journal_mode;').get() as { journal_mode: string };
    expect(journal_mode).toBe('wal');

    // Open a second connection to the same file
    const conn2 = openDatabase(inst.path);
    try {
      // Start a write transaction on conn 1 without committing immediately
      inst.db.run('BEGIN IMMEDIATE;');
      inst.db.run(
        `INSERT INTO characters (id, name, style, created_at, updated_at) VALUES ('c_temp', 'Temp', '{}', ?, ?)`,
        [Date.now(), Date.now()]
      );

      // conn 2 should be able to read without blocking or throwing
      const readRes = conn2.query(`SELECT count(*) as count FROM characters;`).get() as { count: number };
      expect(readRes.count).toBe(1); // sees committed snapshot (does not see uncommitted c_temp)

      inst.db.run('COMMIT;');

      const readAfterCommit = conn2.query(`SELECT count(*) as count FROM characters;`).get() as { count: number };
      expect(readAfterCommit.count).toBe(2);
    } finally {
      conn2.close();
    }
  });
});

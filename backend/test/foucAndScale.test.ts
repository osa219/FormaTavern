import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { openTestDb, type TestDbInstance } from './helpers';
import { runMigrations } from '../src/db/migrate';
import { SQLiteChatRepository } from '../src/db/repositories/chats';
import { SqliteCharacterRepository } from '../src/db/repositories';

describe('Zero-FOUC & Scaling Hardening (Migration 8 & CTE Chats List)', () => {
  let inst: TestDbInstance;
  let chatsRepo: SQLiteChatRepository;
  let charsRepo: SqliteCharacterRepository;

  beforeEach(() => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    chatsRepo = new SQLiteChatRepository(inst.db);
    charsRepo = new SqliteCharacterRepository(inst.db);
  });

  afterEach(() => {
    inst?.cleanup();
  });

  it('confirms Migration 8 created idx_chats_primary_character index on chats', () => {
    const indexes = inst.db
      .query("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='chats';")
      .all() as Array<{ name: string }>;
    const names = new Set(indexes.map((i) => i.name));
    expect(names.has('idx_chats_primary_character')).toBe(true);
    expect(names.has('idx_chats_updated')).toBe(true);
  });

  it('validates CTE early limiting in chats.list returns correct limited chats with message counts', () => {
    const now = Date.now();
    // Create 1 character and 1 persona
    inst.db.run(
      `INSERT INTO characters (id, name, description, personality, scenario, first_message, style, created_at, updated_at)
       VALUES ('char-scale-1', 'Scale Character', 'Test desc', 'Test personality', 'Test scenario', 'Hello', '{}', ?, ?)`,
      [now, now]
    );
    inst.db.run(
      `INSERT INTO personas (id, name, created_at, updated_at)
       VALUES ('persona-default', 'Default Persona', ?, ?)`,
      [now, now]
    );

    // Create 20 chats with varying updatedAt and messages
    for (let i = 1; i <= 20; i++) {
      const chatId = `chat-scale-${i}`;
      inst.db.run(
        `INSERT INTO chats (id, title, primary_character_id, active_persona_id, created_at, updated_at)
         VALUES (?, ?, 'char-scale-1', 'persona-default', ?, ?)`,
        [chatId, `Story ${i}`, now + i * 1000, now + i * 1000]
      );

      // Add messages to each chat
      for (let m = 1; m <= i; m++) {
        inst.db.run(
          `INSERT INTO messages (id, chat_id, role, narrative_role, content, status, created_at)
           VALUES (?, ?, ?, 'character', 'Message content', 'complete', ?)`,
          [`msg-${i}-${m}`, chatId, m % 2 === 0 ? 'assistant' : 'user', now + i * 1000 + m]
        );
      }
    }

    // Query unbounded
    const allChats = chatsRepo.list();
    expect(allChats.length).toBe(20);
    // Newest is Story 20
    expect(allChats[0].id).toBe('chat-scale-20');
    expect(allChats[0].messageCount).toBe(20);
    expect(allChats[0].turnCount).toBe(10); // half are assistant

    // Query with CTE limit: 5
    const limitedChats = chatsRepo.list({ limit: 5 });
    expect(limitedChats.length).toBe(5);
    // Must be the exact top 5 newest chats
    expect(limitedChats[0].id).toBe('chat-scale-20');
    expect(limitedChats[0].messageCount).toBe(20);
    expect(limitedChats[0].turnCount).toBe(10);

    expect(limitedChats[4].id).toBe('chat-scale-16');
    expect(limitedChats[4].messageCount).toBe(16);
    expect(limitedChats[4].turnCount).toBe(8);

    // Query with character filter and limit
    const charLimited = chatsRepo.list({ characterId: 'char-scale-1', limit: 3 });
    expect(charLimited.length).toBe(3);
    expect(charLimited[0].id).toBe('chat-scale-20');
    expect(charLimited[2].id).toBe('chat-scale-18');
  });
});

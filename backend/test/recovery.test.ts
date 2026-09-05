import { describe, it, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../src/db/migrate';
import { createRepositories } from '../src/db/repositories';
import { recoverStaleGenerations } from '../src/engine/recovery';
import type { Repositories } from '../src/db/contracts';

describe('recoverStaleGenerations', () => {
  let db: Database;
  let repos: Repositories;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    repos = createRepositories(db);

    repos.chats.create({
      id: 'chat-rec-1',
      title: 'Recovery Chat',
      primaryCharacterId: 'char-1',
      activePersonaId: 'pers-1',
      metadata: {
        envelopeDialect: 'directive',
        narrativeMode: 'narrative'
      }
    });
  });

  it('marks streaming rows as aborted with recovered: true and stateSource: inherited', () => {
    const m1 = repos.messages.insert({
      id: 'msg-rec-1',
      chatId: 'chat-rec-1',
      parentId: null,
      role: 'assistant',
      narrativeRole: 'character',
      senderName: 'Eldrin',
      content: 'Incomplete message 1...',
      segments: [],
      status: 'streaming',
      metadata: { directorNote: 'test note' }
    });

    const m2 = repos.messages.insert({
      id: 'msg-rec-2',
      chatId: 'chat-rec-1',
      parentId: m1.id,
      role: 'assistant',
      narrativeRole: 'character',
      senderName: 'Eldrin',
      content: 'Incomplete message 2...',
      segments: [],
      status: 'streaming'
    });

    const result = recoverStaleGenerations(repos);

    expect(result.recoveredCount).toBe(2);
    expect(result.messageIds).toContain('msg-rec-1');
    expect(result.messageIds).toContain('msg-rec-2');

    const row1 = repos.messages.get('msg-rec-1');
    expect(row1?.status).toBe('aborted');
    expect(row1?.metadata.recovered).toBe(true);
    expect(row1?.metadata.stateSource).toBe('inherited');
    expect(row1?.metadata.directorNote).toBe('test note');

    const row2 = repos.messages.get('msg-rec-2');
    expect(row2?.status).toBe('aborted');
    expect(row2?.metadata.recovered).toBe(true);
    expect(row2?.metadata.stateSource).toBe('inherited');

    // Second recovery run recovers 0
    const result2 = recoverStaleGenerations(repos);
    expect(result2.recoveredCount).toBe(0);
    expect(result2.messageIds).toEqual([]);
  });
});

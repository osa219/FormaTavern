import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { openTestDb, type TestDbInstance } from '../helpers';
import { runMigrations } from '../../src/db/migrate';
import { createRepositories } from '../../src/db/repositories';
import { eldrin } from '../../src/db/seeds/characters';
import { defaultPersona } from '../../src/db/seeds/personas';

describe('SQLiteChatRepository', () => {
  let inst: TestDbInstance;

  beforeEach(() => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);
    repos.characters.upsert(eldrin);
    repos.personas.upsert(defaultPersona);
  });

  afterEach(() => {
    inst?.cleanup();
  });

  it('creates, retrieves, updates, and counts chats', () => {
    const repos = createRepositories(inst.db);
    const created = repos.chats.create({
      id: 'chat-001',
      title: 'Celestial Convergence',
      primaryCharacterId: eldrin.id,
      activePersonaId: defaultPersona.id,
      metadata: {
        envelopeDialect: 'directive',
        narrativeMode: 'narrative',
        npcs: {},
        currentState: { mood: 'calm' }
      }
    });

    expect(created.id).toBe('chat-001');
    expect(created.title).toBe('Celestial Convergence');
    expect(created.activeLeafId).toBeNull();
    expect(created.metadata.currentState).toEqual({ mood: 'calm' });

    // Retrieve
    const fetched = repos.chats.get('chat-001');
    expect(fetched).not.toBeNull();
    expect(fetched!.title).toBe('Celestial Convergence');

    // Update title and metadata
    repos.chats.update('chat-001', {
      title: 'Cosmic Shift',
      metadata: {
        ...created.metadata,
        currentState: { mood: 'urgent' }
      }
    });

    const updated = repos.chats.get('chat-001');
    expect(updated!.title).toBe('Cosmic Shift');
    expect(updated!.metadata.currentState).toEqual({ mood: 'urgent' });

    // Count
    expect(repos.chats.count()).toBe(1);
  });

  it('lists chats ordered by updated_at DESC and attaches messageCount', async () => {
    const repos = createRepositories(inst.db);

    repos.chats.create({
      id: 'chat-a',
      title: 'Chat A',
      primaryCharacterId: eldrin.id,
      activePersonaId: defaultPersona.id,
      metadata: {}
    });

    await new Promise((r) => setTimeout(r, 10));

    repos.chats.create({
      id: 'chat-b',
      title: 'Chat B',
      primaryCharacterId: eldrin.id,
      activePersonaId: defaultPersona.id,
      metadata: {}
    });

    // Add messages to chat-a
    repos.messages.insert({
      id: '01MSG1',
      chatId: 'chat-a',
      parentId: null,
      senderId: defaultPersona.id,
      senderName: defaultPersona.name,
      role: 'user',
      narrativeRole: 'persona',
      content: 'Hello',
      segments: [],
      state: null,
      status: 'complete',
      metrics: null,
      metadata: {}
    });
    repos.messages.insert({
      id: '01MSG2',
      chatId: 'chat-a',
      parentId: '01MSG1',
      senderId: eldrin.id,
      senderName: eldrin.name,
      role: 'assistant',
      narrativeRole: 'character',
      content: 'Greetings',
      segments: [],
      state: null,
      status: 'complete',
      metrics: null,
      metadata: {}
    });

    const list = repos.chats.list();
    expect(list.length).toBe(2);
    // chat-b was created after chat-a
    expect(list[0].id).toBe('chat-b');
    expect(list[0].messageCount).toBe(0);
    expect(list[1].id).toBe('chat-a');
    expect(list[1].messageCount).toBe(2);

    // Update chat-a's updated_at
    await new Promise((r) => setTimeout(r, 10));
    repos.chats.update('chat-a', { title: 'Chat A Updated' });

    const updatedList = repos.chats.list();
    expect(updatedList[0].id).toBe('chat-a');
    expect(updatedList[1].id).toBe('chat-b');
  });

  it('sets activeLeafId and cascades deletion to messages', () => {
    const repos = createRepositories(inst.db);
    repos.chats.create({
      id: 'chat-cascade',
      title: 'Cascade Test',
      primaryCharacterId: eldrin.id,
      activePersonaId: defaultPersona.id,
      metadata: {}
    });

    const msg = repos.messages.insert({
      id: '01LEAF',
      chatId: 'chat-cascade',
      parentId: null,
      senderId: eldrin.id,
      senderName: eldrin.name,
      role: 'assistant',
      narrativeRole: 'character',
      content: 'Leaf message',
      segments: [],
      state: null,
      status: 'complete',
      metrics: null,
      metadata: {}
    });

    repos.chats.setActiveLeaf('chat-cascade', msg.id);
    expect(repos.chats.get('chat-cascade')!.activeLeafId).toBe('01LEAF');

    // Remove chat
    repos.chats.remove('chat-cascade');
    expect(repos.chats.get('chat-cascade')).toBeNull();
    expect(repos.messages.get('01LEAF')).toBeNull();
    expect(repos.chats.count()).toBe(0);
  });
});

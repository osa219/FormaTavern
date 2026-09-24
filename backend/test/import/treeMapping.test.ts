import { describe, it, expect, afterEach } from 'bun:test';
import { createTestImportEnv, type TestImportEnv } from './testUtils';

describe('CustomEngine Tree Mapping (X6)', () => {
  let env: TestImportEnv;

  afterEach(async () => {
    if (env) {
      await env.cleanup();
    }
  });

  it('maps sequential messages into linear parent-child chain', async () => {
    env = await createTestImportEnv();

    const char = {
      id: 'char-linear',
      card_title: 'Alice',
      chat_name: 'Alice',
      description: 'Test',
      personality: 'Test',
      scenario: 'Test',
      first_message: 'Hi'
    };

    const chat = {
      id: 'chat-linear',
      character_id: 'char-linear',
      title: 'Linear Chat',
      messages: [
        { id: 'm0', chat_id: 'chat-linear', sequence_index: 0, role: 'assistant', content: 'Msg 0', timestamp: 1000 },
        { id: 'm1', chat_id: 'chat-linear', sequence_index: 1, role: 'user', content: 'Msg 1', timestamp: 2000 },
        { id: 'm2', chat_id: 'chat-linear', sequence_index: 2, role: 'assistant', content: 'Msg 2', timestamp: 3000 }
      ]
    };

    await env.writeCharacter(char);
    await env.writeChat(chat);

    const report = await env.service.sync(env.sourceDir);
    expect(report.appendedMessages).toBe(3);

    const dbChat = env.repos.chats.findByProvenance('custom_engine', 'chat-linear');
    expect(dbChat).not.toBeNull();
    expect(dbChat!.activeLeafId).not.toBeNull();

    // Verify active path from leaf to root
    const path = env.repos.messages.path(dbChat!.activeLeafId!);
    expect(path.length).toBe(3);
    expect(path[0].content).toBe('Msg 0');
    expect(path[0].parentId).toBeNull();

    expect(path[1].content).toBe('Msg 1');
    expect(path[1].parentId).toBe(path[0].id);

    expect(path[2].content).toBe('Msg 2');
    expect(path[2].parentId).toBe(path[1].id);
    expect(path[2].id).toBe(dbChat!.activeLeafId!);
  });

  it('maps alternate_swipes to sibling rows sharing parentId with metadata.imported_swipe', async () => {
    env = await createTestImportEnv();

    const char = {
      id: 'char-swipes',
      card_title: 'Bob',
      chat_name: 'Bob',
      description: 'Test',
      personality: 'Test',
      scenario: 'Test',
      first_message: 'Hi'
    };

    const chat = {
      id: 'chat-swipes',
      character_id: 'char-swipes',
      title: 'Swiped Chat',
      messages: [
        {
          id: 's0',
          chat_id: 'chat-swipes',
          sequence_index: 0,
          role: 'assistant',
          content: 'Greeting primary',
          alternate_swipes: ['Greeting swipe 1', 'Greeting swipe 2'],
          timestamp: 1000
        },
        {
          id: 's1',
          chat_id: 'chat-swipes',
          sequence_index: 1,
          role: 'user',
          content: 'User reply',
          timestamp: 2000
        },
        {
          id: 's2',
          chat_id: 'chat-swipes',
          sequence_index: 2,
          role: 'assistant',
          content: 'Response primary',
          alternate_swipes: ['Response alternate A'],
          timestamp: 3000
        }
      ]
    };

    await env.writeCharacter(char);
    await env.writeChat(chat);

    const report = await env.service.sync(env.sourceDir);
    // 3 primary messages + 2 swipes on m0 + 1 swipe on m2 = 6 messages total
    expect(report.appendedMessages).toBe(6);

    const dbChat = env.repos.chats.findByProvenance('custom_engine', 'chat-swipes');
    expect(dbChat).not.toBeNull();

    // Check s0 and its siblings
    const rootMsgs = env.inst.db
      .query('SELECT * FROM messages WHERE chat_id = ? AND parent_id IS NULL ORDER BY created_at ASC;')
      .all(dbChat!.id) as any[];

    expect(rootMsgs.length).toBe(3);
    expect(rootMsgs[0].content).toBe('Greeting primary');
    expect(JSON.parse(rootMsgs[0].metadata)).toEqual({});

    expect(rootMsgs[1].content).toBe('Greeting swipe 1');
    expect(JSON.parse(rootMsgs[1].metadata).imported_swipe).toBe(true);

    expect(rootMsgs[2].content).toBe('Greeting swipe 2');
    expect(JSON.parse(rootMsgs[2].metadata).imported_swipe).toBe(true);

    // Verify user reply's parent is the primary greeting (rootMsgs[0]), NOT the swipes
    const userMsg = env.inst.db
      .query('SELECT * FROM messages WHERE chat_id = ? AND sequence_index = 1;')
      .get(dbChat!.id) as any;
    expect(userMsg.parent_id).toBe(rootMsgs[0].id);

    // Verify s2 primary and alternate share parentId = userMsg.id
    const s2Siblings = env.inst.db
      .query('SELECT * FROM messages WHERE chat_id = ? AND parent_id = ? ORDER BY created_at ASC;')
      .all(dbChat!.id, userMsg.id) as any[];

    expect(s2Siblings.length).toBe(2);
    expect(s2Siblings[0].content).toBe('Response primary');
    expect(s2Siblings[1].content).toBe('Response alternate A');
    expect(JSON.parse(s2Siblings[1].metadata).imported_swipe).toBe(true);

    // Verify active leaf is the primary response
    expect(dbChat!.activeLeafId).toBe(s2Siblings[0].id);
  });

  it('maps is_main: false message as a sibling without advancing parent', async () => {
    env = await createTestImportEnv();

    const char = {
      id: 'char-main-flag',
      card_title: 'Charlie',
      chat_name: 'Charlie',
      description: 'Test',
      personality: 'Test',
      scenario: 'Test',
      first_message: 'Hi'
    };

    const chat = {
      id: 'chat-main-flag',
      character_id: 'char-main-flag',
      title: 'Branching Chat',
      messages: [
        { id: 'f0', chat_id: 'chat-main-flag', sequence_index: 0, role: 'assistant', content: 'Root message', timestamp: 1000 },
        { id: 'f1_alt', chat_id: 'chat-main-flag', sequence_index: 1, role: 'user', content: 'Branch user turn', is_main: false, timestamp: 2000 },
        { id: 'f1_main', chat_id: 'chat-main-flag', sequence_index: 1, role: 'user', content: 'Main user turn', is_main: true, timestamp: 2001 },
        { id: 'f2', chat_id: 'chat-main-flag', sequence_index: 2, role: 'assistant', content: 'Final response', timestamp: 3000 }
      ]
    };

    await env.writeCharacter(char);
    await env.writeChat(chat);

    const report = await env.service.sync(env.sourceDir);
    expect(report.appendedMessages).toBe(4);

    const dbChat = env.repos.chats.findByProvenance('custom_engine', 'chat-main-flag');
    expect(dbChat).not.toBeNull();

    const path = env.repos.messages.path(dbChat!.activeLeafId!);
    expect(path.length).toBe(3);
    expect(path[0].content).toBe('Root message');
    expect(path[1].content).toBe('Main user turn');
    expect(path[2].content).toBe('Final response');
  });

  it('handles deep chains (50+ turns) maintaining correct depth and lineage', async () => {
    env = await createTestImportEnv();

    const char = {
      id: 'char-deep',
      card_title: 'Deep Talker',
      chat_name: 'Deep',
      description: 'Long conversations',
      personality: 'Chatty',
      scenario: 'Marathon',
      first_message: 'Start'
    };

    const turnCount = 50;
    const messages = Array.from({ length: turnCount }, (_, i) => ({
      id: `deep_${i}`,
      chat_id: 'chat-deep',
      sequence_index: i,
      role: (i % 2 === 0 ? 'assistant' : 'user') as 'assistant' | 'user',
      content: `Message ${i}`,
      timestamp: 1000 + i * 100
    }));

    const chat = {
      id: 'chat-deep',
      character_id: 'char-deep',
      title: '50-turn Chat',
      messages
    };

    await env.writeCharacter(char);
    await env.writeChat(chat);

    const report = await env.service.sync(env.sourceDir);
    expect(report.appendedMessages).toBe(turnCount);

    const dbChat = env.repos.chats.findByProvenance('custom_engine', 'chat-deep');
    expect(dbChat).not.toBeNull();

    const path = env.repos.messages.path(dbChat!.activeLeafId!);
    expect(path.length).toBe(turnCount);
    for (let i = 0; i < turnCount; i++) {
      expect(path[i].content).toBe(`Message ${i}`);
      expect(path[i].sequenceIndex).toBe(i);
    }
  });
});

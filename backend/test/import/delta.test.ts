import { describe, it, expect, afterEach } from 'bun:test';
import { createTestImportEnv, type TestImportEnv } from './testUtils';

describe('CustomEngine Delta Sync (X1, X7)', () => {
  let env: TestImportEnv;

  afterEach(async () => {
    if (env) {
      await env.cleanup();
    }
  });

  it('appends only new messages with sequence_index > max_existing and advances active_leaf_id', async () => {
    env = await createTestImportEnv();

    const char = {
      id: 'char-delta',
      name: 'Delta Bot',
      description: 'Initial description',
      personality: 'Helpful',
      scenario: 'Workspace',
      first_message: 'Ready'
    };

    const initialChat = {
      id: 'chat-delta',
      character_id: 'char-delta',
      title: 'Delta Conversation',
      messages: [
        { id: 'msg_0', chat_id: 'chat-delta', sequence_index: 0, role: 'assistant', content: 'Turn 0', timestamp: 1000 },
        { id: 'msg_1', chat_id: 'chat-delta', sequence_index: 1, role: 'user', content: 'Turn 1', timestamp: 2000 }
      ]
    };

    await env.writeCharacter(char);
    await env.writeChat(initialChat);

    // Initial sync
    const report1 = await env.service.sync(env.sourceDir);
    expect(report1.insertedChars).toBe(1);
    expect(report1.insertedChats).toBe(1);
    expect(report1.appendedMessages).toBe(2);

    const dbChat1 = env.repos.chats.findByProvenance('custom_engine', 'chat-delta');
    expect(dbChat1).not.toBeNull();
    const initialLeafId = dbChat1!.activeLeafId;
    expect(initialLeafId).not.toBeNull();

    // Verify existing message rows
    const msg0 = env.repos.messages.get(initialLeafId!);
    expect(msg0!.content).toBe('Turn 1');

    // Delta sync: add Turn 2 to chat JSON
    const deltaChat = {
      ...initialChat,
      messages: [
        ...initialChat.messages,
        { id: 'msg_2', chat_id: 'chat-delta', sequence_index: 2, role: 'assistant', content: 'Turn 2 (Appended)', timestamp: 3000 }
      ]
    };
    await env.writeChat(deltaChat);

    const report2 = await env.service.sync(env.sourceDir);
    expect(report2.scanned).toBe(2); // 1 character + 1 chat
    expect(report2.skipped).toBe(1); // character unchanged
    expect(report2.insertedChats).toBe(0);
    expect(report2.appendedMessages).toBe(1); // only 1 message added!

    const dbChat2 = env.repos.chats.findByProvenance('custom_engine', 'chat-delta');
    expect(dbChat2!.activeLeafId).not.toBe(initialLeafId);

    // Verify new message is child of previous leaf
    const newLeaf = env.repos.messages.get(dbChat2!.activeLeafId!);
    expect(newLeaf!.content).toBe('Turn 2 (Appended)');
    expect(newLeaf!.parentId).toBe(initialLeafId);

    // Verify turn 0 and turn 1 were untouched
    const path = env.repos.messages.path(dbChat2!.activeLeafId!);
    expect(path.length).toBe(3);
    expect(path[0].content).toBe('Turn 0');
    expect(path[1].content).toBe('Turn 1');
    expect(path[2].content).toBe('Turn 2 (Appended)');
  });

  it('never overwrites user edits made to historical messages in FormaTavern (X7)', async () => {
    env = await createTestImportEnv();

    const char = {
      id: 'char-user-edit',
      name: 'Guard Bot',
      description: 'Guards against overwrites',
      personality: 'Strict',
      scenario: 'Fortress',
      first_message: 'Halt'
    };

    const chat = {
      id: 'chat-user-edit',
      character_id: 'char-user-edit',
      title: 'Protected Chat',
      messages: [
        { id: 'u0', chat_id: 'chat-user-edit', sequence_index: 0, role: 'assistant', content: 'Original bot message', timestamp: 1000 },
        { id: 'u1', chat_id: 'chat-user-edit', sequence_index: 1, role: 'user', content: 'Original user message', timestamp: 2000 }
      ]
    };

    await env.writeCharacter(char);
    await env.writeChat(chat);

    await env.service.sync(env.sourceDir);

    const dbChat = env.repos.chats.findByProvenance('custom_engine', 'chat-user-edit');
    expect(dbChat).not.toBeNull();

    // User in FormaTavern manually edits Turn 0
    env.inst.db.run(
      "UPDATE messages SET content = 'Manually edited by user in UI' WHERE chat_id = ? AND sequence_index = 0;",
      [dbChat!.id]
    );

    // New message arrives from source in chat JSON
    const updatedChat = {
      ...chat,
      messages: [
        ...chat.messages,
        { id: 'u2', chat_id: 'chat-user-edit', sequence_index: 2, role: 'assistant', content: 'New source turn', timestamp: 3000 }
      ]
    };
    await env.writeChat(updatedChat);

    const report = await env.service.sync(env.sourceDir);
    expect(report.appendedMessages).toBe(1);

    // Verify user-edited message content was PRESERVED
    const turn0 = env.inst.db
      .query('SELECT content FROM messages WHERE chat_id = ? AND sequence_index = 0;')
      .get(dbChat!.id) as { content: string };
    expect(turn0.content).toBe('Manually edited by user in UI');
  });
});

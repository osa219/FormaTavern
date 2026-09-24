import { describe, it, expect, afterEach } from 'bun:test';
import { createTestImportEnv, type TestImportEnv } from './testUtils';

describe('CustomEngine Chat Import', () => {
  let env: TestImportEnv;

  afterEach(async () => {
    if (env) {
      await env.cleanup();
    }
  });

  it('quarantines orphan chat when character is missing', async () => {
    env = await createTestImportEnv();

    const orphanChat = {
      id: 'chat-orphan-1',
      character_id: 'non-existent-uuid',
      title: 'Chat with Ghost',
      messages: [
        {
          id: 'chat-orphan-1_0',
          chat_id: 'chat-orphan-1',
          sequence_index: 0,
          role: 'assistant',
          content: 'I am a ghost',
          timestamp: 1000
        }
      ]
    };

    await env.writeChat(orphanChat);

    const report = await env.service.sync(env.sourceDir);
    expect(report.insertedChats).toBe(0);
    expect(report.quarantinedChats.length).toBe(1);
    expect(report.quarantinedChats[0]).toEqual({
      chatId: 'chat-orphan-1',
      characterOriginId: 'non-existent-uuid',
      reason: 'missing_character'
    });

    // Verify zero rows in chats table
    const dbChat = env.repos.chats.findByProvenance('custom_engine', 'chat-orphan-1');
    expect(dbChat).toBeNull();
  });

  it('handles null updated_at cleanly', async () => {
    env = await createTestImportEnv();

    const char = {
      id: 'char-null-time',
      name: 'Chronos',
      description: 'Master of time',
      personality: 'Patient',
      scenario: 'Clock tower',
      first_message: 'Tick tock',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: null
    };

    const chat = {
      id: 'chat-null-time',
      character_id: 'char-null-time',
      title: 'Timeless Chat',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: null,
      messages: [
        {
          id: 'chat-null-time_0',
          chat_id: 'chat-null-time',
          sequence_index: 0,
          role: 'assistant',
          content: 'Time is an illusion',
          timestamp: 1700000000000
        }
      ]
    };

    await env.writeCharacter(char);
    await env.writeChat(chat);

    const report = await env.service.sync(env.sourceDir);
    expect(report.insertedChars).toBe(1);
    expect(report.insertedChats).toBe(1);

    const dbChat = env.repos.chats.findByProvenance('custom_engine', 'chat-null-time');
    expect(dbChat).not.toBeNull();
    expect(typeof dbChat!.updatedAt).toBe('number');
    expect(dbChat!.updatedAt).toBeGreaterThan(0);
  });

  it('preserves non-zero active_greeting_index', async () => {
    env = await createTestImportEnv();

    const char = {
      id: 'char-multi-greeting',
      name: 'Guide',
      description: 'Multiple paths',
      personality: 'Helpful',
      scenario: 'Crossroads',
      first_message: 'Default',
      alternate_greetings: ['Path A', 'Path B', 'Path C']
    };

    const chat = {
      id: 'chat-greeting-idx-2',
      character_id: 'char-multi-greeting',
      title: 'Branching Adventure',
      active_greeting_index: 2,
      messages: [
        {
          id: 'chat-greeting-idx-2_0',
          chat_id: 'chat-greeting-idx-2',
          sequence_index: 0,
          role: 'assistant',
          content: 'Path B chosen',
          timestamp: 1000
        }
      ]
    };

    await env.writeCharacter(char);
    await env.writeChat(chat);

    const report = await env.service.sync(env.sourceDir);
    expect(report.insertedChats).toBe(1);

    const dbChat = env.repos.chats.findByProvenance('custom_engine', 'chat-greeting-idx-2');
    expect(dbChat).not.toBeNull();
    expect(dbChat!.activeGreetingIndex).toBe(2);
  });

  it('preserves user_persona snapshot and reuses single persona across multiple chats (no fan-out, X5)', async () => {
    env = await createTestImportEnv();

    const char = {
      id: 'char-persona-test',
      name: 'Companion',
      description: 'A loyal companion',
      personality: 'Devoted',
      scenario: 'Campfire',
      first_message: 'Rest well.'
    };

    const userPersona = {
      name: 'Traveler Joe',
      description: 'A weary wanderer from the northern hills',
      avatar: null,
      pronouns: 'he/him'
    };

    const chat1 = {
      id: 'chat-p-1',
      character_id: 'char-persona-test',
      title: 'First Chat with Joe',
      user_persona: userPersona,
      messages: [
        {
          id: 'chat-p-1_0',
          chat_id: 'chat-p-1',
          sequence_index: 0,
          role: 'user',
          sender_name: 'Traveler Joe',
          content: 'Hello friend.',
          timestamp: 1000
        }
      ]
    };

    const chat2 = {
      id: 'chat-p-2',
      character_id: 'char-persona-test',
      title: 'Second Chat with Joe',
      user_persona: userPersona,
      messages: [
        {
          id: 'chat-p-2_0',
          chat_id: 'chat-p-2',
          sequence_index: 0,
          role: 'user',
          sender_name: 'Traveler Joe',
          content: 'Back again.',
          timestamp: 2000
        }
      ]
    };

    await env.writeCharacter(char);
    await env.writeChat(chat1);
    await env.writeChat(chat2);

    const report = await env.service.sync(env.sourceDir);
    expect(report.insertedChats).toBe(2);

    const dbChat1 = env.repos.chats.findByProvenance('custom_engine', 'chat-p-1');
    const dbChat2 = env.repos.chats.findByProvenance('custom_engine', 'chat-p-2');

    expect(dbChat1).not.toBeNull();
    expect(dbChat2).not.toBeNull();

    // Verify snapshot stored verbatim
    expect(dbChat1!.personaSnapshot).toBe(JSON.stringify(userPersona));
    expect(dbChat2!.personaSnapshot).toBe(JSON.stringify(userPersona));

    // Verify both chats reference the EXACT same persona ID (no fan-out!)
    expect(dbChat1!.activePersonaId).toBe(dbChat2!.activePersonaId);

    // Verify only ONE persona was created with this name in the personas table
    const personas = env.repos.personas.list();
    const travelers = personas.filter((p) => p.name === 'Traveler Joe');
    expect(travelers.length).toBe(1);
    expect(travelers[0].id).toBe(dbChat1!.activePersonaId);
  });
});

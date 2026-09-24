import { describe, it, expect, afterEach } from 'bun:test';
import { DEFAULT_CHARACTER_THEME } from '@formatavern/shared';
import { createTestImportEnv, type TestImportEnv } from './testUtils';
import { importJsonlChat, exportJsonlChat } from '../../src/import/jsonl/service';

describe('SillyTavern JSONL Chat Import & Export (Slice D)', () => {
  let env: TestImportEnv;

  afterEach(async () => {
    if (env) {
      await env.cleanup();
    }
  });

  it('imports SillyTavern JSONL with metadata header and swipe alternates', async () => {
    env = await createTestImportEnv();

    const char = env.repos.characters.create({
      name: 'Elder Sage',
      description: 'A wise scholar',
      personality: 'Wise, patient',
      scenario: 'Library',
      firstMessage: 'Greetings.',
      style: DEFAULT_CHARACTER_THEME
    });

    const lines = [
      JSON.stringify({
        user_name: 'Wanderer',
        character_name: 'Elder Sage',
        create_date: 1700000000000,
        chat_metadata: { imported_from: 'sillytavern' }
      }),
      JSON.stringify({
        name: 'Wanderer',
        is_user: true,
        is_system: false,
        send_date: 1700000001000,
        mes: 'Tell me about the ancient ruins.'
      }),
      JSON.stringify({
        name: 'Elder Sage',
        is_user: false,
        is_system: false,
        send_date: 1700000002000,
        mes: 'The ruins date back millennia.',
        swipes: ['The ruins date back millennia.', 'Few who enter ever return.'],
        swipe_id: 0
      }),
      JSON.stringify({
        name: 'System',
        is_user: false,
        is_system: true,
        send_date: 1700000003000,
        mes: 'Thunder rumbles in the distance.'
      })
    ];

    const jsonlBytes = Buffer.from(lines.join('\n'), 'utf8');
    const chatView = await importJsonlChat(jsonlBytes, char.id, env.repos);

    expect(chatView.primaryCharacterId).toBe(char.id);
    expect(chatView.title).toBe('Chat with Elder Sage');

    // Verify persona snapshot
    const dbChat = env.repos.chats.get(chatView.id);
    expect(dbChat).not.toBeNull();
    expect(dbChat!.personaSnapshot).toBe(JSON.stringify({ name: 'Wanderer' }));

    // Verify messages in chat
    const allMsgs = env.repos.messages.listInChat(chatView.id);
    // 1 user + 1 assistant main + 1 assistant swipe + 1 system = 4 messages
    expect(allMsgs.length).toBe(4);

    const swipeMsg = allMsgs.find((m) => m.content === 'Few who enter ever return.');
    expect(swipeMsg).toBeDefined();
    expect((swipeMsg!.metadata as any).imported_swipe).toBe(true);

    const systemMsg = allMsgs.find((m) => m.content === 'Thunder rumbles in the distance.');
    expect(systemMsg).toBeDefined();
    expect((systemMsg!.metadata as any).system).toBe(true);

    // Export to JSONL
    const exported = await exportJsonlChat(chatView.id, env.repos);
    expect(exported.contentType).toBe('application/octet-stream');
    expect(exported.filename).toMatch(/^chat-.*\.jsonl$/);

    const exportedLines = exported.data.trim().split('\n').map((l) => JSON.parse(l));
    expect(exportedLines.length).toBe(4); // 1 header + 3 turns on active branch

    // Verify header
    expect(exportedLines[0].user_name).toBe('Wanderer');
    expect(exportedLines[0].character_name).toBe('Elder Sage');

    // Verify turn 1: user
    expect(exportedLines[1].is_user).toBe(true);
    expect(exportedLines[1].mes).toBe('Tell me about the ancient ruins.');

    // Verify turn 2: assistant with swipes
    expect(exportedLines[2].is_user).toBe(false);
    expect(exportedLines[2].mes).toBe('The ruins date back millennia.');
    expect(exportedLines[2].swipes).toContain('The ruins date back millennia.');
    expect(exportedLines[2].swipes).toContain('Few who enter ever return.');
    expect(exportedLines[2].swipe_id).toBe(0);

    // Verify turn 3: system
    expect(exportedLines[3].is_system).toBe(true);
    expect(exportedLines[3].mes).toBe('Thunder rumbles in the distance.');
  });

  it('round-trips JSONL export back into database with message parity', async () => {
    env = await createTestImportEnv();

    const char = env.repos.characters.create({
      name: 'Scholar',
      description: 'Researcher',
      personality: 'Curious',
      scenario: 'Lab',
      firstMessage: 'Hello.',
      style: DEFAULT_CHARACTER_THEME
    });

    const lines = [
      JSON.stringify({ user_name: 'Alice', character_name: 'Scholar' }),
      JSON.stringify({ name: 'Alice', is_user: true, mes: 'Step 1' }),
      JSON.stringify({ name: 'Scholar', is_user: false, mes: 'Response 1' }),
      JSON.stringify({ name: 'Alice', is_user: true, mes: 'Step 2' }),
      JSON.stringify({ name: 'Scholar', is_user: false, mes: 'Response 2' })
    ];

    const initialBytes = Buffer.from(lines.join('\n'), 'utf8');
    const chat1 = await importJsonlChat(initialBytes, char.id, env.repos);

    const exported = await exportJsonlChat(chat1.id, env.repos);
    const reimported = await importJsonlChat(Buffer.from(exported.data, 'utf8'), char.id, env.repos);

    const branch1 = env.repos.messages.path(chat1.activeLeafId!);
    const branch2 = env.repos.messages.path(reimported.activeLeafId!);

    expect(branch2.length).toBe(branch1.length);
    for (let i = 0; i < branch1.length; i++) {
      expect(branch2[i].content).toBe(branch1[i].content);
      expect(branch2[i].role).toBe(branch1[i].role);
    }
  });
});

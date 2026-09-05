import { describe, it, expect } from 'bun:test';
import type { ChatStreamEvent, MessageWithTree } from '@formatavern/shared';
import { setupTestApp, readSseEvents } from './helpers';

describe('routes/messages send & pagination', () => {
  it('full SSE send flow: start -> tokens -> usage -> done with status complete', async () => {
    const { app, repos } = setupTestApp();

    const chatRes = await app.handle(
      new Request('http://127.0.0.1/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: 'eldrin-the-mage' })
      })
    );
    const chat = (await chatRes.json()) as any;

    const sendRes = await app.handle(
      new Request(`http://127.0.0.1/api/chats/${chat.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Greetings, Eldrin!' })
      })
    );

    expect(sendRes.status).toBe(200);
    const events = await readSseEvents<ChatStreamEvent>(sendRes);

    expect(events.length).toBeGreaterThan(3);
    expect(events[0].type).toBe('start');
    if (events[0].type === 'start') {
      expect(events[0].chatId).toBe(chat.id);
      expect(events[0].messageId).toBeDefined();
    }

    const tokenEvents = events.filter((e) => e.type === 'token');
    expect(tokenEvents.length).toBeGreaterThan(0);

    const usageEvents = events.filter((e) => e.type === 'usage');
    expect(usageEvents.length).toBe(1);

    const lastEvent = events[events.length - 1];
    expect(lastEvent.type).toBe('done');
    if (lastEvent.type === 'done') {
      expect(lastEvent.message.status).toBe('complete');
      expect(lastEvent.message.state).toBeDefined();
      expect(lastEvent.message.metadata.parse?.adherent).toBe(true);
    }
  });

  it('generate: false returns 201, no assistant row, and sets active leaf to user row', async () => {
    const { app, repos } = setupTestApp();

    const chat = repos.chats.create({
      id: 'c-no-gen',
      title: 'No Gen',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default',
      metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
    });

    const res = await app.handle(
      new Request(`http://127.0.0.1/api/chats/${chat.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Just recording user note',
          generate: false
        })
      })
    );

    expect(res.status).toBe(201);
    const json = (await res.json()) as any;
    expect(json.message.role).toBe('user');
    expect(json.message.content).toBe('Just recording user note');

    const updatedChat = repos.chats.get(chat.id);
    expect(updatedChat!.activeLeafId).toBe(json.message.id);
    expect(repos.messages.countInChat(chat.id)).toBe(1);
  });

  it('directorNote only creates blank user turn and injects [Continue the scene.]', async () => {
    const { app, repos, mockProvider } = setupTestApp();

    const chat = repos.chats.create({
      id: 'c-dir-note',
      title: 'Director Note Chat',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default',
      metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
    });

    const res = await app.handle(
      new Request(`http://127.0.0.1/api/chats/${chat.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directorNote: 'Make it tense'
        })
      })
    );

    expect(res.status).toBe(200);
    await readSseEvents(res);

    expect(mockProvider.calls.length).toBe(1);
    const history = mockProvider.calls[0].history;
    const lastUserTurn = history[history.length - 1];
    expect(lastUserTurn.content).toContain('[Continue the scene.]');
    expect(lastUserTurn.content).toContain("[Director's note for this turn: Make it tense]");
  });

  it('validates NPC message requires senderName (400)', async () => {
    const { app, repos } = setupTestApp();

    const chat = repos.chats.create({
      id: 'c-npc-val',
      title: 'NPC Validation',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default',
      metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
    });

    const res = await app.handle(
      new Request(`http://127.0.0.1/api/chats/${chat.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          narrativeRole: 'npc',
          message: 'Halt!'
        })
      })
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as any;
    expect(json.error.code).toBe('validation_failed');
  });

  it('validates parentId must belong to this chat (400)', async () => {
    const { app, repos } = setupTestApp();

    const chat1 = repos.chats.create({
      id: 'c-p1',
      title: 'Chat 1',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default',
      metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
    });
    const chat2 = repos.chats.create({
      id: 'c-p2',
      title: 'Chat 2',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default',
      metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
    });

    const msgInChat2 = repos.messages.insert({
      id: 'm-c2',
      chatId: chat2.id,
      parentId: null,
      role: 'user',
      narrativeRole: 'persona',
      content: 'Hello in chat 2',
      status: 'complete'
    });

    const res = await app.handle(
      new Request(`http://127.0.0.1/api/chats/${chat1.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Hello in chat 1',
          parentId: msgInChat2.id
        })
      })
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as any;
    expect(json.error.code).toBe('invalid_parent');
  });

  it('rejects concurrent sends to the same chat with 409', async () => {
    const { app, repos } = setupTestApp({ mockIntervalMs: 20 });

    const chat = repos.chats.create({
      id: 'c-concurrent',
      title: 'Concurrent Chat',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default',
      metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
    });

    // Fire two handle calls without awaiting the first
    const send1Promise = app.handle(
      new Request(`http://127.0.0.1/api/chats/${chat.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'First' })
      })
    );

    const send2Promise = app.handle(
      new Request(`http://127.0.0.1/api/chats/${chat.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Second' })
      })
    );

    const [res1, res2] = await Promise.all([send1Promise, send2Promise]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(409);
    const json2 = (await res2.json()) as any;
    expect(json2.error.code).toBe('generation_in_progress');

    await readSseEvents(res1);
  });

  it('exceeding prompt budget returns 413, leaves user row, and creates no assistant row', async () => {
    const { app, repos } = setupTestApp();

    // Set budget to small values
    await app.handle(
      new Request('http://127.0.0.1/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generation: { contextLength: 1024, maxTokens: 1000 }
        })
      })
    );

    const chat = repos.chats.create({
      id: 'c-budget',
      title: 'Budget Chat',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default',
      metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
    });

    const res = await app.handle(
      new Request(`http://127.0.0.1/api/chats/${chat.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Trigger turn' })
      })
    );

    expect(res.status).toBe(413);
    const json = (await res.json()) as any;
    expect(json.error.code).toBe('prompt_budget_exceeded');

    // User row was inserted, no assistant row was created
    const count = repos.messages.countInChat(chat.id);
    expect(count).toBe(1);
    const leaf = repos.messages.get(repos.chats.get(chat.id)!.activeLeafId!);
    expect(leaf?.role).toBe('user');
  });

  it('paginates 7-message branch with before cursor and validates off-branch cursor', async () => {
    const { app, repos } = setupTestApp();

    const chat = repos.chats.create({
      id: 'c-pag',
      title: 'Pagination Chat',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default',
      metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
    });

    // Build 7-message branch: m1 -> m2 -> ... -> m7
    let lastId: string | null = null;
    const msgIds: string[] = [];
    for (let i = 1; i <= 7; i++) {
      const row = repos.messages.insert({
        id: `01PAG00000000000000000000${i}`,
        chatId: chat.id,
        parentId: lastId,
        role: i % 2 === 1 ? 'user' : 'assistant',
        narrativeRole: i % 2 === 1 ? 'persona' : 'character',
        content: `Msg ${i}`,
        status: 'complete'
      });
      lastId = row.id;
      msgIds.push(row.id);
    }
    repos.chats.setActiveLeaf(chat.id, lastId);

    // 1. First page: limit=3 (newest 3: m5, m6, m7 returned ascending)
    const p1Res = await app.handle(
      new Request(`http://127.0.0.1/api/chats/${chat.id}/messages?limit=3`)
    );
    expect(p1Res.status).toBe(200);
    const p1 = (await p1Res.json()) as MessageWithTree[];
    expect(p1.map((m) => m.id)).toEqual([msgIds[4], msgIds[5], msgIds[6]]);

    // 2. Second page: before=m5, limit=3 (m2, m3, m4 returned ascending)
    const p2Res = await app.handle(
      new Request(`http://127.0.0.1/api/chats/${chat.id}/messages?limit=3&before=${msgIds[4]}`)
    );
    expect(p2Res.status).toBe(200);
    const p2 = (await p2Res.json()) as MessageWithTree[];
    expect(p2.map((m) => m.id)).toEqual([msgIds[1], msgIds[2], msgIds[3]]);

    // 3. Invalid cursor off-branch -> 400
    const offBranchRes = await app.handle(
      new Request(`http://127.0.0.1/api/chats/${chat.id}/messages?before=non-existent-cursor`)
    );
    expect(offBranchRes.status).toBe(400);
    const offJson = (await offBranchRes.json()) as any;
    expect(offJson.error.code).toBe('invalid_parent');
  });

  it('formats raw SSE byte frames strictly as data: <JSON>\\n\\n with no event: or id: lines', async () => {
    const { app, repos } = setupTestApp();

    const chat = repos.chats.create({
      id: 'c-frames',
      title: 'Frame Bytes Test',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default',
      metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
    });

    const res = await app.handle(
      new Request(`http://127.0.0.1/api/chats/${chat.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello' })
      })
    );

    const rawText = await res.text();
    expect(rawText).toMatch(/^(data: .+\n\n)+$/);
    expect(rawText).not.toContain('event:');
    expect(rawText).not.toContain('id:');
  });

  it('gates /api/chat/test-stream with 404 when nodeEnv is production', async () => {
    const { app } = setupTestApp({ nodeEnv: 'production' });

    const res = await app.handle(
      new Request('http://127.0.0.1/api/chat/test-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
    );

    expect(res.status).toBe(404);
  });
});

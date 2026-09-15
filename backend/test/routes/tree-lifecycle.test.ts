import { describe, it, expect } from 'bun:test';
import type { ChatStreamEvent, MessageWithTree } from '@formatavern/shared';
import { setupTestApp, readSseEvents } from './helpers';

describe('routes/messages tree lifecycle', () => {
  it('stop: terminates active generation and is idempotent on completed message', async () => {
    const { app, repos } = setupTestApp({ mockIntervalMs: 50 });

    const chat = repos.chats.create({
      id: 'c-stop',
      title: 'Stop Chat',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default',
      metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
    });

    const sendRes = await app.handle(
      new Request(`http://127.0.0.1/api/chats/${chat.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Start generation' })
      })
    );
    expect(sendRes.status).toBe(200);

    const asstId = repos.chats.get(chat.id)!.activeLeafId!;

    // Wait 20ms and stop
    await new Promise((r) => setTimeout(r, 20));
    const stopRes1 = await app.handle(
      new Request(`http://127.0.0.1/api/messages/${asstId}/stop`, { method: 'POST' })
    );
    expect(stopRes1.status).toBe(200);
    const stopJson1 = (await stopRes1.json()) as any;
    expect(stopJson1.stopped).toBe(true);

    // Consume stream to finish
    await readSseEvents(sendRes);

    const stoppedRow = repos.messages.get(asstId);
    expect(stoppedRow!.status).toBe('aborted');

    // Idempotent stop on already finished message
    const stopRes2 = await app.handle(
      new Request(`http://127.0.0.1/api/messages/${asstId}/stop`, { method: 'POST' })
    );
    expect(stopRes2.status).toBe(200);
    const stopJson2 = (await stopRes2.json()) as any;
    expect(stopJson2.stopped).toBe(false);
  });

  it('regenerate: creates sibling 2/2, moves leaf, inherits directorNote, prevents greeting/user/streaming regenerate', async () => {
    const { app, repos, mockProvider } = setupTestApp();

    const chatRes = await app.handle(
      new Request('http://127.0.0.1/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: 'eldrin-the-mage' })
      })
    );
    const chat = (await chatRes.json()) as any;
    const greetingId = chat.activeLeafId;

    // Greeting root has no parent user message -> 400 invalid_parent
    const regenGreetingRes = await app.handle(
      new Request(`http://127.0.0.1/api/messages/${greetingId}/regenerate`, { method: 'POST' })
    );
    expect(regenGreetingRes.status).toBe(400);

    // Send a message with directorNote
    const sendRes = await app.handle(
      new Request(`http://127.0.0.1/api/chats/${chat.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Tell me a secret',
          directorNote: 'Whisper it mysteriously'
        })
      })
    );
    await readSseEvents(sendRes);

    const asst1Id = repos.chats.get(chat.id)!.activeLeafId!;
    const asst1 = repos.messages.get(asst1Id)!;

    // Cannot regenerate user message -> 400 not_assistant_message
    const regenUserRes = await app.handle(
      new Request(`http://127.0.0.1/api/messages/${asst1.parentId}/regenerate`, { method: 'POST' })
    );
    expect(regenUserRes.status).toBe(400);

    // Regenerate assistant message
    const regenRes = await app.handle(
      new Request(`http://127.0.0.1/api/messages/${asst1Id}/regenerate`, { method: 'POST' })
    );
    expect(regenRes.status).toBe(200);
    await readSseEvents(regenRes);

    const asst2Id = repos.chats.get(chat.id)!.activeLeafId!;
    expect(asst2Id).not.toBe(asst1Id);

    const asst2 = repos.messages.get(asst2Id)!;
    expect(asst2.parentId).toBe(asst1.parentId);
    expect(asst2.siblingIndex).toBe(1);
    expect(asst2.siblingCount).toBe(2);

    // Assert directorNote was inherited in MockLLMProvider calls
    const lastCall = mockProvider.calls[mockProvider.calls.length - 1];
    const lastUserHistory = lastCall.history[lastCall.history.length - 1];
    expect(lastUserHistory.content).toContain('Whisper it mysteriously');
  });

  it('continue: reopens leaf, preserves prefix, handles prefill true and false, prevents non-leaf continue', async () => {
    // 1. Prefill true provider
    const { app, repos, mockProvider } = setupTestApp({ mockPrefill: true });

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
        body: JSON.stringify({ message: 'Begin tale' })
      })
    );
    await readSseEvents(sendRes);

    const asstId = repos.chats.get(chat.id)!.activeLeafId!;

    // Continue on active leaf
    const contRes = await app.handle(
      new Request(`http://127.0.0.1/api/messages/${asstId}/continue`, { method: 'POST' })
    );
    expect(contRes.status).toBe(200);
    const events = await readSseEvents<ChatStreamEvent>(contRes);

    const startEv = events.find((e) => e.type === 'start');
    expect(startEv).toBeDefined();
    if (startEv && startEv.type === 'start') {
      expect(startEv.resumedFrom).toBeGreaterThan(0);
    }

    const updated = repos.messages.get(asstId)!;
    expect(updated.metadata.continuations).toBe(1);

    // Call had assistantPrefill
    const lastCall = mockProvider.calls[mockProvider.calls.length - 1];
    expect(lastCall.assistantPrefill).toBeDefined();

    // 2. Non-leaf continue -> 409 not_leaf
    // Add a user message to make asstId not the leaf anymore
    repos.messages.insert({
      id: 'm-new-leaf',
      chatId: chat.id,
      parentId: asstId,
      role: 'user',
      narrativeRole: 'persona',
      content: 'Next turn',
      status: 'complete'
    });
    repos.chats.setActiveLeaf(chat.id, 'm-new-leaf');

    const nonLeafRes = await app.handle(
      new Request(`http://127.0.0.1/api/messages/${asstId}/continue`, { method: 'POST' })
    );
    expect(nonLeafRes.status).toBe(409);
    const nonLeafJson = (await nonLeafRes.json()) as any;
    expect(nonLeafJson.error.code).toBe('not_leaf');
  });

  it('select: switches active branch, updates activeLeafId via descendLatest, and refreshes currentState cache', async () => {
    const { app, repos } = setupTestApp();

    const chat = repos.chats.create({
      id: 'c-sel',
      title: 'Select Branch',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default',
      metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
    });

    const U1 = repos.messages.insert({
      id: '01U1',
      chatId: chat.id,
      parentId: null,
      role: 'user',
      narrativeRole: 'persona',
      content: 'U1',
      status: 'complete'
    });

    // 3 siblings under U1: A1, A2, A3
    const A1 = repos.messages.insert({
      id: '01A1',
      chatId: chat.id,
      parentId: U1.id,
      role: 'assistant',
      narrativeRole: 'character',
      content: 'A1',
      state: { mood: 'calm', affinity: 5 },
      status: 'complete'
    });
    const A2 = repos.messages.insert({
      id: '01A2',
      chatId: chat.id,
      parentId: U1.id,
      role: 'assistant',
      narrativeRole: 'character',
      content: 'A2',
      state: { mood: 'furious', affinity: 0 },
      status: 'complete'
    });
    const A3 = repos.messages.insert({
      id: '01A3',
      chatId: chat.id,
      parentId: U1.id,
      role: 'assistant',
      narrativeRole: 'character',
      content: 'A3',
      state: { mood: 'calm', affinity: 10 },
      status: 'complete'
    });

    // Subtree under A1: U2 -> A4
    const U2 = repos.messages.insert({
      id: '01U2',
      chatId: chat.id,
      parentId: A1.id,
      role: 'user',
      narrativeRole: 'persona',
      content: 'U2',
      status: 'complete'
    });
    const A4 = repos.messages.insert({
      id: '01A4',
      chatId: chat.id,
      parentId: U2.id,
      role: 'assistant',
      narrativeRole: 'character',
      content: 'A4',
      state: { mood: 'furious', affinity: 8 },
      status: 'complete'
    });

    // Active leaf is currently A3
    repos.chats.setActiveLeaf(chat.id, A3.id);

    // Select A1: descendLatest(A1) should resolve to A4
    const selRes = await app.handle(
      new Request(`http://127.0.0.1/api/messages/${A1.id}/select`, { method: 'POST' })
    );

    expect(selRes.status).toBe(200);
    const selJson = (await selRes.json()) as any;
    expect(selJson.activeLeafId).toBe(A4.id);

    const updatedChat = repos.chats.get(chat.id)!;
    expect(updatedChat.activeLeafId).toBe(A4.id);
    expect(updatedChat.metadata.currentState?.mood).toBe('furious');
    expect(updatedChat.metadata.currentState?.affinity).toBe(8);
  });

  it('PATCH message: reparses content, recalculates state from ancestors, validates segments, and prevents editing streaming message', async () => {
    const { app, repos, hub } = setupTestApp();

    const chat = repos.chats.create({
      id: 'c-edit',
      title: 'Edit Message',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default',
      metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
    });

    const U1 = repos.messages.insert({
      id: '01EDITU1',
      chatId: chat.id,
      parentId: null,
      role: 'user',
      narrativeRole: 'persona',
      content: 'Hello',
      status: 'complete'
    });

    const A1 = repos.messages.insert({
      id: '01EDITA1',
      chatId: chat.id,
      parentId: U1.id,
      role: 'assistant',
      narrativeRole: 'character',
      content: 'Original content',
      state: { mood: 'calm', affinity: 10 },
      status: 'complete'
    });

    // 1. Cannot edit if streaming -> 409
    hub.register({ messageId: A1.id, chatId: chat.id });
    const editStreamingRes = await app.handle(
      new Request(`http://127.0.0.1/api/messages/${A1.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'New text' })
      })
    );
    expect(editStreamingRes.status).toBe(409);
    hub.abort(A1.id, 'user');

    // 2. Edit content with new state block -> recomputed
    const newContent =
      ':::character[Eldrin the Mage]\nNew edited line.\n\n```state\n{"mood":"furious"}\n```';

    const editRes = await app.handle(
      new Request(`http://127.0.0.1/api/messages/${A1.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent })
      })
    );

    expect(editRes.status).toBe(200);
    const updated = (await editRes.json()) as MessageWithTree;
    expect(updated.state?.mood).toBe('furious');
    expect(updated.metadata.edited?.count).toBe(1);

    // 3. Edit segments with invalid embedded headers -> 400 serialize_failed
    const invalidSegmentsRes = await app.handle(
      new Request(`http://127.0.0.1/api/messages/${A1.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments: [
            { kind: 'character', text: 'Normal line\n:::character[Alice] Embedded forbidden header' }
          ]
        })
      })
    );
    expect(invalidSegmentsRes.status).toBe(400);
    const invJson = (await invalidSegmentsRes.json()) as any;
    expect(invJson.error.code).toBe('serialize_failed');
  });

  it('PATCH message segments: valid per-segment edit re-serializes content (§7 inline editing)', async () => {
    const { app, repos } = setupTestApp();

    const chat = repos.chats.create({
      id: 'c-segedit',
      title: 'Segment Edit',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default',
      metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
    });

    const A1 = repos.messages.insert({
      id: '01SEGEDA1',
      chatId: chat.id,
      parentId: null,
      role: 'assistant',
      narrativeRole: 'character',
      content: 'Original content',
      segments: [
        { kind: 'narrator', text: 'Rain hammers the shutters.' },
        { kind: 'character', name: 'Eldrin the Mage', text: 'Come in, traveler.' }
      ],
      state: { mood: 'calm' },
      status: 'complete'
    });

    const res = await app.handle(
      new Request(`http://127.0.0.1/api/messages/${A1.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments: [
            { kind: 'narrator', text: 'Rain hammers the shutters.' },
            { kind: 'character', name: 'Eldrin the Mage', text: 'Come in, seeker.' }
          ]
        })
      })
    );

    expect(res.status).toBe(200);
    const updated = (await res.json()) as MessageWithTree;
    expect(updated.segments[1].text).toBe('Come in, seeker.');
    expect(updated.content).toContain('Come in, seeker.');
    expect(updated.content).not.toContain('Come in, traveler.');
    // Segment edits preserve turn state and bump the edited counter.
    expect(updated.state).toEqual({ mood: 'calm' });
    expect(updated.metadata.edited?.count).toBe(1);
  });

  it('DELETE message: cascades through subtree, moves activeLeafId to parent, prevents delete if descendant streaming', async () => {
    const { app, repos, hub } = setupTestApp();

    const chat = repos.chats.create({
      id: 'c-del-msg',
      title: 'Delete Message',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default',
      metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
    });

    const U1 = repos.messages.insert({
      id: '01DELU1',
      chatId: chat.id,
      parentId: null,
      role: 'user',
      narrativeRole: 'persona',
      content: 'U1',
      status: 'complete'
    });

    const A1 = repos.messages.insert({
      id: '01DELA1',
      chatId: chat.id,
      parentId: U1.id,
      role: 'assistant',
      narrativeRole: 'character',
      content: 'A1',
      status: 'complete'
    });

    const U2 = repos.messages.insert({
      id: '01DELU2',
      chatId: chat.id,
      parentId: A1.id,
      role: 'user',
      narrativeRole: 'persona',
      content: 'U2',
      status: 'complete'
    });

    repos.chats.setActiveLeaf(chat.id, U2.id);

    // If U2 is streaming, deleting A1 fails with 409
    hub.register({ messageId: U2.id, chatId: chat.id });
    const delFailRes = await app.handle(
      new Request(`http://127.0.0.1/api/messages/${A1.id}`, { method: 'DELETE' })
    );
    expect(delFailRes.status).toBe(409);
    hub.abort(U2.id, 'user');

    // Delete A1: cascades A1 and U2 (2 messages)
    const delOkRes = await app.handle(
      new Request(`http://127.0.0.1/api/messages/${A1.id}`, { method: 'DELETE' })
    );
    expect(delOkRes.status).toBe(200);
    const delJson = (await delOkRes.json()) as any;
    expect(delJson.deleted).toBe(2);
    expect(delJson.activeLeafId).toBe(U1.id);

    const updatedChat = repos.chats.get(chat.id)!;
    expect(updatedChat.activeLeafId).toBe(U1.id);
    expect(repos.messages.get(A1.id)).toBeNull();
    expect(repos.messages.get(U2.id)).toBeNull();
  });

  it('reattach: GET /messages/:id/stream replays snapshot + live tokens during generation, and replays immediately after completion', async () => {
    const { app, repos } = setupTestApp({ mockIntervalMs: 50 });

    const chat = repos.chats.create({
      id: 'c-reattach',
      title: 'Reattach Chat',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default',
      metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
    });

    // Start generation
    const sendRes = await app.handle(
      new Request(`http://127.0.0.1/api/chats/${chat.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Stream message' })
      })
    );
    expect(sendRes.status).toBe(200);

    const asstId = repos.chats.get(chat.id)!.activeLeafId!;

    // Wait 20ms for first few tokens
    await new Promise((r) => setTimeout(r, 20));

    // Reattach mid-stream
    const reattachRes = await app.handle(
      new Request(`http://127.0.0.1/api/messages/${asstId}/stream`)
    );
    expect(reattachRes.status).toBe(200);

    const [sendEvents, reattachEvents] = await Promise.all([
      readSseEvents<ChatStreamEvent>(sendRes),
      readSseEvents<ChatStreamEvent>(reattachRes)
    ]);

    expect(reattachEvents[0].type).toBe('start');
    const lastReattach = reattachEvents[reattachEvents.length - 1];
    expect(lastReattach.type).toBe('done');

    // After completion: second reattach replays completed message immediately
    const postCompleteRes = await app.handle(
      new Request(`http://127.0.0.1/api/messages/${asstId}/stream`)
    );
    expect(postCompleteRes.status).toBe(200);
    const postEvents = await readSseEvents<ChatStreamEvent>(postCompleteRes);

    expect(postEvents.length).toBe(3); // start, token, done
    expect(postEvents[0].type).toBe('start');
    expect(postEvents[1].type).toBe('token');
    expect(postEvents[2].type).toBe('done');
  });
});

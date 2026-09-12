import { describe, it, expect } from 'bun:test';
import type { ChatView } from '@formatavern/shared';
import { setupTestApp } from './helpers';

describe('routes/chats', () => {
  it('creates chat with greeting root message, sets activeLeafId, and inherits narrativeMode default', async () => {
    const { app, repos } = setupTestApp();

    const res = await app.handle(
      new Request('http://127.0.0.1/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: 'eldrin-the-mage'
        })
      })
    );

    expect(res.status).toBe(201);
    const chat = (await res.json()) as ChatView;
    expect(chat.id).toBeDefined();
    expect(chat.primaryCharacterId).toBe('eldrin-the-mage');
    expect(chat.activeLeafId).not.toBeNull();
    expect(chat.metadata.narrativeMode).toBe('narrative');

    // Check greeting root message in DB
    const rootMsg = repos.messages.get(chat.activeLeafId!);
    expect(rootMsg).not.toBeNull();
    expect(rootMsg!.role).toBe('assistant');
    expect(rootMsg!.status).toBe('complete');
    expect(rootMsg!.metadata.stateSource).toBe('initial');
    expect(rootMsg!.state).toEqual({
      mood: 'calm',
      affinity: 5,
      danger: 'low',
      scene: 'spire_observatory'
    });
  });

  it('creates chat without root message when character firstMessage is blank', async () => {
    const { app, repos } = setupTestApp();

    // Create character with empty firstMessage
    repos.characters.upsert({
      id: 'char-blank',
      name: 'Silent Character',
      description: '...',
      personality: '...',
      scenario: '...',
      firstMessage: '   ',
      style: repos.characters.get('eldrin-the-mage')!.style
    });

    const res = await app.handle(
      new Request('http://127.0.0.1/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: 'char-blank'
        })
      })
    );

    expect(res.status).toBe(201);
    const chat = (await res.json()) as ChatView;
    expect(chat.activeLeafId).toBeNull();
    expect(repos.messages.countInChat(chat.id)).toBe(0);
  });

  it('fails with 404 when creating chat with unknown character', async () => {
    const { app } = setupTestApp();

    const res = await app.handle(
      new Request('http://127.0.0.1/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: 'nonexistent-character'
        })
      })
    );

    expect(res.status).toBe(404);
  });

  it('patches chat title and updates metadata', async () => {
    const { app, repos } = setupTestApp();

    const chat = repos.chats.create({
      id: 'c-patch-test',
      title: 'Original Title',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default',
      metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
    });

    const res = await app.handle(
      new Request(`http://127.0.0.1/api/chats/${chat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Updated Title'
        })
      })
    );

    expect(res.status).toBe(200);
    const updated = (await res.json()) as ChatView;
    expect(updated.title).toBe('Updated Title');
  });

  it('prevents deleting chat while generation is active (409)', async () => {
    const { app, repos, hub } = setupTestApp();

    const chat = repos.chats.create({
      id: 'c-active-del',
      title: 'Active Chat',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default',
      metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
    });

    hub.register({ messageId: 'm-active-1', chatId: chat.id });

    const delRes = await app.handle(
      new Request(`http://127.0.0.1/api/chats/${chat.id}`, { method: 'DELETE' })
    );

    expect(delRes.status).toBe(409);
    const json = (await delRes.json()) as any;
    expect(json.error.code).toBe('chat_has_active_generation');

    // After abort, delete succeeds and cascades messages
    hub.abort('m-active-1', 'user');
    const delOkRes = await app.handle(
      new Request(`http://127.0.0.1/api/chats/${chat.id}`, { method: 'DELETE' })
    );
    expect(delOkRes.status).toBe(200);
    expect(repos.chats.get(chat.id)).toBeNull();
  });

  it('applies state override, coerces aliases, clamps bounds, and updates currentState', async () => {
    const { app, repos } = setupTestApp();

    const chat = repos.chats.create({
      id: 'c-state-test',
      title: 'State Test Chat',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default',
      metadata: {
        envelopeDialect: 'directive',
        narrativeMode: 'narrative',
        currentState: {
          mood: 'calm',
          affinity: 10,
          danger: 'low',
          scene: 'observatory'
        }
      }
    });

    const res = await app.handle(
      new Request(`http://127.0.0.1/api/chats/${chat.id}/state`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: {
            mood: 'angry', // alias for 'furious' in Eldrin's schema
            affinity: 99 // exceeds max 10 -> clamped to 10
          }
        })
      })
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.state.mood).toBe('furious');
    expect(json.state.affinity).toBe(10);
    expect(json.warnings.length).toBeGreaterThan(0);

    const updatedChat = repos.chats.get(chat.id);
    expect(updatedChat!.metadata.currentState?.mood).toBe('furious');
    expect(updatedChat!.metadata.currentState?.affinity).toBe(10);
    expect(updatedChat!.metadata.stateOverrides?.length).toBe(1);
  });

  it('filters chat list by characterId and applies limit', async () => {
    const { app, repos } = setupTestApp();

    // Create a second character
    repos.characters.upsert({
      id: 'char-lyra',
      name: 'Lyra',
      description: 'A stargazing scholar',
      personality: 'Curious',
      scenario: 'In the observatory',
      firstMessage: 'Greetings traveler.',
      style: repos.characters.get('eldrin-the-mage')!.style
    });

    // Create chats for eldrin
    repos.chats.create({
      id: 'chat-eldrin-1',
      title: 'Eldrin Story 1',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default'
    });
    repos.chats.create({
      id: 'chat-eldrin-2',
      title: 'Eldrin Story 2',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default'
    });

    // Create chat for lyra
    repos.chats.create({
      id: 'chat-lyra-1',
      title: 'Lyra Story 1',
      primaryCharacterId: 'char-lyra',
      activePersonaId: 'persona-default'
    });

    // Request without filter -> returns all 3
    const allRes = await app.handle(new Request('http://127.0.0.1/api/chats'));
    expect(allRes.status).toBe(200);
    const allChats = (await allRes.json()) as ChatView[];
    expect(allChats.length).toBe(3);

    // Filter by characterId = eldrin-the-mage -> returns only 2
    const eldrinRes = await app.handle(
      new Request('http://127.0.0.1/api/chats?characterId=eldrin-the-mage')
    );
    expect(eldrinRes.status).toBe(200);
    const eldrinChats = (await eldrinRes.json()) as ChatView[];
    expect(eldrinChats.length).toBe(2);
    expect(eldrinChats.every((c) => c.primaryCharacterId === 'eldrin-the-mage')).toBe(true);

    // Filter by characterId = char-lyra -> returns only 1
    const lyraRes = await app.handle(
      new Request('http://127.0.0.1/api/chats?characterId=char-lyra')
    );
    expect(lyraRes.status).toBe(200);
    const lyraChats = (await lyraRes.json()) as ChatView[];
    expect(lyraChats.length).toBe(1);
    expect(lyraChats[0].id).toBe('chat-lyra-1');

    // Filter by characterId with limit = 1 -> returns 1
    const limitRes = await app.handle(
      new Request('http://127.0.0.1/api/chats?characterId=eldrin-the-mage&limit=1')
    );
    expect(limitRes.status).toBe(200);
    const limitedChats = (await limitRes.json()) as ChatView[];
    expect(limitedChats.length).toBe(1);
  });
});

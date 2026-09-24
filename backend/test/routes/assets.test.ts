import { describe, it, expect } from 'bun:test';
import { setupTestApp } from './helpers';
import { DEFAULT_CHARACTER_THEME } from '@formatavern/shared';

describe('Assets API Routes (/api/assets)', () => {
  it('resolves known and missing hashes via POST /api/assets/resolve', async () => {
    const { app, repos } = setupTestApp();

    const knownHash = 'a'.repeat(64);
    const missingHash = 'f'.repeat(64);

    repos.assets.insert({
      id: knownHash,
      mime: 'image/png',
      ext: '.png',
      size: 1024,
      width: 100,
      height: 100,
      path: `pool/${knownHash}.png`,
      createdAt: Date.now()
    });

    const res = await app.handle(
      new Request('http://localhost/api/assets/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hashes: [knownHash, missingHash, 'not-a-valid-hash']
        })
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      extMap: Record<string, string>;
      missingHashes: string[];
    };

    expect(body.extMap[knownHash]).toBe('png');
    expect(body.missingHashes).toContain(missingHash);
    expect(body.missingHashes).toContain('not-a-valid-hash');
  });

  it('passes activeGreetingIndex and personaSnapshot in toChatView from GET /api/chats/:id', async () => {
    const { app, repos } = setupTestApp();

    const char = repos.characters.create({
      name: 'Test Character',
      description: 'A test character',
      personality: 'Friendly',
      scenario: 'In a room',
      firstMessage: 'Hello!',
      style: DEFAULT_CHARACTER_THEME
    });

    const persona = repos.personas.getDefault()!;

    const chat = repos.chats.create({
      id: 'c-test-snapshot',
      title: 'Snapshot Chat',
      primaryCharacterId: char.id,
      activePersonaId: persona.id,
      activeGreetingIndex: 2,
      personaSnapshot: JSON.stringify({ name: 'Adventurer' })
    });

    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chat.id}`, {
        method: 'GET'
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.activeGreetingIndex).toBe(2);
    expect(body.personaSnapshot).toBe(JSON.stringify({ name: 'Adventurer' }));
  });
});

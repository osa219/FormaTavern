import { describe, it, expect, afterEach } from 'bun:test';
import { setupTestApp } from './helpers';
import { DEFAULT_CHARACTER_THEME, type CharacterCreate, type PersonaCreate } from '@formatavern/shared';
import { FsAssetStore } from '../../src/assets/store';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeCardInput(name: string, tags: string[] = []): CharacterCreate {
  return {
    name,
    description: `A story about ${name}`,
    personality: 'Curious',
    scenario: 'A lively marketplace',
    firstMessage: 'Hello there!',
    style: DEFAULT_CHARACTER_THEME,
    tags
  };
}

describe('Phase 5 Routes', () => {
  let tmpAssetDir: string | undefined;

  afterEach(async () => {
    if (tmpAssetDir) {
      await rm(tmpAssetDir, { recursive: true, force: true });
      tmpAssetDir = undefined;
    }
  });

  it('handles character creation, slug minting, and usage retrieval', async () => {
    const { app } = setupTestApp();

    const createRes = await app.handle(
      new Request('http://127.0.0.1/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeCardInput('Luna the Sorceress', ['magic', 'fantasy']))
      })
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as any;
    expect(created.id).toBe('luna-the-sorceress');
    expect(created.name).toBe('Luna the Sorceress');
    expect(created.tags.sort()).toEqual(['fantasy', 'magic']);

    // Usage route: 0 chats initially
    const usageRes = await app.handle(new Request(`http://127.0.0.1/api/characters/${created.id}/usage`));
    expect(usageRes.status).toBe(200);
    expect((await usageRes.json()) as any).toEqual({ chats: 0 });
  });

  it('handles character PATCH with optimistic concurrency control (409 on stale)', async () => {
    const { app, repos } = setupTestApp();
    const created = repos.characters.create(makeCardInput('Balthazar'));

    // Stale patch (expectedUpdatedAt wrong)
    const staleRes = await app.handle(
      new Request(`http://127.0.0.1/api/characters/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tagline: 'A wandering knight',
          expectedUpdatedAt: created.updatedAt! - 999
        })
      })
    );
    expect(staleRes.status).toBe(409);
    const staleJson = (await staleRes.json()) as any;
    expect(staleJson.error.code).toBe('stale_write');

    // Valid patch
    const okRes = await app.handle(
      new Request(`http://127.0.0.1/api/characters/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tagline: 'A wandering knight',
          expectedUpdatedAt: created.updatedAt!
        })
      })
    );
    expect(okRes.status).toBe(200);
    const updated = (await okRes.json()) as any;
    expect(updated.tagline).toBe('A wandering knight');
    expect(updated.updatedAt).toBeGreaterThan(created.updatedAt!);
  });

  it('handles character duplication', async () => {
    const { app, repos } = setupTestApp();
    const created = repos.characters.create(makeCardInput('Mage Merlin'));

    const dupRes = await app.handle(
      new Request(`http://127.0.0.1/api/characters/${created.id}/duplicate`, {
        method: 'POST'
      })
    );
    expect(dupRes.status).toBe(201);
    const dup = (await dupRes.json()) as any;
    expect(dup.id).toBe('mage-merlin-copy');
    expect(dup.name).toBe('Mage Merlin (Copy)');
  });

  it('handles character deletion with ?cascade=chats', async () => {
    const { app, repos } = setupTestApp();
    const c = repos.characters.create(makeCardInput('To Delete'));
    const p = repos.personas.getDefault()!;

    repos.chats.create({
      id: 'chat-del-test',
      title: 'Chat to Cascade',
      primaryCharacterId: c.id,
      activePersonaId: p.id
    });

    // Delete without cascade -> 400 character_in_use
    const resBlocked = await app.handle(
      new Request(`http://127.0.0.1/api/characters/${c.id}`, { method: 'DELETE' })
    );
    expect(resBlocked.status).toBe(400);
    const blockedJson = (await resBlocked.json()) as any;
    expect(blockedJson.error.code).toBe('character_in_use');
    expect(blockedJson.error.details.chats).toBe(1);

    // Delete with ?cascade=chats -> 200
    const resCascade = await app.handle(
      new Request(`http://127.0.0.1/api/characters/${c.id}?cascade=chats`, { method: 'DELETE' })
    );
    expect(resCascade.status).toBe(200);
    expect((await resCascade.json()) as any).toEqual({ deleted: true, chats: 1 });
    expect(repos.characters.get(c.id)).toBeNull();
    expect(repos.chats.get('chat-del-test')).toBeNull();
  });

  it('retrieves popular tags via GET /api/tags', async () => {
    const { app, repos } = setupTestApp();
    repos.characters.create(makeCardInput('C1', ['scifi', 'cyberpunk']));
    repos.characters.create(makeCardInput('C2', ['scifi']));

    const res = await app.handle(new Request('http://127.0.0.1/api/tags'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(Array.isArray(json.tags)).toBe(true);
    expect(json.tags.some((t: any) => t.tag === 'scifi' && t.count >= 2)).toBe(true);
  });

  it('handles persona creation, patch, default shift, and deletion with reassignment', async () => {
    const { app, repos } = setupTestApp();

    // 1. POST persona
    const postRes = await app.handle(
      new Request('http://127.0.0.1/api/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Mystic Seeker',
          description: 'A quiet wanderer of realms'
        } satisfies PersonaCreate)
      })
    );
    expect(postRes.status).toBe(201);
    const createdPersona = (await postRes.json()) as any;
    expect(createdPersona.id.length).toBe(26);
    expect(createdPersona.name).toBe('Mystic Seeker');

    // 2. PATCH persona with expectedUpdatedAt
    const patchRes = await app.handle(
      new Request(`http://127.0.0.1/api/personas/${createdPersona.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Updated wanderer description',
          expectedUpdatedAt: createdPersona.updatedAt
        })
      })
    );
    expect(patchRes.status).toBe(200);
    const patchedPersona = (await patchRes.json()) as any;
    expect(patchedPersona.description).toBe('Updated wanderer description');

    // 3. POST /:id/default to shift default
    const defRes = await app.handle(
      new Request(`http://127.0.0.1/api/personas/${createdPersona.id}/default`, {
        method: 'POST'
      })
    );
    expect(defRes.status).toBe(200);
    const defPersonas = (await defRes.json()) as any[];
    expect(defPersonas.find((p) => p.id === createdPersona.id)?.isDefault).toBe(true);

    // 4. Try delete default -> 400 persona_is_default
    const delDefRes = await app.handle(
      new Request(`http://127.0.0.1/api/personas/${createdPersona.id}`, { method: 'DELETE' })
    );
    expect(delDefRes.status).toBe(400);
    expect(((await delDefRes.json()) as any).error.code).toBe('persona_is_default');

    // Switch default back to persona-default
    await app.handle(new Request('http://127.0.0.1/api/personas/persona-default/default', { method: 'POST' }));

    // Create a chat using createdPersona
    const char = repos.characters.create(makeCardInput('Character'));
    repos.chats.create({
      id: 'chat-persona-test',
      title: 'Persona Test Chat',
      primaryCharacterId: char.id,
      activePersonaId: createdPersona.id
    });

    // Try delete without reassign -> 400 persona_in_use
    const delInUseRes = await app.handle(
      new Request(`http://127.0.0.1/api/personas/${createdPersona.id}`, { method: 'DELETE' })
    );
    expect(delInUseRes.status).toBe(400);
    expect(((await delInUseRes.json()) as any).error.code).toBe('persona_in_use');

    // Delete with ?reassignTo=persona-default -> 200
    const delOkRes = await app.handle(
      new Request(`http://127.0.0.1/api/personas/${createdPersona.id}?reassignTo=persona-default`, {
        method: 'DELETE'
      })
    );
    expect(delOkRes.status).toBe(200);
    expect(((await delOkRes.json()) as any).reassignedChats).toBe(1);
    expect(repos.personas.get(createdPersona.id)).toBeNull();
    expect(repos.chats.get('chat-persona-test')?.activePersonaId).toBe('persona-default');
  });

  it('switches chat active persona with PATCH /api/chats/:id and rejects if generation is active', async () => {
    const { app, repos, hub } = setupTestApp();
    const char = repos.characters.create(makeCardInput('Guide'));
    const p1 = repos.personas.getDefault()!;
    const p2 = repos.personas.create({ name: 'Alt Persona', description: 'Alt description' });

    const chat = repos.chats.create({
      id: 'chat-switch-test',
      title: 'Switch Chat',
      primaryCharacterId: char.id,
      activePersonaId: p1.id
    });

    // 1. Switch persona when inactive -> 200
    const patchRes = await app.handle(
      new Request(`http://127.0.0.1/api/chats/${chat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activePersonaId: p2.id })
      })
    );
    expect(patchRes.status).toBe(200);
    expect(((await patchRes.json()) as any).activePersonaId).toBe(p2.id);

    // 2. Reject switch when generation active (P7 invariant)
    const gen = hub.register({ chatId: chat.id, messageId: 'msg-1' });
    const rejectRes = await app.handle(
      new Request(`http://127.0.0.1/api/chats/${chat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activePersonaId: p1.id })
      })
    );
    expect(rejectRes.status).toBe(409);
    expect(((await rejectRes.json()) as any).error.code).toBe('chat_has_active_generation');
    gen.close();
  });

  it('validates and handles GET /api/characters with query string limit and sort', async () => {
    const { app, repos } = setupTestApp();
    repos.characters.create(makeCardInput('Character A', ['fantasy']));
    repos.characters.create(makeCardInput('Character B', ['scifi']));

    const res = await app.handle(
      new Request('http://127.0.0.1/api/characters?sort=recent&limit=24')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(Array.isArray(json.items)).toBe(true);
    expect(json.items.length).toBe(4);
    expect(json.items.some((c: any) => c.name === 'Character A')).toBe(true);
  });

  it('handles customCss on POST/PATCH, rejects oversized payloads with 422, and clears with null', async () => {
    const { app } = setupTestApp();

    const sampleCss = '.ft-char-avatar { border-radius: 9999px; }';
    const createRes = await app.handle(
      new Request('http://127.0.0.1/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...makeCardInput('Styled Char'),
          customCss: sampleCss
        })
      })
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as any;
    expect(created.customCss).toBe(sampleCss);

    // Reject oversized customCss (> 131,072 characters)
    const oversizedCss = 'a'.repeat(131_073);
    const overRes = await app.handle(
      new Request('http://127.0.0.1/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...makeCardInput('Oversized Char'),
          customCss: oversizedCss
        })
      })
    );
    expect(overRes.status).toBe(422);

    // Patch with new CSS
    const patchRes = await app.handle(
      new Request(`http://127.0.0.1/api/characters/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customCss: '.ft-char-name { color: red; }',
          expectedUpdatedAt: created.updatedAt
        })
      })
    );
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as any;
    expect(patched.customCss).toBe('.ft-char-name { color: red; }');

    // Patch with null to clear customCss
    const clearRes = await app.handle(
      new Request(`http://127.0.0.1/api/characters/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customCss: null,
          expectedUpdatedAt: patched.updatedAt
        })
      })
    );
    expect(clearRes.status).toBe(200);
    const cleared = (await clearRes.json()) as any;
    expect(cleared.customCss).toBeUndefined();
  });
});

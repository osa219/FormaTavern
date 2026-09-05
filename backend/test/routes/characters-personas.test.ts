import { describe, it, expect } from 'bun:test';
import { DEFAULT_CHARACTER_THEME, type CharacterCard, type Persona } from '@formatavern/shared';
import { setupTestApp } from './helpers';

describe('routes/characters & personas', () => {
  it('handles character CRUD, 404, id mismatch, and chat reference FK restriction', async () => {
    const { app, repos } = setupTestApp();

    // 1. GET list
    const listRes = await app.handle(new Request('http://127.0.0.1/api/characters'));
    expect(listRes.status).toBe(200);
    const listJson = (await listRes.json()) as any;
    const list = listJson.items ?? listJson;
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((c: any) => c.id === 'eldrin-the-mage')).toBe(true);

    // 2. GET /:id (found)
    const getRes = await app.handle(new Request('http://127.0.0.1/api/characters/eldrin-the-mage'));
    expect(getRes.status).toBe(200);
    const card = (await getRes.json()) as CharacterCard;
    expect(card.id).toBe('eldrin-the-mage');

    // 3. GET /:id (not found -> 404 envelope)
    const notFoundRes = await app.handle(new Request('http://127.0.0.1/api/characters/unknown-char'));
    expect(notFoundRes.status).toBe(404);
    const notFoundJson = (await notFoundRes.json()) as any;
    expect(notFoundJson.error.code).toBe('not_found');

    // 4. PUT id mismatch -> 400
    const mismatchRes = await app.handle(
      new Request('http://127.0.0.1/api/characters/char-a', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'char-b',
          name: 'Char B',
          description: 'Desc',
          personality: 'Pers',
          scenario: 'Scen',
          firstMessage: 'Hi',
          style: DEFAULT_CHARACTER_THEME
        })
      })
    );
    expect(mismatchRes.status).toBe(400);
    const mismatchJson = (await mismatchRes.json()) as any;
    expect(mismatchJson.error.code).toBe('validation_failed');

    // 5. PUT valid character -> 200
    const newCard: CharacterCard = {
      id: 'char-new',
      name: 'New Hero',
      description: 'Desc',
      personality: 'Pers',
      scenario: 'Scen',
      firstMessage: 'Hi',
      style: DEFAULT_CHARACTER_THEME
    };
    const putRes = await app.handle(
      new Request('http://127.0.0.1/api/characters/char-new', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCard)
      })
    );
    expect(putRes.status).toBe(200);
    expect(repos.characters.get('char-new')).not.toBeNull();

    // 6. DELETE referenced by chat -> 409 chat_references
    repos.chats.create({
      id: 'chat-fk-test',
      title: 'FK Chat',
      primaryCharacterId: 'char-new',
      activePersonaId: 'persona-default',
      metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
    });

    const deleteRefRes = await app.handle(
      new Request('http://127.0.0.1/api/characters/char-new', { method: 'DELETE' })
    );
    expect([400, 409]).toContain(deleteRefRes.status);
    const delRefJson = (await deleteRefRes.json()) as any;
    expect(['character_in_use', 'chat_references']).toContain(delRefJson.error.code);

    // Remove chat, then DELETE succeeds
    repos.chats.remove('chat-fk-test');
    const deleteOkRes = await app.handle(
      new Request('http://127.0.0.1/api/characters/char-new', { method: 'DELETE' })
    );
    expect(deleteOkRes.status).toBe(200);
    expect(repos.characters.get('char-new')).toBeNull();
  });

  it('handles persona CRUD, 404, and id mismatch', async () => {
    const { app, repos } = setupTestApp();

    // 1. GET personas list
    const listRes = await app.handle(new Request('http://127.0.0.1/api/personas'));
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as Persona[];
    expect(list.some((p) => p.id === 'persona-default')).toBe(true);

    // 2. PUT persona
    const newPersona: Persona = {
      id: 'persona-custom',
      name: 'Custom Persona',
      description: 'Adventurer',
      isDefault: false
    };
    const putRes = await app.handle(
      new Request('http://127.0.0.1/api/personas/persona-custom', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPersona)
      })
    );
    expect(putRes.status).toBe(200);
    expect(repos.personas.get('persona-custom')).not.toBeNull();

    // 3. DELETE persona
    const delRes = await app.handle(
      new Request('http://127.0.0.1/api/personas/persona-custom', { method: 'DELETE' })
    );
    expect(delRes.status).toBe(200);
    expect(repos.personas.get('persona-custom')).toBeNull();
  });

  it('formats 500 error envelope without exposing internal stack trace', async () => {
    const { app, repos } = setupTestApp();
    repos.characters.list = () => {
      throw new Error('Database disk image is malformed at offset 0x4829');
    };

    const res = await app.handle(new Request('http://127.0.0.1/api/characters'));
    expect(res.status).toBe(500);
    const json = (await res.json()) as any;
    expect(json.error.code).toBe('internal');
    expect(json.error.message).toBe('Internal server error');
    expect(JSON.stringify(json)).not.toContain('Database disk image is malformed');
    expect(JSON.stringify(json)).not.toContain('stack');
  });
});

import { describe, it, expect, afterEach } from 'bun:test';
import { runMigrations } from '../../src/db/migrate';
import { createRepositories } from '../../src/db/repositories';
import { openTestDb, type TestDbInstance } from '../helpers';
import type { Persona } from '@formatavern/shared';

describe('SqlitePersonaRepository (Phase 5)', () => {
  let inst: TestDbInstance;

  afterEach(() => {
    inst?.cleanup();
  });

  it('creates personas with minted IDs and timestamps', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);

    const p = repos.personas.create({
      name: 'Scholar',
      description: 'A seeker of truth'
    });
    expect(p.id.length).toBe(26);
    expect(typeof p.createdAt).toBe('number');
    expect(typeof p.updatedAt).toBe('number');

    // Provided id
    const p2 = repos.personas.create({
      id: 'scholar-custom',
      name: 'Scholar',
      description: 'Custom scholar'
    });
    expect(p2.id).toBe('scholar-custom');
  });

  it('supports optimistic concurrency control on patch', async () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);

    const p = repos.personas.create({ name: 'Knight', description: 'A valiant knight' });
    const initialUpdatedAt = p.updatedAt!;

    await new Promise((r) => setTimeout(r, 10));

    // Stale check
    const stale = repos.personas.patch(p.id, {
      description: 'Sir Lancelot',
      expectedUpdatedAt: initialUpdatedAt - 50
    });
    expect(stale).toBe('stale');

    // Valid check
    const updated = repos.personas.patch(p.id, {
      description: 'Sir Lancelot',
      expectedUpdatedAt: initialUpdatedAt
    });
    expect(typeof updated).toBe('object');
    if (typeof updated === 'object') {
      expect(updated.description).toBe('Sir Lancelot');
      expect(updated.updatedAt).toBeGreaterThan(initialUpdatedAt);
    }
  });

  it('atomically shifts default persona with setDefault', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);

    const p1 = repos.personas.create({ name: 'Traveler', description: 'A traveler', isDefault: true });
    const p2 = repos.personas.create({ name: 'Scholar', description: 'A scholar' });

    expect(repos.personas.getDefault()?.id).toBe(p1.id);

    const res = repos.personas.setDefault(p2.id);
    expect(Array.isArray(res)).toBe(true);
    expect(res.find((p) => p.id === p2.id)?.isDefault).toBe(true);
    expect(res.find((p) => p.id === p1.id)?.isDefault).toBe(false);

    expect(repos.personas.getDefault()?.id).toBe(p2.id);
    expect(repos.personas.get(p1.id)?.isDefault).toBe(false);
    expect(repos.personas.get(p2.id)?.isDefault).toBe(true);
  });

  it('prevents deleting the default persona', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);

    const p = repos.personas.create({ name: 'Default Guy', description: 'Default guy', isDefault: true });
    const res = repos.personas.remove(p.id);
    expect(res).toBe('is_default');
    expect(repos.personas.get(p.id)).not.toBeNull();
  });

  it('blocks deleting persona in use without reassignment, and safely reassigns with reassignTo', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);

    repos.characters.upsert({
      id: 'c1',
      name: 'Char',
      description: 'D',
      personality: 'P',
      scenario: 'S',
      firstMessage: 'F',
      style: {
        font: { family: 'sans-serif', size: '1rem', lineHeight: '1.5' },
        colors: {
          charBubbleBg: '#fff',
          charBubbleText: '#000',
          charBubbleBorder: '#ccc',
          userBubbleBg: '#eee',
          userBubbleText: '#111',
          accent: '#f00',
          quote: '#0f0',
          action: '#888',
          narratorText: '#666'
        },
        bubble: { radius: '0.5rem', charTail: 'left', padding: '1rem' },
        background: { overlay: 'rgba(0,0,0,0.5)', blur: '2px' }
      }
    });

    const def = repos.personas.create({ name: 'Default', description: 'Default', isDefault: true });
    const p1 = repos.personas.create({ name: 'Old Persona', description: 'Old' });
    const p2 = repos.personas.create({ name: 'New Persona', description: 'New' });

    // Create chat referencing p1
    inst.db.run(
      `INSERT INTO chats (id, title, primary_character_id, active_persona_id, created_at, updated_at)
       VALUES ('chat1', 'Story', 'c1', ?, 1, 1);`,
      [p1.id]
    );

    // Try delete p1 without reassignment -> 'restricted'
    const inUse = repos.personas.remove(p1.id);
    expect(inUse).toBe('restricted');

    // Delete p1 with reassignTo: p2.id
    const success = repos.personas.remove(p1.id, { reassignTo: p2.id });
    expect(success).toEqual({ chats: 1 });
    expect(repos.personas.get(p1.id)).toBeNull();

    // Verify chat was reassigned to p2
    const chat = inst.db.query(`SELECT active_persona_id FROM chats WHERE id = 'chat1';`).get() as {
      active_persona_id: string;
    };
    expect(chat.active_persona_id).toBe(p2.id);
  });
});

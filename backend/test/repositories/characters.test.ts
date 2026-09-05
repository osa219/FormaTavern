import { describe, it, expect, afterEach } from 'bun:test';
import { runMigrations } from '../../src/db/migrate';
import { createRepositories } from '../../src/db/repositories';
import { openTestDb, type TestDbInstance } from '../helpers';
import type { CharacterCard } from '@formatavern/shared';

function makeCard(id: string, name: string, tags: string[] = [], creator?: string): CharacterCard {
  return {
    id,
    name,
    description: `Description of ${name}`,
    personality: 'Friendly',
    scenario: 'A quiet inn',
    firstMessage: 'Hello traveler!',
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
    },
    tags,
    creator
  };
}

describe('SqliteCharacterRepository (Phase 5)', () => {
  let inst: TestDbInstance;

  afterEach(() => {
    inst?.cleanup();
  });

  it('handles slug minting and collisions on create', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);

    const c1 = repos.characters.create({
      name: 'Silver Dragon',
      description: 'A mighty dragon',
      personality: 'Wise',
      scenario: 'Mountain peak',
      firstMessage: 'Greetings',
      style: makeCard('x', 'x').style
    });
    expect(c1.id).toBe('silver-dragon');

    // Second with same name mints collision slug -2
    const c2 = repos.characters.create({
      name: 'Silver Dragon',
      description: 'Another mighty dragon',
      personality: 'Fierce',
      scenario: 'Mountain cave',
      firstMessage: 'Who goes there',
      style: makeCard('x', 'x').style
    });
    expect(c2.id).toBe('silver-dragon-2');

    // Third mints -3
    const c3 = repos.characters.create({
      name: 'Silver Dragon',
      description: 'Third dragon',
      personality: 'Ancient',
      scenario: 'Deep lair',
      firstMessage: 'Sleep...',
      style: makeCard('x', 'x').style
    });
    expect(c3.id).toBe('silver-dragon-3');
  });

  it('performs optimistic concurrency control on patch', async () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);

    repos.characters.upsert(makeCard('alice', 'Alice'));
    const initial = repos.characters.get('alice');
    expect(initial).not.toBeNull();
    const v1UpdatedAt = initial!.updatedAt!;

    await new Promise((r) => setTimeout(r, 10));

    // Stale update with wrong expectedUpdatedAt
    const staleRes = repos.characters.patch('alice', {
      tagline: 'Stale attempt',
      expectedUpdatedAt: v1UpdatedAt - 100
    });
    expect(staleRes).toBe('stale');

    // Valid update with matching expectedUpdatedAt
    const validRes = repos.characters.patch('alice', {
      tagline: 'Adventurer',
      expectedUpdatedAt: v1UpdatedAt
    });
    expect(typeof validRes).toBe('object');
    if (typeof validRes === 'object') {
      expect(validRes.tagline).toBe('Adventurer');
      expect(validRes.updatedAt).toBeGreaterThan(v1UpdatedAt);
    }

    // Now trying again with v1UpdatedAt is stale because it advanced
    const secondStale = repos.characters.patch('alice', {
      tagline: 'Another attempt',
      expectedUpdatedAt: v1UpdatedAt
    });
    expect(secondStale).toBe('stale');
  });

  it('supports tag filtering with AND logic', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);

    repos.characters.upsert(makeCard('c1', 'Card 1', ['fantasy', 'magic', 'adventure']));
    repos.characters.upsert(makeCard('c2', 'Card 2', ['fantasy', 'adventure']));
    repos.characters.upsert(makeCard('c3', 'Card 3', ['scifi', 'space']));

    const fantasyAdventure = repos.characters.list({ tags: 'fantasy,adventure' });
    expect(fantasyAdventure.items.map((i) => i.id).sort()).toEqual(['c1', 'c2']);

    const magicOnly = repos.characters.list({ tags: 'magic' });
    expect(magicOnly.items.map((i) => i.id)).toEqual(['c1']);

    const allThree = repos.characters.list({ tags: 'fantasy,magic,space' });
    expect(allThree.items.length).toBe(0);
  });

  it('supports search query matching across name, tagline, description, creator, and tags', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);

    const c1 = makeCard('eldrin', 'Eldrin', ['mystic'], 'Archmage');
    c1.tagline = 'Keeper of astral secrets';
    c1.description = 'Studies ancient leylines in celestial towers';
    repos.characters.upsert(c1);

    const c2 = makeCard('bob', 'Bob the Builder', ['crafting'], 'Town');
    c2.tagline = 'Can we fix it?';
    c2.description = 'Works with bricks and mortar';
    repos.characters.upsert(c2);

    // Search by name
    expect(repos.characters.list({ q: 'eldrin' }).items.map((i) => i.id)).toEqual(['eldrin']);

    // Search by tagline term
    expect(repos.characters.list({ q: 'astral' }).items.map((i) => i.id)).toEqual(['eldrin']);

    // Search by description term
    expect(repos.characters.list({ q: 'leylines' }).items.map((i) => i.id)).toEqual(['eldrin']);

    // Search by tag
    expect(repos.characters.list({ q: 'crafting' }).items.map((i) => i.id)).toEqual(['bob']);
  });

  it('supports keyset cursor pagination across sort orders', async () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);

    const baseNow = 1000000;
    for (let i = 1; i <= 5; i++) {
      const card = makeCard(`char-${i}`, `Hero ${String.fromCharCode(64 + i)}`);
      card.createdAt = baseNow + i * 100;
      card.updatedAt = baseNow + i * 100;
      repos.characters.upsert(card);
    }

    // Sort recent (updatedAt DESC, id ASC) with limit 2
    const page1 = repos.characters.list({ sort: 'recent', limit: 2 });
    expect(page1.items.length).toBe(2);
    expect(page1.items.map((i) => i.id)).toEqual(['char-5', 'char-4']);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = repos.characters.list({ sort: 'recent', limit: 2, cursor: page1.nextCursor! });
    expect(page2.items.length).toBe(2);
    expect(page2.items.map((i) => i.id)).toEqual(['char-3', 'char-2']);
    expect(page2.nextCursor).not.toBeNull();

    const page3 = repos.characters.list({ sort: 'recent', limit: 2, cursor: page2.nextCursor! });
    expect(page3.items.length).toBe(1);
    expect(page3.items.map((i) => i.id)).toEqual(['char-1']);
    expect(page3.nextCursor).toBeNull();

    // Sort name (name ASC, id ASC)
    const namePage1 = repos.characters.list({ sort: 'name', limit: 2 });
    expect(namePage1.items.map((i) => i.name)).toEqual(['Hero A', 'Hero B']);
    expect(namePage1.nextCursor).not.toBeNull();

    const namePage2 = repos.characters.list({ sort: 'name', limit: 3, cursor: namePage1.nextCursor! });
    expect(namePage2.items.map((i) => i.name)).toEqual(['Hero C', 'Hero D', 'Hero E']);
    expect(namePage2.nextCursor).toBeNull();
  });

  it('restricts delete when character has chats unless cascadeChats is true', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);

    repos.characters.upsert(makeCard('hero', 'Hero'));
    repos.personas.upsert({ id: 'p1', name: 'Player', description: 'A brave player', isDefault: false });

    inst.db.run(
      `INSERT INTO chats (id, title, primary_character_id, active_persona_id, created_at, updated_at) VALUES ('c1', 'Chat', 'hero', 'p1', 1, 1)`
    );

    // Delete without cascade -> restricted
    const restricted = repos.characters.remove('hero');
    expect(restricted).toBe('restricted');
    expect(repos.characters.get('hero')).not.toBeNull();

    // Delete with cascadeChats -> deletes chats and character
    const cascadeRes = repos.characters.remove('hero', { cascadeChats: true });
    expect(cascadeRes).toEqual({ chats: 1 });
    expect(repos.characters.get('hero')).toBeNull();
    const chatInDb = inst.db.query(`SELECT id FROM chats WHERE id = 'c1';`).get();
    expect(chatInDb).toBeNull();
  });

  it('duplicates character with (Copy) name and cloned tags', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);

    repos.characters.upsert(makeCard('mage', 'Mage', ['fantasy', 'arcane'], 'Merlin'));
    const copy = repos.characters.duplicate('mage');

    expect(copy.id).toBe('mage-copy');
    expect(copy.name).toBe('Mage (Copy)');
    expect(copy.tags).toEqual(['arcane', 'fantasy']);
    expect(copy.creator).toBe('Merlin');

    // Duplicate again appends suffix
    const copy2 = repos.characters.duplicate('mage');
    expect(copy2.id).toBe('mage-copy-2');
  });

  it('lists popular tags with counts', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);

    repos.characters.upsert(makeCard('c1', 'C1', ['fantasy', 'magic']));
    repos.characters.upsert(makeCard('c2', 'C2', ['fantasy', 'sci-fi']));
    repos.characters.upsert(makeCard('c3', 'C3', ['fantasy']));

    const tags = repos.characters.popularTags();
    expect(tags).toEqual([
      { tag: 'fantasy', count: 3 },
      { tag: 'magic', count: 1 },
      { tag: 'sci-fi', count: 1 }
    ]);
  });
});

import { describe, it, expect, afterEach } from 'bun:test';
import { runMigrations } from '../src/db/migrate';
import { createRepositories } from '../src/db/repositories';
import { openTestDb, type TestDbInstance } from './helpers';
import { ValidationError, type CharacterCard, type Persona } from '@formatavern/shared';

const testEldrin: CharacterCard = {
  id: 'eldrin-the-mage',
  name: 'Eldrin the Mage',
  description: 'An ancient archmage bound to a celestial observatory.',
  personality: 'Cryptic, deliberate, sharp-tongued, but secretly protective.',
  scenario: 'The observatory hums as cosmic alignments shift.',
  firstMessage: '*The observatory hums…* "You arrive as the ley lines align. Speak plainly—time is thin."',
  style: {
    font: { family: "'Cinzel', Georgia, serif", size: '1rem', lineHeight: '1.7' },
    colors: {
      charBubbleBg: 'rgba(69, 26, 3, 0.6)',
      charBubbleText: '#fef3c7',
      charBubbleBorder: 'rgba(180, 83, 9, 0.4)',
      userBubbleBg: 'rgba(15, 23, 42, 0.8)',
      userBubbleText: '#f8fafc',
      accent: '#d97706',
      quote: '#fde047',
      action: '#cbd5e1',
      narratorText: '#d6d3d1'
    },
    bubble: { radius: '1rem', charTail: 'left', padding: '1rem 1.25rem' },
    background: { overlay: 'rgba(10, 10, 15, 0.75)', blur: '4px' }
  },
  stateSchema: {
    mood: {
      type: 'enum',
      values: ['calm', 'curious', 'urgent', 'furious'],
      aliases: { angry: 'furious', anxious: 'urgent' },
      default: 'calm'
    },
    affinity: { type: 'int', min: 0, max: 10, default: 5 },
    danger: { type: 'enum', values: ['low', 'elevated', 'high'], default: 'low' },
    scene: { type: 'string', default: 'spire_observatory' }
  },
  stateBindings: [
    {
      when: { mood: 'furious' },
      set: { 'colors.accent': '#dc2626', 'colors.charBubbleBorder': 'rgba(220, 38, 38, 0.6)' }
    },
    { when: { danger: 'high' }, set: { 'background.overlay': 'rgba(40, 5, 5, 0.8)' } }
  ],
  initialState: { mood: 'calm', affinity: 5, danger: 'low', scene: 'spire_observatory' },
  tags: ['fantasy', 'seed'],
  creator: 'formatavern',
  version: '1'
};

const testPersona: Persona = {
  id: 'persona-default',
  name: 'Traveler',
  description: 'A wandering scholar seeking lost lore.',
  isDefault: true
};

describe('SQLite Repositories', () => {
  let inst: TestDbInstance;

  afterEach(() => {
    inst?.cleanup();
  });

  it('upserts and retrieves CharacterCard with clean JSON round-trip', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);

    repos.characters.upsert(testEldrin);
    const retrieved = repos.characters.get('eldrin-the-mage');
    expect(retrieved).not.toBeNull();
    expect(retrieved).toMatchObject(testEldrin);
    expect(typeof retrieved?.createdAt).toBe('number');
    expect(typeof retrieved?.updatedAt).toBe('number');

    // Verify no undefined keys in object
    for (const key of Object.keys(retrieved!)) {
      expect((retrieved as any)[key]).not.toBeUndefined();
    }
  });

  it('preserves created_at and advances updated_at on subsequent upsert', async () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);

    repos.characters.upsert(testEldrin);
    const firstRow = inst.db
      .query(`SELECT created_at, updated_at FROM characters WHERE id = 'eldrin-the-mage'`)
      .get() as { created_at: number; updated_at: number };

    await new Promise((r) => setTimeout(r, 10));

    repos.characters.upsert({
      ...testEldrin,
      name: 'Eldrin the Archmage'
    });

    const secondRow = inst.db
      .query(`SELECT created_at, updated_at FROM characters WHERE id = 'eldrin-the-mage'`)
      .get() as { created_at: number; updated_at: number };

    expect(secondRow.created_at).toBe(firstRow.created_at);
    expect(secondRow.updated_at).toBeGreaterThan(firstRow.updated_at);
    expect(repos.characters.count()).toBe(1);

    const updatedCard = repos.characters.get('eldrin-the-mage');
    expect(updatedCard?.name).toBe('Eldrin the Archmage');
  });

  it('rejects invalid card writes with ValidationError and leaves table unchanged', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);

    repos.characters.upsert(testEldrin);

    const invalidCard = {
      ...testEldrin,
      style: {
        ...testEldrin.style,
        colors: {} as any // missing required colors
      }
    };

    expect(() => repos.characters.upsert(invalidCard)).toThrow(ValidationError);

    const card = repos.characters.get('eldrin-the-mage');
    expect(card?.name).toBe(testEldrin.name);
  });

  it('returns true on first insertIfAbsent and false on duplicate', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);

    expect(repos.characters.insertIfAbsent(testEldrin)).toBe(true);
    expect(repos.characters.insertIfAbsent(testEldrin)).toBe(false);
    expect(repos.characters.count()).toBe(1);
  });

  it('retrieves default persona via personas.getDefault()', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);

    expect(repos.personas.getDefault()).toBeNull();

    repos.personas.upsert(testPersona);
    const def = repos.personas.getDefault();
    expect(def).not.toBeNull();
    expect(def?.id).toBe('persona-default');
    expect(def?.isDefault).toBe(true);
  });

  it('persists and round-trips card.labels and decor/fx styling', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);

    const richCard: CharacterCard = {
      ...testEldrin,
      labels: { startStory: 'Begin Astral Journey' },
      style: {
        ...testEldrin.style,
        decor: [{ image: '/assets/characters/gem.png', position: 'top-left', opacity: 0.8 }],
        fx: { bubble: 'float' }
      }
    };

    repos.characters.upsert(richCard);
    const retrieved = repos.characters.get('eldrin-the-mage');
    expect(retrieved?.labels?.startStory).toBe('Begin Astral Journey');
    expect(retrieved?.style.decor).toEqual([
      { image: '/assets/characters/gem.png', position: 'top-left', opacity: 0.8 }
    ]);
    expect(retrieved?.style.fx?.bubble).toBe('float');
  });
});

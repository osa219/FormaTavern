import { describe, it, expect } from 'bun:test';
import {
  CharacterCardSchema,
  CharacterSummarySchema,
  CharacterPatchSchema,
  PersonaSchema,
  PersonaPatchSchema,
  ChatListItemSchema,
  TagSchema,
  validate,
  type CharacterCard
} from '../src/index';

const eldrinFixture: CharacterCard = {
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

const aliceFixture: CharacterCard = {
  id: 'alice',
  name: 'Alice',
  description: 'A resourceful survivor navigating a hostile steampunk city.',
  personality: 'Guarded, defiant, razor-sharp instincts, fiercely loyal once won over.',
  scenario: 'Trapped in an abandoned tavern as rain lashes against the reinforced glass.',
  firstMessage: '*Rain lashes the glass.* "Step into the light where I can see your hands. Now."',
  style: {
    font: { family: "'Playfair Display', Georgia, serif", size: '1rem', lineHeight: '1.6' },
    colors: {
      charBubbleBg: 'rgba(24, 8, 16, 0.7)',
      charBubbleText: '#f5e6e8',
      charBubbleBorder: 'rgba(159, 18, 57, 0.4)',
      userBubbleBg: 'rgba(15, 23, 42, 0.8)',
      userBubbleText: '#f8fafc',
      accent: '#9f1239',
      quote: '#fda4af',
      action: '#c4b5fd',
      narratorText: '#e2e8f0'
    },
    bubble: { radius: '0.5rem', charTail: 'left', padding: '1rem 1.25rem' },
    background: { overlay: 'rgba(15, 5, 10, 0.8)', blur: '6px' }
  },
  stateSchema: {
    mood: {
      type: 'enum',
      values: ['guarded', 'defiant', 'warm', 'furious'],
      aliases: { cold: 'guarded' },
      default: 'guarded'
    },
    affinity: { type: 'int', min: 0, max: 10, default: 4 },
    danger: { type: 'enum', values: ['low', 'elevated', 'high'], default: 'elevated' },
    scene: { type: 'string', default: 'tavern_ambush' }
  },
  stateBindings: [
    {
      when: { mood: 'furious' },
      set: { 'colors.accent': '#e11d48', 'colors.charBubbleBorder': 'rgba(225, 29, 72, 0.7)' }
    }
  ],
  initialState: { mood: 'guarded', affinity: 4, danger: 'elevated', scene: 'tavern_ambush' },
  tags: ['gothic', 'steampunk', 'seed'],
  creator: 'formatavern',
  version: '1'
};

describe('Shared Schema Validation', () => {
  it('validates a complete valid CharacterCard (Eldrin)', () => {
    const result = validate(CharacterCardSchema, eldrinFixture);
    expect(result.ok).toBe(true);
  });

  it('fails with exact JSON pointer when required field style.colors.accent is missing', () => {
    const broken = JSON.parse(JSON.stringify(eldrinFixture));
    delete broken.style.colors.accent;

    const result = validate(CharacterCardSchema, broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0].path).toBe('/style/colors/accent');
    }
  });

  it('fails with issue path starting at /stateSchema/mood for invalid state field type', () => {
    const broken = JSON.parse(JSON.stringify(eldrinFixture));
    broken.stateSchema.mood.type = 'bogus';

    const result = validate(CharacterCardSchema, broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0].path.startsWith('/stateSchema/mood')).toBe(true);
    }
  });

  it('rejects CSS token injection attempts and invalid asset paths', () => {
    const cssInjection = JSON.parse(JSON.stringify(eldrinFixture));
    cssInjection.style.colors.accent = 'red; background:url(x)';
    const r1 = validate(CharacterCardSchema, cssInjection);
    expect(r1.ok).toBe(false);

    const evilAsset = JSON.parse(JSON.stringify(eldrinFixture));
    evilAsset.avatar = 'http://evil/x.png';
    const r2 = validate(CharacterCardSchema, evilAsset);
    expect(r2.ok).toBe(false);
  });

  it('strips unknown keys without mutating the input object', () => {
    const input = {
      ...JSON.parse(JSON.stringify(eldrinFixture)),
      unknownKey: 1,
      deepUnknown: { a: 2 }
    };
    const result = validate(CharacterCardSchema, input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect('unknownKey' in result.value).toBe(false);
      expect('deepUnknown' in result.value).toBe(false);
    }
    expect('unknownKey' in input).toBe(true);
  });

  it('applies default for isDefault in PersonaSchema', () => {
    const rawPersona = {
      id: 'persona-default',
      name: 'Traveler',
      description: 'A wandering scholar.'
    };
    const result = validate(PersonaSchema, rawPersona);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isDefault).toBe(false);
    }
  });

  it('passes cross-check verification on seed fixtures', () => {
    for (const card of [eldrinFixture, aliceFixture]) {
      const stateSchema = card.stateSchema ?? {};
      const initialState = (card.initialState ?? {}) as Record<string, unknown>;

      // 1. Every initialState key exists in stateSchema
      for (const [key, val] of Object.entries(initialState)) {
        const field = stateSchema[key];
        expect(field).toBeDefined();
        if (field.type === 'enum') {
          expect(field.values).toContain(val as string);
        } else if (field.type === 'int') {
          expect(typeof val).toBe('number');
          expect((val as number) >= field.min && (val as number) <= field.max).toBe(true);
        } else if (field.type === 'string') {
          expect(typeof val).toBe('string');
        }
      }

      // 2. Every stateBinding set key resolves to an existing path in style
      for (const binding of card.stateBindings ?? []) {
        for (const targetPath of Object.keys(binding.set)) {
          const parts = targetPath.split('.');
          let curr: unknown = card.style;
          for (const p of parts) {
            expect(curr).toBeDefined();
            curr = (curr as Record<string, unknown>)[p];
          }
          expect(curr).toBeDefined();
        }
      }
    }
  });

  describe('Phase 5 Schemas Extension', () => {
    it('validates TagSchema pattern and constraints', () => {
      expect(validate(TagSchema, 'fantasy').ok).toBe(true);
      expect(validate(TagSchema, 'sci-fi').ok).toBe(true);
      expect(validate(TagSchema, 'cyber_punk').ok).toBe(false);
      expect(validate(TagSchema, 'UPPERCASE').ok).toBe(false);
      expect(validate(TagSchema, '').ok).toBe(false);
    });

    it('validates CharacterCard additions (tagline, creator, tags, showcase, timestamps)', () => {
      const extendedCard = {
        ...eldrinFixture,
        tagline: 'Bound to celestial observatory',
        creator: 'eldrin-creator',
        tags: ['fantasy', 'magic'],
        showcase: '# Eldrin\n\nAncient mage lore and background.',
        createdAt: 1000,
        updatedAt: 2000
      };
      const res = validate(CharacterCardSchema, extendedCard);
      expect(res.ok).toBe(true);
    });

    it('rejects CharacterCard with invalid tags or oversized showcase', () => {
      const invalidTags = {
        ...eldrinFixture,
        tags: ['valid-tag', 'INVALID TAG!']
      };
      expect(validate(CharacterCardSchema, invalidTags).ok).toBe(false);

      const oversizedShowcase = {
        ...eldrinFixture,
        showcase: 'x'.repeat(65_537)
      };
      expect(validate(CharacterCardSchema, oversizedShowcase).ok).toBe(false);
    });

    it('validates CharacterSummarySchema', () => {
      const summary = {
        id: 'eldrin-the-mage',
        name: 'Eldrin the Mage',
        tagline: 'Ancient archmage',
        tags: ['fantasy'],
        style: eldrinFixture.style,
        storyCount: 5,
        lastStoryAt: 5000,
        updatedAt: 6000
      };
      const res = validate(CharacterSummarySchema, summary);
      expect(res.ok).toBe(true);
    });

    it('enforces expectedUpdatedAt on CharacterPatchSchema and PersonaPatchSchema', () => {
      const validCharPatch = { name: 'Eldrin Renewed', expectedUpdatedAt: 12345 };
      expect(validate(CharacterPatchSchema, validCharPatch).ok).toBe(true);

      const invalidCharPatch = { name: 'Eldrin Renewed' };
      expect(validate(CharacterPatchSchema, invalidCharPatch).ok).toBe(false);

      const validPersonaPatch = { name: 'New Persona', expectedUpdatedAt: 12345 };
      expect(validate(PersonaPatchSchema, validPersonaPatch).ok).toBe(true);

      const invalidPersonaPatch = { name: 'New Persona' };
      expect(validate(PersonaPatchSchema, invalidPersonaPatch).ok).toBe(false);
    });

    it('validates ChatListItemSchema', () => {
      const item = {
        id: 'chat-1',
        title: 'Story with Eldrin',
        primaryCharacterId: 'eldrin-the-mage',
        activePersonaId: 'persona-default',
        personaId: 'persona-default',
        activeLeafId: 'msg-1',
        activeGenerationMessageId: null,
        createdAt: 1000,
        updatedAt: 2000,
        metadata: {},
        messageCount: 10,
        turnCount: 5
      };
      expect(validate(ChatListItemSchema, item).ok).toBe(true);
    });
  });
});

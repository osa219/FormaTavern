import { describe, it, expect } from 'bun:test';
import { CLASSIC_LAYOUT } from '../../src/layout/presets';
import { CharacterLayoutSchema } from '../../src/schemas/layout';
import { validate } from '../../src/validate';

describe('Layout Presets (Invariant L5)', () => {
  it('validates CLASSIC_LAYOUT against CharacterLayoutSchema', () => {
    const res = validate(CharacterLayoutSchema, CLASSIC_LAYOUT);
    expect(res.ok).toBe(true);
    if (!res.ok) {
      expect(res.errors).toEqual([]);
    }
  });

  it('asserts CLASSIC_LAYOUT is strictly layout-only and contains zero style keys (L5)', () => {
    const forbiddenStyleKeys = [
      'style',
      'colors',
      'font',
      'background',
      'charBubbleBg',
      'userBubbleBg',
      'accent',
      'charBubbleText',
      'userBubbleText'
    ];

    const keys = Object.keys(CLASSIC_LAYOUT);
    for (const forbidden of forbiddenStyleKeys) {
      expect(keys.includes(forbidden)).toBe(false);
      expect((CLASSIC_LAYOUT as Record<string, unknown>)[forbidden]).toBeUndefined();
    }
  });

  it('matches the exact blueprint §2.2 document structure', () => {
    expect(CLASSIC_LAYOUT).toEqual({
      align: 'split',
      container: 'bubble',
      headers: 'voices',
      avatars: { character: false, persona: false, npc: false, shape: 'circle', size: '2rem' },
      narrator: 'centered',
      names: { showCharacter: true, showPersona: true, showNpc: true, format: 'classic' },
      tails: true
    });
  });
});

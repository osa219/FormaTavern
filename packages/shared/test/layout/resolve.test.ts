import { describe, it, expect } from 'bun:test';
import { resolveLayout, NEUTRAL_LAYOUT_DOC, CLASSIC_LAYOUT } from '../../src/layout/resolve';
import type { CharacterLayout } from '../../src/schemas/layout';

describe('Layout Resolver (Invariant L3)', () => {
  it('resolves null or undefined to neutral defaults in narrative mode', () => {
    const fromNull = resolveLayout(null, 'narrative');
    const fromUndefined = resolveLayout(undefined, 'narrative');

    expect(fromUndefined).toEqual(NEUTRAL_LAYOUT_DOC);
    expect(fromNull).toEqual(NEUTRAL_LAYOUT_DOC);

    expect(NEUTRAL_LAYOUT_DOC.align).toBe('uniform-left');
    expect(NEUTRAL_LAYOUT_DOC.container).toBe('row');
    expect(NEUTRAL_LAYOUT_DOC.headers).toBe('voices');
    expect(NEUTRAL_LAYOUT_DOC.avatars).toEqual({
      character: false,
      persona: false,
      npc: false,
      shape: 'circle',
      size: '2rem'
    });
    expect(NEUTRAL_LAYOUT_DOC.narrator).toBe('dim-only');
    expect(NEUTRAL_LAYOUT_DOC.names).toEqual({
      showCharacter: true,
      showPersona: true,
      showNpc: true,
      format: 'plain'
    });
    expect(NEUTRAL_LAYOUT_DOC.tails).toBe(false);
    expect(NEUTRAL_LAYOUT_DOC.inert).toEqual([]);
  });

  it('forces headers to single and marks narrator/npc inert in classic mode', () => {
    const classicResolved = resolveLayout(undefined, 'classic');

    expect(classicResolved.headers).toBe('single');
    expect(classicResolved.inert).toEqual(['narrator', 'npc']);

    // Even if layout requested 'voices', classic forces 'single'
    const requestedVoices = resolveLayout({ headers: 'voices' }, 'classic');
    expect(requestedVoices.headers).toBe('single');
  });

  it('honors field overrides in narrative mode', () => {
    const custom: CharacterLayout = {
      align: 'split',
      container: 'bubble',
      headers: 'single',
      avatars: {
        character: true,
        persona: true,
        npc: false,
        shape: 'rounded',
        size: '2.5rem'
      },
      narrator: 'centered',
      names: {
        showCharacter: false,
        showPersona: true,
        showNpc: true,
        format: 'classic'
      },
      tails: true
    };

    const resolved = resolveLayout(custom, 'narrative');
    expect(resolved.align).toBe('split');
    expect(resolved.container).toBe('bubble');
    expect(resolved.headers).toBe('single');
    expect(resolved.avatars.character).toBe(true);
    expect(resolved.avatars.shape).toBe('rounded');
    expect(resolved.avatars.size).toBe('2.5rem');
    expect(resolved.narrator).toBe('centered');
    expect(resolved.names.showCharacter).toBe(false);
    expect(resolved.names.format).toBe('classic');
    expect(resolved.tails).toBe(true);
  });

  it('forces tails to false when container is not bubble', () => {
    const rowWithTails: CharacterLayout = {
      container: 'row',
      tails: true
    };
    expect(resolveLayout(rowWithTails, 'narrative').tails).toBe(false);

    const flatWithTails: CharacterLayout = {
      container: 'flat',
      tails: true
    };
    expect(resolveLayout(flatWithTails, 'narrative').tails).toBe(false);

    const bubbleWithTails: CharacterLayout = {
      container: 'bubble',
      tails: true
    };
    expect(resolveLayout(bubbleWithTails, 'narrative').tails).toBe(true);
  });

  it('is deterministic: identical inputs yield identical outputs', () => {
    const doc1 = resolveLayout(CLASSIC_LAYOUT, 'narrative');
    const doc2 = resolveLayout(CLASSIC_LAYOUT, 'narrative');
    expect(doc1).toEqual(doc2);
  });
});

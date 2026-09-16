import { describe, it, expect } from 'bun:test';
import { resolveLayout, NEUTRAL_LAYOUT_DOC, CLASSIC_LAYOUT } from '@formatavern/shared';
import { layoutRootAttrs, layoutRootStyle, turnAttrs, rowAttrs } from '../src/lib/chat/layoutAttrs';

describe('layoutAttrs (Track-2 Data Attributes & Variables)', () => {
  it('maps NEUTRAL_LAYOUT_DOC to neutral root attributes', () => {
    const attrs = layoutRootAttrs(NEUTRAL_LAYOUT_DOC);
    expect(attrs).toEqual({
      'data-align': 'uniform-left',
      'data-container': 'row',
      'data-headers': 'voices',
      'data-narrator': 'dim-only',
      'data-name-format': 'plain',
      'data-tails': 'off',
      'data-avatar-shape': 'circle'
    });
  });

  it('maps classic resolved layout to classic root attributes', () => {
    const classicResolved = resolveLayout(CLASSIC_LAYOUT, 'narrative');
    const attrs = layoutRootAttrs(classicResolved);
    expect(attrs).toEqual({
      'data-align': 'split',
      'data-container': 'bubble',
      'data-headers': 'voices',
      'data-narrator': 'centered',
      'data-name-format': 'classic',
      'data-tails': 'on',
      'data-avatar-shape': 'circle'
    });
  });

  it('emits --msg-avatar-size inline CSS variable from avatars.size', () => {
    const resolved = resolveLayout(
      { avatars: { character: true, persona: false, npc: false, shape: 'square', size: '2.5rem' } },
      'narrative'
    );
    const style = layoutRootStyle(resolved);
    expect(style).toContain('--msg-avatar-size: 2.5rem');
  });

  it('emits turn and row attributes faithfully', () => {
    const resolved = resolveLayout({ headers: 'single' }, 'narrative');
    expect(turnAttrs('persona', resolved)).toEqual({
      'data-role': 'persona',
      'data-headers': 'single'
    });

    expect(rowAttrs('character')).toEqual({
      'data-kind': 'character'
    });
    expect(rowAttrs('narrator')).toEqual({
      'data-kind': 'narrator'
    });
    expect(rowAttrs('npc')).toEqual({
      'data-kind': 'npc'
    });
  });
});

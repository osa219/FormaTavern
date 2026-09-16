import type { CharacterLayout } from '../schemas/layout';

/**
 * The Classic layout preset reproduces the legacy presentation pixel-close.
 * Backfill stamps this document into all pre-existing rows (with tails honoring
 * legacy charTail).
 *
 * Invariant L5: The Classic preset is layout-only. It never writes color, font,
 * or background tokens.
 */
export const CLASSIC_LAYOUT: CharacterLayout = {
  align: 'split',
  container: 'bubble',
  headers: 'voices',
  avatars: { character: false, persona: false, npc: false, shape: 'circle', size: '2rem' },
  narrator: 'centered',
  names: { showCharacter: true, showPersona: true, showNpc: true, format: 'classic' },
  tails: true
} as const;

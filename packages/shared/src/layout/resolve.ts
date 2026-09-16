import type { CharacterLayout } from '../schemas/layout';
import { CLASSIC_LAYOUT } from './presets';

export { CLASSIC_LAYOUT };

export interface ResolvedLayout {
  align: 'uniform-left' | 'split';
  container: 'row' | 'bubble' | 'flat';
  headers: 'single' | 'voices';
  avatars: {
    character: boolean;
    persona: boolean;
    npc: boolean;
    shape: 'circle' | 'rounded' | 'square';
    size: string;
  };
  narrator: 'dim-only' | 'inline' | 'centered';
  names: {
    showCharacter: boolean;
    showPersona: boolean;
    showNpc: boolean;
    format: 'plain' | 'classic';
  };
  tails: boolean;
  inert: Array<'narrator' | 'npc'>;
  warnings: string[];
}

/**
 * Pure, deterministic layout resolution for chat message logs.
 *
 * Invariant L3: Layout resolution is pure, imports no DOM/Node/Bun,
 * and produces identical ResolvedLayout for identical (layout, narrativeMode) inputs.
 */
export function resolveLayout(
  layout: CharacterLayout | null | undefined,
  narrativeMode: 'classic' | 'narrative'
): ResolvedLayout {
  const warnings: string[] = [];

  const align = layout?.align ?? 'uniform-left';
  const container = layout?.container ?? 'row';

  // Mode matrix (§2.3): classic forces 'single'; narrative defaults unset to 'voices'
  const headers: 'single' | 'voices' =
    narrativeMode === 'classic'
      ? 'single'
      : (layout?.headers ?? 'voices');

  const avatars = {
    character: layout?.avatars?.character ?? false,
    persona: layout?.avatars?.persona ?? false,
    npc: layout?.avatars?.npc ?? false,
    shape: layout?.avatars?.shape ?? 'circle',
    size: layout?.avatars?.size ?? '2rem'
  };

  const narrator = layout?.narrator ?? 'dim-only';

  const names = {
    showCharacter: layout?.names?.showCharacter ?? true,
    showPersona: layout?.names?.showPersona ?? true,
    showNpc: layout?.names?.showNpc ?? true,
    format: layout?.names?.format ?? 'plain'
  };

  // Invariant: tails are effective only when container is 'bubble'
  const tails = container === 'bubble' ? Boolean(layout?.tails) : false;

  const inert: Array<'narrator' | 'npc'> =
    narrativeMode === 'classic' ? ['narrator', 'npc'] : [];

  return {
    align,
    container,
    headers,
    avatars,
    narrator,
    names,
    tails,
    inert,
    warnings
  };
}

/**
 * The normative neutral layout document for blank cards in narrative mode.
 */
export const NEUTRAL_LAYOUT_DOC: ResolvedLayout = resolveLayout(undefined, 'narrative');

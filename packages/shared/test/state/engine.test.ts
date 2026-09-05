import { describe, it, expect } from 'bun:test';
import { defaultState, resolveState } from '../../src/state/engine';
import type { CharacterCard } from '../../src/schemas/character';
import type { StateField } from '../../src/schemas/state';

describe('State Engine (defaultState & resolveState)', () => {
  const eldrinCard: Pick<CharacterCard, 'stateSchema' | 'initialState'> = {
    stateSchema: {
      mood: {
        type: 'enum',
        values: ['calm', 'curious', 'urgent', 'furious'],
        aliases: { angry: 'furious', contemplative: 'calm' },
        default: 'calm'
      },
      affinity: {
        type: 'int',
        min: 0,
        max: 10,
        default: 5
      },
      danger: {
        type: 'enum',
        values: ['low', 'medium', 'high', 'critical'],
        default: 'low'
      },
      scene: {
        type: 'string',
        default: 'spire_observatory'
      }
    },
    initialState: {
      mood: 'calm',
      affinity: 5,
      danger: 'low',
      scene: 'spire_observatory'
    }
  };

  it('derives defaultState from schema and initialState', () => {
    const s = defaultState(eldrinCard);
    expect(s).toEqual({
      mood: 'calm',
      affinity: 5,
      danger: 'low',
      scene: 'spire_observatory'
    });
  });

  it('resolves enum aliases case-insensitively and maps to canonical values', () => {
    const prev = defaultState(eldrinCard);
    const res = resolveState(prev, { mood: 'AnGrY' }, eldrinCard.stateSchema);
    expect(res.source).toBe('patch');
    expect(res.state.mood).toBe('furious');
    // Missing keys carry forward
    expect(res.state.affinity).toBe(5);
    expect(res.state.danger).toBe('low');
    expect(res.state.scene).toBe('spire_observatory');
  });

  it('parses numeric string, rounds float, clamps within [min, max], and warns', () => {
    const prev = defaultState(eldrinCard);

    // Numeric string "7"
    const r1 = resolveState(prev, { affinity: '7' }, eldrinCard.stateSchema);
    expect(r1.state.affinity).toBe(7);

    // Float rounding 7.6 -> 8
    const r2 = resolveState(prev, { affinity: 7.6 }, eldrinCard.stateSchema);
    expect(r2.state.affinity).toBe(8);

    // Upper clamp 15 -> 10 + warning
    const r3 = resolveState(prev, { affinity: 15 }, eldrinCard.stateSchema);
    expect(r3.state.affinity).toBe(10);
    expect(r3.warnings.some((w) => w.includes('Clamped "affinity"'))).toBe(true);

    // Lower clamp -5 -> 0 + warning
    const r4 = resolveState(prev, { affinity: -5 }, eldrinCard.stateSchema);
    expect(r4.state.affinity).toBe(0);
    expect(r4.warnings.some((w) => w.includes('Clamped "affinity"'))).toBe(true);
  });

  it('drops unknown keys and null values with warnings', () => {
    const prev = defaultState(eldrinCard);
    const res = resolveState(prev, { mana: 100, mood: null }, eldrinCard.stateSchema);
    expect(res.state).toEqual(prev);
    expect(res.warnings.some((w) => w.includes('Unknown state key "mana"'))).toBe(true);
    expect(res.warnings.some((w) => w.includes('null or undefined value'))).toBe(true);
  });

  it('preserves primitive values in schemaless (classic) mode while dropping objects/arrays', () => {
    const prev = { score: 10, note: 'classic' };
    const patch = { score: 20, active: true, complex: { a: 1 }, list: [1, 2] };
    const res = resolveState(prev, patch, undefined);
    expect(res.state).toEqual({
      score: 20,
      note: 'classic',
      active: true
    });
    expect(res.warnings.some((w) => w.includes('Non-primitive value'))).toBe(true);
  });

  it('returns inherited state when patch is null', () => {
    const prev = { mood: 'calm' };
    const res = resolveState(prev, null, eldrinCard.stateSchema);
    expect(res.source).toBe('inherited');
    expect(res.state).toEqual(prev);
    expect(res.warnings).toEqual([]);
  });
});

import { describe, it, expect } from 'bun:test';
import { isEmptyOutputError, EMPTY_OUTPUT_BLANK } from '@formatavern/shared';
import { prefs } from '../src/lib/state/prefs.svelte';

describe('Empty replies handling', () => {
  it('discards empty debris by default (keepEmptyReplies off)', () => {
    expect(prefs.keepEmptyReplies).toBe(false);
  });

  it('matches backend empty-output errors for the discard path', () => {
    expect(isEmptyOutputError({ error: { message: EMPTY_OUTPUT_BLANK, recoverable: true } })).toBe(true);
    expect(
      isEmptyOutputError({ error: { message: 'Model returned thinking only, no story output', recoverable: true } })
    ).toBe(true);
    expect(isEmptyOutputError({ error: { message: 'boom', recoverable: true } })).toBe(false);
  });
});

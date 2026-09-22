import { describe, it, expect } from 'bun:test';
import {
  EMPTY_OUTPUT_BLANK,
  EMPTY_OUTPUT_STATE_ONLY,
  EMPTY_OUTPUT_THINKING_ONLY,
  isEmptyOutputError
} from '../../src/text/emptyOutput';

describe('isEmptyOutputError', () => {
  it('matches the three backend empty-output messages when recoverable', () => {
    for (const message of [EMPTY_OUTPUT_THINKING_ONLY, EMPTY_OUTPUT_STATE_ONLY, EMPTY_OUTPUT_BLANK]) {
      expect(isEmptyOutputError({ error: { message, recoverable: true } })).toBe(true);
    }
  });

  it('rejects non-recoverable errors, unknown messages, and missing metadata', () => {
    expect(isEmptyOutputError({ error: { message: EMPTY_OUTPUT_BLANK, recoverable: false } })).toBe(false);
    expect(isEmptyOutputError({ error: { message: 'boom', recoverable: true } })).toBe(false);
    expect(isEmptyOutputError({})).toBe(false);
    expect(isEmptyOutputError(null)).toBe(false);
    expect(isEmptyOutputError(undefined)).toBe(false);
  });
});

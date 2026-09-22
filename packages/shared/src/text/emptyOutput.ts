/**
 * Empty-output failure contract for think-only / state-only / blank replies.
 *
 * When a generation finalizes with zero story segments, the backend marks the
 * turn `error` with one of these recoverable messages. The frontend matches on
 * them (via `isEmptyOutputError`) to discard the debris row unless the user
 * opted into `Keep empty replies (debug)`.
 */

export const EMPTY_OUTPUT_THINKING_ONLY = 'Model returned thinking only, no story output';
export const EMPTY_OUTPUT_STATE_ONLY = 'Model returned state only, no story output';
export const EMPTY_OUTPUT_BLANK = 'Model returned no story output';

const EMPTY_OUTPUT_MESSAGES: ReadonlySet<string> = new Set([
  EMPTY_OUTPUT_THINKING_ONLY,
  EMPTY_OUTPUT_STATE_ONLY,
  EMPTY_OUTPUT_BLANK
]);

export function isEmptyOutputError(metadata?: { error?: { message?: string; recoverable?: boolean } } | null): boolean {
  const err = metadata?.error;
  if (!err || err.recoverable !== true) return false;
  return typeof err.message === 'string' && EMPTY_OUTPUT_MESSAGES.has(err.message);
}

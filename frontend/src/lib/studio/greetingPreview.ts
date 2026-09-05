import { parseEnvelope, type ParseResult } from '@formatavern/shared';

/**
 * Parses author's greeting / firstMessage into narrative segments.
 * Permitted by Invariant U3 Amendment A-U3 for studio live preview.
 */
export function parseGreeting(firstMessage: string, primaryCharacter = 'Companion'): ParseResult {
  if (!firstMessage) {
    return {
      segments: [],
      statePatch: null,
      reasoning: null,
      truncatedAt: null,
      truncatedIndex: null,
      dialect: 'none',
      adherent: false,
      warnings: [],
      heldBack: '',
      parserVersion: 2
    };
  }
  return parseEnvelope(firstMessage, {
    primaryCharacter: primaryCharacter || 'Companion',
    streaming: false
  });
}

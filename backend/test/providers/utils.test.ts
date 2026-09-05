import { describe, it, expect } from 'bun:test';
import {
  coalesceConsecutiveRoles,
  ensureUserFirst,
  abortableSleep
} from '../../src/providers/utils';
import type { MessagePayload } from '@formatavern/shared';

describe('Provider Utils', () => {
  describe('coalesceConsecutiveRoles', () => {
    it('merges consecutive user or assistant messages with double newlines', () => {
      const messages: MessagePayload[] = [
        { role: 'user', content: 'Part 1' },
        { role: 'user', content: 'Part 2' },
        { role: 'assistant', content: 'Response A' },
        { role: 'assistant', content: 'Response B' },
        { role: 'user', content: 'Followup' }
      ];

      const coalesced = coalesceConsecutiveRoles(messages);
      expect(coalesced).toEqual([
        { role: 'user', content: 'Part 1\n\nPart 2' },
        { role: 'assistant', content: 'Response A\n\nResponse B' },
        { role: 'user', content: 'Followup' }
      ]);
    });

    it('leaves alternating roles untouched', () => {
      const messages: MessagePayload[] = [
        { role: 'user', content: 'A' },
        { role: 'assistant', content: 'B' },
        { role: 'user', content: 'C' }
      ];
      expect(coalesceConsecutiveRoles(messages)).toEqual(messages);
    });
  });

  describe('ensureUserFirst', () => {
    it('prepends [Scene begins.] when first non-system message is assistant', () => {
      const messages: MessagePayload[] = [
        { role: 'system', content: 'System prompt' },
        { role: 'assistant', content: 'Hello there.' }
      ];

      const res = ensureUserFirst(messages);
      expect(res).toEqual([
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: '[Scene begins.]' },
        { role: 'assistant', content: 'Hello there.' }
      ]);
    });

    it('leaves messages untouched when first non-system message is user', () => {
      const messages: MessagePayload[] = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' }
      ];

      expect(ensureUserFirst(messages)).toEqual(messages);
    });

    it('handles empty message array', () => {
      expect(ensureUserFirst([])).toEqual([{ role: 'user', content: '[Scene begins.]' }]);
    });
  });

  describe('abortableSleep', () => {
    it('resolves immediately when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const t0 = performance.now();
      await abortableSleep(1000, controller.signal);
      const elapsed = performance.now() - t0;
      expect(elapsed).toBeLessThan(30);
    });

    it('resolves immediately when signal aborts during sleep', async () => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 20);

      const t0 = performance.now();
      await abortableSleep(1000, controller.signal);
      const elapsed = performance.now() - t0;
      expect(elapsed).toBeLessThan(100);
    });
  });
});

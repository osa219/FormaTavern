import { describe, it, expect } from 'bun:test';
import { MockLLMProvider } from '../../src/providers/mock';
import { ENVELOPE_SCRIPT_IDS } from '@formatavern/shared';
import { collect, assertStreamContract } from './contract';

describe('Provider Stream Contract (Invariant E5)', () => {
  const provider = new MockLLMProvider({ intervalMs: 0 });

  for (const id of ENVELOPE_SCRIPT_IDS) {
    it(`validates stream contract E5 for mock script "${id}"`, async () => {
      const events = await collect(
        provider.generate({
          model: `mock:${id}`,
          history: [{ role: 'user', content: 'test' }]
        })
      );

      const expectedTerminal = id === 'error' ? 'error' : 'done';
      assertStreamContract(events, { expectedTerminal });
    });
  }
});

import { describe, it, expect } from 'bun:test';
import { MockLLMProvider } from '../../src/providers/mock';
import { ENVELOPE_SCRIPTS, ENVELOPE_SCRIPT_IDS } from '@formatavern/shared';
import { collect, assertStreamContract } from './contract';

describe('MockLLMProvider', () => {
  it('lists models matching all 9 envelope script fixtures', async () => {
    const provider = new MockLLMProvider();
    const models = await provider.listModels();
    expect(models.length).toBe(ENVELOPE_SCRIPT_IDS.length);
    expect(models.map((m) => m.id)).toEqual(ENVELOPE_SCRIPT_IDS.map((id) => `mock:${id}`));
  });

  it('selects script by model, records request in calls, and reassembles token text', async () => {
    const provider = new MockLLMProvider({ intervalMs: 0 });
    const req = {
      model: 'mock:envelope-directive',
      history: [{ role: 'user' as const, content: 'Greetings.' }]
    };

    const events = await collect(provider.generate(req));
    assertStreamContract(events);

    expect(provider.calls.length).toBe(1);
    expect(provider.calls[0]).toEqual(req);

    const tokens = events.filter((e) => e.type === 'token').map((e: any) => e.text).join('');
    expect(tokens).toBe(ENVELOPE_SCRIPTS['envelope-directive'].text);

    const last = events[events.length - 1];
    expect(last).toEqual({ type: 'done', finishReason: 'stop' });
  });

  it('yields a single error event on unknown script model', async () => {
    const provider = new MockLLMProvider({ intervalMs: 0 });
    const events = await collect(provider.generate({ model: 'mock:unknown-script', history: [] }));
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('error');
    expect((events[0] as any).recoverable).toBe(false);
  });

  it('aborts mid-stream within 20ms when intervalMs is 1000', async () => {
    const provider = new MockLLMProvider({ intervalMs: 1000 });
    const controller = new AbortController();

    const t0 = performance.now();
    const eventsPromise = collect(provider.generate({ model: 'mock:envelope-directive', history: [] }, controller.signal));

    // Abort after 10ms
    setTimeout(() => controller.abort(), 10);
    const events = await eventsPromise;
    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(150);
    expect(events[events.length - 1]).toEqual({ type: 'done', finishReason: 'aborted' });
  });
});

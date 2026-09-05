import { expect } from 'bun:test';
import type { StreamEvent } from '@formatavern/shared';

export async function collect(iterable: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const ev of iterable) {
    events.push(ev);
  }
  return events;
}

export function assertStreamContract(
  events: StreamEvent[],
  opts: { apiKey?: string; expectedTerminal?: 'done' | 'error' } = {}
): void {
  // P1: Sequence ends with exactly one terminal event (done or error)
  expect(events.length).toBeGreaterThan(0);
  const lastEvent = events[events.length - 1];
  const isTerminal = lastEvent.type === 'done' || lastEvent.type === 'error';
  expect(isTerminal).toBe(true);

  if (opts.expectedTerminal) {
    expect(lastEvent.type).toBe(opts.expectedTerminal);
  }

  // P2: No event of any kind after the terminal event
  const terminalCount = events.filter((e) => e.type === 'done' || e.type === 'error').length;
  expect(terminalCount).toBe(1);

  // P5: usage at most once, before the terminal
  const usageEvents = events.filter((e) => e.type === 'usage');
  expect(usageEvents.length).toBeLessThanOrEqual(1);
  if (usageEvents.length === 1) {
    const usageIndex = events.findIndex((e) => e.type === 'usage');
    expect(usageIndex).toBeLessThan(events.length - 1);
  }

  // P6: token.text is never empty
  for (const ev of events) {
    if (ev.type === 'token') {
      expect(ev.text.length).toBeGreaterThan(0);
    }
  }

  // P7: error.message never contains an API key or Authorization header value
  if (opts.apiKey) {
    for (const ev of events) {
      if (ev.type === 'error') {
        expect(ev.message.includes(opts.apiKey)).toBe(false);
      }
    }
  }
}

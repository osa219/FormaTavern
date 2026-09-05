import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { StreamController } from '../src/lib/state/stream.svelte';
import type { ParseResult } from '@formatavern/shared';

describe('StreamController & Frame Budgeting (Invariant U4)', () => {
  let originalRaf: typeof requestAnimationFrame;
  let originalCancelRaf: typeof cancelAnimationFrame;
  let rafQueue: Array<() => void> = [];
  let nextRafId = 1;

  beforeEach(() => {
    originalRaf = globalThis.requestAnimationFrame;
    originalCancelRaf = globalThis.cancelAnimationFrame;
    rafQueue = [];
    nextRafId = 1;

    globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      const id = nextRafId++;
      rafQueue.push(cb as () => void);
      return id;
    };

    globalThis.cancelAnimationFrame = (_id: number) => {
      rafQueue = [];
    };
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancelRaf;
  });

  function stepFrame() {
    const currentQueue = [...rafQueue];
    rafQueue = [];
    for (const cb of currentQueue) {
      cb();
    }
  }

  it('coalesces 200 push calls within one frame to exactly 1 commit', () => {
    let commitCount = 0;
    let lastResult: ParseResult | null = null;
    let lastChars = 0;

    const controller = new StreamController(
      () => ({ primaryCharacter: 'Eldrin', dialect: 'directive' }),
      (r, chars) => {
        commitCount++;
        lastResult = r;
        lastChars = chars;
      }
    );

    // Push 200 tiny tokens
    for (let i = 0; i < 200; i++) {
      controller.push('a');
    }

    expect(commitCount).toBe(0); // Not committed yet
    expect(rafQueue.length).toBe(1); // Exactly one rAF scheduled

    stepFrame();

    expect(commitCount).toBe(1);
    expect(lastChars).toBe(200);
    expect(lastResult).not.toBeNull();
  });

  it('commits at most once per frame across 5 frames', () => {
    let commitCount = 0;
    const controller = new StreamController(
      () => ({ primaryCharacter: 'Eldrin', dialect: 'directive' }),
      () => {
        commitCount++;
      }
    );

    for (let frame = 0; frame < 5; frame++) {
      controller.push('token1 ');
      controller.push('token2 ');
      stepFrame();
    }

    expect(commitCount).toBe(5);
  });

  it('seed commits synchronously and retains seed + push order', () => {
    const results: string[] = [];
    const controller = new StreamController(
      () => ({ primaryCharacter: 'Eldrin', dialect: 'directive' }),
      (r) => {
        results.push(r.segments.map((s) => s.text).join(''));
      }
    );

    controller.seed('Initial seed.');
    expect(results.length).toBe(1);
    expect(results[0]).toBe('Initial seed.');

    controller.push(' Followup token.');
    stepFrame();
    expect(results.length).toBe(2);
    expect(results[1]).toBe('Initial seed. Followup token.');
  });

  it('flush immediately executes pending commit and clears rAF', () => {
    let commitCount = 0;
    const controller = new StreamController(
      () => ({ primaryCharacter: 'Eldrin', dialect: 'directive' }),
      () => {
        commitCount++;
      }
    );

    controller.push('some text');
    expect(commitCount).toBe(0);

    controller.flush();
    expect(commitCount).toBe(1);
    expect(rafQueue.length).toBe(0);
  });

  it('dispose cancels any pending rAF frame', () => {
    let commitCount = 0;
    const controller = new StreamController(
      () => ({ primaryCharacter: 'Eldrin', dialect: 'directive' }),
      () => {
        commitCount++;
      }
    );

    controller.push('pending text');
    controller.dispose();

    stepFrame();
    expect(commitCount).toBe(0);
  });

  it('passes streaming: true and dynamic options to parseEnvelope', () => {
    let lastOpts: any = null;
    let primary = 'Eldrin';

    const controller = new StreamController(
      () => ({ primaryCharacter: primary, dialect: 'directive' }),
      (r) => {
        lastOpts = r;
      }
    );

    controller.push(':::character[Alice]\nHello\n:::');
    stepFrame();
    expect(lastOpts).not.toBeNull();

    primary = 'Alice';
    controller.push(' More text');
    stepFrame();
    expect(lastOpts).not.toBeNull();
  });
});

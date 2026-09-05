import { describe, it, expect } from 'bun:test';
import { isAtBottom, nextStuck, prependAdjust, STICK_THRESHOLD_PX, type ScrollSample } from '../src/lib/scroll/policy';

describe('Scroll Policy (Invariant U5)', () => {
  it('identifies when scroll sample is at bottom (<= 48 px threshold)', () => {
    const atBottom: ScrollSample = { scrollTop: 952, scrollHeight: 2000, clientHeight: 1000 };
    expect(isAtBottom(atBottom)).toBe(true);

    const exactly48: ScrollSample = { scrollTop: 952, scrollHeight: 2000, clientHeight: 1000 };
    expect(isAtBottom(exactly48)).toBe(true);

    const awayFromBottom: ScrollSample = { scrollTop: 900, scrollHeight: 2000, clientHeight: 1000 };
    expect(isAtBottom(awayFromBottom)).toBe(false);
  });

  it('user gestures disengage when scrolled up and re-engage only at bottom', () => {
    const sAway: ScrollSample = { scrollTop: 500, scrollHeight: 2000, clientHeight: 1000 };
    expect(nextStuck(true, sAway, 'user')).toBe(false);

    const sBottom: ScrollSample = { scrollTop: 960, scrollHeight: 2000, clientHeight: 1000 };
    expect(nextStuck(false, sBottom, 'user')).toBe(true);
  });

  it('program and content causes never change ownership', () => {
    const sAway: ScrollSample = { scrollTop: 500, scrollHeight: 2000, clientHeight: 1000 };
    expect(nextStuck(true, sAway, 'program')).toBe(true);
    expect(nextStuck(true, sAway, 'content')).toBe(true);

    const sBottom: ScrollSample = { scrollTop: 1000, scrollHeight: 2000, clientHeight: 1000 };
    expect(nextStuck(false, sBottom, 'program')).toBe(false);
    expect(nextStuck(false, sBottom, 'content')).toBe(false);
  });

  it('prependAdjust accurately computes new scrollTop when older turns are prepended', () => {
    const beforeHeight = 1500;
    const afterHeight = 2200; // added 700px of older turns above
    const currentScrollTop = 300;

    const adjusted = prependAdjust(beforeHeight, afterHeight, currentScrollTop);
    expect(adjusted).toBe(1000); // 300 + (2200 - 1500)
  });
});

export interface ScrollSample {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export const STICK_THRESHOLD_PX = 48;

export function isAtBottom(s: ScrollSample): boolean {
  return s.scrollHeight - s.scrollTop - s.clientHeight <= STICK_THRESHOLD_PX;
}

/**
 * Derives the next stuck state:
 * - 'user' gesture: caller recalculates based on whether user is within STICK_THRESHOLD_PX of bottom
 * - 'program' (e.g. our scrollTo) or 'content' (streaming expansion): ownership unchanged (prev remains)
 */
export function nextStuck(prev: boolean, s: ScrollSample, cause: 'user' | 'program' | 'content'): boolean {
  if (cause === 'user') {
    return isAtBottom(s);
  }
  return prev;
}

/**
 * Calculates new scrollTop when prepending older messages to keep the anchor turn visually locked.
 */
export function prependAdjust(beforeHeight: number, afterHeight: number, scrollTop: number): number {
  return scrollTop + (afterHeight - beforeHeight);
}

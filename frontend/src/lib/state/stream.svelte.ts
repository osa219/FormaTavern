import { parseEnvelope, type ParseOptions, type ParseResult } from '@formatavern/shared';

/**
 * rAF-throttled envelope stream parser buffer (Invariant U3, U4).
 * Holds raw incoming stream chunks in a non-reactive buffer, parsing
 * and committing to reactive state at most once per animation frame.
 */
export class StreamController {
  private buffer = ''; // Plain field — NOT $state
  private dirty = false;
  private raf = 0;

  constructor(
    private opts: () => ParseOptions,
    private commit: (r: ParseResult, chars: number) => void
  ) {}

  push(text: string) {
    this.buffer += text;
    this.dirty = true;
    if (!this.raf) {
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  seed(content: string) {
    this.buffer = content;
    this.dirty = true;
    this.tick();
  }

  private tick = () => {
    this.raf = 0;
    if (!this.dirty) return;
    this.dirty = false;
    const r = parseEnvelope(this.buffer, { ...this.opts(), streaming: true });
    this.commit(r, this.buffer.length);
  };

  flush() {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
    }
    this.raf = 0;
    this.tick();
  }

  dispose() {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
    }
    this.raf = 0;
  }
}

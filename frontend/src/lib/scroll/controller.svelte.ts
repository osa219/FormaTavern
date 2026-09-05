import { isAtBottom, nextStuck, prependAdjust, type ScrollSample } from './policy';

/**
 * Element-bound scroll controller (Invariant U5).
 * Distinguishes user gestures from programmatic and content expansion scrolls.
 * Guarantees auto-follow only when stuck (within 48px threshold).
 */
export class ScrollController {
  private el: HTMLElement | null = null;
  private isProgrammaticScroll = false;
  private lastGestureAt = 0;
  private resizeObserver: ResizeObserver | null = null;

  stuck = $state<boolean>(true);
  hasUnread = $state<boolean>(false);

  attach(element: HTMLElement, composerEl?: HTMLElement | null) {
    this.el = element;
    element.style.overflowAnchor = 'none';

    element.addEventListener('wheel', this.onGesture, { passive: true });
    element.addEventListener('touchmove', this.onGesture, { passive: true });
    element.addEventListener('keydown', this.onKeydown, { passive: true });
    element.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    element.addEventListener('scroll', this.onScroll, { passive: true });

    if (composerEl && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.stuck && this.el) {
          this.scrollToBottom(false);
        }
      });
      this.resizeObserver.observe(composerEl);
    }

    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.addEventListener('resize', this.onVisualViewportResize);
    }

    this.updateStuck('program');
  }

  detach() {
    if (this.el) {
      this.el.removeEventListener('wheel', this.onGesture);
      this.el.removeEventListener('touchmove', this.onGesture);
      this.el.removeEventListener('keydown', this.onKeydown);
      this.el.removeEventListener('pointerdown', this.onPointerDown);
      this.el.removeEventListener('scroll', this.onScroll);
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this.onVisualViewportResize);
    }
    this.el = null;
  }

  private onGesture = () => {
    this.lastGestureAt = performance.now();
  };

  private onPointerDown = (e: PointerEvent) => {
    if (!this.el) return;
    if (e.offsetX >= this.el.clientWidth - 24) {
      this.lastGestureAt = performance.now();
    }
  };

  private onKeydown = (e: KeyboardEvent) => {
    if (['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      this.lastGestureAt = performance.now();
    }
  };

  private onVisualViewportResize = () => {
    if (this.stuck && this.el) {
      this.scrollToBottom(false);
    }
  };

  private onScroll = () => {
    if (this.isProgrammaticScroll) {
      this.isProgrammaticScroll = false;
      this.updateStuck('program');
      return;
    }

    const isUser = performance.now() - this.lastGestureAt < 150;
    this.updateStuck(isUser ? 'user' : 'content');
  };

  private updateStuck(cause: 'user' | 'program' | 'content') {
    if (!this.el) return;
    const sample: ScrollSample = {
      scrollTop: this.el.scrollTop,
      scrollHeight: this.el.scrollHeight,
      clientHeight: this.el.clientHeight
    };
    const next = nextStuck(this.stuck, sample, cause);
    this.stuck = next;
    if (next) {
      this.hasUnread = false;
    }
  }

  scrollToBottom(smooth: boolean = false) {
    if (!this.el) return;
    this.isProgrammaticScroll = true;
    if (smooth) {
      this.el.scrollTo({ top: this.el.scrollHeight, behavior: 'smooth' });
    } else {
      this.el.scrollTop = this.el.scrollHeight;
    }
    this.stuck = true;
    this.hasUnread = false;
  }

  onLiveCommit() {
    if (this.stuck && this.el) {
      this.el.scrollTop = this.el.scrollHeight;
    } else {
      this.hasUnread = true;
    }
  }

  handlePrepend(beforeHeight: number) {
    if (!this.el) return;
    const afterHeight = this.el.scrollHeight;
    this.el.scrollTop = prependAdjust(beforeHeight, afterHeight, this.el.scrollTop);
  }
}

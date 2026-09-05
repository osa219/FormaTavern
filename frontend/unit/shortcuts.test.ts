import { describe, it, expect } from 'bun:test';
import { handleGlobalKeydown } from '../src/lib/actions/shortcuts';

describe('Global Keyboard Map (actions/shortcuts.ts)', () => {
  it('does not fire navigation shortcuts when target is an input field', () => {
    let prevCalled = false;
    let nextCalled = false;
    let focusCalled = false;

    const input = document.createElement('input');

    const eventSlash = new KeyboardEvent('keydown', { key: '/', bubbles: true });
    Object.defineProperty(eventSlash, 'target', { value: input });
    handleGlobalKeydown(
      eventSlash,
      { onFocusComposer: () => (focusCalled = true) },
      false
    );
    expect(focusCalled).toBe(false);

    const eventAltRight = new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true });
    Object.defineProperty(eventAltRight, 'target', { value: input });
    handleGlobalKeydown(
      eventAltRight,
      { onNextSwipe: () => (nextCalled = true) },
      false
    );
    expect(nextCalled).toBe(false);
  });

  it('allows Esc to fire even when focused in an input field', () => {
    let stopCalled = false;
    let closeCalled = false;

    const textarea = document.createElement('textarea');

    const eventEscBusy = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    Object.defineProperty(eventEscBusy, 'target', { value: textarea });
    handleGlobalKeydown(
      eventEscBusy,
      { onStop: () => (stopCalled = true), onCloseOverlay: () => (closeCalled = true) },
      true // isBusy
    );
    expect(stopCalled).toBe(true);
    expect(closeCalled).toBe(false);

    const eventEscIdle = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    Object.defineProperty(eventEscIdle, 'target', { value: textarea });
    handleGlobalKeydown(
      eventEscIdle,
      { onStop: () => (stopCalled = true), onCloseOverlay: () => (closeCalled = true) },
      false // idle
    );
    expect(closeCalled).toBe(true);
  });

  it('triggers Alt+Left and Alt+Right swipes when idle, but ignores while busy', () => {
    let prevCalled = false;
    let nextCalled = false;

    const div = document.createElement('div');

    const eventAltLeft = new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true });
    Object.defineProperty(eventAltLeft, 'target', { value: div });
    handleGlobalKeydown(
      eventAltLeft,
      { onPrevSwipe: () => (prevCalled = true) },
      true // busy
    );
    expect(prevCalled).toBe(false);

    handleGlobalKeydown(
      eventAltLeft,
      { onPrevSwipe: () => (prevCalled = true) },
      false // idle
    );
    expect(prevCalled).toBe(true);

    const eventAltRight = new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true });
    Object.defineProperty(eventAltRight, 'target', { value: div });
    handleGlobalKeydown(
      eventAltRight,
      { onNextSwipe: () => (nextCalled = true) },
      false // idle
    );
    expect(nextCalled).toBe(true);
  });
});

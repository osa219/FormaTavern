export interface ShortcutHandlers {
  onStop?: () => void;
  onCloseOverlay?: () => void;
  onPrevSwipe?: () => void;
  onNextSwipe?: () => void;
  onToggleDirector?: () => void;
  onToggleStateHud?: () => void;
  onToggleNav?: () => void;
  onFocusComposer?: () => void;
}

export function isInputField(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || target.isContentEditable;
}

export function handleGlobalKeydown(e: KeyboardEvent, handlers: ShortcutHandlers, isBusy: boolean) {
  const inField = isInputField(e.target);

  // Esc fires everywhere
  if (e.key === 'Escape') {
    if (isBusy && handlers.onStop) {
      e.preventDefault();
      handlers.onStop();
      return;
    }
    if (handlers.onCloseOverlay) {
      e.preventDefault();
      handlers.onCloseOverlay();
      return;
    }
  }

  // If inside input or textarea, suppress navigation / command shortcuts
  if (inField) {
    return;
  }

  // Alt + Left / Right for swipe navigation on the last assistant turn
  if (e.altKey && e.key === 'ArrowLeft') {
    if (!isBusy && handlers.onPrevSwipe) {
      e.preventDefault();
      handlers.onPrevSwipe();
    }
    return;
  }

  if (e.altKey && e.key === 'ArrowRight') {
    if (!isBusy && handlers.onNextSwipe) {
      e.preventDefault();
      handlers.onNextSwipe();
    }
    return;
  }

  // Alt + D: Toggle Director Drawer
  if (e.altKey && (e.key === 'd' || e.key === 'D')) {
    e.preventDefault();
    handlers.onToggleDirector?.();
    return;
  }

  // Alt + S: Toggle State HUD
  if (e.altKey && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    handlers.onToggleStateHud?.();
    return;
  }

  // Alt + N: Toggle Nav Drawer
  if (e.altKey && (e.key === 'n' || e.key === 'N')) {
    e.preventDefault();
    handlers.onToggleNav?.();
    return;
  }

  // /: Focus Composer
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    handlers.onFocusComposer?.();
    return;
  }
}

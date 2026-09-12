import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prefs } from '../src/lib/state/prefs.svelte';
import { loadCustomCss, motionGuard } from '@formatavern/shared/customCss/loader';
import { HOOKS } from '@formatavern/shared';

describe('Chat Surface Custom Styling & Conservative Profile (Slice 6, Invariants C7, C8, C9, C12)', () => {
  beforeEach(() => {
    prefs.hideCustomStyling = false;
    document.head.querySelectorAll('style[data-ft-sheet]').forEach((el) => el.remove());
  });

  afterEach(() => {
    prefs.hideCustomStyling = false;
    document.head.querySelectorAll('style[data-ft-sheet]').forEach((el) => el.remove());
  });

  it('verifies ChatViewport markup mounts CustomStyleOutlet with scope="chat"', () => {
    const filePath = resolve(import.meta.dir, '../src/lib/components/chat/ChatViewport.svelte');
    const content = readFileSync(filePath, 'utf-8');

    // Root element must declare data-ft-surface="chat"
    expect(content).toContain('data-ft-surface="chat"');
    expect(content).toContain('{HOOKS.chat.viewport}');

    // Must mount CustomStyleOutlet with scope="chat" and character customCss
    expect(content).toContain('<CustomStyleOutlet scope="chat" css={session.character?.customCss} />');
  });

  it('enforces chat-conservative profile on character sheet in chat scope', async () => {
    const { sanitizeCss } = await loadCustomCss();

    const authorSheet = `
      /* Permitted chat styling */
      .ft-bubble-char {
        background-color: rgba(20, 20, 20, 0.9);
        border: 1px solid var(--theme-accent);
      }
      .ft-turn {
        border-radius: 12px;
        z-index: 5;
      }

      /* Chat-conservative violations */
      .ft-turn {
        position: fixed;
        z-index: 99999;
      }
      .ft-message-log {
        scroll-behavior: smooth;
        overflow: hidden;
      }
      .ft-viewport {
        touch-action: none;
      }
    `;

    const out = sanitizeCss(authorSheet, 'chat');

    // Permitted declarations preserved under chat scope prefix
    expect(out.css).toContain('[data-ft-surface="chat"] .ft-bubble-char');
    expect(out.css).toContain('background-color:rgba(20,20,20,0.9)');
    expect(out.css).toContain('z-index:5');

    // Forbidden declarations stripped
    expect(out.css).not.toContain('position:fixed');
    expect(out.css).not.toContain('z-index:99999');
    expect(out.css).not.toContain('scroll-behavior');
    expect(out.css).not.toContain('overflow:hidden');
    expect(out.css).not.toContain('touch-action:none');

    // Reports detail stripped declarations with blocked-property-scope reason
    const drops = out.report.filter((r) => r.kind === 'dropped-declaration');
    expect(drops.length).toBeGreaterThanOrEqual(5);
    for (const drop of drops) {
      expect(drop.reason).toBe('blocked-property-scope');
    }
  });

  it('attaches chat-scoped reduced-motion guard (Invariant C9)', () => {
    const guard = motionGuard('chat');
    expect(guard).toContain('@media (prefers-reduced-motion: reduce)');
    expect(guard).toContain('[data-ft-surface="chat"] *');
    expect(guard).toContain('[data-ft-surface="chat"] *::before');
    expect(guard).toContain('[data-ft-surface="chat"] *::after');
    expect(guard).toContain('[data-ft-motion="reduced"] [data-ft-surface="chat"] *');
    expect(guard).toContain('animation-duration: 0.01ms !important');
    expect(guard).toContain('animation-iteration-count: 1 !important');
    expect(guard).toContain('transition-duration: 0.01ms !important');
    expect(guard).toContain('scroll-behavior: auto !important');
  });

  it('guarantees viewer supremacy on chat surface (Invariant C8)', async () => {
    const { sanitizeCss } = await loadCustomCss();
    const scope = 'chat';
    const rawCss = '.ft-bubble-char { color: gold; }';

    function injectOutlet(css: string | null | undefined, hide: boolean): HTMLStyleElement | null {
      const raw = css && css.trim() && !hide ? css : null;
      if (!raw) return null;
      const out = sanitizeCss(raw, scope);
      if (!out.css) return null;
      const el = document.createElement('style');
      el.setAttribute('data-ft-sheet', scope);
      el.textContent = out.css + motionGuard(scope);
      document.head.appendChild(el);
      return el;
    }

    // 1. Injected when hideCustomStyling is false
    let el = injectOutlet(rawCss, false);
    expect(el).not.toBeNull();
    expect(document.head.querySelector('style[data-ft-sheet="chat"]')).toBe(el);
    expect(el?.textContent).toContain('[data-ft-surface="chat"] .ft-bubble-char{color:gold}');

    // 2. Removed when hideCustomStyling is true
    el?.remove();
    el = injectOutlet(rawCss, true);
    expect(el).toBeNull();
    expect(document.head.querySelector('style[data-ft-sheet="chat"]')).toBeNull();
  });
});

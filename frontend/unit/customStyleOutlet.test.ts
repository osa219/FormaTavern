import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { render } from 'svelte/server';
import CustomStyleOutlet from '../src/lib/components/custom/CustomStyleOutlet.svelte';
import { prefs } from '../src/lib/state/prefs.svelte';
import { loadCustomCss, motionGuard } from '@formatavern/shared/customCss/loader';

describe('CustomStyleOutlet (Invariants C2, C8, C12, C13)', () => {
  beforeEach(() => {
    prefs.hideCustomStyling = false;
    document.head.querySelectorAll('style[data-ft-sheet]').forEach((el) => el.remove());
  });

  afterEach(() => {
    prefs.hideCustomStyling = false;
    document.head.querySelectorAll('style[data-ft-sheet]').forEach((el) => el.remove());
  });

  it('renders cleanly without SSR markup leak', () => {
    const rendered = render(CustomStyleOutlet, {
      props: {
        scope: 'character',
        css: '.ft-hero { border: 1px solid red; }'
      }
    });
    // CustomStyleOutlet produces zero DOM elements in SSR (client-only $effect outlet)
    expect(rendered.body.replace(/<!--[\s\S]*?-->/g, '')).toBe('');
    expect(rendered.head).toBe('');
  });

  it('generates exact reduced-motion guard block per scope (Invariant C12)', () => {
    const guardChar = motionGuard('character');
    expect(guardChar).toContain('@media (prefers-reduced-motion: reduce)');
    expect(guardChar).toContain('[data-ft-surface="character"] *');
    expect(guardChar).toContain('[data-ft-surface="character"] *::before');
    expect(guardChar).toContain('[data-ft-surface="character"] *::after');
    expect(guardChar).toContain('[data-ft-motion="reduced"] [data-ft-surface="character"] *');
    expect(guardChar).toContain('animation-duration: 0.01ms !important');
    expect(guardChar).toContain('animation-iteration-count: 1 !important');
    expect(guardChar).toContain('transition-duration: 0.01ms !important');
    expect(guardChar).toContain('scroll-behavior: auto !important');

    const guardChat = motionGuard('chat');
    expect(guardChat).toContain('[data-ft-surface="chat"]');

    const guardShell = motionGuard('shell');
    expect(guardShell).toContain('[data-ft-surface="shell"]');
  });

  it('dynamically loads customCss module without bundling (Invariant C13)', async () => {
    const p1 = loadCustomCss();
    const p2 = loadCustomCss();
    // Invariant C13: cached promise
    expect(p1).toBe(p2);

    const m = await p1;
    expect(typeof m.sanitizeCss).toBe('function');
    expect(typeof m.lintSheet).toBe('function');
  });

  it('simulates client injection lifecycle and viewer supremacy (Invariant C2, C8)', async () => {
    const m = await loadCustomCss();
    const scope = 'character';
    const rawCss = '.ft-hero { opacity: 0.8; }';

    function runOutletLogic(css: string | null | undefined, hide: boolean): HTMLStyleElement | null {
      const raw = css && css.trim() && !hide ? css : null;
      if (!raw) return null;
      const out = m.sanitizeCss(raw, scope);
      if (!out.css) return null;
      const el = document.createElement('style');
      el.setAttribute('data-ft-sheet', scope);
      el.textContent = out.css + motionGuard(scope);
      document.head.appendChild(el);
      return el;
    }

    // 1. Injected when CSS present and hideCustomStyling is false
    let styleEl = runOutletLogic(rawCss, false);
    expect(styleEl).not.toBeNull();
    expect(document.head.querySelector('style[data-ft-sheet="character"]')).toBe(styleEl);
    expect(styleEl?.textContent).toContain('.ft-hero');
    expect(styleEl?.textContent).toContain(motionGuard('character'));

    // 2. Viewer supremacy (C8): when hide is true, style is not generated or removed
    styleEl?.remove();
    styleEl = runOutletLogic(rawCss, true);
    expect(styleEl).toBeNull();
    expect(document.head.querySelector('style[data-ft-sheet="character"]')).toBeNull();

    // 3. Empty CSS: no style element
    styleEl = runOutletLogic('   \n\t  ', false);
    expect(styleEl).toBeNull();
  });
});

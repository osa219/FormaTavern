import { describe, it, expect } from 'bun:test';
import { loadCustomCss, motionGuard } from '../../src/customCss/loader';

describe('customCss — Loader & Motion Guard (Invariant C9, C13)', () => {
  it('loadCustomCss returns cached dynamic module with sanitizer and linter', async () => {
    const mod1 = await loadCustomCss();
    const mod2 = await loadCustomCss();

    expect(mod1).toBe(mod2);
    expect(typeof mod1.sanitizeCss).toBe('function');
    expect(typeof mod1.lintSheet).toBe('function');
    expect(typeof mod1.motionGuard).toBe('function');
  });

  it('motionGuard appends both OS prefers-reduced-motion and data-ft-motion="reduced" rules (C9)', () => {
    const guardChat = motionGuard('chat');
    expect(guardChat).toContain('@media (prefers-reduced-motion: reduce)');
    expect(guardChat).toContain('[data-ft-surface="chat"] *');
    expect(guardChat).toContain('[data-ft-surface="chat"] *::before');
    expect(guardChat).toContain('[data-ft-surface="chat"] *::after');
    expect(guardChat).toContain('[data-ft-motion="reduced"] [data-ft-surface="chat"] *');
    expect(guardChat).toContain('animation-duration: 0.01ms !important');
    expect(guardChat).toContain('scroll-behavior: auto !important');

    const guardChar = motionGuard('character');
    expect(guardChar).toContain('[data-ft-surface="character"] *');
    expect(guardChar).toContain('[data-ft-motion="reduced"] [data-ft-surface="character"] *');
  });
});

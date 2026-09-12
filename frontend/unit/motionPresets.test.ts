import { describe, it, expect } from 'bun:test';
import { render } from 'svelte/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import SpeechBubble from '../src/lib/components/chat/SpeechBubble.svelte';

describe('Motion Presets (Slice 5 / Invariants U2, C9, C13)', () => {
  it('renders data-fx attribute on character speech bubble for breathe, float, and glow', () => {
    for (const preset of ['breathe', 'float', 'glow'] as const) {
      const rendered = render(SpeechBubble, {
        props: {
          variant: 'character',
          text: 'Speaking with motion...',
          fx: preset
        }
      });
      expect(rendered.body).toContain(`data-fx="${preset}"`);
    }
  });

  it('omits data-fx attribute when fx is "none" or null on character bubble', () => {
    const renderedNone = render(SpeechBubble, {
      props: {
        variant: 'character',
        text: 'Speaking quietly...',
        fx: 'none'
      }
    });
    expect(renderedNone.body).not.toContain('data-fx');

    const renderedDefault = render(SpeechBubble, {
      props: {
        variant: 'character',
        text: 'Default speech...'
      }
    });
    expect(renderedDefault.body).not.toContain('data-fx');
  });

  it('never attaches data-fx to user persona bubbles', () => {
    const renderedUser = render(SpeechBubble, {
      props: {
        variant: 'persona',
        text: 'User input...',
        fx: 'breathe'
      }
    });
    expect(renderedUser.body).not.toContain('data-fx');
  });

  it('app.css contains all required compositor keyframes and reduced-motion guards', () => {
    const cssPath = resolve(import.meta.dir, '../src/app.css');
    const css = readFileSync(cssPath, 'utf8');

    // Keyframes presence
    expect(css).toContain('@keyframes ft-fx-breathe');
    expect(css).toContain('@keyframes ft-fx-float');
    expect(css).toContain('@keyframes ft-fx-glow');

    // Selectors
    expect(css).toContain('[data-fx="breathe"]');
    expect(css).toContain('[data-fx="float"]');
    expect(css).toContain('[data-fx="glow"]');

    // Reduced motion safety (C9)
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('[data-ft-motion="reduced"] [data-fx]');
    expect(css).toContain('animation: none !important');
  });
});

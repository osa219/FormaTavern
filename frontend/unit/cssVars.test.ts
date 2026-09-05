import { describe, it, expect } from 'bun:test';
import { themeToCssVars, serializeVars, CSS_VAR_NAMES } from '../src/lib/theme/cssVars';
import { DEFAULT_CHARACTER_THEME, type CharacterTheme } from '@formatavern/shared';

describe('themeToCssVars & serializeVars', () => {
  it('pins the exact CSS_VAR_NAMES list as the single canonical source of truth', () => {
    expect(CSS_VAR_NAMES).toEqual([
      '--theme-font-family',
      '--theme-font-size',
      '--theme-line-height',
      '--theme-char-bg',
      '--theme-char-text',
      '--theme-char-border',
      '--theme-user-bg',
      '--theme-user-text',
      '--theme-user-border',
      '--theme-accent',
      '--theme-quote-color',
      '--theme-action-color',
      '--theme-narrator-color',
      '--theme-bubble-radius',
      '--theme-bubble-padding',
      '--theme-char-tail',
      '--theme-user-tail',
      '--theme-bg-img',
      '--theme-bg-blur',
      '--theme-bg-overlay',
      '--theme-scheme'
    ]);
  });

  it('produces exact variable set and fixed order matching CSS_VAR_NAMES', () => {
    const vars = themeToCssVars(DEFAULT_CHARACTER_THEME);
    const keys = Object.keys(vars);
    expect(keys).toEqual([...CSS_VAR_NAMES]);

    const serialized = serializeVars(vars);
    // Every variable appears once in exact order
    for (let i = 0; i < CSS_VAR_NAMES.length - 1; i++) {
      const idxCurr = serialized.indexOf(CSS_VAR_NAMES[i]);
      const idxNext = serialized.indexOf(CSS_VAR_NAMES[i + 1]);
      expect(idxCurr).toBeGreaterThanOrEqual(0);
      expect(idxNext).toBeGreaterThan(idxCurr);
    }
  });

  it('applies standard fallbacks when optional fields are omitted', () => {
    const minimalTheme: CharacterTheme = {
      font: { family: 'Georgia, serif' },
      colors: {
        charBubbleBg: '#222',
        charBubbleText: '#fff',
        userBubbleBg: '#333',
        userBubbleText: '#eee',
        accent: '#55f'
      },
      bubble: { radius: '0.8rem' },
      background: {}
    };

    const vars = themeToCssVars(minimalTheme);
    expect(vars['--theme-font-size']).toBe('1rem');
    expect(vars['--theme-line-height']).toBe('1.7');
    expect(vars['--theme-char-border']).toBe('transparent');
    expect(vars['--theme-user-border']).toBe('transparent');
    expect(vars['--theme-quote-color']).toBe('inherit');
    expect(vars['--theme-action-color']).toBe('rgb(148, 163, 184)');
    expect(vars['--theme-narrator-color']).toBe('rgb(203, 213, 225)');
    expect(vars['--theme-bubble-padding']).toBe('1rem 1.25rem');
    expect(vars['--theme-char-tail']).toBe('left');
    expect(vars['--theme-user-tail']).toBe('right');
    expect(vars['--theme-bg-img']).toBe('none');
    expect(vars['--theme-bg-blur']).toBe('0px');
    expect(vars['--theme-bg-overlay']).toBe('rgba(0, 0, 0, 0.5)');
  });

  it('formats background image as url("...") with quotes and backslashes escaped', () => {
    const themeWithImg: CharacterTheme = {
      ...DEFAULT_CHARACTER_THEME,
      background: {
        image: '/assets/backgrounds/observatory-night.webp' as any
      }
    };

    const vars = themeToCssVars(themeWithImg);
    expect(vars['--theme-bg-img']).toBe('url("/assets/backgrounds/observatory-night.webp")');

    // Test escaping of quote in path
    const themeEscaped: CharacterTheme = {
      ...DEFAULT_CHARACTER_THEME,
      background: {
        image: '/assets/bg/foo"bar\\baz.webp' as any
      }
    };
    const varsEscaped = themeToCssVars(themeEscaped);
    expect(varsEscaped['--theme-bg-img']).toBe('url("/assets/bg/foo\\"bar\\\\baz.webp")');
  });

  it('appends system fallback to font stack if missing', () => {
    const theme1: CharacterTheme = {
      ...DEFAULT_CHARACTER_THEME,
      font: { family: 'Cinzel, Georgia, serif' }
    };
    const vars1 = themeToCssVars(theme1);
    expect(vars1['--theme-font-family']).toBe('Cinzel, Georgia, serif, system-ui, sans-serif');

    const theme2: CharacterTheme = {
      ...DEFAULT_CHARACTER_THEME,
      font: { family: 'Cinzel, system-ui' }
    };
    const vars2 = themeToCssVars(theme2);
    expect(vars2['--theme-font-family']).toBe('Cinzel, system-ui');
  });

  it('derives --theme-scheme from charBubbleText luminance', () => {
    // Light text on dark bg -> dark scheme
    const darkTheme: CharacterTheme = {
      ...DEFAULT_CHARACTER_THEME,
      colors: {
        ...DEFAULT_CHARACTER_THEME.colors,
        charBubbleText: '#f8fafc'
      }
    };
    expect(themeToCssVars(darkTheme)['--theme-scheme']).toBe('dark');

    // Dark text on parchment bg -> light scheme
    const lightTheme: CharacterTheme = {
      ...DEFAULT_CHARACTER_THEME,
      colors: {
        ...DEFAULT_CHARACTER_THEME.colors,
        charBubbleText: '#18181b'
      }
    };
    expect(themeToCssVars(lightTheme)['--theme-scheme']).toBe('light');
  });
});

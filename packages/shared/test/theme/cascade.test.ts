import { describe, it, expect } from 'bun:test';
import {
  resolveTheme,
  matchesWhen,
  THEME_PATHS,
  DEFAULT_CHARACTER_THEME,
  NEUTRAL_A11Y_THEME,
  type CharacterTheme,
  type ThemeInputs
} from '../../src';

describe('Shared Theme Cascade & matchesWhen', () => {
  describe('matchesWhen normalization & condition checking', () => {
    it('returns false for empty when object', () => {
      expect(matchesWhen({}, { mood: 'calm' })).toBe(false);
    });

    it('matches strings with case-insensitivity and whitespace trimming', () => {
      expect(matchesWhen({ mood: 'furious' }, { mood: 'FURIOUS' })).toBe(true);
      expect(matchesWhen({ mood: '  furious ' }, { mood: 'furious  ' })).toBe(true);
      expect(matchesWhen({ mood: 'calm' }, { mood: 'furious' })).toBe(false);
    });

    it('matches numeric strings and numbers equivalently', () => {
      expect(matchesWhen({ affinity: 7 }, { affinity: 7 })).toBe(true);
      expect(matchesWhen({ affinity: '7' }, { affinity: 7 })).toBe(true);
      expect(matchesWhen({ affinity: 7 }, { affinity: '7' })).toBe(true);
      expect(matchesWhen({ affinity: ' 7 ' }, { affinity: 7 })).toBe(true);
      expect(matchesWhen({ affinity: 7 }, { affinity: 8 })).toBe(false);
    });

    it('matches booleans strictly', () => {
      expect(matchesWhen({ inCombat: true }, { inCombat: true })).toBe(true);
      expect(matchesWhen({ inCombat: false }, { inCombat: false })).toBe(true);
      expect(matchesWhen({ inCombat: true }, { inCombat: 'true' })).toBe(false);
      expect(matchesWhen({ inCombat: false }, { inCombat: 'false' })).toBe(false);
    });

    it('never matches array or object values', () => {
      expect(matchesWhen({ tags: ['combat'] }, { tags: ['combat'] })).toBe(false);
      expect(matchesWhen({ meta: { x: 1 } }, { meta: { x: 1 } })).toBe(false);
    });

    it('requires all keys in when to match (multi-key AND)', () => {
      const state = { mood: 'furious', danger: 'high', affinity: 3 };
      expect(matchesWhen({ mood: 'furious', danger: 'high' }, state)).toBe(true);
      expect(matchesWhen({ mood: 'furious', danger: 'low' }, state)).toBe(false);
    });

    it('returns false if key is missing in state or undefined', () => {
      expect(matchesWhen({ mood: 'furious' }, {})).toBe(false);
      expect(matchesWhen({ mood: 'furious' }, { mood: undefined })).toBe(false);
    });
  });

  describe('resolveTheme cascade order and invariants', () => {
    it('applies cascade precedence: persona overrides binding, binding overrides character', () => {
      const charTheme: CharacterTheme = {
        font: { family: 'Cinzel', size: '1rem', lineHeight: '1.7' },
        colors: {
          charBubbleBg: '#111',
          charBubbleText: '#eee',
          userBubbleBg: '#222',
          userBubbleText: '#fff',
          accent: '#00f'
        },
        bubble: { radius: '1rem' },
        background: {}
      };

      const inputs: ThemeInputs = {
        character: charTheme,
        bindings: [
          {
            when: { mood: 'furious' },
            set: { 'colors.accent': '#f00', 'colors.charBubbleText': '#ff0' }
          }
        ],
        state: { mood: 'furious' },
        persona: {
          colors: { accent: '#0f0' } // Persona overrides binding
        },
        a11y: { disableCharacterThemes: false, disableReactiveTheming: false }
      };

      const resolved = resolveTheme(inputs);
      expect(resolved.appliedBindings).toEqual([0]);
      // Binding overrode character: charBubbleText is #ff0
      expect(resolved.theme.colors.charBubbleText).toBe('#ff0');
      // Persona overrode binding: accent is #0f0
      expect(resolved.theme.colors.accent).toBe('#0f0');
    });

    it('a11y.disableCharacterThemes overrides all layers and returns NEUTRAL_A11Y_THEME', () => {
      const inputs: ThemeInputs = {
        character: {
          font: { family: 'Cinzel', size: '1rem', lineHeight: '1.7' },
          colors: {
            charBubbleBg: '#111',
            charBubbleText: '#eee',
            userBubbleBg: '#222',
            userBubbleText: '#fff',
            accent: '#00f'
          },
          bubble: { radius: '1rem' },
          background: { image: '/assets/bg/castle.webp' as any }
        },
        bindings: [{ when: { mood: 'furious' }, set: { 'colors.accent': '#f00' } }],
        state: { mood: 'furious' },
        persona: { colors: { accent: '#0f0' } },
        a11y: { disableCharacterThemes: true, disableReactiveTheming: false }
      };

      const resolved = resolveTheme(inputs);
      expect(resolved.appliedBindings).toEqual([]);
      expect(resolved.warnings).toEqual([]);
      expect(resolved.theme.colors.charBubbleBg).toBe(NEUTRAL_A11Y_THEME.colors.charBubbleBg);
      expect(resolved.theme.colors.charBubbleText).toBe(NEUTRAL_A11Y_THEME.colors.charBubbleText);
      expect(resolved.theme.background).toEqual({});
      expect(resolved.theme.bubble.radius).toBe('0.75rem');
    });

    it('disableReactiveTheming skips state bindings only', () => {
      const inputs: ThemeInputs = {
        character: {
          font: { family: 'Cinzel', size: '1rem', lineHeight: '1.7' },
          colors: {
            charBubbleBg: '#111',
            charBubbleText: '#eee',
            userBubbleBg: '#222',
            userBubbleText: '#fff',
            accent: '#00f'
          },
          bubble: { radius: '1rem' },
          background: {}
        },
        bindings: [{ when: { mood: 'furious' }, set: { 'colors.accent': '#f00' } }],
        state: { mood: 'furious' },
        a11y: { disableCharacterThemes: false, disableReactiveTheming: true }
      };

      const resolved = resolveTheme(inputs);
      expect(resolved.appliedBindings).toEqual([]);
      expect(resolved.theme.colors.accent).toBe('#00f'); // Character color preserved, binding skipped
    });

    it('applies multiple bindings in array order (later wins)', () => {
      const inputs: ThemeInputs = {
        bindings: [
          { when: { mood: 'furious' }, set: { 'colors.accent': '#f00' } },
          { when: { danger: 'high' }, set: { 'colors.accent': '#ff0' } }
        ],
        state: { mood: 'furious', danger: 'high' },
        a11y: { disableCharacterThemes: false, disableReactiveTheming: false }
      };

      const resolved = resolveTheme(inputs);
      expect(resolved.appliedBindings).toEqual([0, 1]);
      expect(resolved.theme.colors.accent).toBe('#ff0');
    });

    it('records warnings for unknown theme paths and invalid CssTokens without throwing', () => {
      const inputs: ThemeInputs = {
        bindings: [
          {
            when: { mood: 'furious' },
            set: {
              'invalid.path': '#f00',
              'colors.accent': 'red; background: black;', // semi-colon injection
              'bubble.charTail': 'upside-down'
            }
          }
        ],
        state: { mood: 'furious' },
        a11y: { disableCharacterThemes: false, disableReactiveTheming: false }
      };

      expect(() => resolveTheme(inputs)).not.toThrow();
      const resolved = resolveTheme(inputs);
      expect(resolved.appliedBindings).toEqual([0]);
      expect(resolved.warnings.length).toBe(3);
      expect(resolved.warnings.some((w) => w.includes('Unknown theme path'))).toBe(true);
      expect(resolved.warnings.some((w) => w.includes('Invalid charTail value'))).toBe(true);
      expect(resolved.warnings.some((w) => w.includes('Invalid CssToken'))).toBe(true);
      // accent should remain default
      expect(resolved.theme.colors.accent).toBe(DEFAULT_CHARACTER_THEME.colors.accent);
    });

    it('preserves untouched optional fields across deep-merges', () => {
      const inputs: ThemeInputs = {
        character: {
          font: { family: 'Cinzel' },
          colors: { charBubbleBg: '#123', charBubbleText: '#fff', userBubbleBg: '#456', userBubbleText: '#fff', accent: '#789' },
          bubble: { radius: '2rem' },
          background: {}
        },
        a11y: { disableCharacterThemes: false, disableReactiveTheming: false }
      };

      const resolved = resolveTheme(inputs);
      expect(resolved.theme.font.family).toBe('Cinzel');
      expect(resolved.theme.font.size).toBe(DEFAULT_CHARACTER_THEME.font.size);
      expect(resolved.theme.colors.quote).toBe(DEFAULT_CHARACTER_THEME.colors.quote);
      expect(resolved.theme.bubble.padding).toBe(DEFAULT_CHARACTER_THEME.bubble.padding);
    });

    it('is strictly deterministic and does not mutate input objects', () => {
      const originalCharacter = {
        font: { family: 'Cinzel', size: '1rem', lineHeight: '1.7' },
        colors: {
          charBubbleBg: '#111',
          charBubbleText: '#eee',
          userBubbleBg: '#222',
          userBubbleText: '#fff',
          accent: '#00f'
        },
        bubble: { radius: '1rem' },
        background: {}
      };
      const inputs: ThemeInputs = {
        character: originalCharacter,
        bindings: [{ when: { mood: 'furious' }, set: { 'colors.accent': '#f00' } }],
        state: { mood: 'furious' },
        persona: { colors: { userBubbleBg: '#333' } },
        a11y: { disableCharacterThemes: false, disableReactiveTheming: false }
      };

      const jsonBefore = JSON.stringify(inputs);
      const res1 = resolveTheme(inputs);
      const res2 = resolveTheme(inputs);

      expect(JSON.stringify(res1)).toBe(JSON.stringify(res2));
      expect(JSON.stringify(inputs)).toBe(jsonBefore);
      expect(originalCharacter.colors.accent).toBe('#00f');
    });

    it('resolves Eldrin and Alice seed configurations without warnings', () => {
      const eldrinStyle: CharacterTheme = {
        font: { family: "'Cinzel', Georgia, serif", size: '1rem', lineHeight: '1.7' },
        colors: {
          charBubbleBg: 'rgba(69, 26, 3, 0.6)',
          charBubbleText: '#fef3c7',
          charBubbleBorder: 'rgba(180, 83, 9, 0.4)',
          userBubbleBg: 'rgba(15, 23, 42, 0.8)',
          userBubbleText: '#f8fafc',
          accent: '#d97706',
          quote: '#fde047',
          action: '#cbd5e1',
          narratorText: '#d6d3d1'
        },
        bubble: { radius: '1rem', charTail: 'left', padding: '1rem 1.25rem' },
        background: { overlay: 'rgba(10, 10, 15, 0.75)', blur: '4px' }
      };

      const eldrinBindings = [
        {
          when: { mood: 'furious' },
          set: { 'colors.accent': '#dc2626', 'colors.charBubbleBorder': 'rgba(220, 38, 38, 0.6)' }
        },
        { when: { danger: 'high' }, set: { 'background.overlay': 'rgba(40, 5, 5, 0.8)' } }
      ];

      const resEldrin = resolveTheme({
        character: eldrinStyle,
        bindings: eldrinBindings,
        state: { mood: 'furious', danger: 'high' },
        a11y: { disableCharacterThemes: false, disableReactiveTheming: false }
      });

      expect(resEldrin.warnings).toEqual([]);
      expect(resEldrin.appliedBindings).toEqual([0, 1]);
      expect(resEldrin.theme.colors.accent).toBe('#dc2626');
      expect(resEldrin.theme.background.overlay).toBe('rgba(40, 5, 5, 0.8)');

      const aliceStyle: CharacterTheme = {
        font: { family: "'Playfair Display', Georgia, serif", size: '1rem', lineHeight: '1.6' },
        colors: {
          charBubbleBg: 'rgba(24, 8, 16, 0.7)',
          charBubbleText: '#f5e6e8',
          charBubbleBorder: 'rgba(159, 18, 57, 0.4)',
          userBubbleBg: 'rgba(15, 23, 42, 0.8)',
          userBubbleText: '#f8fafc',
          accent: '#9f1239',
          quote: '#fda4af',
          action: '#c4b5fd',
          narratorText: '#e2e8f0'
        },
        bubble: { radius: '0.5rem', charTail: 'left', padding: '1rem 1.25rem' },
        background: { overlay: 'rgba(15, 5, 10, 0.8)', blur: '6px' }
      };

      const aliceBindings = [
        {
          when: { mood: 'furious' },
          set: { 'colors.accent': '#e11d48', 'colors.charBubbleBorder': 'rgba(225, 29, 72, 0.7)' }
        }
      ];

      const resAlice = resolveTheme({
        character: aliceStyle,
        bindings: aliceBindings,
        state: { mood: 'furious' },
        a11y: { disableCharacterThemes: false, disableReactiveTheming: false }
      });

      expect(resAlice.warnings).toEqual([]);
      expect(resAlice.appliedBindings).toEqual([0]);
      expect(resAlice.theme.colors.accent).toBe('#e11d48');
    });

    it('has exactly 20 legal dotted paths in THEME_PATHS', () => {
      expect(THEME_PATHS.length).toBe(20);
    });

    describe('Amendment A-U1: global shell theme layer in cascade', () => {
      it('global layer overrides NEUTRAL defaults when character does not set them', () => {
        const globalOverrides = {
          font: { family: 'CustomGlobalFont', size: '1.25rem' },
          background: { blur: '12px' }
        };

        const resolved = resolveTheme({
          global: globalOverrides,
          a11y: { disableCharacterThemes: false, disableReactiveTheming: false }
        });

        expect(resolved.theme.font.family).toBe('CustomGlobalFont');
        expect(resolved.theme.font.size).toBe('1.25rem');
        expect(resolved.theme.background.blur).toBe('12px');
        // Unset properties still inherit from DEFAULT_CHARACTER_THEME
        expect(resolved.theme.colors.accent).toBe(DEFAULT_CHARACTER_THEME.colors.accent);
      });

      it('character theme overrides global layer', () => {
        const globalOverrides = {
          font: { family: 'CustomGlobalFont', size: '1.25rem' },
          background: { blur: '12px' }
        };

        const charTheme: CharacterTheme = {
          ...DEFAULT_CHARACTER_THEME,
          font: { family: 'CharacterSpecificFont', size: '0.9rem', lineHeight: '1.5' }
        };

        const resolved = resolveTheme({
          global: globalOverrides,
          character: charTheme,
          a11y: { disableCharacterThemes: false, disableReactiveTheming: false }
        });

        // Character font overrides global font
        expect(resolved.theme.font.family).toBe('CharacterSpecificFont');
        expect(resolved.theme.font.size).toBe('0.9rem');
        // Global background persists because character did not override it
        expect(resolved.theme.background.blur).toBe('12px');
      });

      it('a11y.disableCharacterThemes overrides global layer completely', () => {
        const globalOverrides = {
          font: { family: 'CustomGlobalFont' }
        };

        const resolved = resolveTheme({
          global: globalOverrides,
          a11y: { disableCharacterThemes: true, disableReactiveTheming: false }
        });

        expect(resolved.theme).toEqual(NEUTRAL_A11Y_THEME);
      });
    });
  });
});

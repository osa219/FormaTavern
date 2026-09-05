import type { CharacterTheme } from '../schemas/theme';

/** Neutral fallback used when a card arrives without a style (Phase 4 cascade layer 1). */
export const DEFAULT_CHARACTER_THEME: CharacterTheme = {
  font: {
    family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    size: '1rem',
    lineHeight: '1.7'
  },
  colors: {
    charBubbleBg: 'rgb(30, 41, 59)',
    charBubbleText: 'rgb(241, 245, 249)',
    userBubbleBg: 'rgba(15, 23, 42, 0.8)',
    userBubbleText: '#f8fafc',
    accent: '#38bdf8',
    quote: '#fde047',
    action: '#94a3b8',
    narratorText: 'rgb(203, 213, 225)'
  },
  bubble: {
    radius: '1rem',
    padding: '1rem 1.25rem'
  },
  background: {}
};

/**
 * High-contrast, WCAG-AA neutral theme applied when disableCharacterThemes is active.
 * Retains background: {} so no remote backdrop images are loaded.
 */
export const NEUTRAL_A11Y_THEME: CharacterTheme = {
  font: {
    family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    size: '1rem',
    lineHeight: '1.7'
  },
  colors: {
    charBubbleBg: '#0f172a',
    charBubbleText: '#e2e8f0',
    charBubbleBorder: '#334155',
    userBubbleBg: '#1e293b',
    userBubbleText: '#f8fafc',
    userBubbleBorder: '#475569',
    accent: '#38bdf8',
    quote: '#fde047',
    action: '#94a3b8',
    narratorText: '#cbd5e1'
  },
  bubble: {
    radius: '0.75rem',
    padding: '1rem 1.25rem'
  },
  background: {}
};

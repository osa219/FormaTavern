import { describe, it, expect } from 'bun:test';
import {
  isValidThemePath,
  getThemePathLabel,
  THEME_PATH_CATEGORIES
} from '../src/lib/studio/bindingsModel';

describe('Bindings Model & Theme Paths (Studio)', () => {
  it('identifies valid theme paths correctly', () => {
    expect(isValidThemePath('font.family')).toBe(true);
    expect(isValidThemePath('colors.accent')).toBe(true);
    expect(isValidThemePath('colors.charBubbleBg')).toBe(true);
    expect(isValidThemePath('bubble.radius')).toBe(true);
    expect(isValidThemePath('background.image')).toBe(true);

    // Invalid paths
    expect(isValidThemePath('nonexistent.path')).toBe(false);
    expect(isValidThemePath('style.font')).toBe(false);
    expect(isValidThemePath('')).toBe(false);
  });

  it('retrieves user-friendly label for theme path', () => {
    expect(getThemePathLabel('font.family')).toBe('Font Family');
    expect(getThemePathLabel('colors.accent')).toBe('Accent Color');
    expect(getThemePathLabel('bubble.radius')).toBe('Corner Radius');
    expect(getThemePathLabel('background.image')).toBe('Background Image URL');
    // Fallback for unknown path
    expect(getThemePathLabel('custom.unknown')).toBe('custom.unknown');
  });

  it('contains expected categories and paths', () => {
    expect(THEME_PATH_CATEGORIES.length).toBeGreaterThanOrEqual(4);
    const categoryLabels = THEME_PATH_CATEGORIES.map((c) => c.label);
    expect(categoryLabels).toContain('Typography');
    expect(categoryLabels).toContain('Colors');
    expect(categoryLabels).toContain('Bubble Geometry');
    expect(categoryLabels).toContain('Atmospheric Background');

    for (const cat of THEME_PATH_CATEGORIES) {
      for (const p of cat.paths) {
        expect(isValidThemePath(p.path)).toBe(true);
        expect(p.label.length).toBeGreaterThan(0);
        expect(p.placeholder.length).toBeGreaterThan(0);
      }
    }
  });
});

import { describe, it, expect } from 'bun:test';
import {
  CUSTOM_CSS_PRESETS,
  TERMINAL_PRESET,
  MANUSCRIPT_PRESET,
  WINDOW_PRESET,
  NIGHT_MARKET_PRESET
} from '../src/lib/custom/presets';
import { sanitizeCss } from '@formatavern/shared/customCss';
import { lintSheet } from '@formatavern/shared/customCss';

describe('Custom CSS Presets (Slice 7)', () => {
  it('defines 4 curated starter presets with required properties', () => {
    expect(CUSTOM_CSS_PRESETS.length).toBe(4);
    expect(CUSTOM_CSS_PRESETS.map((p) => p.id)).toEqual([
      'terminal',
      'manuscript',
      'window',
      'night-market'
    ]);

    for (const preset of CUSTOM_CSS_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.name).toBeTruthy();
      expect(preset.description).toBeTruthy();
      expect(preset.css).toBeTruthy();
    }
  });

  it('keeps every preset strictly under 8 KB (<= 8,192 bytes)', () => {
    for (const preset of CUSTOM_CSS_PRESETS) {
      const byteLength = new TextEncoder().encode(preset.css).length;
      expect(byteLength).toBeLessThanOrEqual(8192);
      expect(preset.css.length).toBeLessThanOrEqual(8192);
    }
  });

  it('ensures all presets are 100% sanitizeCss-clean on character scope', () => {
    for (const preset of CUSTOM_CSS_PRESETS) {
      const out = sanitizeCss(preset.css, 'character');
      const criticalIssues = out.report.filter((r) => r.kind !== 'note');
      expect(criticalIssues).toEqual([]);
      expect(out.css.length).toBeGreaterThan(0);
    }
  });

  it('ensures all presets are 100% sanitizeCss-clean on chat-conservative scope', () => {
    for (const preset of CUSTOM_CSS_PRESETS) {
      const out = sanitizeCss(preset.css, 'chat');
      const criticalIssues = out.report.filter((r) => r.kind !== 'note');
      expect(criticalIssues).toEqual([]);
      expect(out.css.length).toBeGreaterThan(0);
    }
  });

  it('ensures all presets are 100% lintSheet-clean on character scope', () => {
    for (const preset of CUSTOM_CSS_PRESETS) {
      const issues = lintSheet(preset.css, 'character');
      expect(issues).toEqual([]);
    }
  });

  it('ensures all presets are 100% lintSheet-clean on chat scope', () => {
    for (const preset of CUSTOM_CSS_PRESETS) {
      const issues = lintSheet(preset.css, 'chat');
      expect(issues).toEqual([]);
    }
  });
});

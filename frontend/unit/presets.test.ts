import { describe, it, expect } from 'bun:test';
import {
  CUSTOM_CSS_PRESETS,
  SHOWCASE_PRESETS,
  CHAT_PRESETS,
  TERMINAL_PRESET,
  MANUSCRIPT_PRESET,
  WINDOW_PRESET,
  NIGHT_MARKET_PRESET,
  ILLUMINATED_CODEX_PRESET,
  UNIFORM_ROWS_PRESET,
  SPLIT_BUBBLES_PRESET,
  CENTERED_NARRATOR_PRESET
} from '../src/lib/custom/presets';
import { sanitizeCss } from '@formatavern/shared/customCss';
import { lintSheet } from '@formatavern/shared/customCss';

describe('Custom CSS Presets (Slice 7 & Post-Blueprint)', () => {
  it('defines curated starter presets with required properties and surface tags', () => {
    expect(CUSTOM_CSS_PRESETS.length).toBe(8);
    expect(SHOWCASE_PRESETS.length).toBe(4);
    expect(CHAT_PRESETS.length).toBe(4);
    expect(CUSTOM_CSS_PRESETS.map((p) => p.id)).toEqual([
      'terminal',
      'manuscript',
      'window',
      'night-market',
      'illuminated-codex',
      'uniform-rows',
      'split-bubbles',
      'centered-narrator'
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

  it('ensures showcase presets are 100% sanitizeCss-clean on character scope', () => {
    for (const preset of SHOWCASE_PRESETS) {
      const out = sanitizeCss(preset.css, 'character');
      const criticalIssues = out.report.filter((r) => r.kind !== 'note');
      expect(criticalIssues).toEqual([]);
      expect(out.css.length).toBeGreaterThan(0);
    }
  });

  it('ensures chat presets are 100% sanitizeCss-clean on chat scope', () => {
    for (const preset of CHAT_PRESETS) {
      const out = sanitizeCss(preset.css, 'chat');
      const criticalIssues = out.report.filter((r) => r.kind !== 'note');
      expect(criticalIssues).toEqual([]);
      expect(out.css.length).toBeGreaterThan(0);
    }
  });

  it('ensures showcase presets are 100% lintSheet-clean on character scope', () => {
    for (const preset of SHOWCASE_PRESETS) {
      const issues = lintSheet(preset.css, 'character');
      expect(issues).toEqual([]);
    }
  });

  it('ensures chat presets are 100% lintSheet-clean on chat scope', () => {
    for (const preset of CHAT_PRESETS) {
      const issues = lintSheet(preset.css, 'chat');
      expect(issues).toEqual([]);
    }
  });
});

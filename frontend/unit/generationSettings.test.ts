import { describe, it, expect } from 'bun:test';
import { rangeFill, rangeFillPercent } from '../src/lib/actions/rangeFill';
import {
  TOP_P_NEUTRAL,
  TOP_K_NEUTRAL,
  REP_PENALTY_NEUTRAL,
  FREQ_PENALTY_NEUTRAL,
  topPDisplay,
  topKDisplay,
  repetitionPenaltyDisplay,
  frequencyPenaltyDisplay
} from '../src/lib/settings/generation';

const sheetUrl = new URL(
  '../src/lib/components/settings/SettingsSheet.svelte',
  import.meta.url
);
const cssUrl = new URL('../src/app.css', import.meta.url);

describe('Generation settings UI (generation-settings-proposal §4/§6)', () => {
  it('renders neutral positions when settings are unset, passes through set values', () => {
    expect(topPDisplay(undefined)).toBe(TOP_P_NEUTRAL);
    expect(topKDisplay(undefined)).toBe(TOP_K_NEUTRAL);
    expect(repetitionPenaltyDisplay(undefined)).toBe(REP_PENALTY_NEUTRAL);
    expect(frequencyPenaltyDisplay(undefined)).toBe(FREQ_PENALTY_NEUTRAL);

    expect(topPDisplay(0.5)).toBe(0.5);
    expect(topKDisplay(40)).toBe(40);
    expect(topKDisplay(0)).toBe(0);
    expect(repetitionPenaltyDisplay(1.2)).toBe(1.2);
    expect(frequencyPenaltyDisplay(-1)).toBe(-1);
    expect(frequencyPenaltyDisplay(0)).toBe(0);
  });

  it('renders reasoning display options and formats durations', async () => {
    const { reasoningDisplay, reasoningEffortDisplay, formatReasoningDuration } = await import(
      '../src/lib/settings/generation'
    );
    expect(reasoningDisplay(undefined)).toBe('Default');
    expect(reasoningDisplay('on')).toBe('On');
    expect(reasoningDisplay('off')).toBe('Off');

    expect(reasoningEffortDisplay(undefined)).toBe('Default');
    expect(reasoningEffortDisplay('low')).toBe('Low');
    expect(reasoningEffortDisplay('medium')).toBe('Medium');
    expect(reasoningEffortDisplay('high')).toBe('High');

    expect(formatReasoningDuration(undefined)).toBe('');
    expect(formatReasoningDuration(null)).toBe('');
    expect(formatReasoningDuration(800)).toBe('0.8s');
    expect(formatReasoningDuration(3400)).toBe('3.4s');
    expect(formatReasoningDuration(65_000)).toBe('1m 5s');
  });

  it('rangeFillPercent maps value to 0–100 with clamping and a 50 fallback', () => {
    expect(rangeFillPercent(0, 0, 2)).toBe(0);
    expect(rangeFillPercent(1, 0, 2)).toBe(50);
    expect(rangeFillPercent(2, 0, 2)).toBe(100);
    expect(rangeFillPercent(0, -2, 2)).toBe(50);
    expect(rangeFillPercent(0, 0, 100)).toBe(0);
    expect(rangeFillPercent(1, 1, 2)).toBe(0);
    expect(rangeFillPercent(-5, 0, 100)).toBe(0);
    expect(rangeFillPercent(500, 0, 100)).toBe(100);
    expect(rangeFillPercent(5, 5, 5)).toBe(50);
    expect(rangeFillPercent(NaN, 0, 100)).toBe(50);
  });

  it('rangeFill action sets --range-p on mount and updates it on input events', () => {
    const node = document.createElement('input');
    node.type = 'range';
    node.min = '0';
    node.max = '2';
    node.value = '0.8';

    const handle = rangeFill(node, 0.8);
    expect(node.style.getPropertyValue('--range-p')).toBe('40%');

    node.value = '2';
    node.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(node.style.getPropertyValue('--range-p')).toBe('100%');

    handle.update(0);
    expect(node.style.getPropertyValue('--range-p')).toBe('0%');

    handle.destroy();
    node.value = '1';
    node.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(node.style.getPropertyValue('--range-p')).toBe('0%');
  });

  it('orders tabs Provider → Generation → Appearance and groups advanced sliders', async () => {
    const source = await Bun.file(sheetUrl).text();

    const providerIdx = source.indexOf("activeTab = 'provider'");
    const generationIdx = source.indexOf("activeTab = 'generation'");
    const appearanceIdx = source.indexOf("activeTab = 'appearance'");
    const narrativeIdx = source.indexOf("activeTab = 'narrative'");
    expect(providerIdx).toBeGreaterThanOrEqual(0);
    expect(generationIdx).toBeGreaterThan(providerIdx);
    expect(appearanceIdx).toBeGreaterThan(generationIdx);
    expect(narrativeIdx).toBeGreaterThan(appearanceIdx);

    expect(source).toContain('Advanced settings');
    for (const id of ['id="top-k"', 'id="top-p"', 'id="rep-penalty"', 'id="freq-penalty"', 'id="thinking-toggle"', 'id="thinking-level"']) {
      expect(source).toContain(id);
    }
    // Sliders render the neutral position when unset and patch only on user input.
    expect(source).toContain('value={topKDisplay(s.generation.topK)}');
    expect(source).toContain('value={repetitionPenaltyDisplay(s.generation.repetitionPenalty)}');
    expect(source).toContain('value={frequencyPenaltyDisplay(s.generation.frequencyPenalty)}');
    expect(source).toContain('queuePatch({ generation: { topK:');
    expect(source).toContain('queuePatch({ generation: { repetitionPenalty:');
    expect(source).toContain('queuePatch({ generation: { frequencyPenalty:');
    expect(source).toContain('queuePatch({ generation: { reasoning:');
    expect(source).toContain('queuePatch({ generation: { reasoningEffort:');
    // No effect patches generation state (mount must never send absent params).
    for (const match of source.matchAll(/\$effect\(\(\) => \{([\s\S]*?)\n  \}\);/g)) {
      expect(match[1]).not.toContain('generation');
    }
  });

  it('paints filled slider tracks app-wide via --range-p and moz-range-progress', async () => {
    const css = await Bun.file(cssUrl).text();
    expect(css).toContain('::-moz-range-progress');
    expect(css).toContain('var(--range-p, 50%)');
    expect(css).toContain('var(--theme-accent) var(--range-p, 50%)');
  });
});

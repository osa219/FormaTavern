/**
 * Neutral display positions for the Generation tab's sampling sliders.
 *
 * Optional generation params are absent-is-unsent: opening Settings must never
 * start sending previously-absent params. Each slider therefore renders its
 * neutral position when the setting is `undefined`, and patches fire only on
 * user `input` (the component uses `value={display(...)}` + `oninput`, never
 * `bind:value` with an effect, so mount never patches).
 */

export const TOP_P_NEUTRAL = 1;

export const TOP_K_MIN = 0;
export const TOP_K_MAX = 100;
export const TOP_K_NEUTRAL = 0;

export const REP_PENALTY_MIN = 1;
export const REP_PENALTY_MAX = 2;
export const REP_PENALTY_STEP = 0.05;
export const REP_PENALTY_NEUTRAL = 1;

export const FREQ_PENALTY_MIN = -2;
export const FREQ_PENALTY_MAX = 2;
export const FREQ_PENALTY_STEP = 0.05;
export const FREQ_PENALTY_NEUTRAL = 0;

export function topPDisplay(value: number | undefined): number {
  return value ?? TOP_P_NEUTRAL;
}

export function topKDisplay(value: number | undefined): number {
  return value ?? TOP_K_NEUTRAL;
}

export function repetitionPenaltyDisplay(value: number | undefined): number {
  return value ?? REP_PENALTY_NEUTRAL;
}

export function frequencyPenaltyDisplay(value: number | undefined): number {
  return value ?? FREQ_PENALTY_NEUTRAL;
}

export type ReasoningOption = 'Default' | 'On' | 'Off';
export type ReasoningEffortOption = 'Default' | 'Low' | 'Medium' | 'High';

export function reasoningDisplay(value: 'on' | 'off' | undefined): ReasoningOption {
  if (value === 'on') return 'On';
  if (value === 'off') return 'Off';
  return 'Default';
}

export function reasoningEffortDisplay(
  value: 'low' | 'medium' | 'high' | undefined
): ReasoningEffortOption {
  if (value === 'low') return 'Low';
  if (value === 'medium') return 'Medium';
  if (value === 'high') return 'High';
  return 'Default';
}

export function formatReasoningDuration(ms?: number | null): string {
  if (ms === undefined || ms === null || isNaN(ms)) return '';
  if (ms < 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const sec = ms / 1000;
  if (sec < 60) {
    return `${sec.toFixed(1)}s`;
  }
  const mins = Math.floor(sec / 60);
  const remSec = Math.round(sec % 60);
  return `${mins}m ${remSec}s`;
}

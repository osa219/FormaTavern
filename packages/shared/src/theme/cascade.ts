import type { CharacterTheme, ThemeOverrides } from '../schemas/theme';
import type { StateBinding, StateVector } from '../schemas/state';
import { DEFAULT_CHARACTER_THEME, NEUTRAL_A11Y_THEME } from './defaults';

export const THEME_PATHS = [
  'font.family',
  'font.size',
  'font.lineHeight',
  'colors.charBubbleBg',
  'colors.charBubbleText',
  'colors.charBubbleBorder',
  'colors.userBubbleBg',
  'colors.userBubbleText',
  'colors.userBubbleBorder',
  'colors.accent',
  'colors.quote',
  'colors.action',
  'colors.narratorText',
  'bubble.radius',
  'bubble.charTail',
  'bubble.userTail',
  'bubble.padding',
  'background.image',
  'background.overlay',
  'background.blur'
] as const;

export type ThemePath = (typeof THEME_PATHS)[number];

const THEME_PATH_SET: ReadonlySet<string> = new Set(THEME_PATHS);

export interface ThemeInputs {
  global?: ThemeOverrides; // Amendment A-U1: lowest authored layer
  character?: CharacterTheme; // undefined → NEUTRAL
  bindings?: StateBinding[];
  state?: StateVector;
  persona?: ThemeOverrides;
  a11y: {
    disableCharacterThemes: boolean;
    disableReactiveTheming: boolean;
  };
}

export interface ResolvedTheme {
  theme: CharacterTheme;
  appliedBindings: number[];
  warnings: string[];
}

/**
 * Normalizes and compares when vs state values:
 * - Arrays and objects never match
 * - Booleans match strictly (true === true, false === false)
 * - Numbers match numerically ('7' and 7 are equal)
 * - Strings match trimmed and case-insensitively
 */
function compareNormalized(whenVal: unknown, stateVal: unknown): boolean {
  if (whenVal === null || whenVal === undefined) return false;
  if (stateVal === null || stateVal === undefined) return false;

  // Arrays and objects never match
  if (typeof whenVal === 'object' || typeof stateVal === 'object') {
    return false;
  }

  // Booleans strictly
  if (typeof whenVal === 'boolean' || typeof stateVal === 'boolean') {
    return whenVal === stateVal;
  }

  // Numeric comparison
  const isWhenNum = typeof whenVal === 'number' || (typeof whenVal === 'string' && whenVal.trim() !== '' && !Number.isNaN(Number(whenVal)));
  const isStateNum = typeof stateVal === 'number' || (typeof stateVal === 'string' && stateVal.trim() !== '' && !Number.isNaN(Number(stateVal)));

  if (isWhenNum && isStateNum) {
    return Number(whenVal) === Number(stateVal);
  }

  // String comparison trimmed & case-insensitive
  const strWhen = String(whenVal).trim().toLowerCase();
  const strState = String(stateVal).trim().toLowerCase();
  return strWhen === strState;
}

/**
 * Checks if a binding condition matches current state.
 * Empty `when` never matches (a binding must be conditional).
 */
export function matchesWhen(when: Record<string, unknown>, state: StateVector): boolean {
  const keys = Object.keys(when);
  if (keys.length === 0) return false;

  for (const key of keys) {
    if (!(key in state) || state[key] === undefined) {
      return false;
    }
    if (!compareNormalized(when[key], state[key])) {
      return false;
    }
  }

  return true;
}

function cloneTheme(theme: CharacterTheme): CharacterTheme {
  return {
    font: { ...theme.font },
    colors: { ...theme.colors },
    bubble: { ...theme.bubble },
    background: { ...theme.background }
  };
}

function deepMergeTheme(target: CharacterTheme, source?: Partial<CharacterTheme> | ThemeOverrides): void {
  if (!source) return;
  if (source.font) Object.assign(target.font, source.font);
  if (source.colors) Object.assign(target.colors, source.colors);
  if (source.bubble) Object.assign(target.bubble, source.bubble);
  if (source.background) Object.assign(target.background, source.background);
}

function isValidCssToken(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  if (val.length < 1 || val.length > 256) return false;
  return !/[;{}<>]/.test(val);
}

/**
 * Pure, deterministic theme cascade resolution:
 * NEUTRAL → character.style → stateBindings (array order) → persona.styleOverrides → accessibility
 */
export function resolveTheme(i: ThemeInputs): ResolvedTheme {
  const warnings: string[] = [];

  // If accessibility overrides character themes completely:
  if (i.a11y?.disableCharacterThemes) {
    return {
      theme: cloneTheme(NEUTRAL_A11Y_THEME),
      appliedBindings: [],
      warnings: []
    };
  }

  // 1. Start from structuredClone-free deep copy of DEFAULT_CHARACTER_THEME, merge global, then character.style
  const theme = cloneTheme(DEFAULT_CHARACTER_THEME);
  if (i.global) {
    deepMergeTheme(theme, i.global);
  }
  if (i.character) {
    deepMergeTheme(theme, i.character);
  }

  // 2. State bindings (if enabled, bindings provided, and state provided)
  const appliedBindings: number[] = [];
  if (!i.a11y?.disableReactiveTheming && i.bindings && i.state) {
    i.bindings.forEach((binding, index) => {
      if (matchesWhen(binding.when, i.state!)) {
        appliedBindings.push(index);
        for (const [path, value] of Object.entries(binding.set)) {
          if (!THEME_PATH_SET.has(path)) {
            warnings.push(`Unknown theme path "${path}" in state binding at index ${index}`);
            continue;
          }

          if (path === 'bubble.charTail' && value !== 'left' && value !== 'none') {
            warnings.push(`Invalid charTail value "${value}" in state binding at index ${index}`);
            continue;
          }

          if (path === 'bubble.userTail' && value !== 'right' && value !== 'none') {
            warnings.push(`Invalid userTail value "${value}" in state binding at index ${index}`);
            continue;
          }

          if (!isValidCssToken(value)) {
            warnings.push(`Invalid CssToken value "${value}" for path "${path}" in state binding at index ${index}`);
            continue;
          }

          const [section, key] = path.split('.') as [keyof CharacterTheme, string];
          (theme[section] as Record<string, unknown>)[key] = value;
        }
      }
    });
  }

  // 3. Deep-merge persona overrides
  if (i.persona) {
    deepMergeTheme(theme, i.persona);
  }

  return {
    theme,
    appliedBindings,
    warnings
  };
}

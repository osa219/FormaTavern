import type { StateField, StateVector } from '../schemas/state';
import type { CharacterCard } from '../schemas/character';

export interface ResolveResult {
  state: StateVector;
  source: 'patch' | 'inherited';
  warnings: string[];
}

/**
 * Derives default state from a character's stateSchema and initialState.
 */
export function defaultState(card: Pick<CharacterCard, 'stateSchema' | 'initialState'>): StateVector {
  const base: StateVector = {};

  if (card.stateSchema) {
    for (const [key, field] of Object.entries(card.stateSchema)) {
      base[key] = field.default;
    }
  }

  if (card.initialState) {
    if (card.stateSchema) {
      const resolved = resolveState(base, card.initialState, card.stateSchema);
      return resolved.state;
    } else {
      // Classic schemaless: copy primitives
      for (const [k, v] of Object.entries(card.initialState)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          base[k] = v;
        }
      }
    }
  }

  return base;
}

/**
 * Resolves a new state vector by applying a patch to the previous state.
 * Never throws.
 */
export function resolveState(
  previous: StateVector,
  patch: StateVector | null,
  schema?: Record<string, StateField>
): ResolveResult {
  if (patch === null) {
    return {
      state: { ...previous },
      source: 'inherited',
      warnings: []
    };
  }

  const warnings: string[] = [];
  const coercedPatch: StateVector = {};

  for (const [key, rawVal] of Object.entries(patch)) {
    if (rawVal === null || rawVal === undefined) {
      warnings.push(`Key "${key}" has null or undefined value; dropped`);
      continue;
    }

    if (schema) {
      if (!(key in schema)) {
        warnings.push(`Unknown state key "${key}"; dropped`);
        continue;
      }

      const def = schema[key];
      if (def.type === 'enum') {
        const rawStr = String(rawVal).trim().toLowerCase();

        // 1. Direct match in allowed values
        const exactMatch = def.values.find((v) => v.toLowerCase() === rawStr);
        if (exactMatch) {
          coercedPatch[key] = exactMatch;
          continue;
        }

        // 2. Alias match
        let aliasTarget: string | undefined;
        if (def.aliases) {
          const aliasEntry = Object.entries(def.aliases).find(([a]) => a.toLowerCase() === rawStr);
          if (aliasEntry) {
            aliasTarget = aliasEntry[1];
          }
        }

        if (aliasTarget) {
          const targetLower = aliasTarget.toLowerCase();
          const targetMatch = def.values.find((v) => v.toLowerCase() === targetLower);
          coercedPatch[key] = targetMatch ?? aliasTarget;
        } else {
          warnings.push(`Invalid enum value "${rawVal}" for key "${key}"; dropped`);
        }
      } else if (def.type === 'int') {
        if (typeof rawVal === 'boolean') {
          warnings.push(`Boolean value for integer key "${key}"; dropped`);
          continue;
        }

        const num = typeof rawVal === 'number' ? rawVal : Number(rawVal);
        if (Number.isNaN(num)) {
          warnings.push(`Non-numeric value "${rawVal}" for integer key "${key}"; dropped`);
          continue;
        }

        let rounded = Math.round(num);
        if (rounded < def.min) {
          warnings.push(`Clamped "${key}" from ${rounded} to minimum ${def.min}`);
          rounded = def.min;
        } else if (rounded > def.max) {
          warnings.push(`Clamped "${key}" from ${rounded} to maximum ${def.max}`);
          rounded = def.max;
        }
        coercedPatch[key] = rounded;
      } else if (def.type === 'string') {
        let str = String(rawVal);
        if (str.length > 200) {
          str = str.slice(0, 200);
        }
        coercedPatch[key] = str;
      }
    } else {
      // Schemaless / classic mode: keep primitive values
      if (typeof rawVal === 'string' || typeof rawVal === 'number' || typeof rawVal === 'boolean') {
        coercedPatch[key] = rawVal;
      } else {
        warnings.push(`Non-primitive value for key "${key}" dropped in schemaless state`);
      }
    }
  }

  const resultState = Object.assign({}, previous, coercedPatch);

  return {
    state: resultState,
    source: 'patch',
    warnings
  };
}

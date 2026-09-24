import { sha256 } from './text/sha256';

/**
 * Serializes any JavaScript value into a deterministic, canonical JSON string.
 * - Object keys are sorted alphabetically at all nesting levels.
 * - Whitespace is stripped.
 * - Arrays preserve element order, but their elements are canonicalized.
 * - Undefined object values are omitted.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return '[' + value.map((item) => (item === undefined ? 'null' : canonicalJson(item))).join(',') + ']';
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs: string[] = [];

  for (const key of keys) {
    const val = obj[key];
    if (val !== undefined) {
      pairs.push(JSON.stringify(key) + ':' + canonicalJson(val));
    }
  }

  return '{' + pairs.join(',') + '}';
}

/**
 * Extracts and canonicalizes the semantic content of a character record.
 * Strips non-semantic/informational timestamps (`created_at`, `updated_at`)
 * and produces a stable, key-sorted JSON string for dirty-checking.
 */
export function canonicalCharacter(record: Record<string, unknown>): string {
  if (!record || typeof record !== 'object') return '{}';

  // Omit volatile timestamp fields so re-exports with updated metadata don't false-trigger deltas
  const projection: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    if (key === 'created_at' || key === 'updated_at') continue;
    projection[key] = val;
  }

  return canonicalJson(projection);
}

/**
 * Extracts and canonicalizes the semantic content of a chat session record.
 * Strips volatile session timestamps and canonicalizes all messages.
 */
export function canonicalChat(record: Record<string, unknown>): string {
  if (!record || typeof record !== 'object') return '{}';

  const projection: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    if (key === 'created_at' || key === 'updated_at') continue;
    projection[key] = val;
  }

  return canonicalJson(projection);
}

/**
 * Computes the 64-character lowercase SHA-256 digest of a canonical projection.
 * If passed an object, it canonicalizes it first; if passed a string, it hashes directly.
 */
export function hashCanonical(input: string | unknown): string {
  const serialized = typeof input === 'string' ? input : canonicalJson(input);
  return sha256(serialized);
}

import type { LLMProvider } from '@formatavern/shared';

interface CacheEntry {
  value: number | null;
  expiresAt: number;
}

const WINDOW_TTL_MS = 10 * 60_000;
const UNKNOWN_TTL_MS = 60_000;
const MAX_ENTRIES = 50;

const cache = new Map<string, CacheEntry>();

function cacheKey(providerId: string, model: string): string {
  return `${providerId}::${model}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/**
 * Best-effort model context window for budget clamping. Returns the
 * provider-reported window, or null when unknown (provider lacks
 * listModels, model absent, fetch failed or timed out). Null means the
 * manual setting stands alone — never a made-up number.
 *
 * Results are cached (10 min for known windows, 60 s for unknowns) so the
 * steady-state send path performs zero extra requests.
 */
export async function lookupModelContextLength(
  provider: Pick<LLMProvider, 'id' | 'listModels'>,
  model: string,
  timeoutMs = 3000
): Promise<number | null> {
  const key = cacheKey(provider.id, model);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  let value: number | null = null;
  try {
    if (typeof provider.listModels === 'function') {
      const models = await withTimeout(provider.listModels(), timeoutMs);
      const found = models?.find((m) => m.id === model) ?? null;
      if (found && typeof found.contextLength === 'number' && found.contextLength > 0) {
        value = Math.floor(found.contextLength);
      }
    }
  } catch {
    value = null;
  }

  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, {
    value,
    expiresAt: Date.now() + (value === null ? UNKNOWN_TTL_MS : WINDOW_TTL_MS)
  });
  return value;
}

/** Test hook: clears the lookup cache. */
export function clearModelWindowCache(): void {
  cache.clear();
}

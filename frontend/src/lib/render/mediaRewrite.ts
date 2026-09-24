import { rewriteMediaUrls, extractMediaHashes } from '@formatavern/shared';

export interface MediaRewriteOptions {
  extMap?: Record<string, string> | Map<string, string>;
  missingHashes?: Set<string> | string[];
  fetchFn?: typeof fetch;
  standaloneAsImage?: boolean;
}

export const PROBE_EXTENSIONS = ['webp', 'png', 'jpg', 'gif'] as const;
export type ProbedExtension = (typeof PROBE_EXTENSIONS)[number];

const extensionCache = new Map<string, string>();
const missingCache = new Set<string>();
const inFlightProbes = new Set<string>();

type CacheListener = () => void;
const listeners = new Set<CacheListener>();
let cacheVersion = 0;

/**
 * Returns current cache version number, incremented whenever assets resolve.
 */
export function getMediaCacheVersion(): number {
  return cacheVersion;
}

/**
 * Subscribes to cache updates (probes resolving, batch lookups completing).
 */
export function subscribeMediaCache(listener: CacheListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Notifies all subscribers that cache has been updated.
 */
export function notifyMediaCacheUpdated(): void {
  cacheVersion++;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Ignore listener errors
    }
  }
}

/**
 * Seeds missing hashes into memory cache (e.g. from messages.missing_assets).
 */
export function seedMissingHashes(hashes: Iterable<string>): void {
  let anyNew = false;
  for (const h of hashes) {
    if (!missingCache.has(h)) {
      missingCache.add(h);
      anyNew = true;
    }
  }
  if (anyNew) notifyMediaCacheUpdated();
}

/**
 * Seeds extension map into memory cache.
 */
export function seedExtMap(map: Record<string, string> | Map<string, string>): void {
  let anyNew = false;
  const entries = map instanceof Map ? map.entries() : Object.entries(map);
  for (const [h, ext] of entries) {
    const cleanExt = ext.replace(/^\./, '');
    if (extensionCache.get(h) !== cleanExt) {
      extensionCache.set(h, cleanExt);
      anyNew = true;
    }
  }
  if (anyNew) notifyMediaCacheUpdated();
}

/**
 * Clears extension and missing asset caches. Useful for unit testing.
 */
export function clearMediaCache(): void {
  extensionCache.clear();
  missingCache.clear();
  inFlightProbes.clear();
  notifyMediaCacheUpdated();
}

/**
 * Checks if a hash is known to be missing.
 */
export function isMediaMissing(hash: string, missingHashes?: Set<string> | string[]): boolean {
  if (missingCache.has(hash)) return true;
  if (!missingHashes) return false;
  if (missingHashes instanceof Set) return missingHashes.has(hash);
  return missingHashes.includes(hash);
}

/**
 * Renders the accessible missing asset fallback slate.
 */
export function renderMissingAssetSlate(hash: string): string {
  return `<span class="missing-asset-slate inline-flex items-center gap-1.5 rounded border border-(--chrome-line) bg-(--chrome-bg) px-2.5 py-1 text-xs text-(--chrome-text)/60 select-none my-1" data-missing-asset="${hash}"><span class="opacity-70">📷</span><span>Missing media</span></span>`;
}

/**
 * Resolves the cached or mapped extension for a hash, defaulting to 'webp'.
 */
export function resolveExtension(
  hash: string,
  extMap?: Record<string, string> | Map<string, string>
): string {
  if (extMap) {
    const fromMap = extMap instanceof Map ? extMap.get(hash) : extMap[hash];
    if (fromMap) {
      const clean = fromMap.replace(/^\./, '');
      extensionCache.set(hash, clean);
      return clean;
    }
  }
  return extensionCache.get(hash) ?? 'webp';
}

/**
 * Probes candidate extensions in order: .webp -> .png -> .jpg -> .gif via HEAD requests.
 * Stops on the first 200/ok response and caches the result.
 * If all 4 fail, records hash in missing cache and returns null.
 */
export async function probeMediaExtension(
  hash: string,
  options?: { fetchFn?: typeof fetch }
): Promise<string | null> {
  if (missingCache.has(hash)) return null;
  const cached = extensionCache.get(hash);
  if (cached) return cached;

  const fn = options?.fetchFn ?? (typeof fetch !== 'undefined' ? fetch : null);
  if (!fn) return null;

  for (const ext of PROBE_EXTENSIONS) {
    try {
      const res = await fn(`/assets/pool/${hash}.${ext}`, { method: 'HEAD' });
      if (res && (res.ok || res.status === 200)) {
        extensionCache.set(hash, ext);
        notifyMediaCacheUpdated();
        return ext;
      }
    } catch {
      // Continue next candidate probe
    }
  }

  missingCache.add(hash);
  notifyMediaCacheUpdated();
  return null;
}

/**
 * Resolves a list of media hashes by:
 * 1. Checking in-memory cache and options
 * 2. Invoking POST /api/assets/resolve batch endpoint
 * 3. Falling back to candidate HEAD probing (.webp -> .png -> .jpg -> .gif)
 */
export async function resolveMediaHashes(
  hashes: string[],
  options?: MediaRewriteOptions
): Promise<{ extMap: Record<string, string>; missingHashes: string[] }> {
  const extMap: Record<string, string> = {};
  const missingHashes: string[] = [];

  const needed: string[] = [];
  for (const hash of hashes) {
    if (!/^[a-f0-9]{64}$/.test(hash)) continue;
    if (isMediaMissing(hash, options?.missingHashes)) {
      missingHashes.push(hash);
    } else if (extensionCache.has(hash)) {
      extMap[hash] = extensionCache.get(hash)!;
    } else if (options?.extMap) {
      const fromMap = options.extMap instanceof Map ? options.extMap.get(hash) : options.extMap[hash];
      if (fromMap) {
        const clean = fromMap.replace(/^\./, '');
        extensionCache.set(hash, clean);
        extMap[hash] = clean;
      } else {
        needed.push(hash);
      }
    } else {
      needed.push(hash);
    }
  }

  const toFetch = [...new Set(needed)].filter((h) => !inFlightProbes.has(h));
  if (toFetch.length === 0) {
    return { extMap, missingHashes };
  }

  for (const h of toFetch) inFlightProbes.add(h);

  try {
    const fn = options?.fetchFn ?? (typeof fetch !== 'undefined' ? fetch : null);
    let apiSucceeded = false;

    // 1. Try batch resolve endpoint if fetch is available
    if (fn) {
      try {
        const res = await fn('/api/assets/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hashes: toFetch })
        });
        if (res && (res.ok || res.status === 200)) {
          const data = (await res.json()) as {
            extMap?: Record<string, string>;
            missingHashes?: string[];
          };
          if (data && typeof data === 'object') {
            apiSucceeded = true;
            if (data.extMap) {
              for (const [h, ext] of Object.entries(data.extMap)) {
                const clean = ext.replace(/^\./, '');
                extensionCache.set(h, clean);
                extMap[h] = clean;
              }
            }
            if (Array.isArray(data.missingHashes)) {
              for (const h of data.missingHashes) {
                missingCache.add(h);
                missingHashes.push(h);
              }
            }
            notifyMediaCacheUpdated();
          }
        }
      } catch {
        // API endpoint not available or network error, fallback to candidate probe
      }
    }

    // 2. Fallback: probe candidate extensions if batch endpoint failed
    if (!apiSucceeded) {
      let anyChanged = false;
      for (const h of toFetch) {
        const probedExt = await probeMediaExtension(h, { fetchFn: fn ?? undefined });
        if (probedExt) {
          extMap[h] = probedExt;
          anyChanged = true;
        } else {
          missingHashes.push(h);
          anyChanged = true;
        }
      }
      if (anyChanged) {
        notifyMediaCacheUpdated();
      }
    }
  } finally {
    for (const h of toFetch) inFlightProbes.delete(h);
  }

  return { extMap, missingHashes };
}

/**
 * Resolves a media:// hash into its full /assets/pool/<hash>.<ext> URL.
 * Returns null if the asset is missing.
 */
export async function resolveMediaUrl(
  hash: string,
  options: MediaRewriteOptions = {}
): Promise<string | null> {
  if (isMediaMissing(hash, options.missingHashes)) return null;

  let ext = options.extMap instanceof Map
    ? options.extMap.get(hash)
    : options.extMap?.[hash] ?? extensionCache.get(hash);

  if (!ext) {
    const { extMap } = await resolveMediaHashes([hash], options);
    ext = extMap[hash];
  }

  if (ext) {
    return `/assets/pool/${hash}.${ext}`;
  }
  return null;
}

/**
 * Rewrites media://{hash} references inside an HTML string after sanitization.
 *
 * 1. <img> tags with missing hashes are replaced wholesale by renderMissingAssetSlate.
 * 2. <img> tags with resolvable hashes rewrite src="media://{hash}" -> src="/assets/pool/{hash}.<ext>".
 * 3. <a> tags with missing hashes replace href with #missing-asset.
 * 4. <a> tags with resolvable hashes rewrite href="media://{hash}" -> href="/assets/pool/{hash}.<ext>".
 * 5. Standalone media://{hash} references are rewritten via rewriteMediaUrls:
 *    - if missing -> renderMissingAssetSlate
 *    - if standaloneAsImage !== false -> <img src="..." class="rounded-lg max-w-full my-2 inline-block" />
 *    - otherwise -> /assets/pool/{hash}.<ext>
 */
export function rewriteHtmlMediaUrls(html: string, options: MediaRewriteOptions = {}): string {
  if (!html || typeof html !== 'string') return '';

  // Auto-schedule background resolution for un-cached hashes when running in browser
  const allHashes = extractMediaHashes(html);
  const uncached = allHashes.filter(
    (h) => !extensionCache.has(h) && !missingCache.has(h) && !inFlightProbes.has(h)
  );
  if (uncached.length > 0 && typeof window !== 'undefined') {
    void resolveMediaHashes(uncached, options);
  }

  // 1. Process <img> tags with src="media://{hash}"
  const imgRegex = /<img\b([^>]*?)\bsrc=["']media:\/\/([a-f0-9]{64})["']([^>]*?)\/?>/gi;
  let out = html.replace(imgRegex, (_full, before, hash: string, after) => {
    if (isMediaMissing(hash, options.missingHashes)) {
      return renderMissingAssetSlate(hash);
    }
    const ext = resolveExtension(hash, options.extMap);
    return `<img${before}src="/assets/pool/${hash}.${ext}"${after} />`;
  });

  // 2. Process <a> tags with href="media://{hash}"
  const hrefRegex = /href=["']media:\/\/([a-f0-9]{64})["']/gi;
  out = out.replace(hrefRegex, (_full, hash: string) => {
    if (isMediaMissing(hash, options.missingHashes)) {
      return `href="#missing-asset" data-missing-asset="${hash}"`;
    }
    const ext = resolveExtension(hash, options.extMap);
    return `href="/assets/pool/${hash}.${ext}"`;
  });

  // 3. Process any remaining media://{hash} occurrences using rewriteMediaUrls from @formatavern/shared
  out = rewriteMediaUrls(out, (hash) => {
    if (isMediaMissing(hash, options.missingHashes)) {
      return renderMissingAssetSlate(hash);
    }
    const ext = resolveExtension(hash, options.extMap);
    const url = `/assets/pool/${hash}.${ext}`;
    if (options.standaloneAsImage !== false) {
      return `<img src="${url}" alt="media" class="rounded-lg max-w-full my-2 inline-block" loading="lazy" decoding="async" />`;
    }
    return url;
  });

  return out;
}

/**
 * Extracts human-readable persona name from persona snapshot JSON or string.
 */
export function extractPersonaSnapshotName(snapshot?: string | null): string | null {
  if (!snapshot) return null;
  try {
    const parsed = JSON.parse(snapshot);
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.name === 'string' && parsed.name.trim()) {
        return parsed.name.trim();
      }
      return null;
    }
  } catch {
    // If snapshot is not JSON, check if it is a raw string
  }
  const trimmed = snapshot.trim();
  return trimmed || null;
}

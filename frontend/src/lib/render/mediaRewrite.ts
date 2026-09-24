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

/**
 * Clears extension and missing asset caches. Useful for unit testing.
 */
export function clearMediaCache(): void {
  extensionCache.clear();
  missingCache.clear();
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
      extensionCache.set(hash, fromMap);
      return fromMap;
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
        return ext;
      }
    } catch {
      // Continue next candidate probe
    }
  }

  missingCache.add(hash);
  return null;
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
    const probed = await probeMediaExtension(hash, { fetchFn: options.fetchFn });
    if (probed) ext = probed;
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

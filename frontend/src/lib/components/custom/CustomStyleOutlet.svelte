<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { SurfaceScope } from '@formatavern/shared';
  import { loadCustomCss, motionGuard } from '@formatavern/shared/customCss/loader';
  import { prefs } from '$lib/state/prefs.svelte';

  const SANITIZER_VERSION = 1;
  const MAX_MEMORY_BYTES = 512 * 1024; // 512 KiB strict RAM cap for character/chat sheets

  interface MemoryCacheEntry {
    hash: string;
    css: string;
    size: number;
  }

  const memorySheetCache = new Map<string, MemoryCacheEntry>();
  let memorySheetBytes = 0;

  function hashCss(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
  }

  function cacheKey(scope: SurfaceScope, rawHash: string): string {
    return `${scope}:${rawHash}`;
  }

  function getCachedSheet(scope: SurfaceScope, rawHash: string): string | null {
    if (scope === 'shell' && typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem('formatavern_sheet_shell');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (
            parsed &&
            parsed.sanitizerVersion === SANITIZER_VERSION &&
            parsed.rawHash === rawHash &&
            typeof parsed.css === 'string'
          ) {
            return parsed.css;
          }
        }
      } catch {
        // Ignore JSON error
      }
    } else {
      // Keyed by scope + content hash so distinct character/chat sheets coexist
      // up to the byte budget instead of evicting each other per navigation.
      const entry = memorySheetCache.get(cacheKey(scope, rawHash));
      if (entry) {
        // Refresh LRU recency on hit.
        memorySheetCache.delete(cacheKey(scope, rawHash));
        memorySheetCache.set(cacheKey(scope, rawHash), entry);
        return entry.css;
      }
    }
    return null;
  }

  function setCachedSheet(scope: SurfaceScope, rawHash: string, sanitizedCss: string): void {
    if (scope === 'shell' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(
          'formatavern_sheet_shell',
          JSON.stringify({
            sanitizerVersion: SANITIZER_VERSION,
            rawHash,
            css: sanitizedCss,
            fullCss: sanitizedCss + motionGuard(scope)
          })
        );
      } catch {
        // Ignore quota error
      }
    } else {
      const key = cacheKey(scope, rawHash);
      const entrySize = sanitizedCss.length * 2;
      const existing = memorySheetCache.get(key);
      if (existing) {
        memorySheetBytes -= existing.size;
        memorySheetCache.delete(key);
      }
      while (memorySheetBytes + entrySize > MAX_MEMORY_BYTES && memorySheetCache.size > 0) {
        const oldestKey = memorySheetCache.keys().next().value;
        if (!oldestKey) break;
        const oldEntry = memorySheetCache.get(oldestKey);
        if (oldEntry) memorySheetBytes -= oldEntry.size;
        memorySheetCache.delete(oldestKey);
      }
      memorySheetCache.set(key, { hash: rawHash, css: sanitizedCss, size: entrySize });
      memorySheetBytes += entrySize;
    }
  }

  let { scope, css }: { scope: SurfaceScope; css?: string | null } = $props();
  let styleEl: HTMLStyleElement | null = null;

  $effect(() => {
    const raw = css && css.trim() && !prefs.hideCustomStyling ? css : null;
    if (!raw) {
      if (styleEl) {
        styleEl.remove();
        styleEl = null;
      }
      if (scope === 'shell' && typeof localStorage !== 'undefined') {
        try {
          localStorage.removeItem('formatavern_sheet_shell');
        } catch {}
        // C8: purge Frame-0 token bootstrap when viewer hides custom styling.
        if (prefs.hideCustomStyling && typeof document !== 'undefined') {
          document
            .querySelectorAll('style[data-ft-bootstrap="shell-vars"]')
            .forEach((el) => el.remove());
        }
      }
      return;
    }

    const currentHash = hashCss(raw);
    const cached = getCachedSheet(scope, currentHash);
    let cancelled = false;

    // Fast-path: adopt or create synchronously if valid sanitized sheet is in cache
    if (cached) {
      const targetContent = cached + motionGuard(scope);
      if (!styleEl) {
        const existing = typeof document !== 'undefined'
          ? (document.querySelector(`style[data-ft-sheet="${scope}"]`) as HTMLStyleElement | null)
          : null;
        if (existing) {
          styleEl = existing;
          if (styleEl.textContent !== targetContent) {
            styleEl.textContent = targetContent;
          }
        } else if (typeof document !== 'undefined') {
          const el = document.createElement('style');
          el.setAttribute('data-ft-sheet', scope);
          el.textContent = targetContent;
          document.head.appendChild(el);
          styleEl = el;
        }
      } else if (styleEl.textContent !== targetContent) {
        styleEl.textContent = targetContent;
      }
    }

    // Always re-sanitize in background for verification & cache update
    loadCustomCss().then((m) => {
      if (cancelled) return;
      const out = m.sanitizeCss(raw, scope);
      if (!out.css) {
        if (styleEl) {
          styleEl.remove();
          styleEl = null;
        }
        return;
      }

      setCachedSheet(scope, currentHash, out.css);
      const verifiedContent = out.css + motionGuard(scope);

      if (!styleEl) {
        const existing = typeof document !== 'undefined'
          ? (document.querySelector(`style[data-ft-sheet="${scope}"]`) as HTMLStyleElement | null)
          : null;
        if (existing) {
          styleEl = existing;
        } else if (typeof document !== 'undefined') {
          const el = document.createElement('style');
          el.setAttribute('data-ft-sheet', scope);
          document.head.appendChild(el);
          styleEl = el;
        }
      }

      if (styleEl && styleEl.textContent !== verifiedContent) {
        styleEl.textContent = verifiedContent;
      }
    });

    return () => {
      cancelled = true;
      if (styleEl) {
        styleEl.remove();
        styleEl = null;
      }
    };
  });

  onDestroy(() => {
    if (styleEl) {
      styleEl.remove();
      styleEl = null;
    }
  });
</script>

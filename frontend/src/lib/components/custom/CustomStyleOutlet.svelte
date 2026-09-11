<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { SurfaceScope } from '@formatavern/shared';
  import { loadCustomCss, motionGuard } from '@formatavern/shared/customCss/loader';
  import { prefs } from '$lib/state/prefs.svelte';

  let { scope, css }: { scope: SurfaceScope; css?: string | null } = $props();
  let styleEl: HTMLStyleElement | null = null;

  $effect(() => {
    const raw = css && css.trim() && !prefs.hideCustomStyling ? css : null;
    if (!raw) {
      if (styleEl) {
        styleEl.remove();
        styleEl = null;
      }
      return;
    }
    let cancelled = false;
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
      if (styleEl) {
        styleEl.remove();
        styleEl = null;
      }
      const el = document.createElement('style');
      el.setAttribute('data-ft-sheet', scope);
      el.textContent = out.css + motionGuard(scope);
      document.head.appendChild(el);
      styleEl = el;
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

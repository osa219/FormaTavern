<script lang="ts">
  import { untrack } from 'svelte';
  import { media } from '$lib/state/media.svelte';

  let { image = null }: { image?: string | null } = $props();

  let layerA = $state<string | null>(null);
  let layerB = $state<string | null>(null);
  let activeLayer = $state<'A' | 'B'>('A');

  $effect(() => {
    const target = image;
    if (!target) {
      layerA = null;
      layerB = null;
      activeLayer = 'A';
      return;
    }

    // Preload new image before cross-fading it in.
    // activeLayer is read untracked: this effect writes it, so tracking
    // the read would retrigger the effect forever (effect_update_depth_exceeded).
    let cancelled = false;
    const show = () => {
      if (cancelled) return;
      const current = untrack(() => activeLayer);
      if (current === 'A') {
        layerB = target;
        activeLayer = 'B';
      } else {
        layerA = target;
        activeLayer = 'A';
      }
    };
    const img = new Image();
    img.onload = show;
    img.onerror = () => {
      if (!cancelled) console.warn(`[Backdrop] failed to load background image: ${target}`);
    };
    img.src = target;
    // Already cached: onload may not fire again after assignment.
    if (img.complete && img.naturalWidth > 0) show();

    return () => {
      cancelled = true;
    };
  });
</script>

<div class="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
  <!-- Layer A -->
  {#if layerA}
    <div
      class="absolute inset-0 bg-cover bg-center transition-opacity duration-(--motion-theme)"
      style="background-image: url('{layerA}'); filter: blur(var(--theme-bg-blur)); transform: scale(1.06); opacity: {activeLayer === 'A' ? 1 : 0};"
    ></div>
  {/if}

  <!-- Layer B -->
  {#if layerB}
    <div
      class="absolute inset-0 bg-cover bg-center transition-opacity duration-(--motion-theme)"
      style="background-image: url('{layerB}'); filter: blur(var(--theme-bg-blur)); transform: scale(1.06); opacity: {activeLayer === 'B' ? 1 : 0};"
    ></div>
  {/if}

  <!-- Scenery Overlay Tint -->
  <div
    class="absolute inset-0 transition-colors duration-(--motion-theme)"
    style="background-color: var(--theme-bg-overlay);"
  ></div>

  <!-- Ambient Gradient Fallback when no image is loaded -->
  {#if !layerA && !layerB}
    <div
      class="absolute inset-0 transition-opacity duration-(--motion-theme)"
      style="background: radial-gradient(120% 80% at 20% 0%, color-mix(in oklab, var(--theme-accent), transparent 86%), transparent 60%), radial-gradient(90% 70% at 100% 100%, color-mix(in oklab, var(--theme-char-bg), transparent 40%), transparent 70%), var(--n-950);"
    ></div>
  {/if}
</div>

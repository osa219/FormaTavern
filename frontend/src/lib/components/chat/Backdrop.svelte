<script lang="ts">
  import { media } from '$lib/state/media.svelte';

  let { image = null }: { image?: string | null } = $props();

  let layerA = $state<string | null>(null);
  let layerB = $state<string | null>(null);
  let activeLayer = $state<'A' | 'B'>('A');

  $effect(() => {
    if (!image) {
      layerA = null;
      layerB = null;
      return;
    }

    // Preload new image
    const img = new Image();
    img.src = image;
    img.onload = () => {
      if (activeLayer === 'A') {
        layerB = image;
        activeLayer = 'B';
      } else {
        layerA = image;
        activeLayer = 'A';
      }
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

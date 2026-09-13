<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';
  import Toaster from '$lib/components/ui/Toaster.svelte';
  import { shellTheme } from '$lib/state/shellTheme.svelte';
  import { media } from '$lib/state/media.svelte';
  import { prefs } from '$lib/state/prefs.svelte';
  import { SURFACES, type SurfaceScope } from '@formatavern/shared';

  let { children } = $props();

  onMount(() => {
    shellTheme.load();
  });

  const activeSurface = $derived.by<SurfaceScope>(() => {
    const path = page.url.pathname;
    if (path === '/character/new' || path.endsWith('/edit')) return SURFACES[0];
    if (path.startsWith('/character/')) return SURFACES[1];
    if (path.startsWith('/chat/')) return SURFACES[2];
    return SURFACES[0];
  });

  $effect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-ft-motion', media.reducedMotion ? 'reduce' : 'full');
      document.documentElement.setAttribute('data-ft-chrome', prefs.forceSolidChrome ? 'solid' : 'frosted');
      document.documentElement.setAttribute('data-ft-active-surface', activeSurface);
    }
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<Toaster />

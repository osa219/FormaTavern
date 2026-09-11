<script lang="ts">
  import { onMount } from 'svelte';
  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';
  import Toaster from '$lib/components/ui/Toaster.svelte';
  import { shellTheme } from '$lib/state/shellTheme.svelte';
  import { media } from '$lib/state/media.svelte';

  let { children } = $props();

  onMount(() => {
    shellTheme.load();
  });

  $effect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-ft-motion', media.reducedMotion ? 'reduce' : 'full');
    }
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<Toaster />

<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';
  import Toaster from '$lib/components/ui/Toaster.svelte';
  import { shellTheme } from '$lib/state/shellTheme.svelte';
  import { media } from '$lib/state/media.svelte';
  import { prefs } from '$lib/state/prefs.svelte';
  import { isLightColor } from '$lib/theme/cssVars';

  let { children } = $props();

  onMount(() => {
    shellTheme.load();
  });

  const activeSurface = $derived.by(() => {
    const path = page.url.pathname;
    if (path === '/character/new' || path.endsWith('/edit')) return 'shell';
    if (path.startsWith('/character/')) return 'character';
    if (path.startsWith('/chat/')) return 'chat';
    return 'shell';
  });

  $effect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-ft-motion', media.reducedMotion ? 'reduce' : 'full');
      document.documentElement.setAttribute('data-ft-chrome', prefs.forceSolidChrome ? 'solid' : 'frosted');
      document.documentElement.setAttribute('data-ft-surface', activeSurface);

      const c = shellTheme.theme.chrome;
      if (c?.accent) {
        document.documentElement.style.setProperty('--theme-accent', c.accent);
        const isLight = isLightColor(c.accent);
        document.documentElement.style.setProperty('--theme-accent-contrast', isLight ? '#0a0a0c' : '#ffffff');
      } else {
        document.documentElement.style.removeProperty('--theme-accent');
        document.documentElement.style.removeProperty('--theme-accent-contrast');
      }

      if (shellTheme.theme.tint !== undefined) {
        document.documentElement.style.setProperty('--chrome-tint-strength', shellTheme.theme.tint);
      } else {
        document.documentElement.style.removeProperty('--chrome-tint-strength');
      }

      if (activeSurface === 'shell') {
        if (c?.surface) {
          document.documentElement.style.setProperty('--chrome-bg', c.surface);
        } else {
          document.documentElement.style.removeProperty('--chrome-bg');
        }

        if (c?.text) {
          document.documentElement.style.setProperty('--chrome-text', c.text);
        } else {
          document.documentElement.style.removeProperty('--chrome-text');
        }

        if (c?.surface || c?.text) {
          const isLightBg = c.surface ? isLightColor(c.surface) : !isLightColor(c.text!);
          document.documentElement.style.setProperty('color-scheme', isLightBg ? 'light' : 'dark');
        } else {
          document.documentElement.style.removeProperty('color-scheme');
        }
      } else {
        document.documentElement.style.removeProperty('--chrome-bg');
        document.documentElement.style.removeProperty('--chrome-text');
        document.documentElement.style.removeProperty('color-scheme');
      }
    }
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<Toaster />

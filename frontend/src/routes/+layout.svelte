<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';
import Toaster from '$lib/components/ui/Toaster.svelte';
import BottomNav from '$lib/components/nav/BottomNav.svelte';
import PinPromptModal from '$lib/components/auth/PinPromptModal.svelte';
  import { authStore } from '$lib/auth/store.svelte';
  import { shellTheme } from '$lib/state/shellTheme.svelte';
  import { media } from '$lib/state/media.svelte';
  import { prefs } from '$lib/state/prefs.svelte';
  import { SURFACES, type SurfaceScope } from '@formatavern/shared';

  let { children } = $props();

  onMount(() => {
    shellTheme.load();
    authStore.checkStatus();
  });

  const activeSurface = $derived.by<SurfaceScope>(() => {
    const path = page.url.pathname;
    if (path === '/character/new' || path.endsWith('/edit')) return SURFACES[0];
    if (path.startsWith('/character/')) return SURFACES[1];
    if (path.startsWith('/chat/')) return SURFACES[2];
    return SURFACES[0];
  });

  // Mobile bottom nav owns the bottom edge everywhere except the chat view,
  // where the composer owns it (M2). Studio keeps the nav with padded columns.
  const showBottomNav = $derived(!page.url.pathname.startsWith('/chat/'));

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

{#if showBottomNav}
  <!-- C14: same shell-surface hosting precedent as the PIN modal below. -->
  <div data-ft-surface="shell" style="display: contents">
    <BottomNav />
  </div>
{/if}

{#if authStore.status === 'pin-locked'}
  <!-- C14: dialogs render inside a surface boundary. This host is a sibling of
       (never nested in) page surfaces; fixed positioning is viewport-relative,
       so display:contents changes no geometry. Chrome vars resolve to :root
       neutral defaults here — full shell-theme sync is a deferred polish. -->
  <div data-ft-surface="shell" style="display: contents">
    <PinPromptModal />
  </div>
{/if}

<Toaster />

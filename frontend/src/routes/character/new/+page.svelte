<script lang="ts">
  import { onMount } from 'svelte';
  import { CharacterDraft } from '$lib/studio/draft.svelte';
  import StudioShell from '$lib/components/studio/StudioShell.svelte';

  const draft = new CharacterDraft();
  let showRestoreBanner = $state(false);

  onMount(() => {
    if (draft.hasAutosave()) {
      showRestoreBanner = true;
    }
  });

  function handleRestore() {
    draft.restoreAutosave();
    showRestoreBanner = false;
  }

  function handleDismiss() {
    draft.clearAutosave();
    showRestoreBanner = false;
  }
</script>

<svelte:head>
  <title>New Companion — FormaTavern Studio</title>
</svelte:head>

{#if showRestoreBanner}
  <div class="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl border border-accent/40 bg-(--chrome-surface) px-5 py-3 shadow-2xl backdrop-blur-md text-xs text-(--chrome-text)">
    <span>An unsaved companion draft was found from a previous session.</span>
    <button
      type="button"
      onclick={handleRestore}
      class="rounded-lg bg-accent px-3 py-1 font-semibold text-accent-contrast hover:bg-accent/90"
    >
      Restore
    </button>
    <button
      type="button"
      onclick={handleDismiss}
      class="text-(--chrome-text)/60 hover:text-(--chrome-text)"
    >
      Dismiss
    </button>
  </div>
{/if}

<StudioShell {draft} />

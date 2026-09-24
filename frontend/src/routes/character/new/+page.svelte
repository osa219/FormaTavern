<script lang="ts">
  import { onMount } from 'svelte';
  import { CharacterDraft } from '$lib/studio/draft.svelte';
  import StudioShell from '$lib/components/studio/StudioShell.svelte';
  import { importPreviewStore } from '$lib/state/importPreview.svelte';
  import { toasts } from '$lib/state/toasts.svelte';
  import { authStore } from '$lib/auth/store.svelte';
  import type { CharacterCreate } from '@formatavern/shared';

  const draft = new CharacterDraft();
  let showRestoreBanner = $state(false);

  onMount(() => {
    if (draft.hasAutosave()) {
      showRestoreBanner = true;
    }
    void applyImportPreview();
  });

  /**
   * Consumes a stashed import preview (Foyer dialog) into the new draft.
   * Reviewed imports are adopted as native cards on save: only prompt and
   * display fields transfer; import metadata is intentionally dropped.
   */
  async function applyImportPreview() {
    const preview = importPreviewStore.consume();
    if (!preview || preview.kind !== 'character') return;
    try {
      const card = preview.card as CharacterCreate;
      if (card.name) draft.card.name = card.name;
      if (card.characterName !== undefined) draft.card.characterName = card.characterName ?? '';
      if (card.tagline !== undefined) draft.card.tagline = card.tagline ?? '';
      if (card.creator !== undefined) draft.card.creator = card.creator ?? '';
      if (card.creatorUrl !== undefined) draft.card.creatorUrl = card.creatorUrl ?? '';
      if (card.characterUrl !== undefined) draft.card.characterUrl = card.characterUrl ?? '';
      if (card.description !== undefined) draft.card.description = card.description;
      if (card.personality !== undefined) draft.card.personality = card.personality;
      if (card.scenario !== undefined) draft.card.scenario = card.scenario;
      if (card.firstMessage !== undefined) draft.card.firstMessage = card.firstMessage;
      if (card.alternateGreetings !== undefined) draft.card.alternateGreetings = [...card.alternateGreetings];
      if (card.exampleDialogue !== undefined) draft.card.exampleDialogue = card.exampleDialogue ?? '';
      if (card.showcase !== undefined) draft.card.showcase = card.showcase ?? '';
      if (card.tags !== undefined) draft.card.tags = [...card.tags];
      if (card.version !== undefined) draft.card.version = card.version ?? '';

      if (preview.avatarDataUrl) {
        const avatarPath = await stagePreviewAvatar(preview.avatarDataUrl);
        if (avatarPath) draft.card.avatar = avatarPath;
      }
      draft.clearAutosave();
      toasts.success(`Imported "${draft.card.name}" — review and save when ready`);
      for (const warning of preview.warnings ?? []) toasts.show(warning);
    } catch (err: any) {
      toasts.error(err?.message || 'Could not apply the imported card');
    }
  }

  async function stagePreviewAvatar(dataUrl: string): Promise<string | null> {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const formData = new FormData();
      formData.append('file', blob, 'import-avatar.png');
      formData.append('scope', 'draft');
      formData.append('targetId', draft.ownerId);
      const upload = await fetch('/api/assets/upload', {
        method: 'POST',
        headers: authStore.authHeaders(),
        body: formData
      });
      if (!upload.ok) throw new Error('Avatar staging failed');
      const data = await upload.json();
      return data.path ?? null;
    } catch {
      toasts.show('Card text imported, but the avatar could not be staged — upload one manually');
      return null;
    }
  }

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
  <title>New Card — FormaTavern Studio</title>
</svelte:head>

{#if showRestoreBanner}
  <div class="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl border border-accent/40 bg-(--chrome-surface) px-5 py-3 shadow-2xl backdrop-blur-md text-xs text-(--chrome-text)">
    <span>An unsaved card draft was found from a previous session.</span>
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

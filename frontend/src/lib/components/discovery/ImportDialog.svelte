<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import { authStore } from '$lib/auth/store.svelte';
  import { HOOKS, type ImportPreview } from '@formatavern/shared';

  let {
    open = false,
    onClose,
    onPreviewCharacter
  }: {
    open: boolean;
    onClose: () => void;
    onPreviewCharacter: (preview: Extract<ImportPreview, { kind: 'character' }>) => void;
  } = $props();

  let dialogEl = $state<HTMLDialogElement | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let parsing = $state(false);
  let dragActive = $state(false);
  let fileName = $state<string | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!dialogEl) return;
    if (open) {
      if (!dialogEl.open) dialogEl.showModal();
    } else {
      if (dialogEl.open) dialogEl.close();
      reset();
    }
  });

  function reset() {
    parsing = false;
    dragActive = false;
    fileName = null;
    error = null;
    if (fileInput) fileInput.value = '';
  }

  function handleCancel(e?: Event) {
    e?.preventDefault();
    onClose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === dialogEl) onClose();
  }

  async function parseFile(file: File) {
    parsing = true;
    error = null;
    fileName = file.name;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/import/preview', {
        method: 'POST',
        headers: authStore.authHeaders(),
        body: formData
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || `Preview failed (HTTP ${res.status})`);
      }
      const preview = (await res.json()) as ImportPreview;
      if (preview.kind === 'chat') {
        error =
          'This looks like a chat transcript. Open the target character page and use Import chat from its menu instead.';
        parsing = false;
        return;
      }
      onPreviewCharacter(preview);
    } catch (err: any) {
      error = err?.message || 'Could not parse this file.';
      parsing = false;
    }
  }

  function handleInputChange(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (files && files.length > 0) void parseFile(files[0]);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragActive = false;
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) void parseFile(files[0]);
  }

  // Page-level drops on the Foyer dispatch here once the dialog is mounted.
  onMount(() => {
    const listener = (e: Event) => {
      const file = (e as CustomEvent).detail?.file as File | undefined;
      if (file) void parseFile(file);
    };
    window.addEventListener('foyer-import-drop', listener);
    return () => window.removeEventListener('foyer-import-drop', listener);
  });
</script>

<dialog
  bind:this={dialogEl}
  oncancel={handleCancel}
  onclick={handleBackdropClick}
  class="fixed inset-0 m-auto hidden open:block w-full max-w-md rounded-2xl border border-(--chrome-line) bg-(--chrome-surface) p-6 max-md:p-4 text-(--chrome-text) shadow-2xl max-md:bottom-0 max-md:top-auto max-md:max-w-none max-md:rounded-b-none max-md:border-x-0 max-md:border-b-0 {HOOKS.chrome.dialog}"
  aria-label="Import character card"
>
  <div class="flex flex-col gap-4">
    <div class="flex items-start justify-between gap-4">
      <h2 class="text-base font-semibold text-(--chrome-text)">Import character card</h2>
      <button
        type="button"
        onclick={onClose}
        class="rounded-lg p-1 text-(--chrome-text)/60 hover:bg-(--chrome-line)/40 hover:text-(--chrome-text)"
        aria-label="Close import dialog"
      >
        <Icon name="close" size={16} />
      </button>
    </div>

    <p class="text-xs leading-relaxed text-(--chrome-text)/60">
      TavernCard V2 (.png, .json) or custom_engine character (.json). The card opens in Studio for review — nothing is saved until you save the draft.
    </p>

    <button
      type="button"
      class="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-xs transition-colors {dragActive
        ? 'border-accent bg-accent/10 text-(--chrome-text)'
        : 'border-(--chrome-line) text-(--chrome-text)/60 hover:border-accent/40 hover:text-(--chrome-text)'}"
      ondragover={(e) => {
        e.preventDefault();
        dragActive = true;
      }}
      ondragleave={() => (dragActive = false)}
      ondrop={handleDrop}
      onclick={() => fileInput?.click()}
      disabled={parsing}
    >
      {#if parsing}
        <Spinner size={20} />
        <span>Parsing {fileName ?? 'file'}…</span>
      {:else}
        <Icon name="upload" size={20} />
        <span>Drop a card file here, or click to browse</span>
      {/if}
    </button>
    <input
      type="file"
      accept=".png,.json"
      class="hidden"
      bind:this={fileInput}
      onchange={handleInputChange}
    />

    {#if error}
      <p class="rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2 text-xs text-red-300" role="alert">
        {error}
      </p>
    {/if}

    <div class="flex items-center justify-end gap-2.5">
      <button
        type="button"
        onclick={onClose}
        class="rounded-xl border border-(--chrome-line) bg-(--chrome-bg) px-4 py-2 text-xs font-medium text-(--chrome-text) hover:border-accent/40"
      >
        Cancel
      </button>
    </div>
  </div>
</dialog>

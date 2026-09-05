<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import Spinner from '../ui/Spinner.svelte';
  import type { NarrativeRole } from '@formatavern/shared';

  let {
    open = false,
    content = '',
    narrativeRole = 'character',
    onSave,
    onClose
  }: {
    open: boolean;
    content: string;
    narrativeRole?: NarrativeRole;
    onSave: (newContent: string) => Promise<void> | void;
    onClose: () => void;
  } = $props();

  let dialogEl = $state<HTMLDialogElement | null>(null);
  let draft = $state('');
  let saving = $state(false);

  $effect(() => {
    if (open) {
      draft = content;
      if (dialogEl && !dialogEl.open) {
        dialogEl.showModal();
      }
    } else {
      if (dialogEl && dialogEl.open) {
        dialogEl.close();
      }
    }
  });

  const isAssistant = $derived(narrativeRole === 'character' || narrativeRole === 'narrator' || narrativeRole === 'npc');

  async function handleSave() {
    saving = true;
    try {
      await onSave(draft);
      onClose();
    } finally {
      saving = false;
    }
  }

  function handleCancel(e: Event) {
    e.preventDefault();
    onClose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === dialogEl) {
      onClose();
    }
  }
</script>

<dialog
  bind:this={dialogEl}
  oncancel={handleCancel}
  onclick={handleBackdropClick}
  class="fixed inset-0 m-auto flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-neutral-800 bg-neutral-900/98 p-6 text-neutral-100 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm max-sm:bottom-0 max-sm:top-auto max-sm:max-h-[90vh] max-sm:max-w-none max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0"
  aria-labelledby="edit-dialog-title"
>
  <div class="mb-3 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <Icon name="edit" size={16} class="text-accent" />
      <h2 id="edit-dialog-title" class="text-base font-semibold text-neutral-100">
        Edit Message
      </h2>
    </div>
    <button
      type="button"
      onclick={onClose}
      class="rounded-lg p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
      aria-label="Close dialog"
    >
      <Icon name="close" size={16} />
    </button>
  </div>

  {#if isAssistant}
    <div class="mb-3 rounded-xl border border-amber-900/50 bg-amber-950/20 px-3.5 py-2.5 text-xs leading-relaxed text-amber-200/90">
      <span class="font-semibold">Note:</span> Saving will reparse envelope structure and state for this turn. Downstream turns in this branch will not be automatically regenerated.
    </div>
  {/if}

  <div class="relative flex min-h-[16rem] flex-1 flex-col">
    <textarea
      bind:value={draft}
      class="w-full flex-1 resize-none rounded-xl border border-neutral-800 bg-neutral-950 p-4 font-mono text-xs leading-relaxed text-neutral-200 placeholder-neutral-600 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-accent"
      placeholder="Message content..."
      rows={12}
    ></textarea>
  </div>

  <div class="mt-4 flex items-center justify-end gap-2.5">
    <button
      type="button"
      onclick={onClose}
      disabled={saving}
      class="rounded-xl border border-neutral-800 bg-neutral-850 px-4 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-50"
    >
      Cancel
    </button>
    <button
      type="button"
      onclick={handleSave}
      disabled={saving || draft === content}
      class="flex items-center gap-1.5 rounded-xl bg-neutral-100 px-4 py-2 text-xs font-semibold text-neutral-900 transition-colors hover:bg-white disabled:opacity-50"
    >
      {#if saving}
        <Spinner size={12} class="text-neutral-900" />
        <span>Saving…</span>
      {:else}
        <span>Save Changes</span>
      {/if}
    </button>
  </div>
</dialog>

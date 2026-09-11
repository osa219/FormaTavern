<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import { HOOKS } from '@formatavern/shared';

  let {
    open = false,
    title = 'Confirm Action',
    message = 'Are you sure you want to proceed?',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    onConfirm,
    onCancel
  }: {
    open: boolean;
    title?: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  } = $props();

  let dialogEl = $state<HTMLDialogElement | null>(null);

  $effect(() => {
    if (!dialogEl) return;
    if (open) {
      if (!dialogEl.open) {
        dialogEl.showModal();
      }
    } else {
      if (dialogEl.open) {
        dialogEl.close();
      }
    }
  });

  function handleCancel(e: Event) {
    e.preventDefault();
    onCancel();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === dialogEl) {
      onCancel();
    }
  }
</script>

<dialog
  bind:this={dialogEl}
  oncancel={handleCancel}
  onclick={handleBackdropClick}
  class="fixed inset-0 m-auto hidden open:block w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/98 p-6 text-neutral-100 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm max-sm:bottom-0 max-sm:top-auto max-sm:max-w-none max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 {HOOKS.chrome.dialog}"
  aria-labelledby="confirm-dialog-title"
  aria-describedby="confirm-dialog-desc"
>
  <div class="flex flex-col gap-4">
    <div class="flex items-start justify-between gap-4">
      <h2 id="confirm-dialog-title" class="text-base font-semibold text-neutral-100">
        {title}
      </h2>
      <button
        type="button"
        onclick={onCancel}
        class="rounded-lg p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        aria-label="Close dialog"
      >
        <Icon name="close" size={16} />
      </button>
    </div>

    <p id="confirm-dialog-desc" class="text-sm leading-relaxed text-neutral-400">
      {message}
    </p>

    <div class="mt-2 flex items-center justify-end gap-2.5">
      <button
        type="button"
        onclick={onCancel}
        class="rounded-xl border border-neutral-800 bg-neutral-850 px-4 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onclick={onConfirm}
        class="rounded-xl px-4 py-2 text-xs font-semibold text-white transition-colors"
        class:bg-red-600={danger}
        class:hover:bg-red-500={danger}
        class:bg-neutral-100={!danger}
        class:text-neutral-900={!danger}
        class:hover:bg-white={!danger}
      >
        {confirmLabel}
      </button>
    </div>
  </div>
</dialog>

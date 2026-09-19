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
  class="fixed inset-0 m-auto hidden open:block w-full max-w-md rounded-2xl border border-(--chrome-line) bg-(--chrome-surface) p-6 max-md:p-4 text-(--chrome-text) shadow-2xl max-md:bottom-0 max-md:top-auto max-md:max-w-none max-md:rounded-b-none max-md:border-x-0 max-md:border-b-0 {HOOKS.chrome.dialog}"
  aria-labelledby="confirm-dialog-title"
  aria-describedby="confirm-dialog-desc"
>
  <div class="flex flex-col gap-4">
    <div class="flex items-start justify-between gap-4">
      <h2 id="confirm-dialog-title" class="text-base font-semibold text-(--chrome-text)">
        {title}
      </h2>
      <button
        type="button"
        onclick={onCancel}
        class="rounded-lg p-1 text-(--chrome-text)/60 hover:bg-(--chrome-line)/40 hover:text-(--chrome-text)"
        aria-label="Close dialog"
      >
        <Icon name="close" size={16} />
      </button>
    </div>

    <p id="confirm-dialog-desc" class="text-sm leading-relaxed text-(--chrome-text)/70">
      {message}
    </p>

    <div class="mt-2 flex items-center justify-end gap-2.5">
      <button
        type="button"
        onclick={onCancel}
        class="rounded-xl border border-(--chrome-line) bg-(--chrome-bg) px-4 py-2 text-xs font-medium text-(--chrome-text)/80 transition-colors hover:bg-(--chrome-line)/40 hover:text-(--chrome-text)"
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onclick={onConfirm}
        class="rounded-xl px-4 py-2 text-xs font-semibold transition-colors"
        class:bg-red-600={danger}
        class:text-white={danger}
        class:hover:bg-red-500={danger}
        class:bg-(--theme-accent)={!danger}
        class:text-accent-contrast={!danger}
        class:hover:opacity-90={!danger}
      >
        {confirmLabel}
      </button>
    </div>
  </div>
</dialog>

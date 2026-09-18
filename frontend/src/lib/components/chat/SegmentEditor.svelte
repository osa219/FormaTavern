<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import { HOOKS } from '@formatavern/shared';
  import { autosize } from '$lib/actions/autosize';

  let {
    initial = '',
    saving = false,
    onSave,
    onCancel
  }: {
    initial?: string;
    saving?: boolean;
    onSave?: (text: string) => void;
    onCancel?: () => void;
  } = $props();

  let ta = $state<HTMLTextAreaElement | null>(null);
  // Seeded from the prop so SSR/first paint shows the text; the effect below
  // resyncs when retargeted at a different segment.
  // svelte-ignore state_referenced_locally
  let draft = $state(initial);

  // Reset when the editor is retargeted at a different segment; focus for typing.
  $effect(() => {
    draft = initial;
    ta?.focus();
  });

  const dirty = $derived(draft !== initial);

  function commit() {
    if (saving || !dirty) return;
    onSave?.(draft);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (!saving) onCancel?.();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
  }
</script>

<div class="relative w-full rounded-xl border border-accent/40 bg-(--chrome-surface)/95 shadow-md backdrop-blur-sm transition-colors focus-within:border-accent/80 focus-within:ring-1 focus-within:ring-accent/30 {HOOKS.chat.segmentEditor}">
  <!-- Floating action bar outside top-right (Janitor-style header alignment) -->
  <div class="absolute -top-7.5 right-0 z-20 flex items-center gap-1 rounded-md border border-(--chrome-line)/40 bg-(--chrome-surface)/95 px-1 py-0.5 shadow-sm backdrop-blur-sm">
    <button
      type="button"
      onclick={() => onCancel?.()}
      disabled={saving}
      class="flex h-6 w-6 items-center justify-center rounded text-(--chrome-text)/60 hover:bg-(--chrome-line)/40 hover:text-(--chrome-text) transition-colors disabled:opacity-40"
      title="Cancel edit (Esc)"
      aria-label="Cancel edit"
    >
      <Icon name="close" size={13} />
    </button>
    <button
      type="button"
      onclick={commit}
      disabled={saving || !dirty}
      class="flex h-6 w-6 items-center justify-center rounded text-accent hover:bg-accent/20 transition-colors disabled:opacity-40"
      title="Save edit (Ctrl+Enter)"
      aria-label="Save edit"
    >
      <Icon name="check" size={13} />
    </button>
  </div>

  <textarea
    use:autosize={{ minRows: 1, maxRows: 30 }}
    bind:this={ta}
    bind:value={draft}
    onkeydown={handleKeydown}
    disabled={saving}
    rows={1}
    title="Plain prose — Ctrl+Enter saves, Esc cancels"
    aria-label="Edit segment text"
    class="w-full resize-y border-0 bg-transparent px-3 py-2 text-sm leading-relaxed text-(--chrome-text) placeholder:text-(--chrome-text)/40 focus:outline-none focus:ring-0 disabled:opacity-60 max-h-[65vh] overflow-y-auto block"
  ></textarea>
</div>

<script lang="ts">
  import Icon from '../ui/Icon.svelte';

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

<div class="w-full rounded-xl border border-accent/40 bg-neutral-950 p-2">
  <textarea
    bind:this={ta}
    bind:value={draft}
    onkeydown={handleKeydown}
    disabled={saving}
    rows={3}
    aria-label="Edit segment text"
    class="w-full resize-y rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm leading-relaxed text-neutral-100 placeholder-neutral-600 focus:border-neutral-600 focus:outline-none disabled:opacity-60"
  ></textarea>
  <div class="mt-1.5 flex items-center justify-between gap-2">
    <span class="px-1 text-[11px] text-neutral-500">Plain prose — markers stay hidden. Ctrl+Enter saves, Esc cancels.</span>
    <div class="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onclick={() => onCancel?.()}
        disabled={saving}
        class="flex h-7 w-7 items-center justify-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-40"
        title="Cancel edit"
        aria-label="Cancel edit"
      >
        <Icon name="close" size={14} />
      </button>
      <button
        type="button"
        onclick={commit}
        disabled={saving || !dirty}
        class="flex h-7 w-7 items-center justify-center rounded text-emerald-300 hover:bg-emerald-950/60 hover:text-emerald-200 disabled:opacity-40"
        title="Save edit"
        aria-label="Save edit"
      >
        <Icon name="check" size={14} />
      </button>
    </div>
  </div>
</div>

<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import { api } from '$lib/api';

  let {
    messageId,
    siblingIndex = 0,
    siblingCount = 1,
    busy = false,
    onSelectSibling,
    onRegenerate
  }: {
    messageId: string;
    siblingIndex: number;
    siblingCount: number;
    busy?: boolean;
    onSelectSibling?: (siblingId: string) => void;
    onRegenerate?: () => void;
  } = $props();

  let siblingsCache = $state<Array<{ id: string }> | null>(null);
  let loadingSiblings = $state<boolean>(false);

  async function ensureSiblings() {
    if (siblingsCache || loadingSiblings || siblingCount <= 1) return;
    loadingSiblings = true;
    try {
      const { data, error } = await api.api.messages({ id: messageId }).siblings.get();
      if (!error && Array.isArray(data)) {
        siblingsCache = data;
      }
    } catch {
      // ignore
    } finally {
      loadingSiblings = false;
    }
  }

  async function handlePrev() {
    if (busy || siblingIndex <= 0) return;
    await ensureSiblings();
    if (siblingsCache && siblingsCache[siblingIndex - 1]) {
      onSelectSibling?.(siblingsCache[siblingIndex - 1].id);
    }
  }

  async function handleNext() {
    if (busy) return;
    if (siblingIndex === siblingCount - 1) {
      onRegenerate?.();
      return;
    }
    await ensureSiblings();
    if (siblingsCache && siblingsCache[siblingIndex + 1]) {
      onSelectSibling?.(siblingsCache[siblingIndex + 1].id);
    }
  }

  const isLast = $derived(siblingIndex === siblingCount - 1);
</script>

<div
  class="flex items-center gap-1 rounded border border-neutral-800 bg-neutral-900/80 px-1.5 py-0.5 text-[11px] font-medium text-neutral-400"
  onmouseenter={ensureSiblings}
  onfocusin={ensureSiblings}
  role="region"
  aria-label="Swipe alternatives"
>
  <button
    type="button"
    onclick={handlePrev}
    disabled={busy || siblingIndex <= 0}
    class="rounded p-0.5 transition-colors hover:text-neutral-100 disabled:opacity-30 disabled:hover:text-neutral-400"
    aria-label="Previous swipe"
    title="Previous swipe"
  >
    <Icon name="chevron-left" size={13} />
  </button>

  <span class="select-none px-1 font-mono">{siblingIndex + 1} / {siblingCount}</span>

  <button
    type="button"
    onclick={handleNext}
    disabled={busy}
    class="flex items-center rounded p-0.5 transition-colors hover:text-neutral-100 disabled:opacity-30 disabled:hover:text-neutral-400"
    aria-label={isLast ? 'New reply variation' : 'Next swipe'}
    title={isLast ? 'New reply variation' : 'Next swipe'}
  >
    <Icon name="chevron-right" size={13} />
    {#if isLast}
      <span class="ml-[-2px] text-[9px] font-bold text-accent">+</span>
    {/if}
  </button>
</div>

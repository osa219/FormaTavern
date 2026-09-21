<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import { HOOKS } from '@formatavern/shared';

  // Generalized edge pager: edge-anchored previous/next arrows with a
  // centered counter. When onRegenerate is provided, the next arrow stays
  // enabled at the last position and generates a new alternative instead.
  let {
    index = 0,
    count = 1,
    busy = false,
    nextDisabled = false,
    prevLabel = 'Previous',
    nextLabel = 'Next',
    onSelect,
    onRegenerate
  }: {
    index: number;
    count: number;
    busy?: boolean;
    nextDisabled?: boolean;
    prevLabel?: string;
    nextLabel?: string;
    onSelect: (index: number) => void;
    onRegenerate?: () => void;
  } = $props();

  const atEnd = $derived(index >= count - 1);

  function handleNext() {
    if (busy || nextDisabled) return;
    if (atEnd) {
      onRegenerate?.();
      return;
    }
    onSelect(index + 1);
  }
</script>

<div
  class="flex w-full items-center justify-between {HOOKS.chat.edgePager}"
  role="region"
  aria-label="Alternatives"
>
  <button
    type="button"
    onclick={() => onSelect(index - 1)}
    disabled={busy || index <= 0}
    class="rounded-full p-2.5 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-30"
    aria-label={prevLabel}
    title={prevLabel}
  >
    <Icon name="chevron-left" size={20} />
  </button>

  <span class="select-none font-mono text-xs text-neutral-400" aria-live="polite">
    {index + 1} / {count}
  </span>

  <button
    type="button"
    onclick={handleNext}
    disabled={busy || nextDisabled || (atEnd && !onRegenerate)}
    class="rounded-full p-2.5 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-30"
    aria-label={nextLabel}
    title={nextLabel}
  >
    <Icon name="chevron-right" size={20} />
  </button>
</div>

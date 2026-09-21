<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import { HOOKS } from '@formatavern/shared';

  // Generalized edge pager: edge-anchored previous/next arrows with a
  // centered display-only counter. Greeting flip is the first use; sibling
  // swipe can adopt the same visual language later.
  let {
    index = 0,
    count = 1,
    busy = false,
    prevLabel = 'Previous',
    nextLabel = 'Next',
    onSelect
  }: {
    index: number;
    count: number;
    busy?: boolean;
    prevLabel?: string;
    nextLabel?: string;
    onSelect: (index: number) => void;
  } = $props();
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
    onclick={() => onSelect(index + 1)}
    disabled={busy || index >= count - 1}
    class="rounded-full p-2.5 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-30"
    aria-label={nextLabel}
    title={nextLabel}
  >
    <Icon name="chevron-right" size={20} />
  </button>
</div>

<script lang="ts">
  import { displayTag } from '@formatavern/shared';

  let {
    availableTags = [],
    selectedTags = [],
    onToggleTag,
    onClearTags
  }: {
    availableTags?: Array<{ tag: string; count: number }>;
    selectedTags?: string[];
    onToggleTag: (tag: string) => void;
    onClearTags: () => void;
  } = $props();
</script>

{#if availableTags.length > 0}
  <div class="space-y-2">
    <div class="flex items-center justify-between text-xs">
      <span class="font-mono text-[11px] uppercase tracking-wider text-(--chrome-text)/60">
        {#if selectedTags.length > 0}
          Matching all of ({selectedTags.length}):
        {:else}
          Filter by tag:
        {/if}
      </span>

      {#if selectedTags.length > 0}
        <button
          type="button"
          onclick={onClearTags}
          class="text-xs text-(--chrome-text)/60 hover:text-(--chrome-text) underline"
        >
          Clear filters
        </button>
      {/if}
    </div>

    <div class="flex flex-wrap items-center gap-1.5">
      {#each availableTags as { tag, count } (tag)}
        {@const selected = selectedTags.includes(tag)}
        <button
          type="button"
          onclick={() => onToggleTag(tag)}
          class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-mono transition-colors {selected
            ? 'border-accent bg-accent/20 text-accent font-semibold shadow-xs'
            : 'border-(--chrome-line) bg-(--chrome-surface) text-(--chrome-text)/70 hover:border-accent/40 hover:text-(--chrome-text)'}"
        >
          <span>{displayTag(tag)}</span>
          <span class="text-[10px] opacity-60">({count})</span>
        </button>
      {/each}
    </div>
  </div>
{/if}

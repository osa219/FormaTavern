<script lang="ts">
  import type { CharacterSummary } from '@formatavern/shared';
  import CompanionCard from './CompanionCard.svelte';
  import EmptyState from './EmptyState.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';

  let {
    companions = [],
    loading = false,
    loadingMore = false,
    hasMore = false,
    hasFilters = false,
    onLoadMore,
    onStartStory,
    onResetFilters
  }: {
    companions?: CharacterSummary[];
    loading?: boolean;
    loadingMore?: boolean;
    hasMore?: boolean;
    hasFilters?: boolean;
    onLoadMore?: () => void;
    onStartStory?: (characterId: string) => void;
    onResetFilters?: () => void;
  } = $props();
</script>

<div>
  {#if loading && companions.length === 0}
    <!-- Skeleton Grid -->
    <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {#each Array(6) as _, i (i)}
        <div class="h-44 animate-pulse rounded-2xl border border-neutral-800/60 bg-neutral-900/40 p-5"></div>
      {/each}
    </div>
  {:else if companions.length === 0}
    <EmptyState {hasFilters} onReset={onResetFilters} />
  {:else}
    <!-- Companions Grid -->
    <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {#each companions as companion (companion.id)}
        <CompanionCard {companion} {onStartStory} />
      {/each}
    </div>

    <!-- Load More Button -->
    {#if hasMore}
      <div class="mt-8 flex justify-center">
        <button
          type="button"
          disabled={loadingMore}
          onclick={onLoadMore}
          class="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900 px-6 py-2.5 text-xs font-semibold text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-850 hover:text-white disabled:opacity-50"
        >
          {#if loadingMore}
            <Spinner size={14} />
            <span>Loading more…</span>
          {:else}
            <span>Load More Companions</span>
          {/if}
        </button>
      </div>
    {/if}
  {/if}
</div>

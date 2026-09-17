<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte';

  let {
    hasFilters = false,
    onReset
  }: {
    hasFilters?: boolean;
    onReset?: () => void;
  } = $props();
</script>

<div class="flex flex-col items-center justify-center rounded-3xl border border-dashed border-neutral-800 bg-neutral-900/30 p-12 text-center">
  <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-800/80 text-accent mb-4 border border-neutral-700">
    <Icon name="sparkles" size={20} />
  </div>

  <h3 class="text-base font-semibold text-neutral-200">
    No Characters Found
  </h3>

  <p class="mt-1.5 max-w-sm text-xs leading-relaxed text-neutral-400">
    {#if hasFilters}
      No characters matched your active search query and tag filters.
    {:else}
      Your character library is currently empty.
    {/if}
  </p>

  <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
    {#if hasFilters && onReset}
      <button
        type="button"
        onclick={onReset}
        class="rounded-xl border border-neutral-800 bg-neutral-850 px-4 py-2 text-xs font-semibold text-neutral-300 hover:bg-neutral-800"
      >
        Clear Filters
      </button>
    {/if}

    <a
      href="/character/new"
      class="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-contrast hover:bg-accent/90 shadow-md"
    >
      <Icon name="plus" size={14} />
      <span>Create a Character</span>
    </a>
  </div>
</div>

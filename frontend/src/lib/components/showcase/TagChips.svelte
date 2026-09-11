<script lang="ts">
  import { displayTag, HOOKS } from '@formatavern/shared';

  let {
    tags = []
  }: {
    tags?: string[];
  } = $props();
</script>

{#if tags && tags.length > 0}
  <div class="flex flex-wrap items-center gap-1.5 {HOOKS.character.tagChips}">
    {#each tags as tag (tag)}
      <a
        href="/?tags={encodeURIComponent(tag)}"
        class="inline-flex items-center rounded-md border border-neutral-800 bg-neutral-900/80 px-2 py-0.5 text-xs font-mono text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800 hover:text-neutral-100"
      >
        {displayTag(tag)}
      </a>
    {/each}
  </div>
{/if}

<script lang="ts">
  import { goto } from '$app/navigation';
  import { HOOKS } from '@formatavern/shared';

  let {
    creator,
    creatorUrl
  }: {
    creator?: string | null;
    creatorUrl?: string | null;
  } = $props();

  function goToCreator(e: MouseEvent) {
    // If the creator has an external URL, the link handles it.
    // Otherwise, filter the catalog to cards by this creator.
    if (creatorUrl) return;
    e.preventDefault();
    e.stopPropagation();
    if (creator?.trim()) {
      goto(`/?creator=${encodeURIComponent(creator.trim())}`);
    }
  }
</script>

{#if creator}
  <div class="flex items-center gap-1.5 text-xs text-neutral-400 {HOOKS.character.creatorCredit}">
    <span>Created by</span>
    {#if creatorUrl}
      <a
        href={creatorUrl}
        target="_blank"
        rel="noopener noreferrer"
        onclick={(e) => e.stopPropagation()}
        class="font-medium text-neutral-200 underline decoration-neutral-600 underline-offset-2 hover:text-white"
      >{creator}</a>
    {:else}
      <button
        type="button"
        onclick={goToCreator}
        title="See all cards by {creator}"
        class="font-medium text-neutral-200 underline decoration-dotted decoration-neutral-600 underline-offset-2 hover:text-white cursor-pointer"
      >{creator}</button>
    {/if}
  </div>
{/if}

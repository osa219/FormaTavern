<script lang="ts">
  import { HOOKS } from '@formatavern/shared';

  let {
    creator
  }: {
    creator?: string | null;
  } = $props();
</script>

{#if creator}
  <div class="flex items-center gap-1.5 text-xs text-neutral-400 {HOOKS.character.creatorCredit}">
    <span>Created by</span>
    <span class="font-medium text-neutral-200">{creator}</span>
  </div>
{/if}

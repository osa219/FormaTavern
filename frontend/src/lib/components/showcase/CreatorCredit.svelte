<script lang="ts">
  let {
    creator
  }: {
    creator?: string | null;
  } = $props();
</script>

{#if creator}
  <div class="flex items-center gap-1.5 text-xs text-neutral-400">
    <span>Created by</span>
    <span class="font-medium text-neutral-200">{creator}</span>
  </div>
{/if}

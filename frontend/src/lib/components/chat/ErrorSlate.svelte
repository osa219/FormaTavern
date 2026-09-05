<script lang="ts">
  import Icon from '../ui/Icon.svelte';

  let { onRetry }: { onRetry?: () => void } = $props();
</script>

<div
  class="my-2 flex items-center justify-between gap-3 rounded-lg border border-red-800/80 bg-red-950/70 px-4 py-2.5 text-xs text-red-200"
  role="alert"
>
  <div class="flex items-center gap-2">
    <span class="text-red-400 font-semibold uppercase tracking-wider">Generation Interrupted</span>
  </div>

  {#if onRetry}
    <button
      type="button"
      onclick={onRetry}
      class="flex items-center gap-1.5 rounded bg-red-900/60 px-2.5 py-1 text-xs font-medium text-red-100 transition-colors hover:bg-red-800"
    >
      <Icon name="regenerate" size={14} />
      <span>Retry</span>
    </button>
  {/if}
</div>

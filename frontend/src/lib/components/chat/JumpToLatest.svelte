<script lang="ts">
  import Icon from '../ui/Icon.svelte';

  let {
    visible = false,
    hasUnread = false,
    onclick
  }: {
    visible?: boolean;
    hasUnread?: boolean;
    onclick?: () => void;
  } = $props();
</script>

{#if visible}
  <div class="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
    <button
      type="button"
      {onclick}
      class="pointer-events-auto flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900/95 px-3 py-1.5 text-xs font-medium text-neutral-200 shadow-lg backdrop-blur-sm transition-colors hover:bg-neutral-800 hover:text-neutral-50 active:scale-95"
      aria-label="Scroll to latest messages"
    >
      <Icon name="arrow-down" size={14} />
      <span>Latest</span>
      {#if hasUnread}
        <span class="h-2 w-2 rounded-full bg-accent animate-pulse" aria-hidden="true"></span>
      {/if}
    </button>
  </div>
{/if}

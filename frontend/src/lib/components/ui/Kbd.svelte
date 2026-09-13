<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children?: Snippet } = $props();
</script>

<kbd class="inline-flex items-center justify-center rounded border border-(--chrome-line) bg-(--chrome-surface) px-1.5 py-0.5 font-mono text-[10px] font-semibold text-(--chrome-text) shadow-xs">
  {@render children?.()}
</kbd>

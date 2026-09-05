<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children?: Snippet } = $props();
</script>

<kbd class="inline-flex items-center justify-center rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-neutral-300 shadow-sm">
  {@render children?.()}
</kbd>

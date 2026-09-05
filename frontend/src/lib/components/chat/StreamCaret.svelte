<script lang="ts">
  import { media } from '$lib/state/media.svelte';
</script>

<span
  class="inline-block w-2 h-4 ml-1 align-middle bg-accent rounded-xs {media.reducedMotion ? 'opacity-90' : 'animate-pulse'}"
  aria-hidden="true"
></span>

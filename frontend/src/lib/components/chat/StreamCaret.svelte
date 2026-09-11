<script lang="ts">
  import { media } from '$lib/state/media.svelte';
  import { HOOKS } from '@formatavern/shared';
</script>

<span
  class="inline-block w-2 h-4 ml-1 align-middle bg-accent rounded-xs {media.reducedMotion ? 'opacity-90' : 'animate-pulse'} {HOOKS.chat.streamCaret}"
  aria-hidden="true"
></span>

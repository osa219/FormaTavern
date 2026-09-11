<script lang="ts">
  import Markdown from '../ui/Markdown.svelte';
  import StreamCaret from './StreamCaret.svelte';
  import { HOOKS } from '@formatavern/shared';

  let {
    text = '',
    live = false,
    showSeparator = false
  }: {
    text?: string;
    live?: boolean;
    showSeparator?: boolean;
  } = $props();
</script>

<div class="relative mx-auto my-2 w-full max-w-[62ch] px-4 text-center {HOOKS.chat.narrator}">
  {#if showSeparator}
    <div
      class="mx-auto mb-3 h-[1px] w-12 opacity-60"
      style="background: color-mix(in oklab, var(--theme-accent) 30%, transparent);"
      aria-hidden="true"
    ></div>
  {/if}

  <div
    class="font-narrative text-narrator italic tracking-[0.005em]"
    style="font-size: clamp(0.95rem, 0.9rem + 0.25vw, 1.0625rem);"
  >
    <Markdown {text} />
    {#if live}
      <StreamCaret />
    {/if}
  </div>
</div>

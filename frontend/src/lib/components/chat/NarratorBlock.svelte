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

<div class="narrator-block relative w-full {HOOKS.chat.narrator}">
  {#if showSeparator}
    <div
      class="narrator-separator mx-auto mb-3 h-[1px] w-12 opacity-60"
      style="background: color-mix(in oklab, var(--theme-accent) 30%, transparent);"
      aria-hidden="true"
    ></div>
  {/if}

  <div class="narrator-content font-narrative">
    <Markdown {text} />
    {#if live}
      <StreamCaret />
    {/if}
  </div>
</div>

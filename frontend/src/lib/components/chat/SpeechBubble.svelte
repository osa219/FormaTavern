<script lang="ts">
  import Markdown from '../ui/Markdown.svelte';
  import StreamCaret from './StreamCaret.svelte';
  import { HOOKS } from '@formatavern/shared';

  let {
    variant = 'character',
    name,
    primaryName,
    hue = null,
    text = '',
    live = false,
    fx = 'none'
  }: {
    variant?: 'character' | 'npc' | 'persona';
    name?: string;
    primaryName?: string;
    hue?: number | null;
    text?: string;
    live?: boolean;
    fx?: 'none' | 'breathe' | 'float' | 'glow' | null;
  } = $props();

  const isUser = $derived(variant === 'persona');
  const isNpc = $derived(variant === 'npc');
  const bubbleHook = $derived(
    isUser ? HOOKS.chat.bubbleUser : isNpc ? HOOKS.chat.bubbleNpc : HOOKS.chat.bubbleChar
  );

  const npcStyle = $derived(
    isNpc && hue !== null
      ? `--npc-hue: ${hue};`
      : ''
  );
</script>

<div class="speech-bubble-wrapper flex w-full">
  <div
    class="speech-bubble bubble-tail relative {bubbleHook}"
    data-fx={!isUser && fx && fx !== 'none' ? fx : undefined}
    style={npcStyle}
  >
    <div class="relative">
      <Markdown {text} />
      {#if live}
        <StreamCaret />
      {/if}
    </div>
  </div>
</div>

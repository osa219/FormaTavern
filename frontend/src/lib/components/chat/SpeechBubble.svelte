<script lang="ts">
  import Markdown from '../ui/Markdown.svelte';
  import StreamCaret from './StreamCaret.svelte';
  import { HOOKS } from '@formatavern/shared';

  let {
    variant,
    name,
    primaryName,
    hue = null,
    text = '',
    live = false,
    fx = 'none'
  }: {
    variant: 'character' | 'npc' | 'persona';
    name?: string;
    primaryName?: string;
    hue?: number | null;
    text?: string;
    live?: boolean;
    fx?: 'none' | 'breathe' | 'float' | 'glow' | null;
  } = $props();

  const isUser = $derived(variant === 'persona');
  const isNpc = $derived(variant === 'npc');
  const showLabel = $derived(
    isNpc ? Boolean(name) : !isUser && Boolean(name) && name !== primaryName
  );
  const tailSide = $derived(isUser ? 'right' : 'left');
  const bubbleHook = $derived(
    isUser ? HOOKS.chat.bubbleUser : isNpc ? HOOKS.chat.bubbleNpc : HOOKS.chat.bubbleChar
  );

  const npcStyle = $derived(
    isNpc && hue !== null
      ? `--npc-hue: ${hue}; background: color-mix(in oklab, var(--theme-char-bg) 68%, hsl(var(--npc-hue) 55% 45%) 32%); --bubble-tail-color: color-mix(in oklab, var(--theme-char-bg) 68%, hsl(var(--npc-hue) 55% 45%) 32%);`
      : ''
  );
</script>

<div class="flex w-full {isUser ? 'justify-end' : 'justify-start'}">
  <div
    class="bubble-tail relative max-w-[85%] md:max-w-[70%] shadow-md {bubbleHook} {isUser
      ? 'bg-user-bg text-user-text border border-user-border rounded-bubble p-(--theme-bubble-padding)'
      : isNpc
        ? 'text-char-text border border-char-border/60 rounded-bubble p-(--theme-bubble-padding)'
        : 'bg-char-bg text-char-text border border-char-border rounded-bubble p-(--theme-bubble-padding)'}"
    data-tail={tailSide}
    data-fx={!isUser && fx && fx !== 'none' ? fx : undefined}
    style={npcStyle}
  >
    {#if showLabel}
      <div
        class="mb-1 font-chrome text-[0.6875rem] font-semibold uppercase tracking-[0.08em] opacity-75 select-none"
        style={isNpc ? '' : 'color: var(--theme-accent);'}
      >
        {name}
      </div>
    {/if}

    <div class="relative">
      <Markdown {text} />
      {#if live}
        <StreamCaret />
      {/if}
    </div>
  </div>
</div>

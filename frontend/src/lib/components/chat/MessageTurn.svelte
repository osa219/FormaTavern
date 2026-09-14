<script lang="ts">
  import type { Segment, MessageStatus, NarrativeRole } from '@formatavern/shared';
  import { HOOKS } from '@formatavern/shared';
  import NarratorBlock from './NarratorBlock.svelte';
  import SpeechBubble from './SpeechBubble.svelte';
  import ErrorSlate from './ErrorSlate.svelte';
  import ReasoningBlock from './ReasoningBlock.svelte';
  import { npcHue } from '$lib/render/npcTint';
  import type { Snippet } from 'svelte';

  let {
    segments = [],
    status = 'complete',
    narrativeRole = 'character',
    primaryName = 'Character',
    npcs = {},
    streaming = false,
    isLast = false,
    reasoning = null,
    reasoningDurationMs = null,
    isThinking = false,
    toolbar,
    onRetry,
    fx = 'none'
  }: {
    segments?: Segment[];
    status?: MessageStatus;
    narrativeRole?: NarrativeRole;
    primaryName?: string;
    npcs?: Record<string, { accent?: string }>;
    streaming?: boolean;
    isLast?: boolean;
    reasoning?: string | null;
    reasoningDurationMs?: number | null;
    isThinking?: boolean;
    toolbar?: Snippet;
    onRetry?: () => void;
    fx?: 'none' | 'breathe' | 'float' | 'glow' | null;
  } = $props();

  const lastIdx = $derived(segments.length - 1);
</script>

<article
  class="turn group relative my-2 flex w-full flex-col gap-1.5 {HOOKS.chat.turn}"
  data-role={narrativeRole}
  data-status={status}
  aria-busy={streaming}
  style={streaming || isLast ? '' : 'content-visibility: auto; contain-intrinsic-size: auto 6rem;'}
>
  <ReasoningBlock {reasoning} durationMs={reasoningDurationMs} {isThinking} {streaming} />

  {#each segments as seg, i (i)}
    {#if seg.kind === 'narrator'}
      <NarratorBlock text={seg.text} live={streaming && i === lastIdx} showSeparator={i > 0} />
    {:else}
      <SpeechBubble
        variant={seg.kind}
        name={seg.name}
        {primaryName}
        hue={seg.kind === 'npc' ? npcHue(seg.name ?? 'NPC', npcs) : null}
        text={seg.text}
        live={streaming && i === lastIdx}
        {fx}
      />
    {/if}
  {/each}

  {#if streaming && segments.length === 0 && !reasoning && !isThinking}
    <SpeechBubble variant="character" name={primaryName} {primaryName} text="" live {fx} />
  {/if}

  {#if status === 'error'}
    <ErrorSlate {onRetry} />
  {/if}

  <div class="toolbar-slot h-7">
    {@render toolbar?.()}
  </div>
</article>

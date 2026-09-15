<script lang="ts">
  import type { Segment, MessageStatus, NarrativeRole } from '@formatavern/shared';
  import { HOOKS } from '@formatavern/shared';
  import NarratorBlock from './NarratorBlock.svelte';
  import SpeechBubble from './SpeechBubble.svelte';
  import SegmentEditor from './SegmentEditor.svelte';
  import ErrorSlate from './ErrorSlate.svelte';
  import ReasoningBlock from './ReasoningBlock.svelte';
  import Icon from '../ui/Icon.svelte';
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
    fx = 'none',
    editable = false,
    editingIndex = null,
    editSaving = false,
    onStartEdit,
    onSaveEdit,
    onCancelEdit
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
    editable?: boolean;
    editingIndex?: number | null;
    editSaving?: boolean;
    onStartEdit?: (index: number) => void;
    onSaveEdit?: (index: number, text: string) => void;
    onCancelEdit?: () => void;
  } = $props();

  const lastIdx = $derived(segments.length - 1);
  // Inline editing is for settled turns only — never the live stream or an error slate.
  const canEditSeg = $derived(editable && !streaming && status !== 'streaming' && status !== 'error');
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
    <div class="group/seg relative w-full">
      {#if editingIndex === i}
        <SegmentEditor
          initial={seg.text}
          saving={editSaving}
          onSave={(text) => onSaveEdit?.(i, text)}
          onCancel={() => onCancelEdit?.()}
        />
      {:else}
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
        {#if canEditSeg && editingIndex === null}
          <button
            type="button"
            onclick={() => onStartEdit?.(i)}
            class="absolute top-0 right-1 z-10 flex h-7 w-7 items-center justify-center rounded bg-neutral-900/80 text-neutral-400 opacity-100 shadow-sm backdrop-blur transition-opacity duration-150 hover:bg-neutral-800 hover:text-neutral-200 focus-visible:opacity-100 md:opacity-0 md:group-hover/seg:opacity-100 md:group-focus-within/seg:opacity-100 [@media(hover:none)]:opacity-100"
            title="Edit segment"
            aria-label="Edit segment {i + 1}"
          >
            <Icon name="edit" size={13} />
          </button>
        {/if}
      {/if}
    </div>
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

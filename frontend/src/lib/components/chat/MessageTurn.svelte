<script lang="ts">
  import type { Segment, MessageStatus, NarrativeRole, ResolvedLayout } from '@formatavern/shared';
  import { HOOKS, NEUTRAL_LAYOUT_DOC } from '@formatavern/shared';
  import TurnRow from './TurnRow.svelte';
  import NarratorBlock from './NarratorBlock.svelte';
  import SpeechBubble from './SpeechBubble.svelte';
  import SegmentEditor from './SegmentEditor.svelte';
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
    fx = 'none',
    editable = false,
    editingIndex = null,
    editSaving = false,
    onStartEdit,
    onSaveEdit,
    onCancelEdit,
    layout = NEUTRAL_LAYOUT_DOC,
    characterAvatar = null,
    personaAvatar = null
  }: {
    segments?: Segment[];
    status?: MessageStatus;
    narrativeRole?: NarrativeRole;
    primaryName?: string;
    npcs?: Record<string, { accent?: string; avatar?: string }>;
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
    layout?: ResolvedLayout;
    characterAvatar?: string | null;
    personaAvatar?: string | null;
  } = $props();

  const lastIdx = $derived(segments.length - 1);
  // Inline editing is for settled turns only — never the live stream or an error slate.
  const canEditSeg = $derived(editable && !streaming && status !== 'streaming' && status !== 'error');
</script>

<article
  class="turn group relative my-2 flex w-full flex-col gap-1.5 {HOOKS.chat.turn}"
  data-role={narrativeRole}
  data-headers={layout.headers}
  data-status={status}
  aria-busy={streaming}
  style={streaming || isLast ? '' : 'content-visibility: auto; contain-intrinsic-size: auto 6rem;'}
>
  <ReasoningBlock {reasoning} durationMs={reasoningDurationMs} {isThinking} {streaming} />

  {#each segments as seg, i (i)}
    <TurnRow
      kind={seg.kind}
      name={seg.name ?? (seg.kind === 'persona' ? 'You' : seg.kind === 'character' ? primaryName : 'NPC')}
      {primaryName}
      avatarSrc={seg.kind === 'character' ? characterAvatar : seg.kind === 'persona' ? personaAvatar : (npcs[seg.name ?? '']?.avatar ?? null)}
      hue={seg.kind === 'npc' ? npcHue(seg.name ?? 'NPC', npcs) : null}
      {layout}
      isFirstRow={i === 0}
      isTurnOwner={seg.kind === narrativeRole || (narrativeRole === 'character' && seg.kind === 'character')}
      editable={canEditSeg && editingIndex === null}
      onStartEdit={() => onStartEdit?.(i)}
      editIndex={i}
    >
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
      {/if}
    </TurnRow>
  {/each}

  {#if streaming && segments.length === 0 && !reasoning && !isThinking}
    <TurnRow
      kind="character"
      name={primaryName}
      {primaryName}
      avatarSrc={characterAvatar}
      {layout}
      isFirstRow={true}
      isTurnOwner={true}
    >
      <SpeechBubble variant="character" name={primaryName} {primaryName} text="" live {fx} />
    </TurnRow>
  {/if}

  {#if status === 'error'}
    <ErrorSlate {onRetry} />
  {/if}

  <div class="toolbar-slot h-7">
    {@render toolbar?.()}
  </div>
</article>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ResolvedLayout } from '@formatavern/shared';
  import { HOOKS } from '@formatavern/shared';
  import SegmentAvatar from './SegmentAvatar.svelte';
  import Icon from '../ui/Icon.svelte';

  let {
    kind,
    name = '',
    primaryName = '',
    avatarSrc = null,
    hue = null,
    layout,
    isFirstRow = false,
    isTurnOwner = true,
    editable = false,
    onStartEdit,
    editIndex = 0,
    children
  }: {
    kind: 'character' | 'persona' | 'npc' | 'narrator';
    name?: string;
    primaryName?: string;
    avatarSrc?: string | null;
    hue?: number | null;
    layout: ResolvedLayout;
    isFirstRow?: boolean;
    isTurnOwner?: boolean;
    editable?: boolean;
    onStartEdit?: () => void;
    editIndex?: number;
    children?: Snippet;
  } = $props();

  const isNarrator = $derived(kind === 'narrator');
  const isUser = $derived(kind === 'persona');
  const isNpc = $derived(kind === 'npc');

  // Avatar visibility
  const avatarEnabled = $derived.by(() => {
    if (isNarrator) return false;
    if (kind === 'character') return layout.avatars.character;
    if (kind === 'persona') return layout.avatars.persona;
    if (kind === 'npc') return layout.avatars.npc;
    return false;
  });

  // Name visibility
  const nameEnabled = $derived.by(() => {
    if (isNarrator) return false;
    if (kind === 'character') {
      if (!layout.names.showCharacter) return false;
      // In classic format, hide primary character name if matching
      if (layout.names.format === 'classic' && name === primaryName) return false;
      return Boolean(name);
    }
    if (kind === 'persona') return layout.names.showPersona && Boolean(name);
    if (kind === 'npc') return layout.names.showNpc && Boolean(name);
    return false;
  });

  // Header slot presence
  const isSingle = $derived(layout.headers === 'single');
  const renderRowHeader = $derived.by(() => {
    if (isSingle) {
      // In single mode, only the first row gets the top header
      return isFirstRow && (avatarEnabled || nameEnabled);
    }
    // In voices mode, render header if avatar or name is enabled for this voice
    return avatarEnabled || nameEnabled;
  });

  // Invariant L8: In single mode, non-owner segments keep an inline voice tag
  const showInlineVoiceTag = $derived(
    isSingle && !isFirstRow && !isTurnOwner && !isNarrator && Boolean(name)
  );

  const nameFormatClass = $derived.by(() => {
    if (layout.names.format === 'classic') {
      return isNpc
        ? 'font-chrome text-[0.6875rem] font-semibold uppercase tracking-[0.08em] opacity-75'
        : 'font-chrome text-[0.6875rem] font-semibold uppercase tracking-[0.08em]';
    }
    // plain format: body text color, normal weight/case, 0.8125rem
    return 'text-[0.8125rem] font-normal text-chrome-text opacity-90';
  });

  const nameColorStyle = $derived(
    layout.names.format === 'classic' && !isNpc
      ? 'color: var(--theme-accent);'
      : ''
  );
</script>

<div
  class="group/row relative flex w-full flex-col {HOOKS.chat.row}"
  data-kind={kind}
>
  {#if renderRowHeader}
    <div
      class="flex items-center gap-2 mb-1.5 min-w-0 max-w-full select-none {HOOKS.chat.rowHeader}"
    >
      {#if avatarEnabled}
        <SegmentAvatar
          src={avatarSrc}
          {name}
          shape={layout.avatars.shape}
          {hue}
          {kind}
        />
      {/if}

      {#if nameEnabled}
        <div
          class="truncate {nameFormatClass} {HOOKS.chat.turnName}"
          style={nameColorStyle}
        >
          {name}
        </div>
      {/if}
    </div>
  {/if}

  <div class="relative w-full {HOOKS.chat.turnBody}">
    {#if showInlineVoiceTag}
      <span
        class="inline-block text-[0.75rem] font-semibold text-accent mb-1 mr-1.5 opacity-80 select-none {HOOKS.chat.turnName} inline"
      >
        [{name}]
      </span>
    {/if}

    {@render children?.()}

    {#if editable}
      <button
        type="button"
        onclick={() => onStartEdit?.()}
        class="absolute top-0 right-1 z-10 flex h-7 w-7 items-center justify-center rounded bg-neutral-900/80 text-neutral-400 opacity-100 shadow-sm backdrop-blur transition-opacity duration-150 hover:bg-neutral-800 hover:text-neutral-200 focus-visible:opacity-100 md:opacity-0 md:group-hover/row:opacity-100 md:group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-100"
        title="Edit segment"
        aria-label="Edit segment {editIndex + 1}"
      >
        <Icon name="edit" size={13} />
      </button>
    {/if}
  </div>
</div>

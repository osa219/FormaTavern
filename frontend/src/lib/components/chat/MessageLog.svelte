<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { ChatSession } from '$lib/state/session.svelte';
  import { ScrollController } from '$lib/scroll/controller.svelte';
  import MessageTurn from './MessageTurn.svelte';
  import TurnToolbar from './TurnToolbar.svelte';
  import TurnEditor from './TurnEditor.svelte';
  import JumpToLatest from './JumpToLatest.svelte';
  import type { MessageWithTree, Segment } from '@formatavern/shared';
  import { HOOKS, resolveLayout } from '@formatavern/shared';
  import { layoutRootAttrs, layoutRootStyle } from '$lib/chat/layoutAttrs';
  import { prefs } from '$lib/state/prefs.svelte';
  import { media } from '$lib/state/media.svelte';

  const reducedMotion = $derived(
    prefs.reducedMotion === 'on' || (prefs.reducedMotion === 'system' && media.reducedMotion)
  );

  let {
    session,
    composerEl = null,
    flip = null,
    onEditTurn,
    onDeleteTurn
  }: {
    session: ChatSession;
    composerEl?: HTMLElement | null;
    flip?: { turnId: string; dir: 1 | -1 } | null;
    onEditTurn?: (turn: MessageWithTree) => void;
    onDeleteTurn?: (turn: MessageWithTree) => void;
  } = $props();

  // When the streaming row is already in the log (pulled in at stream
  // start), the live tokens render into it instead of a separate turn.
  const liveCovered = $derived(
    session.live?.messageId != null && session.messages.some((m) => m.id === session.live?.messageId)
  );
  // Peeked away mid-stream: the live indicator belongs to the streaming
  // page, not the old branch being viewed — hide the trailing live turn
  // instead of appending dots under the wrong reply.
  const livePeekedAway = $derived(
    session.live?.messageId != null &&
      session.chat?.activeLeafId != null &&
      session.live.messageId !== session.chat.activeLeafId
  );

  let logEl = $state<HTMLElement | null>(null);
  const scrollController = new ScrollController();

  onMount(() => {
    if (logEl) {
      scrollController.attach(logEl, composerEl);
      scrollController.scrollToBottom(false);
    }

    // Attach stream frame commit hook to scroll controller
    session.onStreamCommit = () => {
      scrollController.onLiveCommit();
    };

    return () => {
      scrollController.detach();
      session.onStreamCommit = undefined;
    };
  });

  // Top sentinel for windowed older messages loading
  let sentinelEl = $state<HTMLElement | null>(null);

  $effect(() => {
    if (!sentinelEl || !logEl || !session.hasOlder) return;

    const observer = new IntersectionObserver(
      async (entries) => {
        if (entries[0].isIntersecting && session.hasOlder && !session.loadingOlder && logEl) {
          const beforeHeight = logEl.scrollHeight;
          await session.loadOlder();
          await tick();
          scrollController.handlePrepend(beforeHeight);
        }
      },
      { root: logEl, threshold: 0.1 }
    );

    observer.observe(sentinelEl);

    return () => {
      observer.disconnect();
    };
  });

  const primaryName = $derived(session.character?.name ?? 'Character');
  const npcs = $derived(session.chat?.metadata.npcs ?? {});
  const activeLeafId = $derived(session.activeLeafId);
  const lastIndex = $derived(session.messages.length - 1);
  const fx = $derived(session.character?.style?.fx?.bubble ?? 'none');

  const narrativeMode = $derived(session.chat?.metadata?.narrativeMode ?? 'narrative');
  const resolvedLayout = $derived(resolveLayout(session.character?.layout, narrativeMode));
  const rootAttrs = $derived(layoutRootAttrs(resolvedLayout));
  const rootStyle = $derived(layoutRootStyle(resolvedLayout));
  const characterAvatar = $derived(session.character?.avatar ?? null);
  const personaAvatar = $derived(session.persona?.avatar ?? null);

  // Single active inline segment edit across the whole log (scope §7: first cut).
  let segEditing = $state<{ messageId: string; index: number } | null>(null);
  let segSaving = $state(false);

  // Single active inline turn edit
  let turnEditing = $state<{ messageId: string; saving: boolean } | null>(null);

  // A new generation takes over the log — drop any open editor.
  $effect(() => {
    if (session.busy) {
      segEditing = null;
      turnEditing = null;
    }
  });

  function canInlineEdit(msg: MessageWithTree): boolean {
    if (session.busy || segSaving || turnEditing?.saving) return false;
    if (msg.status === 'streaming' || msg.status === 'error') return false;
    if (msg.id.startsWith('tmp-')) return false;
    return true;
  }

  function startSegEdit(msg: MessageWithTree, index: number) {
    if (!canInlineEdit(msg)) return;
    turnEditing = null; // Close any turn editor
    segEditing = { messageId: msg.id, index };
  }

  function cancelSegEdit() {
    if (!segSaving) segEditing = null;
  }

  async function saveSegEdit(msg: MessageWithTree, index: number, text: string) {
    const base = displaySegments(msg);
    const next = base.map((s, i) => (i === index ? { ...s, text } : s));
    segSaving = true;
    try {
      await session.editSegments(msg.id, next);
      segEditing = null;
    } finally {
      segSaving = false;
    }
  }

  function startTurnEdit(msg: MessageWithTree) {
    if (!canInlineEdit(msg)) return;
    segEditing = null; // Close any segment editor
    scrollController.stuck = false;
    turnEditing = { messageId: msg.id, saving: false };
  }

  function cancelTurnEdit() {
    if (!turnEditing?.saving) turnEditing = null;
  }

  async function saveTurnEdit(msg: MessageWithTree, newContent: string) {
    if (!turnEditing) return;
    turnEditing.saving = true;
    try {
      await session.edit(msg.id, newContent);
      turnEditing = null;
    } finally {
      if (turnEditing) turnEditing.saving = false;
    }
  }

  function displaySegments(msg: MessageWithTree): Segment[] {
    if (msg.segments && msg.segments.length > 0) return msg.segments;
    const text = msg.content?.trim() ?? '';
    if (!text) return [];
    const role = msg.narrativeRole ?? msg.role;
    if (role === 'narrator') return [{ kind: 'narrator', text }];
    if (role === 'npc') return [{ kind: 'npc', name: msg.senderName ?? undefined, text }];
    if (role === 'character' || msg.role === 'assistant')
      return [{ kind: 'character', name: msg.senderName ?? undefined, text }];
    return [{ kind: 'persona', name: msg.senderName ?? undefined, text }];
  }
</script>

<div class="relative flex-1 min-h-0 w-full">
  <div
    bind:this={logEl}
    class="h-full w-full overflow-x-hidden overflow-y-auto px-4 py-6 md:px-8 focus:outline-none {HOOKS.chat.messageLog}"
    style="overflow-anchor: none; {rootStyle}"
    tabindex="-1"
    role="region"
    aria-label="Conversation turns"
    {...rootAttrs}
  >
    <!-- Top Sentinel for older pagination -->
    {#if session.hasOlder}
      <div bind:this={sentinelEl} class="h-4 w-full flex items-center justify-center py-2 text-xs text-neutral-500">
        {#if session.loadingOlder}
          <span>Loading earlier scene…</span>
        {/if}
      </div>
    {/if}

    <!-- Persisted Active Branch Turns -->
    {#each session.messages as msg, i (msg.id)}
      {#key flip && flip.turnId === msg.id && msg.status !== 'streaming' ? msg.content : msg.id}
      {#if turnEditing?.messageId === msg.id}
        <TurnEditor
          message={msg}
          saving={turnEditing.saving}
          onSave={(newContent) => saveTurnEdit(msg, newContent)}
          onCancel={cancelTurnEdit}
        />
      {:else}
        {@const liveHere = session.live && msg.id === session.live.messageId ? session.live : null}
        {@const waitingHere = liveHere !== null && liveHere.segments.length === 0}
        <div
          class:ft-flip-in-right={flip?.turnId === msg.id && flip.dir === 1}
          class:ft-flip-in-left={flip?.turnId === msg.id && flip.dir === -1}
        >
        {#if waitingHere}
          {@render waitDots()}
        {:else}
        <MessageTurn
          segments={liveHere ? liveHere.segments : displaySegments(msg)}
          status={liveHere ? 'streaming' : msg.status}
          narrativeRole={msg.narrativeRole}
          {primaryName}
          {npcs}
          {fx}
          layout={resolvedLayout}
          {characterAvatar}
          {personaAvatar}
          isLast={i === lastIndex && !session.live}
          reasoning={liveHere ? (liveHere.reasoning ?? msg.metadata?.reasoning) : msg.metadata?.reasoning}
          reasoningDurationMs={msg.metadata?.reasoningDurationMs}
          onRetry={() => session.regenerate(msg.id)}
          editable={canInlineEdit(msg)}
          editingIndex={segEditing?.messageId === msg.id ? segEditing.index : null}
          editSaving={segEditing?.messageId === msg.id && segSaving}
          onStartEdit={(index) => startSegEdit(msg, index)}
          onSaveEdit={(index, text) => saveSegEdit(msg, index, text)}
          onCancelEdit={cancelSegEdit}
        >
          {#snippet toolbar()}
            <TurnToolbar
              role={msg.role}
              isLeaf={msg.id === activeLeafId}
              content={msg.content}
              busy={session.busy}
              onContinue={() => session.continueTurn(msg.id)}
              onEdit={() => startTurnEdit(msg)}
              onDelete={() => onDeleteTurn?.(msg)}
            />
          {/snippet}
        </MessageTurn>
        {/if}
        </div>
      {/if}
      {/key}
    {/each}

    {#if turnEditing}
      <!-- Bottom clearance spacer to guarantee the edited turn can scroll to the top of the log -->
      <div class="h-[75vh] pointer-events-none" aria-hidden="true"></div>
    {/if}

    <!-- Live Streaming Turn (only when its row is not already in the log,
         and never under a branch being peeked at mid-stream) -->
    {#if session.live && !liveCovered && !livePeekedAway && session.live.segments.length === 0}
      {@render waitDots()}
    {/if}
    {#if session.live && !liveCovered && !livePeekedAway && session.live.segments.length > 0}
      <MessageTurn
        segments={session.live.segments}
        status="streaming"
        narrativeRole="character"
        {primaryName}
        {npcs}
        {fx}
        layout={resolvedLayout}
        {characterAvatar}
        {personaAvatar}
        streaming={true}
        isLast={true}
        reasoning={session.live.reasoning}
        isThinking={session.live.isThinking}
      />
    {/if}
  </div>

  <!-- Jump to latest pill: only when far from bottom (5 viewports) or
       when new content arrived while away -->
  <JumpToLatest
    visible={!scrollController.stuck && (scrollController.farFromBottom || scrollController.hasUnread)}
    hasUnread={scrollController.hasUnread}
    onclick={() => scrollController.scrollToBottom(true)}
  />
</div>

{#snippet waitDots()}
  <div
    class="flex w-fit items-center gap-1 px-1 py-2"
    role="status"
    aria-label="Waiting for reply"
  >
    <span class="ft-wait-dot" class:ft-wait-static={reducedMotion} style="animation-delay: 0ms;"></span>
    <span class="ft-wait-dot" class:ft-wait-static={reducedMotion} style="animation-delay: 150ms;"></span>
    <span class="ft-wait-dot" class:ft-wait-static={reducedMotion} style="animation-delay: 300ms;"></span>
  </div>
{/snippet}

<style>
  /* Greeting flip illusion: fresh mount slides in from the flip direction. */
  @keyframes ft-flip-from-right {
    from { transform: translateX(140px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes ft-flip-from-left {
    from { transform: translateX(-140px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  .ft-flip-in-right {
    animation: ft-flip-from-right 170ms ease-out;
  }
  .ft-flip-in-left {
    animation: ft-flip-from-left 170ms ease-out;
  }
  /* Waiting indicator: gentle bounce while no reply text exists yet. */
  @keyframes ft-wait-bounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.65; }
    30% { transform: translateY(-3px); opacity: 1; }
  }
  .ft-wait-dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 9999px;
    background: #c2c5d3;
    animation: ft-wait-bounce 1.2s ease-in-out infinite;
  }
  .ft-wait-static {
    animation: none;
    opacity: 0.85;
  }
  @media (prefers-reduced-motion: reduce) {
    .ft-wait-dot {
      animation: none;
      opacity: 0.85;
    }
  }
</style>

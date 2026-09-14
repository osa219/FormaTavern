<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { ChatSession } from '$lib/state/session.svelte';
  import { ScrollController } from '$lib/scroll/controller.svelte';
  import MessageTurn from './MessageTurn.svelte';
  import TurnToolbar from './TurnToolbar.svelte';
  import JumpToLatest from './JumpToLatest.svelte';
  import type { MessageWithTree } from '@formatavern/shared';
  import { HOOKS } from '@formatavern/shared';
  import type { Segment } from '@formatavern/shared';

  let {
    session,
    composerEl = null,
    onEditTurn,
    onDeleteTurn
  }: {
    session: ChatSession;
    composerEl?: HTMLElement | null;
    onEditTurn?: (turn: MessageWithTree) => void;
    onDeleteTurn?: (turn: MessageWithTree) => void;
  } = $props();

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
    class="h-full w-full overflow-y-auto px-4 py-6 md:px-8 focus:outline-none {HOOKS.chat.messageLog}"
    style="overflow-anchor: none;"
    tabindex="-1"
    role="region"
    aria-label="Conversation turns"
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
      <MessageTurn
        segments={displaySegments(msg)}
        status={msg.status}
        narrativeRole={msg.narrativeRole}
        {primaryName}
        {npcs}
        {fx}
        isLast={i === lastIndex && !session.live}
        reasoning={msg.metadata?.reasoning}
        reasoningDurationMs={msg.metadata?.reasoningDurationMs}
        onRetry={() => session.regenerate(msg.id)}
      >
        {#snippet toolbar()}
          <TurnToolbar
            messageId={msg.id}
            role={msg.role}
            isLeaf={msg.id === activeLeafId}
            siblingIndex={msg.siblingIndex}
            siblingCount={msg.siblingCount}
            content={msg.content}
            busy={session.busy}
            onRegenerate={() => session.regenerate(msg.id)}
            onContinue={() => session.continueTurn(msg.id)}
            onEdit={() => onEditTurn?.(msg)}
            onDelete={() => onDeleteTurn?.(msg)}
            onSelectSibling={(id) => session.select(id)}
          />
        {/snippet}
      </MessageTurn>
    {/each}

    <!-- Live Streaming Turn -->
    {#if session.live}
      <MessageTurn
        segments={session.live.segments}
        status="streaming"
        narrativeRole="character"
        {primaryName}
        {npcs}
        {fx}
        streaming={true}
        isLast={true}
        reasoning={session.live.reasoning}
        isThinking={session.live.isThinking}
      />
    {/if}
  </div>

  <!-- Jump to latest pill -->
  <JumpToLatest
    visible={!scrollController.stuck}
    hasUnread={scrollController.hasUnread}
    onclick={() => scrollController.scrollToBottom(true)}
  />
</div>

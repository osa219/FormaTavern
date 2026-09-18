<script lang="ts">
  import type { ChatHubGroup, ChatView } from '@formatavern/shared';
  import Icon from '../ui/Icon.svelte';
  import Spinner from '../ui/Spinner.svelte';

  let {
    group,
    expanded = false,
    overflowChats = undefined,
    loadingOverflow = false,
    onToggle,
    onStartChat,
    onDeleteChat,
    onClearAllChats,
    onLoadAllChats
  }: {
    group: ChatHubGroup;
    expanded?: boolean;
    overflowChats?: ChatView[];
    loadingOverflow?: boolean;
    onToggle: () => void;
    onStartChat: (characterId: string) => void;
    onDeleteChat: (chatId: string) => void;
    onClearAllChats: (characterId: string) => void;
    onLoadAllChats: (characterId: string) => void;
  } = $props();

  function formatRelativeTime(timestamp?: number): string {
    if (!timestamp) return '';
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  const character = $derived(group.character);
  const displayChats = $derived(overflowChats ?? group.recentChats);
  const hasMoreChats = $derived(!overflowChats && group.chatCount > group.recentChats.length);
</script>

<div class="overflow-hidden rounded-2xl border border-(--chrome-line) bg-(--chrome-surface) transition-colors">
  <!-- Collapsed Header Row -->
  <button
    type="button"
    onclick={onToggle}
    class="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-(--chrome-bg)/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    aria-expanded={expanded}
  >
    <div class="flex min-w-0 items-center gap-3.5">
      <!-- Avatar thumbnail -->
      <div class="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-(--chrome-line) bg-(--chrome-bg)">
        {#if character.avatar}
          <img
            src={character.avatar}
            alt={character.name}
            class="h-full w-full object-cover"
            loading="lazy"
          />
        {:else}
          <div class="flex h-full w-full items-center justify-center font-bold text-(--chrome-text)/60">
            {character.name.slice(0, 1).toUpperCase()}
          </div>
        {/if}
      </div>

      <!-- Character Info & Tagline Snippet -->
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span class="truncate font-semibold text-(--chrome-text)">
            {character.name}
          </span>
          {#if character.style?.colors?.accent}
            <span
              class="h-2 w-2 shrink-0 rounded-full"
              style="background-color: {character.style.colors.accent};"
              aria-hidden="true"
            ></span>
          {/if}
        </div>
        {#if character.tagline}
          <p class="truncate text-xs text-(--chrome-text)/60">
            {character.tagline}
          </p>
        {/if}
      </div>
    </div>

    <div class="flex shrink-0 items-center gap-3">
      <!-- Chat Count Badge -->
      <span class="rounded-lg border border-(--chrome-line) bg-(--chrome-bg) px-2.5 py-1 text-xs font-mono text-(--chrome-text)/80">
        {group.chatCount} {group.chatCount === 1 ? 'chat' : 'chats'}
      </span>

      <!-- Latest Turn Timestamp -->
      <span class="hidden text-xs text-(--chrome-text)/50 sm:inline">
        {formatRelativeTime(group.lastChatAt)}
      </span>

      <!-- Expand Chevron -->
      <div class="text-(--chrome-text)/60 transition-transform">
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} />
      </div>
    </div>
  </button>

  <!-- Expanded Interior: Mini-Showcase + Recent Chats -->
  {#if expanded}
    <div class="border-t border-(--chrome-line) bg-(--chrome-bg)/30 p-5 space-y-6">
      <!-- Mini-Showcase & Action Buttons -->
      <div class="rounded-xl border border-(--chrome-line) bg-(--chrome-surface) p-4 space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div class="space-y-1.5 flex-1 min-w-0">
            {#if character.tagline}
              <p class="text-xs font-medium italic text-accent">
                "{character.tagline}"
              </p>
            {/if}
            {#if character.description}
              <p class="line-clamp-3 text-xs leading-relaxed text-(--chrome-text)/80">
                {character.description}
              </p>
            {/if}
            {#if character.tags && character.tags.length > 0}
              <div class="flex flex-wrap gap-1 pt-1">
                {#each character.tags as tag}
                  <span class="rounded-md border border-(--chrome-line) bg-(--chrome-bg) px-1.5 py-0.5 text-[10px] text-(--chrome-text)/70">
                    #{tag}
                  </span>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Quick Actions -->
          <div class="flex shrink-0 flex-wrap items-center gap-2">
            <a
              href="/character/{character.id}"
              class="inline-flex items-center gap-1.5 rounded-xl border border-(--chrome-line) bg-(--chrome-bg) px-3 py-1.5 text-xs font-medium text-(--chrome-text) hover:border-accent/40 transition-colors"
            >
              <Icon name="user" size={13} />
              <span>Profile</span>
            </a>

            <button
              type="button"
              onclick={() => onStartChat(character.id)}
              class="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-accent-contrast hover:bg-accent/90 shadow-sm"
            >
              <Icon name="plus" size={13} />
              <span>New Chat</span>
            </button>

            <button
              type="button"
              onclick={() => onClearAllChats(character.id)}
              class="inline-flex items-center gap-1 rounded-xl border border-(--chrome-line) bg-(--chrome-bg) p-1.5 text-xs text-(--chrome-text)/60 hover:text-red-400 hover:border-red-400/40 transition-colors"
              title="Clear all conversations with this character"
              aria-label="Clear all conversations with this character"
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        </div>
      </div>

      <!-- Conversations List -->
      <div class="space-y-2.5">
        <div class="flex items-center justify-between px-1">
          <h4 class="text-xs font-semibold uppercase tracking-wider text-(--chrome-text)/60">
            Conversations
          </h4>
          <span class="text-xs font-mono text-(--chrome-text)/40">
            {displayChats.length} of {group.chatCount}
          </span>
        </div>

        <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {#each displayChats as chat (chat.id)}
            <a
              href="/chat/{chat.id}"
              class="group relative flex flex-col justify-between rounded-xl border border-(--chrome-line) bg-(--chrome-surface) p-3.5 transition-colors hover:border-accent/50 hover:bg-(--chrome-bg)/50"
            >
              <div class="space-y-1">
                <div class="flex items-start justify-between gap-2">
                  <h5 class="truncate text-xs font-medium text-(--chrome-text) group-hover:text-accent">
                    {chat.title && chat.title.trim().length > 0 ? chat.title : 'Untitled Conversation'}
                  </h5>
                  {#if chat.activeGenerationMessageId}
                    <span
                      class="relative flex h-2 w-2 shrink-0"
                      title="Generation active"
                    >
                      <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                      <span class="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                    </span>
                  {/if}
                </div>
              </div>

              <div class="mt-3 flex items-center justify-between text-[11px] text-(--chrome-text)/50">
                <span>
                  {chat.messageCount} {chat.messageCount === 1 ? 'message' : 'messages'}
                </span>
                <div class="flex items-center gap-2">
                  <span>{formatRelativeTime(chat.updatedAt)}</span>
                  <button
                    type="button"
                    onclick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onDeleteChat(chat.id);
                    }}
                    class="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity p-0.5"
                    title="Delete conversation"
                    aria-label="Delete conversation"
                  >
                    <Icon name="trash" size={12} />
                  </button>
                </div>
              </div>
            </a>
          {/each}
        </div>

        {#if hasMoreChats}
          <div class="pt-2 text-center">
            <button
              type="button"
              onclick={() => onLoadAllChats(character.id)}
              disabled={loadingOverflow}
              class="inline-flex items-center gap-1.5 rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-4 py-1.5 text-xs font-medium text-(--chrome-text)/80 hover:border-accent/40 transition-colors disabled:opacity-50"
            >
              {#if loadingOverflow}
                <Spinner size={12} class="mr-1" />
                <span>Loading all chats…</span>
              {:else}
                <span>View all {group.chatCount} conversations</span>
                <Icon name="chevron-down" size={13} />
              {/if}
            </button>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

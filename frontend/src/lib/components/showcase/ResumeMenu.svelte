<script lang="ts">
  import { goto } from '$app/navigation';
  import type { ChatView } from '@formatavern/shared';
  import { HOOKS } from '@formatavern/shared';
  import Icon from '$lib/components/ui/Icon.svelte';

  let {
    chats = [],
    onDeleteChat
  }: {
    chats?: ChatView[];
    onDeleteChat?: (chatId: string) => void;
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
</script>

{#if chats.length > 0}
  <div class="space-y-3 {HOOKS.character.resumeMenu}">
    <div class="flex items-center justify-between border-b border-neutral-800 pb-2">
      <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-400">
        Resume Existing Chat
      </h3>
      <span class="text-xs font-mono text-neutral-500">
        {chats.length} {chats.length === 1 ? 'chat' : 'chats'}
      </span>
    </div>

    <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {#each chats as chat (chat.id)}
        <div
          role="button"
          tabindex="0"
          onclick={() => goto(`/chat/${chat.id}`)}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              goto(`/chat/${chat.id}`);
            }
          }}
          class="group relative flex flex-col justify-between rounded-xl border border-neutral-800 bg-neutral-900/60 p-3.5 transition-colors hover:border-neutral-700 hover:bg-neutral-850 cursor-pointer text-left"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate text-sm font-medium text-neutral-200 group-hover:text-white">
                  {chat.title || 'Untitled Chat'}
                </span>
                {#if chat.activeGenerationMessageId}
                  <span class="flex items-center gap-1 text-[10px] font-mono text-accent shrink-0">
                    <span class="relative flex h-1.5 w-1.5">
                      <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75"></span>
                      <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent"></span>
                    </span>
                    <span>writing…</span>
                  </span>
                {/if}
              </div>

              <div class="mt-1 flex items-center gap-2 text-[11px] text-neutral-500 font-mono">
                <span>{chat.messageCount ?? (chat as any).turnCount ?? 0} turns</span>
                <span>•</span>
                <span>{formatRelativeTime(chat.updatedAt)}</span>
              </div>
            </div>

            {#if onDeleteChat}
              <button
                type="button"
                onclick={(e) => {
                  e.stopPropagation();
                  onDeleteChat(chat.id);
                }}
                class="rounded p-1 text-neutral-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100 focus:opacity-100"
                aria-label="Delete chat"
                title="Delete chat"
              >
                <Icon name="trash" size={13} />
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}

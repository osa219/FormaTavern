<script lang="ts">
  import type { ChatView, CharacterCard, CharacterSummary } from '@formatavern/shared';
  import { HOOKS } from '@formatavern/shared';
  import Icon from '../ui/Icon.svelte';
  import Spinner from '../ui/Spinner.svelte';
  import ConfirmDialog from '../dialogs/ConfirmDialog.svelte';

  let {
    open = false,
    activeChatId = '',
    chats = [],
    characters = [],
    onClose,
    onSelectChat,
    onNewChat,
    onDeleteChat
  }: {
    open: boolean;
    activeChatId?: string;
    chats?: ChatView[];
    characters?: (CharacterCard | CharacterSummary)[];
    onClose: () => void;
    onSelectChat?: (chatId: string) => void;
    onNewChat?: (characterId?: string) => void;
    onDeleteChat?: (chatId: string) => Promise<void> | void;
  } = $props();

  let dialogEl = $state<HTMLDialogElement | null>(null);
  let deleteTargetChatId = $state<string | null>(null);
  let confirmDeleteOpen = $state(false);

  $effect(() => {
    if (open) {
      if (dialogEl && !dialogEl.open) {
        dialogEl.showModal();
      }
    } else {
      if (dialogEl && dialogEl.open) {
        dialogEl.close();
      }
    }
  });

  const charMap = $derived(new Map(characters.map((c) => [c.id, c])));

  // Group chats by character
  const groupedChats = $derived.by(() => {
    const groups: { character: CharacterCard | CharacterSummary | null; characterId: string; items: ChatView[] }[] = [];
    const map = new Map<string, ChatView[]>();

    for (const chat of chats) {
      const list = map.get(chat.primaryCharacterId) ?? [];
      list.push(chat);
      map.set(chat.primaryCharacterId, list);
    }

    for (const [charId, items] of map.entries()) {
      groups.push({
        characterId: charId,
        character: charMap.get(charId) ?? null,
        items
      });
    }

    return groups;
  });

  function promptDelete(chatId: string, e: MouseEvent) {
    e.stopPropagation();
    deleteTargetChatId = chatId;
    confirmDeleteOpen = true;
  }

  async function handleConfirmDelete() {
    if (deleteTargetChatId && onDeleteChat) {
      const id = deleteTargetChatId;
      deleteTargetChatId = null;
      confirmDeleteOpen = false;
      await onDeleteChat(id);
    }
  }

  function handleCancel(e: Event) {
    e.preventDefault();
    onClose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === dialogEl) {
      onClose();
    }
  }
</script>

<dialog
  bind:this={dialogEl}
  oncancel={handleCancel}
  onclick={handleBackdropClick}
  style="font-family: var(--chrome-font, var(--theme-font-family)); color: var(--chrome-text, inherit);"
  class="fixed inset-y-0 left-0 m-0 hidden open:flex h-full w-full max-w-sm flex-col border-r border-neutral-800 bg-neutral-900/98 p-0 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm max-sm:bottom-0 max-sm:top-auto max-sm:h-[80vh] max-sm:max-w-none max-sm:rounded-t-2xl max-sm:border-r-0 max-sm:border-t {HOOKS.chrome.navdrawer}"
  aria-labelledby="nav-drawer-title"
>
  <!-- Drawer Header -->
  <div class="flex items-center justify-between border-b border-neutral-800 p-4">
    <div class="flex items-center gap-2">
      <a
        href="/"
        class="flex items-center gap-2 font-bold text-neutral-100 transition-colors hover:text-accent"
        onclick={onClose}
      >
        <span class="text-accent">◈</span>
        <span id="nav-drawer-title">FormaTavern</span>
      </a>
    </div>
    <div class="flex items-center gap-1">
      <button
        type="button"
        onclick={() => {
          onClose();
          onNewChat?.();
        }}
        class="flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-850 px-2.5 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-800 hover:text-white"
        title="Start new chat"
      >
        <Icon name="sparkles" size={13} class="text-accent" />
        <span>New</span>
      </button>
      <button
        type="button"
        onclick={onClose}
        class="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        aria-label="Close drawer"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  </div>

  <!-- Chats List -->
  <div class="flex-1 overflow-y-auto p-3">
    {#if chats.length === 0}
      <div class="flex h-32 items-center justify-center text-xs text-neutral-500">
        No conversations yet.
      </div>
    {:else}
      <div class="flex flex-col gap-4">
        {#each groupedChats as group (group.characterId)}
          <div class="flex flex-col gap-1">
            <!-- Group Header -->
            <div class="flex items-center justify-between px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              <span>{group.character?.name ?? 'Unknown Character'}</span>
              <button
                type="button"
                onclick={() => {
                  onClose();
                  onNewChat?.(group.characterId);
                }}
                class="text-neutral-500 hover:text-accent"
                title="New chat with {group.character?.name}"
              >
                + new
              </button>
            </div>

            <!-- Chat Items -->
            {#each group.items as chat (chat.id)}
              <div
                role="button"
                tabindex="0"
                onclick={() => {
                  onClose();
                  onSelectChat?.(chat.id);
                }}
                onkeydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClose();
                    onSelectChat?.(chat.id);
                  }
                }}
                class="group relative flex items-center justify-between rounded-xl px-3 py-2 text-xs transition-colors cursor-pointer"
                class:bg-neutral-800={chat.id === activeChatId}
                class:text-neutral-100={chat.id === activeChatId}
                class:font-medium={chat.id === activeChatId}
                class:text-neutral-300={chat.id !== activeChatId}
                class:hover:bg-neutral-850={chat.id !== activeChatId}
              >
                <div class="flex items-center gap-2 overflow-hidden pr-2">
                  {#if chat.activeGenerationMessageId}
                    <span class="relative flex h-2 w-2">
                      <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75"></span>
                      <span class="relative inline-flex h-2 w-2 rounded-full bg-accent"></span>
                    </span>
                  {:else}
                    <span class="text-neutral-600">·</span>
                  {/if}
                  <span class="truncate">{chat.title || 'Untitled Story'}</span>
                </div>

                <!-- Delete button on hover -->
                <button
                  type="button"
                  onclick={(e) => promptDelete(chat.id, e)}
                  class="rounded p-1 text-neutral-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100 focus:opacity-100"
                  aria-label="Delete chat"
                  title="Delete chat"
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            {/each}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</dialog>

<ConfirmDialog
  open={confirmDeleteOpen}
  title="Delete Story"
  message="Are you sure you want to delete this story branch? All turns will be permanently removed."
  confirmLabel="Delete"
  danger={true}
  onConfirm={handleConfirmDelete}
  onCancel={() => {
    confirmDeleteOpen = false;
    deleteTargetChatId = null;
  }}
/>

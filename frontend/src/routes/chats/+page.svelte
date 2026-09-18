<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { chatsHubStore } from '$lib/state/chatsHub.svelte';
  import { personasStore } from '$lib/state/personas.svelte';
  import { shellTheme } from '$lib/state/shellTheme.svelte';
  import { toasts } from '$lib/state/toasts.svelte';
  import { api, toUiError } from '$lib/api';
  import ShellSurface from '$lib/components/custom/ShellSurface.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import ChatHubCharacterRow from '$lib/components/chats/ChatHubCharacterRow.svelte';
  import ConfirmDialog from '$lib/components/dialogs/ConfirmDialog.svelte';
  import SettingsSheet from '$lib/components/settings/SettingsSheet.svelte';
  import { HOOKS, type ChatHubSort } from '@formatavern/shared';

  let settingsOpen = $state(false);
  let deleteChatId = $state<string | null>(null);
  let deleteCharacterId = $state<string | null>(null);
  let confirmDeleteChatOpen = $state(false);
  let clearCharacterId = $state<string | null>(null);
  let confirmClearCharacterOpen = $state(false);
  let creatingChatForCharacterId = $state<string | null>(null);

  let searchInput = $state('');
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let sentinelEl = $state<HTMLDivElement | null>(null);

  onMount(() => {
    personasStore.load();
    chatsHubStore.load();

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          chatsHubStore.loadMore();
        }
      },
      { rootMargin: '200px' }
    );

    if (sentinelEl) {
      observer.observe(sentinelEl);
    }

    return () => {
      observer.disconnect();
      if (searchTimer) clearTimeout(searchTimer);
    };
  });

  function handleSearchInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    searchInput = val;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      chatsHubStore.setSearch(val);
    }, 250);
  }

  function handleSortChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value as ChatHubSort;
    chatsHubStore.setSort(val);
  }

  async function handleStartChat(characterId: string) {
    if (creatingChatForCharacterId) return;
    creatingChatForCharacterId = characterId;
    try {
      const defaultPersonaId = personasStore.defaultPersona?.id;
      const { data: newChat, error } = await (api.api.chats.post as any)({
        characterId,
        personaId: defaultPersonaId
      });
      if (error) {
        toasts.error(toUiError(error).message);
        return;
      }
      if (newChat && 'id' in newChat) {
        goto(`/chat/${newChat.id}`);
      }
    } catch (err: any) {
      toasts.error(toUiError(err).message);
    } finally {
      creatingChatForCharacterId = null;
    }
  }

  function promptDeleteChat(chatId: string, charId: string) {
    deleteChatId = chatId;
    deleteCharacterId = charId;
    confirmDeleteChatOpen = true;
  }

  async function confirmDeleteChat() {
    if (deleteChatId && deleteCharacterId) {
      const cId = deleteChatId;
      const charId = deleteCharacterId;
      deleteChatId = null;
      deleteCharacterId = null;
      confirmDeleteChatOpen = false;
      await chatsHubStore.deleteChat(cId, charId);
    }
  }

  function promptClearCharacterChats(characterId: string) {
    clearCharacterId = characterId;
    confirmClearCharacterOpen = true;
  }

  async function confirmClearCharacterChats() {
    if (clearCharacterId) {
      const id = clearCharacterId;
      clearCharacterId = null;
      confirmClearCharacterOpen = false;
      await chatsHubStore.clearCharacterChats(id);
    }
  }

  const clearTargetCharacterName = $derived.by(() => {
    if (!clearCharacterId) return '';
    const item = chatsHubStore.items.find((g) => g.character.id === clearCharacterId);
    return item?.character.name ?? 'this character';
  });
</script>

<svelte:head>
  <title>{shellTheme.theme.labels?.foyerTitle || 'FormaTavern'} — Conversation Hub</title>
</svelte:head>

<ShellSurface>
  <!-- Top Navigation Header -->
  <header class="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-(--chrome-line) chrome-bar px-6">
    <div class="flex items-center gap-3">
      <a
        href="/"
        class="flex items-center gap-2 font-bold tracking-wide text-(--chrome-text) uppercase hover:text-accent transition-colors"
      >
        <span class="text-accent text-lg">◈</span>
        <span class="text-sm">{shellTheme.theme.labels?.foyerTitle || 'FormaTavern'}</span>
      </a>
      <span class="text-(--chrome-text)/40">/</span>
      <span class="rounded border border-(--chrome-line) bg-(--chrome-surface) px-2 py-0.5 text-[10px] font-mono text-(--chrome-text)/70">
        Chats Hub
      </span>
    </div>

    <div class="flex items-center gap-2.5">
      <!-- Personas Quick-Access -->
      <a
        href="/personas"
        class="flex items-center gap-1.5 rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-1.5 text-xs text-(--chrome-text)/80 hover:border-accent/40 transition-colors"
        title="Manage user personas"
      >
        <Icon name="user" size={13} />
        <span class="hidden sm:inline">Personas</span>
      </a>

      <!-- Create New Character -->
      <a
        href="/character/new"
        class="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-contrast hover:bg-accent/90 shadow-sm"
      >
        <Icon name="plus" size={13} />
        <span class="hidden sm:inline">New Character</span>
      </a>

      <!-- Settings Button -->
      <button
        type="button"
        onclick={() => (settingsOpen = true)}
        class="flex h-9 w-9 items-center justify-center rounded-xl border border-(--chrome-line) bg-(--chrome-surface) text-(--chrome-text)/80 transition-colors hover:border-accent/40"
        aria-label="Open settings"
        title="Settings"
      >
        <Icon name="settings" size={16} />
      </button>
    </div>
  </header>

  <main class="mx-auto max-w-6xl px-6 py-8 space-y-8">
    <!-- Hero / Title & Stats -->
    <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div>
        <h2 class="text-2xl font-bold tracking-tight text-(--chrome-text) sm:text-3xl">
          Conversation Hub
        </h2>
        <p class="mt-1 text-sm text-(--chrome-text)/70">
          Manage and resume conversations across your character roster.
        </p>
      </div>

      <!-- Live Totals Pill -->
      <div class="flex items-center gap-2 rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-1.5 text-xs font-mono text-(--chrome-text)/80">
        <span>{chatsHubStore.totalCharacters} {chatsHubStore.totalCharacters === 1 ? 'character' : 'characters'}</span>
        <span class="text-(--chrome-text)/40">·</span>
        <span>{chatsHubStore.totalChats} {chatsHubStore.totalChats === 1 ? 'chat' : 'chats'}</span>
      </div>
    </div>

    <!-- Controls Bar: Search & Sort -->
    <div class="flex flex-col sm:flex-row items-center gap-3">
      <!-- Search Box -->
      <div class="relative w-full sm:flex-1">
        <input
          type="text"
          value={searchInput}
          oninput={handleSearchInput}
          placeholder="Search characters or conversation titles…"
          class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) py-2.5 pl-9 pr-4 text-xs text-(--chrome-text) placeholder:text-(--chrome-text)/40 focus:border-accent focus:outline-none"
        />
        <div class="pointer-events-none absolute left-3 top-3 text-(--chrome-text)/40">
          <Icon name="book" size={14} />
        </div>
        {#if searchInput}
          <button
            type="button"
            onclick={() => {
              searchInput = '';
              chatsHubStore.setSearch('');
            }}
            class="absolute right-3 top-2.5 text-(--chrome-text)/40 hover:text-(--chrome-text)"
            aria-label="Clear search"
          >
            <Icon name="x" size={14} />
          </button>
        {/if}
      </div>

      <!-- Sort Dropdown -->
      <div class="w-full sm:w-auto shrink-0">
        <select
          value={chatsHubStore.sort}
          onchange={handleSortChange}
          class="w-full sm:w-auto rounded-xl border border-(--chrome-line) bg-(--chrome-surface) py-2.5 px-3 text-xs text-(--chrome-text) focus:border-accent focus:outline-none cursor-pointer"
        >
          <option value="recent">Sort: Recent Activity</option>
          <option value="chats">Sort: Most Chats</option>
          <option value="name">Sort: Character Name</option>
        </select>
      </div>
    </div>

    <!-- Content Feed -->
    {#if chatsHubStore.loading && chatsHubStore.items.length === 0}
      <div class="flex h-64 items-center justify-center rounded-2xl border border-(--chrome-line) bg-(--chrome-surface) text-xs text-(--chrome-text)/60">
        <Spinner size={18} class="mr-2.5" />
        <span>Loading conversations…</span>
      </div>
    {:else if chatsHubStore.items.length === 0}
      <div class="flex flex-col items-center justify-center rounded-2xl border border-(--chrome-line) bg-(--chrome-surface) p-12 text-center">
        {#if chatsHubStore.query}
          <p class="text-sm text-(--chrome-text)/80">
            No characters or conversations matched <span class="font-semibold text-(--chrome-text)">"{chatsHubStore.query}"</span>
          </p>
          <button
            type="button"
            onclick={() => {
              searchInput = '';
              chatsHubStore.setSearch('');
            }}
            class="mt-4 rounded-xl border border-(--chrome-line) bg-(--chrome-bg) px-4 py-2 text-xs font-medium text-(--chrome-text) hover:border-accent/40"
          >
            Clear Search
          </button>
        {:else}
          <p class="text-sm text-(--chrome-text)/80">
            No conversations recorded yet.
          </p>
          <p class="mt-1 text-xs text-(--chrome-text)/50">
            Start a chat with any character in the Foyer to begin roleplaying!
          </p>
          <a
            href="/"
            class="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-contrast hover:bg-accent/90 shadow-sm"
          >
            <Icon name="arrow-left" size={14} />
            <span>Explore Characters</span>
          </a>
        {/if}
      </div>
    {:else}
      <div class="space-y-4">
        {#each chatsHubStore.items as group (group.character.id)}
          <ChatHubCharacterRow
            {group}
            expanded={chatsHubStore.isExpanded(group.character.id)}
            overflowChats={chatsHubStore.overflowChats.get(group.character.id)}
            loadingOverflow={chatsHubStore.loadingOverflow.has(group.character.id)}
            onToggle={() => chatsHubStore.toggleExpand(group.character.id)}
            onStartChat={handleStartChat}
            onDeleteChat={(chatId) => promptDeleteChat(chatId, group.character.id)}
            onClearAllChats={promptClearCharacterChats}
            onLoadAllChats={(charId) => chatsHubStore.loadAllChatsForCharacter(charId)}
          />
        {/each}
      </div>

      <!-- Infinite Scroll Sentinel -->
      <div bind:this={sentinelEl} class="h-6 w-full py-4 text-center" aria-hidden="true">
        {#if chatsHubStore.loadingMore}
          <div class="inline-flex items-center gap-2 text-xs text-(--chrome-text)/60">
            <Spinner size={14} />
            <span>Loading more characters…</span>
          </div>
        {/if}
      </div>
    {/if}
  </main>

  <!-- Settings Sheet -->
  <SettingsSheet
    open={settingsOpen}
    onClose={() => {
      settingsOpen = false;
    }}
  />

  <!-- Confirm Delete Single Chat Dialog -->
  <ConfirmDialog
    open={confirmDeleteChatOpen}
    title="Delete Conversation"
    message="Are you sure you want to delete this conversation? All branches and messages will be permanently removed."
    confirmLabel="Delete"
    danger={true}
    onConfirm={confirmDeleteChat}
    onCancel={() => {
      confirmDeleteChatOpen = false;
      deleteChatId = null;
      deleteCharacterId = null;
    }}
  />

  <!-- Confirm Bulk Clear All Chats for Character Dialog -->
  <ConfirmDialog
    open={confirmClearCharacterOpen}
    title="Clear All Conversations"
    message={`Are you sure you want to delete all conversations with ${clearTargetCharacterName}? This action cannot be undone.`}
    confirmLabel="Clear All"
    danger={true}
    onConfirm={confirmClearCharacterChats}
    onCancel={() => {
      confirmClearCharacterOpen = false;
      clearCharacterId = null;
    }}
  />
</ShellSurface>

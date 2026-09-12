<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';
  import type { ChatView } from '@formatavern/shared';
  import { HOOKS } from '@formatavern/shared';
  import { api, toUiError } from '$lib/api';
  import { toasts } from '$lib/state/toasts.svelte';
  import { catalogStore } from '$lib/state/catalog.svelte';
  import { personasStore } from '$lib/state/personas.svelte';
  import { shellTheme } from '$lib/state/shellTheme.svelte';

  import Icon from '$lib/components/ui/Icon.svelte';
  import SearchBar from '$lib/components/discovery/SearchBar.svelte';
  import TagFilter from '$lib/components/discovery/TagFilter.svelte';
  import SortSelect from '$lib/components/discovery/SortSelect.svelte';
  import CompanionGrid from '$lib/components/discovery/CompanionGrid.svelte';
  import SettingsSheet from '$lib/components/settings/SettingsSheet.svelte';
  import ConfirmDialog from '$lib/components/dialogs/ConfirmDialog.svelte';
  import ShellSurface from '$lib/components/custom/ShellSurface.svelte';

  let { data }: { data: PageData } = $props();

  let chats = $state<ChatView[]>([]);
  let creatingCharacterId = $state<string | null>(null);
  let settingsOpen = $state(false);
  let deleteChatId = $state<string | null>(null);
  let confirmDeleteOpen = $state(false);

  const isDev = import.meta.env.DEV;

  onMount(() => {
    if (typeof window !== 'undefined') {
      catalogStore.initFromUrl(new URL(window.location.href));
    }
    personasStore.load();
    refreshChats();
  });

  $effect(() => {
    if (data.chats) chats = data.chats;
  });

  async function refreshChats() {
    try {
      const res = await api.api.chats.get();
      if (res.data && Array.isArray(res.data)) {
        chats = res.data as ChatView[];
      }
    } catch {
      // Non-fatal
    }
  }

  async function handleStartChat(characterId: string) {
    if (creatingCharacterId) return;
    creatingCharacterId = characterId;
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
      creatingCharacterId = null;
    }
  }

  function promptDeleteChat(chatId: string, e: MouseEvent) {
    e.stopPropagation();
    deleteChatId = chatId;
    confirmDeleteOpen = true;
  }

  async function handleConfirmDelete() {
    if (!deleteChatId) return;
    const id = deleteChatId;
    deleteChatId = null;
    confirmDeleteOpen = false;
    try {
      const { error } = await api.api.chats({ id }).delete();
      if (error) {
        toasts.error(toUiError(error).message);
        return;
      }
      chats = chats.filter((c) => c.id !== id);
      toasts.success('Story deleted');
    } catch (err: any) {
      toasts.error(toUiError(err).message);
    }
  }

  // Filter recent stories by query if q is present
  const filteredChats = $derived.by(() => {
    if (!catalogStore.q.trim()) return chats;
    const qLower = catalogStore.q.trim().toLowerCase();
    return chats.filter(
      (c) =>
        (c.title && c.title.toLowerCase().includes(qLower)) ||
        c.primaryCharacterId.toLowerCase().includes(qLower)
    );
  });
</script>

<svelte:head>
  <title>{shellTheme.theme.labels?.foyerTitle || 'FormaTavern'} — Companion Catalog</title>
</svelte:head>

<ShellSurface>
  <!-- Top Navigation Header -->
  <header class="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-(--chrome-line) chrome-bar px-6 {HOOKS.shell.foyerHeader}">
    <div class="flex items-center gap-3">
      <span class="text-accent text-lg">◈</span>
      <h1 class="text-sm font-bold tracking-wide text-(--chrome-text) uppercase">
        {shellTheme.theme.labels?.foyerTitle || 'FormaTavern'}
      </h1>
      <span class="rounded border border-(--chrome-line) bg-(--chrome-surface) px-2 py-0.5 text-[10px] font-mono text-(--chrome-text)/70">
        Foyer
      </span>
    </div>

    <div class="flex items-center gap-2.5">
      <!-- Personas Quick-Access -->
      <a
        href="/personas"
        class="flex items-center gap-1.5 rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-1.5 text-xs text-(--chrome-text)/80 hover:border-accent/40 transition-colors"
        title="Manage your user personas"
      >
        <Icon name="user" size={13} />
        <span class="hidden sm:inline">Personas</span>
      </a>

      <!-- Create New Companion -->
      <a
        href="/character/new"
        class="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-contrast hover:bg-accent/90 shadow-sm"
      >
        <Icon name="plus" size={13} />
        <span>New Companion</span>
      </a>

      {#if isDev}
        <a
          href="/dev"
          class="hidden sm:flex items-center gap-1.5 rounded-xl border border-neutral-800 bg-neutral-850 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          <Icon name="sparkles" size={13} />
          <span>Dev</span>
        </a>
      {/if}

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
    <!-- Hero / Intro -->
    <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div>
        <h2 class="text-2xl font-bold tracking-tight text-(--chrome-text) sm:text-3xl">
          Discover Companions
        </h2>
        <p class="mt-1 text-sm text-(--chrome-text)/70">
          Chameleon roleplay companions with author-designed aesthetics, responsive typography, and atmospheric worlds.
        </p>
      </div>

      <SortSelect
        sort={catalogStore.sort}
        onSortChange={(sort) => catalogStore.setSort(sort)}
      />
    </div>

    <!-- Search & Filter Controls -->
    <section aria-label="Search and Filters" class="space-y-4">
      <SearchBar
        value={catalogStore.q}
        onSearch={(q) => catalogStore.setQuery(q)}
      />

      <TagFilter
        availableTags={catalogStore.availableTags}
        selectedTags={catalogStore.tags}
        onToggleTag={(t) => catalogStore.toggleTag(t)}
        onClearTags={() => catalogStore.clearTags()}
      />
    </section>

    <!-- Companion Grid (Foyer v2) -->
    <section aria-label="Available Companions" class={HOOKS.shell.foyerGrid}>
      <CompanionGrid
        companions={catalogStore.items}
        loading={catalogStore.loading}
        loadingMore={catalogStore.loadingMore}
        hasMore={catalogStore.hasMore}
        hasFilters={Boolean(catalogStore.q || catalogStore.tags.length > 0)}
        onLoadMore={() => catalogStore.loadMore()}
        onStartStory={handleStartChat}
        onResetFilters={() => {
          catalogStore.q = '';
          catalogStore.clearTags();
        }}
      />
    </section>

    <!-- Recent Stories Section -->
    <section aria-label="Recent Stories" class="border-t border-(--chrome-line) pt-8 space-y-4 {HOOKS.shell.recentStories}">
      <div class="flex items-center justify-between border-b border-(--chrome-line) pb-2">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-(--chrome-text)/70">
          Recent Stories
        </h3>
        <span class="text-xs text-(--chrome-text)/50 font-mono">
          {filteredChats.length} {filteredChats.length === 1 ? 'story' : 'stories'}
        </span>
      </div>

      {#if filteredChats.length === 0}
        <div class="flex h-28 items-center justify-center rounded-2xl border border-dashed border-(--chrome-line) text-xs text-(--chrome-text)/50">
          {catalogStore.q ? 'No recorded stories match your current search.' : 'No stories recorded yet. Select a companion above to begin.'}
        </div>
      {:else}
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {#each filteredChats as chat (chat.id)}
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
              class="group relative flex flex-col justify-between rounded-xl border border-(--chrome-line) bg-(--chrome-surface) p-4 transition-colors hover:border-accent/40 cursor-pointer shadow-xs"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="flex flex-col overflow-hidden">
                  <span class="truncate text-sm font-semibold text-(--chrome-text)">
                    {chat.title || 'Untitled Story'}
                  </span>
                  <span class="text-xs text-(--chrome-text)/60 font-mono">
                    ID: {chat.primaryCharacterId}
                  </span>
                </div>

                {#if chat.activeGenerationMessageId}
                  <span class="flex items-center gap-1 text-[11px] font-mono text-accent shrink-0">
                    <span class="relative flex h-2 w-2">
                      <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75"></span>
                      <span class="relative inline-flex h-2 w-2 rounded-full bg-accent"></span>
                    </span>
                    <span>writing…</span>
                  </span>
                {/if}
              </div>

              <div class="mt-4 flex items-center justify-between border-t border-(--chrome-line) pt-2 text-[11px] text-(--chrome-text)/50 font-mono">
                <span>{chat.messageCount ?? 0} turns</span>

                <button
                  type="button"
                  onclick={(e) => promptDeleteChat(chat.id, e)}
                  class="rounded p-1 text-(--chrome-text)/50 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100 focus:opacity-100"
                  aria-label="Delete story"
                  title="Delete story"
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </main>

  <!-- Settings Sheet -->
  <SettingsSheet
    open={settingsOpen}
    onClose={() => {
      settingsOpen = false;
    }}
  />

  <!-- Confirm Delete Dialog -->
  <ConfirmDialog
    open={confirmDeleteOpen}
    title="Delete Story"
    message="Are you sure you want to delete this story? All branches and messages will be permanently lost."
    confirmLabel="Delete"
    danger={true}
    onConfirm={handleConfirmDelete}
    onCancel={() => {
      confirmDeleteOpen = false;
      deleteChatId = null;
    }}
  />
</ShellSurface>

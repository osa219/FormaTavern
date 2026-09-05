<script lang="ts">
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';
  import type { CharacterCard as CharacterCardType, ChatView } from '@formatavern/shared';
  import { api, toUiError } from '$lib/api';
  import { toasts } from '$lib/state/toasts.svelte';

  import Icon from '$lib/components/ui/Icon.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import CharacterCard from '$lib/components/nav/CharacterCard.svelte';
  import SettingsSheet from '$lib/components/settings/SettingsSheet.svelte';
  import ConfirmDialog from '$lib/components/dialogs/ConfirmDialog.svelte';

  let { data }: { data: PageData } = $props();

  let characters = $state<CharacterCardType[]>([]);
  let chats = $state<ChatView[]>([]);
  let creatingCharacterId = $state<string | null>(null);
  let settingsOpen = $state(false);

  $effect(() => {
    if (data.characters) characters = data.characters;
    if (data.chats) chats = data.chats;
  });

  let deleteChatId = $state<string | null>(null);
  let confirmDeleteOpen = $state(false);

  const isDev = import.meta.env.DEV;

  // Refresh recent chats & characters on load
  $effect(() => {
    refreshData();
  });

  async function refreshData() {
    try {
      const [charsRes, chatsRes] = await Promise.all([
        api.api.characters.get(),
        api.api.chats.get()
      ]);
      if (charsRes.data && Array.isArray(charsRes.data)) {
        characters = charsRes.data as CharacterCardType[];
      }
      if (chatsRes.data && Array.isArray(chatsRes.data)) {
        chats = chatsRes.data as ChatView[];
      }
    } catch {
      // Non-fatal
    }
  }

  async function handleStartChat(characterId: string) {
    if (creatingCharacterId) return;
    creatingCharacterId = characterId;
    try {
      const { data: newChat, error } = await api.api.chats.post({
        characterId
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

  const charMap = $derived(new Map(characters.map((c) => [c.id, c])));

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (confirmDeleteOpen) {
        confirmDeleteOpen = false;
        deleteChatId = null;
      } else if (settingsOpen) {
        settingsOpen = false;
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="min-h-screen bg-neutral-950 text-neutral-100 font-sans">
  <!-- Header -->
  <header class="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-neutral-800/80 bg-neutral-900/80 px-6 backdrop-blur-md">
    <div class="flex items-center gap-3">
      <span class="text-accent text-lg">◈</span>
      <h1 class="text-sm font-bold tracking-wide text-neutral-100 uppercase">
        FormaTavern
      </h1>
      <span class="rounded bg-neutral-800 px-2 py-0.5 text-[10px] font-mono text-neutral-400">
        Canvas
      </span>
    </div>

    <div class="flex items-center gap-2">
      {#if isDev}
        <a
          href="/dev"
          class="flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-850 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          <Icon name="sparkles" size={13} />
          <span>Dev Workbench</span>
        </a>
      {/if}

      <button
        type="button"
        onclick={() => (settingsOpen = true)}
        class="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-850 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
        aria-label="Open settings"
        title="Settings"
      >
        <Icon name="settings" size={16} />
      </button>
    </div>
  </header>

  <main class="mx-auto max-w-5xl px-6 py-8">
    <!-- Hero / Title -->
    <div class="mb-8">
      <h2 class="text-2xl font-bold tracking-tight text-neutral-100 sm:text-3xl">
        Select a Companion
      </h2>
      <p class="mt-1 text-sm text-neutral-400">
        Experience chameleon styling where every character brings their own typography, color tokens, and atmospheric aesthetic.
      </p>
    </div>

    <!-- Character Cards Grid (Live Chameleon Theme Swatches) -->
    <section aria-label="Available Characters" class="mb-12">
      {#if characters.length === 0}
        <div class="flex h-48 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900/50 text-xs text-neutral-400">
          <Spinner size={16} class="mr-2" />
          <span>Loading characters…</span>
        </div>
      {:else}
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
          {#each characters as character (character.id)}
            <CharacterCard
              {character}
              creating={creatingCharacterId === character.id}
              onStartChat={handleStartChat}
            />
          {/each}
        </div>
      {/if}
    </section>

    <!-- Recent Stories -->
    <section aria-label="Recent Stories">
      <div class="mb-4 flex items-center justify-between border-b border-neutral-800 pb-2">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Recent Stories
        </h3>
        <span class="text-xs text-neutral-500 font-mono">
          {chats.length} {chats.length === 1 ? 'story' : 'stories'}
        </span>
      </div>

      {#if chats.length === 0}
        <div class="flex h-32 items-center justify-center rounded-2xl border border-dashed border-neutral-800 text-xs text-neutral-500">
          No stories recorded yet. Choose a companion above to embark on a new journey.
        </div>
      {:else}
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {#each chats as chat (chat.id)}
            {@const char = charMap.get(chat.primaryCharacterId)}
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
              class="group relative flex flex-col justify-between rounded-xl border border-neutral-800/80 bg-neutral-900/70 p-4 transition-colors hover:border-neutral-700 hover:bg-neutral-850 cursor-pointer"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="flex flex-col overflow-hidden">
                  <span class="truncate text-sm font-semibold text-neutral-100">
                    {chat.title || 'Untitled Story'}
                  </span>
                  <span class="text-xs text-neutral-400">
                    with {char?.name ?? 'Unknown Character'}
                  </span>
                </div>

                {#if chat.activeGenerationMessageId}
                  <span class="flex items-center gap-1 text-[11px] font-mono text-accent">
                    <span class="relative flex h-2 w-2">
                      <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75"></span>
                      <span class="relative inline-flex h-2 w-2 rounded-full bg-accent"></span>
                    </span>
                    <span>writing…</span>
                  </span>
                {/if}
              </div>

              <div class="mt-4 flex items-center justify-between border-t border-neutral-800/60 pt-2 text-[11px] text-neutral-500">
                <span>{chat.messageCount ?? 0} turns</span>

                <button
                  type="button"
                  onclick={(e) => promptDeleteChat(chat.id, e)}
                  class="rounded p-1 text-neutral-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100 focus:opacity-100"
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
</div>

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

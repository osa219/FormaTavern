<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { ChatSession } from '$lib/state/session.svelte';
  import type { ThemeEngine } from '$lib/theme/engine.svelte';
  import type { CharacterCard, ChatView, MessageWithTree, StateVector } from '@formatavern/shared';
  import { api, toUiError } from '$lib/api';
  import { media } from '$lib/state/media.svelte';
  import { prefs } from '$lib/state/prefs.svelte';
  import { toasts } from '$lib/state/toasts.svelte';

  import { handleGlobalKeydown } from '$lib/actions/shortcuts';
  import Backdrop from './Backdrop.svelte';
  import TopBar from '../nav/TopBar.svelte';
  import MessageLog from './MessageLog.svelte';
  import Composer from '../composer/Composer.svelte';
  import NavDrawer from '../nav/NavDrawer.svelte';
  import SettingsSheet from '../settings/SettingsSheet.svelte';
  import EditTurnDialog from '../dialogs/EditTurnDialog.svelte';
  import ConfirmDialog from '../dialogs/ConfirmDialog.svelte';

  let {
    session,
    themeEngine
  }: {
    session: ChatSession;
    themeEngine: ThemeEngine;
  } = $props();

  let ready = $state(false);
  let navOpen = $state(false);
  let settingsOpen = $state(false);
  let directorOpen = $state(false);
  let editingTurn = $state<MessageWithTree | null>(null);
  let deletingTurn = $state<MessageWithTree | null>(null);

  let navChats = $state<ChatView[]>([]);
  let navCharacters = $state<CharacterCard[]>([]);

  // First-frame gate for transitions to avoid neutral swoop on load
  onMount(() => {
    const handle = requestAnimationFrame(() => {
      ready = true;
    });

    loadNavData();

    // Check URL for ?dev=1
    if (typeof window !== 'undefined' && window.location.search.includes('dev=1')) {
      prefs.devMode = true;
    }

    return () => {
      cancelAnimationFrame(handle);
    };
  });

  async function loadNavData() {
    try {
      const [chatsRes, charsRes] = await Promise.all([
        api.api.chats.get(),
        api.api.characters.get()
      ]);
      if (chatsRes.data && Array.isArray(chatsRes.data)) {
        navChats = chatsRes.data as ChatView[];
      }
      if (charsRes.data && Array.isArray(charsRes.data)) {
        navCharacters = charsRes.data as CharacterCard[];
      }
    } catch {
      // Non-fatal
    }
  }

  const isReducedMotion = $derived(
    prefs.reducedMotion === 'on' || (prefs.reducedMotion === 'system' && media.reducedMotion)
  );

  const transitionAttr = $derived(ready && !isReducedMotion ? 'on' : 'off');

  // Subtree deletion count message
  const deleteMessage = $derived.by(() => {
    if (!deletingTurn) return 'Delete this turn?';
    if (deletingTurn.hasChildren) {
      return 'Delete this turn and all downstream turns in this story branch? This cannot be undone.';
    }
    return 'Delete this turn? This cannot be undone.';
  });

  async function handleConfirmDeleteTurn() {
    if (!deletingTurn) return;
    const id = deletingTurn.id;
    deletingTurn = null;
    await session.remove(id);
  }

  async function handleSaveEditedTurn(newContent: string) {
    if (!editingTurn) return;
    const id = editingTurn.id;
    editingTurn = null;
    await session.edit(id, newContent);
  }

  async function handleNewChat(characterId?: string) {
    const charId = characterId || session.character?.id;
    if (!charId) return;
    try {
      const { data, error } = await api.api.chats.post({
        characterId: charId
      });
      if (error) {
        toasts.error(toUiError(error).message);
        return;
      }
      if (data && 'id' in data) {
        goto(`/chat/${data.id}`);
      }
    } catch (err: any) {
      toasts.error(toUiError(err).message);
    }
  }

  async function handleDeleteChat(chatId: string) {
    try {
      const { error } = await api.api.chats({ id: chatId }).delete();
      if (error) {
        toasts.error(toUiError(error).message);
        return;
      }
      navChats = navChats.filter((c) => c.id !== chatId);
      toasts.success('Story deleted');
      if (chatId === session.chatId) {
        goto('/');
      }
    } catch (err: any) {
      toasts.error(toUiError(err).message);
    }
  }

  function handleStandingDirectionChange(dir: string) {
    api.api.chats({ id: session.chatId }).patch({
      metadata: { standingDirection: dir }
    });
  }

  function closeActiveOverlay(): boolean {
    if (editingTurn) {
      editingTurn = null;
      return true;
    }
    if (deletingTurn) {
      deletingTurn = null;
      return true;
    }
    if (settingsOpen) {
      settingsOpen = false;
      return true;
    }
    if (navOpen) {
      navOpen = false;
      return true;
    }
    if (directorOpen) {
      directorOpen = false;
      return true;
    }
    return false;
  }

  async function handlePrevSwipe() {
    const lastMsg = [...session.messages].reverse().find((m) => m.role === 'assistant');
    if (!lastMsg || lastMsg.siblingIndex <= 0) return;
    try {
      const { data } = await api.api.messages({ id: lastMsg.id }).siblings.get();
      if (Array.isArray(data) && data[lastMsg.siblingIndex - 1]) {
        await session.select(data[lastMsg.siblingIndex - 1].id);
      }
    } catch {
      // ignore
    }
  }

  async function handleNextSwipe() {
    const lastMsg = [...session.messages].reverse().find((m) => m.role === 'assistant');
    if (!lastMsg) return;
    if (lastMsg.siblingIndex === lastMsg.siblingCount - 1) {
      await session.regenerate(lastMsg.id);
      return;
    }
    try {
      const { data } = await api.api.messages({ id: lastMsg.id }).siblings.get();
      if (Array.isArray(data) && data[lastMsg.siblingIndex + 1]) {
        await session.select(data[lastMsg.siblingIndex + 1].id);
      }
    } catch {
      // ignore
    }
  }

  function onWindowKeydown(e: KeyboardEvent) {
    handleGlobalKeydown(
      e,
      {
        onStop: () => {
          if (session.busy) {
            session.stop();
          }
        },
        onCloseOverlay: () => {
          closeActiveOverlay();
        },
        onToggleDirector: () => {
          directorOpen = !directorOpen;
        },
        onToggleNav: () => {
          settingsOpen = false;
          loadNavData();
          navOpen = !navOpen;
        },
        onPrevSwipe: () => {
          handlePrevSwipe();
        },
        onNextSwipe: () => {
          handleNextSwipe();
        },
        onFocusComposer: () => {
          const el = document.querySelector<HTMLTextAreaElement>('textarea[data-composer-input]');
          el?.focus();
        }
      },
      session.busy
    );
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div
  style={themeEngine.styleAttr}
  data-theme-scheme={themeEngine.themeScheme}
  data-transitions={transitionAttr}
  class="relative grid h-[100dvh] w-full grid-rows-[auto_1fr_auto] overflow-hidden bg-neutral-950 font-sans text-neutral-100 select-text"
>
  <!-- Backdrop image / ambient gradient layer -->
  <Backdrop image={themeEngine.backgroundImage} />

  <!-- Top Bar -->
  <TopBar
    character={session.character}
    chat={session.chat}
    currentState={session.currentState}
    stateSource={session.messages[session.messages.length - 1]?.metadata?.stateSource ?? 'initial'}
    onToggleNav={() => {
      settingsOpen = false;
      loadNavData();
      navOpen = !navOpen;
    }}
    onToggleSettings={() => {
      navOpen = false;
      settingsOpen = true;
    }}
    onOverrideState={(patch) => {
      session.overrideState(patch);
    }}
  />

  <!-- Message Log (Scroll container) -->
  <main class="relative min-h-0 w-full overflow-hidden">
    <MessageLog
      {session}
      onEditTurn={(turn) => {
        editingTurn = turn;
      }}
      onDeleteTurn={(turn) => {
        deletingTurn = turn;
      }}
    />
  </main>

  <!-- Composer & Director Drawer -->
  <footer class="relative z-20 w-full border-t border-neutral-800/80 bg-neutral-900/80 backdrop-blur-md">
    <Composer
      busy={session.busy}
      personaName={session.persona?.name || 'Traveler'}
      primaryCharName={session.character?.name || 'Character'}
      npcs={session.chat?.metadata?.npcs || {}}
      standingDirection={session.chat?.metadata?.standingDirection || ''}
      bind:directorOpen
      onSend={(payload) => session.send(payload)}
      onStop={() => session.stop()}
      onStandingChange={handleStandingDirectionChange}
    />
  </footer>

  <!-- Dev Diagnostics Overlay -->
  {#if prefs.devMode}
    <aside
      class="pointer-events-none fixed bottom-24 right-4 z-50 flex flex-col gap-1 rounded-xl border border-neutral-700 bg-neutral-950/90 p-3 font-mono text-[10px] text-neutral-300 shadow-2xl backdrop-blur"
      aria-label="Developer Diagnostics"
    >
      <div class="flex items-center justify-between gap-4 font-bold text-accent">
        <span>DEV DIAGNOSTICS</span>
        <span>{session.busy ? 'STREAMING' : 'IDLE'}</span>
      </div>
      {#if session.live}
        <div>Phase: <span class="text-neutral-100">{session.live.phase}</span></div>
        <div>Chars: <span class="text-neutral-100">{session.live.chars}</span></div>
        <div>TTFT: <span class="text-neutral-100">{session.live.ttftMs ? `${session.live.ttftMs}ms` : '…'}</span></div>
        <div>Segments: <span class="text-neutral-100">{session.live.segments.length}</span></div>
        {#if session.live.warnings.length > 0}
          <div class="text-amber-400">Warnings: {session.live.warnings.join(', ')}</div>
        {/if}
      {:else}
        <div>Active Leaf: <span class="text-neutral-100">{session.activeLeafId?.slice(0, 8) ?? 'none'}</span></div>
        <div>Turns: <span class="text-neutral-100">{session.messages.length}</span></div>
        <div>Current State: <span class="text-neutral-100">{JSON.stringify(session.currentState)}</span></div>
      {/if}
    </aside>
  {/if}
</div>

<!-- Navigation Drawer -->
<NavDrawer
  open={navOpen}
  activeChatId={session.chatId}
  chats={navChats}
  characters={navCharacters}
  onClose={() => {
    navOpen = false;
  }}
  onSelectChat={(chatId) => {
    goto(`/chat/${chatId}`);
  }}
  onNewChat={handleNewChat}
  onDeleteChat={handleDeleteChat}
/>

<!-- Settings Sheet -->
<SettingsSheet
  open={settingsOpen}
  onClose={() => {
    settingsOpen = false;
  }}
/>

<!-- Edit Turn Dialog -->
{#if editingTurn}
  <EditTurnDialog
    open={true}
    content={editingTurn.content}
    narrativeRole={editingTurn.narrativeRole}
    onSave={handleSaveEditedTurn}
    onClose={() => {
      editingTurn = null;
    }}
  />
{/if}

<!-- Confirm Delete Turn Dialog -->
{#if deletingTurn}
  <ConfirmDialog
    open={true}
    title="Delete Message"
    message={deleteMessage}
    confirmLabel="Delete"
    danger={true}
    onConfirm={handleConfirmDeleteTurn}
    onCancel={() => {
      deletingTurn = null;
    }}
  />
{/if}

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import type { ChatSession } from '$lib/state/session.svelte';
  import type { ThemeEngine } from '$lib/theme/engine.svelte';
  import type { CharacterCard, CharacterSummary, ChatView, MessageWithTree, Persona, StateVector } from '@formatavern/shared';
  import { HOOKS } from '@formatavern/shared';
  import { api, toUiError } from '$lib/api';
  import { media } from '$lib/state/media.svelte';
  import { prefs } from '$lib/state/prefs.svelte';
  import { toasts } from '$lib/state/toasts.svelte';

  import { handleGlobalKeydown } from '$lib/actions/shortcuts';
  import Backdrop from './Backdrop.svelte';
  import DecorLayers from '../custom/DecorLayers.svelte';
  import TopBar from '../nav/TopBar.svelte';
  import MessageLog from './MessageLog.svelte';
  import Composer from '../composer/Composer.svelte';
  import type { PromptDraft } from '$lib/prompt/preview';
  import NavDrawer from '../nav/NavDrawer.svelte';
  import LoreDrawer from './LoreDrawer.svelte';
  import SettingsSheet from '../settings/SettingsSheet.svelte';
  import EditTurnDialog from '../dialogs/EditTurnDialog.svelte';
  import ConfirmDialog from '../dialogs/ConfirmDialog.svelte';
  import CustomStyleOutlet from '../custom/CustomStyleOutlet.svelte';
  import { selectPartitionSurface } from '@formatavern/shared';

  let {
    session,
    themeEngine
  }: {
    session: ChatSession;
    themeEngine: ThemeEngine;
  } = $props();

  // Marked sheets inject only the chat partition (possibly nothing);
  // unmarked legacy sheets keep pre-partition behavior (whole sheet, C4-contained).
  const chatCss = $derived(
    selectPartitionSurface(session.character?.customCss, 'chat') || null
  );

  let ready = $state(false);
  let navOpen = $state(false);
  let loreOpen = $state(false);
  let loreTab = $state<'about' | 'voice' | 'you' | 'state' | 'prompt'>('about');
  let promptDraft = $state<PromptDraft | null>(null);
  let settingsOpen = $state(false);
  let directorOpen = $state(false);
  let editingTurn = $state<MessageWithTree | null>(null);
  let deletingTurn = $state<MessageWithTree | null>(null);

  let navChats = $state<ChatView[]>([]);
  let navCharacters = $state<(CharacterCard | CharacterSummary)[]>([]);
  let personas = $state<Persona[]>([]);

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
      const [chatsRes, charsRes, personasRes] = await Promise.all([
        api.api.chats.get(),
        api.api.characters.get(),
        api.api.personas.get()
      ]);
      if (chatsRes.data && Array.isArray(chatsRes.data)) {
        navChats = chatsRes.data as ChatView[];
      }
      if (charsRes.data) {
        const rawChars = charsRes.data as any;
        if (Array.isArray(rawChars)) {
          navCharacters = rawChars;
        } else if (rawChars.items && Array.isArray(rawChars.items)) {
          navCharacters = rawChars.items;
        }
      }
      if (personasRes.data && Array.isArray(personasRes.data)) {
        personas = personasRes.data as Persona[];
      }
    } catch {
      // Non-fatal
    }
  }

  async function handleSwitchPersona(personaId: string) {
    if (session.busy) {
      toasts.error('Cannot switch persona while companion is generating');
      return;
    }
    try {
      const res = await (api.api.chats({ id: session.chatId }).patch as any)({
        activePersonaId: personaId
      });
      if (res.error) {
        toasts.error(toUiError(res.error).message);
        return;
      }
      const target = personas.find((p) => p.id === personaId);
      if (target) {
        session.persona = target;
        toasts.success(
          `You are now ${target.name} — future replies address you as ${target.name}; earlier turns are unchanged.`
        );
      }
    } catch (err: any) {
      toasts.error(toUiError(err).message);
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

  async function handleConvertChat(
    targetDialect: 'directive' | 'xml' | 'prefix'
  ): Promise<{ converted: number; unchanged: number }> {
    const { data, error } = await api.api.chats({ id: session.chatId }).convert.post({
      targetDialect
    });
    if (error) {
      throw new Error(toUiError(error).message);
    }
    await session.refetchState();
    const result = data as { converted: number; unchanged: number };
    toasts.success(
      `Converted ${result.converted} turn${result.converted === 1 ? '' : 's'} to ${targetDialect}` +
        (result.unchanged > 0 ? ` (${result.unchanged} plain turns untouched)` : '')
    );
    return result;
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

  // Standing direction: optimistic locally on every keystroke, persisted to the
  // server only after the user pauses (600 ms), like the preamble field. Firing
  // a PATCH per keystroke spammed the server and let out-of-order completions
  // clobber newer text.
  let standingDebounce: any = null;
  let pendingStandingDir: string | null = null;

  function flushStandingDirection() {
    if (pendingStandingDir === null) return;
    const dir = pendingStandingDir;
    pendingStandingDir = null;
    api.api.chats({ id: session.chatId }).patch({
      metadata: { standingDirection: dir }
    }).then(
      () => {},
      (err: any) => {
        toasts.error(toUiError(err).message);
      }
    );
  }

  function handleStandingDirectionChange(dir: string) {
    // Optimistic local update first: the director field is uncontrolled, so any
    // re-render before the PATCH lands would overwrite the typed text with the
    // stale prop (typed text "disappears" while the server already has it).
    if (session.chat) {
      session.chat.metadata = { ...session.chat.metadata, standingDirection: dir };
    }
    pendingStandingDir = dir;
    clearTimeout(standingDebounce);
    standingDebounce = setTimeout(flushStandingDirection, 600);
  }

  onDestroy(() => {
    clearTimeout(standingDebounce);
    flushStandingDirection();
  });

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
    if (loreOpen) {
      loreOpen = false;
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
          loreOpen = false;
          loadNavData();
          navOpen = !navOpen;
        },
        onToggleLore: () => {
          settingsOpen = false;
          navOpen = false;
          directorOpen = false;
          loreOpen = !loreOpen;
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
  data-ft-surface="chat"
  class="relative isolate grid h-[100dvh] w-full grid-rows-[auto_1fr_auto] overflow-hidden bg-(--chrome-bg) font-sans text-(--chrome-text) select-text {HOOKS.chat.viewport}"
>
  <CustomStyleOutlet scope="chat" css={chatCss} />

  <!-- Backdrop image / ambient gradient layer -->
  <Backdrop image={themeEngine.backgroundImage} />

  <!-- Fixed decor layers (scenery pins / page dolls) -->
  <DecorLayers layers={themeEngine.decor} variant="chat" />

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
      loreOpen = false;
      settingsOpen = true;
    }}
    onToggleLore={() => {
      settingsOpen = false;
      navOpen = false;
      directorOpen = false;
      if (!loreOpen) loreTab = 'about';
      loreOpen = !loreOpen;
    }}
    onOverrideState={(patch) => {
      session.overrideState(patch);
    }}
  />

  <!-- Message Log (Scroll container: flex column so the log root's flex-1 constrains its height and the inner log can scroll) -->
  <main class="relative flex min-h-0 w-full flex-col overflow-hidden">
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
  <footer class="relative z-20 w-full border-t border-neutral-800/40 bg-transparent backdrop-blur-md">
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
      onPreview={(draft) => {
        promptDraft = draft;
        loreTab = 'prompt';
        settingsOpen = false;
        navOpen = false;
        directorOpen = false;
        loreOpen = true;
      }}
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

  <!-- Navigation Drawer (rendered on theme root for chameleon styling) -->
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

  <!-- In-Chat Lore Drawer (Alt+L) rendered on theme root -->
  {#if session.character}
    <LoreDrawer
      open={loreOpen}
      character={session.character}
      chat={session.chat}
      currentPersona={session.persona}
      {personas}
      currentState={session.currentState}
      busy={session.busy}
      initialTab={loreTab}
      {promptDraft}
      onClose={() => (loreOpen = false)}
      onSwitchPersona={handleSwitchPersona}
      onOpenStateOverride={() => (directorOpen = true)}
      onEditSettings={() => {
        loreOpen = false;
        settingsOpen = true;
      }}
      onConvertChat={handleConvertChat}
    />
  {/if}
</div>

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
  import { settingsStore } from '$lib/state/settings.svelte';
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
  import ConfirmDialog from '../dialogs/ConfirmDialog.svelte';
  import CustomStyleOutlet from '../custom/CustomStyleOutlet.svelte';
  import { selectPartitionSurface, resolveCharacterName, resolveStateTracking } from '@formatavern/shared';

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
        api.api.chats.get({ query: { limit: 20 } }),
        api.api.characters.get({ query: { limit: 20 } }),
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
      toasts.error('Cannot switch persona while character is generating');
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
      return 'Delete this turn and all downstream turns in this branch? This cannot be undone.';
    }
    return 'Delete this turn? This cannot be undone.';
  });

  async function handleConfirmDeleteTurn() {
    if (!deletingTurn) return;
    const id = deletingTurn.id;
    deletingTurn = null;
    await session.remove(id);
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
      toasts.success('Chat deleted');
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

  async function handleUpdatePersonaVoicing(policy: 'inherited' | 'prohibited' | 'allowed') {
    if (!session.chat) return;
    const value = policy === 'inherited' ? null : policy;
    const nextMeta = { ...session.chat.metadata };
    if (value) {
      nextMeta.personaVoicing = value;
    } else {
      delete nextMeta.personaVoicing;
    }
    session.chat.metadata = nextMeta;
    try {
      await api.api.chats({ id: session.chatId }).patch({
        metadata: { personaVoicing: value }
      });
    } catch (err: any) {
      toasts.error(toUiError(err).message);
    }
  }

  async function handleUpdateStateTracking(policy: 'inherited' | 'on' | 'off') {
    if (!session.chat) return;
    const value = policy === 'inherited' ? null : policy === 'on';
    const nextMeta = { ...session.chat.metadata };
    if (value !== null) {
      nextMeta.stateEnabled = value;
    } else {
      delete nextMeta.stateEnabled;
    }
    session.chat.metadata = nextMeta;
    try {
      await api.api.chats({ id: session.chatId }).patch({
        metadata: { stateEnabled: value }
      });
    } catch (err: any) {
      toasts.error(toUiError(err).message);
    }
  }

  const stateTrackingEnabled = $derived(
    resolveStateTracking({
      chat: session.chat?.metadata ?? null,
      card: session.character,
      settings: settingsStore.settings
    })
  );
  const chatIsNarrative = $derived(
    (session.chat?.metadata?.narrativeMode ?? settingsStore.settings?.narrative?.defaultMode ?? 'narrative') === 'narrative'
  );

  onDestroy(() => {
    clearTimeout(standingDebounce);
    clearTimeout(flipClearTimer);
    flushStandingDirection();
  });

  function closeActiveOverlay(): boolean {
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

  // Pre-reply greeting flip: while the chat is a single childless greeting
  // root and the card has alternates, the reader may flip between doors.
  // Eligibility is derived client-side and enforced server-side.
  const greetingOptions = $derived(
    session.character
      ? [session.character.firstMessage, ...(session.character.alternateGreetings ?? [])]
      : []
  );
  const greetingRoot = $derived(
    session.messages.length === 1 ? session.messages[0] : null
  );
  const greetingPagerVisible = $derived(
    greetingRoot !== null &&
      greetingRoot.role === 'assistant' &&
      greetingRoot.parentId === null &&
      !greetingRoot.hasChildren &&
      greetingOptions.length > 1 &&
      !session.busy &&
      !session.live
  );
  const greetingIndex = $derived(greetingRoot?.metadata?.greetingIndex ?? 0);

  let switchingGreeting = $state(false);
  let flip = $state<{ turnId: string; dir: 1 | -1 } | null>(null);
  let flipClearTimer: any = null;
  let regenFlipArmed = $state(false);

  // Hold flip past the animated mount (170ms slide) before clearing it:
  // clearing synchronously lets Svelte batch it with the refetch and the
  // animation classes never reach the DOM.
  function scheduleFlipClear() {
    clearTimeout(flipClearTimer);
    flipClearTimer = setTimeout(() => {
      flip = null;
    }, 300);
  }

  // Sibling mode: once the conversation has started, the same docked row
  // drives the latest assistant turn's alternatives. Roots are excluded
  // (regenerating a root is a 400) and so are turns with children (flipping
  // there would yank the active branch from under the leaf).
  const latestAssistant = $derived(
    [...session.messages].reverse().find((m) => m.role === 'assistant') ?? null
  );
  const siblingPagerVisible = $derived(
    !greetingPagerVisible &&
      latestAssistant !== null &&
      latestAssistant.parentId !== null &&
      !latestAssistant.hasChildren
  );

  let siblingCache = $state<{ forId: string; ids: string[] } | null>(null);
  let switchingSibling = $state(false);

  // Regen lock is positional, not global: > is forbidden only while viewing
  // the page that's actually streaming (where it would open a parallel
  // reply). Peeking at an older sibling keeps > enabled so the reader can
  // step forward again — including back onto the streaming page. While still
  // connecting (no messageId yet) it stays locked.
  const regenLocked = $derived(
    session.live != null &&
      (session.live.messageId == null || latestAssistant?.id === session.live.messageId)
  );

  async function ensureSiblingIds(turnId: string): Promise<string[] | null> {
    if (siblingCache?.forId === turnId) return siblingCache.ids;
    try {
      const { data } = await api.api.messages({ id: turnId }).siblings.get();
      if (Array.isArray(data)) {
        const ids = (data as Array<{ id: string }>).map((s) => s.id);
        siblingCache = { forId: turnId, ids };
        return ids;
      }
    } catch {
      // ignore
    }
    return null;
  }

  async function handleSelectSibling(index: number) {
    const turn = latestAssistant;
    if (!turn || switchingSibling || !siblingPagerVisible) return;
    if (index < 0 || index >= turn.siblingCount || index === turn.siblingIndex) return;
    switchingSibling = true;
    try {
      const ids = await ensureSiblingIds(turn.id);
      const id = ids?.[index];
      if (id && id !== turn.id) {
        flip = { turnId: id, dir: index > turn.siblingIndex ? 1 : -1 };
        await session.select(id);
      }
    } catch (err: any) {
      toasts.error(toUiError(err).message);
    } finally {
      switchingSibling = false;
      scheduleFlipClear();
    }
  }

  async function handleRegenerateSibling() {
    const turn = latestAssistant;
    if (!turn || session.busy || !siblingPagerVisible) return;
    regenFlipArmed = true;
    try {
      await session.regenerate(turn.id);
    } finally {
      regenFlipArmed = false;
    }
  }

  // Regen-only slide: when the new streaming row lands while armed, flip to
  // it through the same shared mechanism as every other flip. Sends,
  // continues, and reattaches never arm this, so their pages open silently.
  $effect(() => {
    const msgs = session.messages;
    const last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
    if (
      regenFlipArmed &&
      last &&
      last.role === 'assistant' &&
      last.parentId !== null &&
      last.status === 'streaming'
    ) {
      flip = { turnId: last.id, dir: 1 };
      regenFlipArmed = false;
      scheduleFlipClear();
    }
  });

  async function handleSelectGreeting(index: number) {
    if (!greetingRoot || switchingGreeting || !greetingPagerVisible) return;
    if (index < 0 || index >= greetingOptions.length || index === greetingIndex) return;
    flip = { turnId: greetingRoot.id, dir: index > greetingIndex ? 1 : -1 };
    switchingGreeting = true;
    try {
      const res = await (api.api.messages({ id: greetingRoot.id }) as any).greeting.post({ index });
      if (res.error) {
        toasts.error(toUiError(res.error).message);
        return;
      }
      await session.refetchState();
    } catch (err: any) {
      toasts.error(toUiError(err).message);
    } finally {
      switchingGreeting = false;
      scheduleFlipClear();
    }
  }

  async function handlePrevSwipe() {
    if (greetingPagerVisible) {
      await handleSelectGreeting(greetingIndex - 1);
      return;
    }
    if (siblingPagerVisible && latestAssistant) {
      await handleSelectSibling(latestAssistant.siblingIndex - 1);
      return;
    }
    const lastMsg = [...session.messages].reverse().find((m) => m.role === 'assistant');
    if (!lastMsg || lastMsg.parentId === null || lastMsg.siblingIndex <= 0) return;
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
    if (greetingPagerVisible) {
      await handleSelectGreeting(greetingIndex + 1);
      return;
    }
    if (siblingPagerVisible && latestAssistant) {
      if (latestAssistant.siblingIndex >= latestAssistant.siblingCount - 1) {
        await handleRegenerateSibling();
      } else {
        await handleSelectSibling(latestAssistant.siblingIndex + 1);
      }
      return;
    }
    const lastMsg = [...session.messages].reverse().find((m) => m.role === 'assistant');
    if (!lastMsg || lastMsg.parentId === null) return;
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

    if (!settingsStore.settings && !settingsStore.loading) {
      void settingsStore.load();
    }
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
    stateEnabled={stateTrackingEnabled && chatIsNarrative}
    onOpenState={() => {
      loreTab = 'state';
      loreOpen = true;
    }}
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
      flip={isReducedMotion ? null : flip}
      greetingPager={greetingPagerVisible
        ? { index: greetingIndex, count: greetingOptions.length, busy: switchingGreeting }
        : null}
      siblingPager={siblingPagerVisible && latestAssistant
        ? {
            index: latestAssistant.siblingIndex,
            count: latestAssistant.siblingCount,
            busy: switchingSibling,
            nextLocked: regenLocked
          }
        : null}
      onSelectGreeting={handleSelectGreeting}
      onSelectSibling={handleSelectSibling}
      onRegenerateSibling={handleRegenerateSibling}
      onDeleteTurn={(turn) => {
        deletingTurn = turn;
      }}
    />
  </main>

  <!-- Composer & Director Drawer -->
  <!-- Safe-area rule: the ONLY geometry added here is bottom env() inset (0 on
       desktop, notch height on phones). Fixed px/pt/pb utilities are forbidden
       on this footer — Composer owns its own p-3 box, and any wrapper inset
       doubles it and breaks author .ft-composer theming (see boundaries test). -->
  <footer
    class="relative z-20 w-full border-t border-neutral-800/40 bg-transparent backdrop-blur-md"
    style="padding-bottom: env(safe-area-inset-bottom, 0px);"
  >
    <Composer
      busy={session.busy}
      personaName={session.persona?.name || 'Traveler'}
      primaryCharName={session.character ? resolveCharacterName(session.character) : 'Character'}
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
      onUpdatePersonaVoicing={handleUpdatePersonaVoicing}
      onUpdateStateTracking={handleUpdateStateTracking}
    />
  {/if}
</div>

<script lang="ts">
  import { onMount } from 'svelte';
  import {
    parseEnvelope,
    ENVELOPE_SCRIPTS,
    ENVELOPE_SCRIPT_IDS,
    type CharacterCard,
    type ChatStreamEvent,
    type ChatView,
    type EnvelopeScriptId,
    type MessageWithTree,
    type ParseResult,
    type SettingsView
  } from '@formatavern/shared';
  import { api, readSse, readTestStream } from '$lib/api';
  import ShellSurface from '$lib/components/custom/ShellSurface.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';

  const isDev = import.meta.env.DEV;

  // System & Health
  let health = $state('…');

  // Characters & Chats
  let characters = $state<CharacterCard[]>([]);
  let selectedCharacterId = $state<string>('');
  let chats = $state<ChatView[]>([]);
  let selectedChatId = $state<string>('');
  let currentChat = $state<ChatView | null>(null);

  // Active Branch Messages
  let messages = $state<MessageWithTree[]>([]);

  // Send Form
  let inputMessage = $state<string>('');
  let inputDirectorNote = $state<string>('');
  let inputNarrativeRole = $state<'persona' | 'narrator' | 'npc' | 'character'>('persona');
  let inputSenderName = $state<string>('');

  // Generation & Streaming State
  let isGenerating = $state<boolean>(false);
  let activeGeneratingMessageId = $state<string | null>(null);
  let streamingBuffer = $state<string>('');
  let streamAbortController = $state<AbortController | null>(null);
  let streamTokensCount = $state<number>(0);
  let streamStatusText = $state<string>('');

  // State Override Form
  let stateOverrideJson = $state<string>('{\n  "mood": "furious"\n}');
  let stateOverrideWarnings = $state<string[]>([]);

  // Settings
  let settings = $state<SettingsView | null>(null);
  let newApiKey = $state<string>('');
  let settingsStatus = $state<string>('');

  // Test Stream fixture runner
  let selectedScript = $state<EnvelopeScriptId>('envelope-directive');
  let testStreamText = $state<string>('');
  let testStreamStatus = $state<string>('idle');
  let testStreamDeltas = $state<number[]>([]);
  let testStreamParsed = $state<ParseResult | null>(null);

  onMount(async () => {
    if (!isDev) return;
    await refreshHealth();
    await refreshSettings();
    await refreshCharacters();
    await refreshChats();
  });

  async function refreshHealth() {
    try {
      const { data, error } = await api.api.health.get();
      if (error) {
        health = `ERROR ${error.status}`;
      } else if (data && 'sharedVersion' in data) {
        health = `ok · shared ${data.sharedVersion} · db v${data.db.schemaVersion} · ${data.db.characters} chars / ${data.db.personas} persona · active: ${data.activeGenerations ?? 0}`;
      }
    } catch (e: any) {
      health = `offline (${e?.message ?? 'fetch failed'})`;
    }
  }

  async function refreshSettings() {
    try {
      const { data, error } = await api.api.settings.get();
      if (!error && data && 'provider' in data) {
        settings = data as SettingsView;
      }
    } catch {
      // ignore
    }
  }

  async function patchSettings(patch: any) {
    try {
      settingsStatus = 'Saving…';
      const { data, error } = await api.api.settings.patch(patch);
      if (error) {
        settingsStatus = `Error saving settings: ${error.status}`;
      } else if (data && 'provider' in data) {
        settings = data as SettingsView;
        newApiKey = '';
        settingsStatus = 'Settings saved.';
      }
    } catch (err: any) {
      settingsStatus = `Error: ${err?.message ?? 'Failed to save'}`;
    }
  }

  async function refreshCharacters() {
    try {
      const { data, error } = await api.api.characters.get();
      if (!error && Array.isArray(data)) {
        characters = data;
        if (!selectedCharacterId && characters.length > 0) {
          selectedCharacterId = characters[0].id;
        }
      }
    } catch {
      // ignore
    }
  }

  async function refreshChats() {
    try {
      const { data, error } = await api.api.chats.get();
      if (!error && Array.isArray(data)) {
        chats = data as ChatView[];
        if (!selectedChatId && chats.length > 0) {
          await selectChat(chats[0].id);
        } else if (selectedChatId) {
          const found = chats.find((c) => c.id === selectedChatId);
          if (found) {
            currentChat = found;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  async function selectChat(id: string) {
    selectedChatId = id;
    const found = chats.find((c) => c.id === id);
    if (found) {
      currentChat = found;
      if (found.activeGenerationMessageId) {
        activeGeneratingMessageId = found.activeGenerationMessageId;
        isGenerating = true;
      }
    }
    await loadMessages(id);
  }

  async function loadMessages(chatId: string) {
    try {
      const { data, error } = await api.api.chats({ id: chatId }).messages.get({
        query: { limit: 50 }
      });
      if (!error && Array.isArray(data)) {
        messages = data as MessageWithTree[];
      }
    } catch {
      // ignore
    }
  }

  async function createChat() {
    if (!selectedCharacterId) return;
    try {
      const { data, error } = await api.api.chats.post({
        characterId: selectedCharacterId
      });
      if (!error && data && 'id' in data) {
        await refreshChats();
        await selectChat((data as ChatView).id);
      }
    } catch (err: any) {
      alert(`Failed to create chat: ${err?.message}`);
    }
  }

  async function deleteChat(chatId: string) {
    if (!confirm('Delete this entire chat?')) return;
    try {
      const { error } = await api.api.chats({ id: chatId }).delete();
      if (!error) {
        selectedChatId = '';
        currentChat = null;
        messages = [];
        await refreshChats();
      } else {
        alert(`Failed to delete chat: ${error.status}`);
      }
    } catch (err: any) {
      alert(`Error deleting chat: ${err?.message}`);
    }
  }

  // Sibling Navigation (Swiping)
  async function swipeSibling(messageId: string, direction: 'prev' | 'next') {
    try {
      const { data, error } = await api.api.messages({ id: messageId }).siblings.get();
      if (error || !Array.isArray(data)) return;

      const idx = data.findIndex((m) => m.id === messageId);
      if (idx === -1) return;

      const targetIdx = direction === 'prev' ? idx - 1 : idx + 1;
      if (targetIdx >= 0 && targetIdx < data.length) {
        const targetSibling = data[targetIdx];
        await api.api.messages({ id: targetSibling.id }).select.post();
        await refreshChats();
        if (selectedChatId) {
          await loadMessages(selectedChatId);
        }
      }
    } catch (err: any) {
      alert(`Swipe failed: ${err?.message}`);
    }
  }

  // Message Actions: Regenerate, Continue, Delete
  async function regenerateMessage(messageId: string) {
    if (isGenerating) return;
    isGenerating = true;
    streamingBuffer = '';
    streamTokensCount = 0;
    streamStatusText = 'Regenerating…';
    streamAbortController = new AbortController();

    try {
      await readSse(
        `/api/messages/${messageId}/regenerate`,
        { method: 'POST' },
        (ev) => handleChatStreamEvent(ev),
        streamAbortController.signal
      );
    } catch (err: any) {
      streamStatusText = `Error: ${err?.message ?? 'Regenerate failed'}`;
      isGenerating = false;
    }
  }

  async function continueMessage(messageId: string) {
    if (isGenerating) return;
    isGenerating = true;
    streamingBuffer = '';
    streamTokensCount = 0;
    streamStatusText = 'Continuing…';
    streamAbortController = new AbortController();

    try {
      await readSse(
        `/api/messages/${messageId}/continue`,
        { method: 'POST' },
        (ev) => handleChatStreamEvent(ev),
        streamAbortController.signal
      );
    } catch (err: any) {
      streamStatusText = `Error: ${err?.message ?? 'Continue failed'}`;
      isGenerating = false;
    }
  }

  async function deleteMessage(messageId: string) {
    if (!confirm('Delete message and all subsequent descendants?')) return;
    try {
      const { error } = await api.api.messages({ id: messageId }).delete();
      if (!error) {
        await refreshChats();
        if (selectedChatId) {
          await loadMessages(selectedChatId);
        }
      } else {
        alert(`Failed to delete message: ${error.status}`);
      }
    } catch (err: any) {
      alert(`Delete failed: ${err?.message}`);
    }
  }

  // Send Message Flow
  async function sendMessage(generate: boolean = true) {
    if (!selectedChatId || (!inputMessage.trim() && !inputDirectorNote.trim())) return;
    if (isGenerating) return;

    const payload = {
      message: inputMessage || undefined,
      directorNote: inputDirectorNote || undefined,
      narrativeRole: inputNarrativeRole,
      senderName: inputNarrativeRole === 'npc' ? inputSenderName : undefined,
      generate
    };

    if (!generate) {
      try {
        const res = await fetch(`/api/chats/${selectedChatId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          inputMessage = '';
          inputDirectorNote = '';
          await refreshChats();
          await loadMessages(selectedChatId);
        } else {
          const err = await res.json();
          alert(`Send failed: ${err?.error?.message ?? res.statusText}`);
        }
      } catch (err: any) {
        alert(`Send failed: ${err?.message}`);
      }
      return;
    }

    isGenerating = true;
    streamingBuffer = '';
    streamTokensCount = 0;
    streamStatusText = 'Sending…';
    streamAbortController = new AbortController();

    const sentText = inputMessage;
    const sentNote = inputDirectorNote;
    inputMessage = '';
    inputDirectorNote = '';

    try {
      await readSse(
        `/api/chats/${selectedChatId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        },
        (ev) => handleChatStreamEvent(ev),
        streamAbortController.signal
      );
    } catch (err: any) {
      inputMessage = sentText;
      inputDirectorNote = sentNote;
      streamStatusText = `Error: ${err?.message ?? 'Send failed'}`;
      isGenerating = false;
    }
  }

  // Stop generation
  async function stopGeneration() {
    if (!activeGeneratingMessageId) return;
    try {
      await api.api.messages({ id: activeGeneratingMessageId }).stop.post();
      streamStatusText = 'Stopped by user.';
    } catch (err: any) {
      alert(`Stop failed: ${err?.message}`);
    }
  }

  // Reattach to an ongoing stream
  async function reattachStream(messageId: string) {
    isGenerating = true;
    activeGeneratingMessageId = messageId;
    streamingBuffer = '';
    streamTokensCount = 0;
    streamStatusText = `Reattaching to ${messageId}…`;
    streamAbortController = new AbortController();

    try {
      await readSse(
        `/api/messages/${messageId}/stream`,
        { method: 'GET' },
        (ev) => handleChatStreamEvent(ev),
        streamAbortController.signal
      );
    } catch (err: any) {
      streamStatusText = `Reattach failed: ${err?.message}`;
      isGenerating = false;
    }
  }

  // Stream Event Handler (S4 DB reconciliation)
  async function handleChatStreamEvent(ev: ChatStreamEvent) {
    if (ev.type === 'start') {
      activeGeneratingMessageId = ev.messageId;
      streamStatusText = `Streaming message ${ev.messageId}…`;
      if (selectedChatId) {
        await loadMessages(selectedChatId);
      }
    } else if (ev.type === 'token') {
      streamingBuffer += ev.text;
      streamTokensCount++;
    } else if (ev.type === 'usage') {
      streamStatusText = `Usage: ${ev.promptTokens} prompt, ${ev.completionTokens} completion tokens`;
    } else if (ev.type === 'done') {
      streamingBuffer = ev.message.content;
      isGenerating = false;
      activeGeneratingMessageId = null;
      streamStatusText = `Completed (${ev.message.status}).`;
      await refreshChats();
      if (selectedChatId) {
        await loadMessages(selectedChatId);
      }
    } else if (ev.type === 'error') {
      streamingBuffer = ev.message.content;
      isGenerating = false;
      activeGeneratingMessageId = null;
      streamStatusText = `Error: ${ev.error.message}`;
      await refreshChats();
      if (selectedChatId) {
        await loadMessages(selectedChatId);
      }
    }
  }

  // State Override
  async function applyStateOverride() {
    if (!selectedChatId) return;
    try {
      stateOverrideWarnings = [];
      const parsedState = JSON.parse(stateOverrideJson);
      const res = await fetch(`/api/chats/${selectedChatId}/state`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: parsedState })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.warnings?.length) {
          stateOverrideWarnings = data.warnings;
        }
        await refreshChats();
        await loadMessages(selectedChatId);
      } else {
        alert(`Override failed: ${data.error?.message ?? res.statusText}`);
      }
    } catch (err: any) {
      alert(`Invalid JSON state: ${err?.message}`);
    }
  }

  // Live Isomorphic Parse Result
  const streamingParsed = $derived.by(() => {
    if (!streamingBuffer) return null;
    const charName = currentChat
      ? characters.find((c) => c.id === currentChat?.primaryCharacterId)?.name ?? 'Character'
      : 'Character';
    return parseEnvelope(streamingBuffer, {
      primaryCharacter: charName,
      dialect: currentChat?.metadata.envelopeDialect ?? 'directive',
      streaming: true
    });
  });

  // Test Stream Runner (Phase 0 / Phase 2 Diagnostic)
  async function runTestStream() {
    testStreamText = '';
    testStreamDeltas = [];
    testStreamStatus = 'streaming';
    testStreamParsed = null;

    try {
      await readTestStream(
        {
          onEvent: (e) => {
            if (e.type === 'token') {
              testStreamText += e.text;
              testStreamParsed = parseEnvelope(testStreamText, {
                primaryCharacter: ENVELOPE_SCRIPTS[selectedScript].primaryCharacter,
                dialect: ENVELOPE_SCRIPTS[selectedScript].dialect,
                streaming: true
              });
            } else if (e.type === 'done') {
              testStreamStatus = 'done';
              testStreamParsed = parseEnvelope(testStreamText, {
                primaryCharacter: ENVELOPE_SCRIPTS[selectedScript].primaryCharacter,
                dialect: ENVELOPE_SCRIPTS[selectedScript].dialect,
                streaming: false
              });
            } else if (e.type === 'error') {
              testStreamStatus = 'error';
            }
          },
          onChunk: (_b, d) => {
            testStreamDeltas.push(d);
          }
        },
        { script: selectedScript }
      );
    } catch (err: any) {
      testStreamStatus = `error: ${err?.message ?? 'failed'}`;
    }
  }
</script>

<svelte:head>
  <title>Developer Diagnostics — FormaTavern</title>
</svelte:head>

<ShellSurface>
  {#if !isDev}
    <div class="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
      <div class="max-w-md rounded-2xl border border-(--chrome-line) bg-(--chrome-surface) p-8 shadow-xl">
        <h2 class="mb-2 text-xl font-bold text-(--chrome-text)">404 — Not Found</h2>
        <p class="mb-6 text-sm text-(--chrome-text)/70">The developer workbench is disabled in production mode.</p>
        <a
          href="/"
          class="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-contrast hover:bg-accent/90 transition-colors"
        >
          <Icon name="arrow-left" size={14} />
          <span>Return to FormaTavern</span>
        </a>
      </div>
    </div>
  {:else}
    <!-- Sticky Chrome Header -->
    <header class="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-(--chrome-line) chrome-bar px-6">
      <div class="flex items-center gap-3">
        <a
          href="/"
          class="flex items-center gap-1.5 text-xs text-(--chrome-text)/60 hover:text-(--chrome-text) transition-colors"
          title="Return to Foyer"
        >
          <Icon name="arrow-left" size={14} />
          <span>Foyer</span>
        </a>
        <span class="text-(--chrome-line)">/</span>
        <h1 class="text-sm font-bold tracking-wide text-(--chrome-text)">Developer Diagnostics</h1>
        <span class="rounded border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-mono text-accent">
          Workbench
        </span>
      </div>

      <div class="flex items-center gap-3">
        <div class="hidden md:flex items-center gap-2 rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-1.5 text-xs text-(--chrome-text)/80 font-mono">
          <span class="inline-block h-2 w-2 rounded-full {health.startsWith('ok') ? 'bg-emerald-400' : 'bg-amber-400'}"></span>
          <span>{health}</span>
        </div>
        <button
          type="button"
          onclick={refreshHealth}
          class="flex items-center gap-1.5 rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-1.5 text-xs text-(--chrome-text)/80 hover:text-(--chrome-text) hover:border-accent/40 transition-colors"
          title="Refresh health check"
        >
          <Icon name="sparkles" size={13} class="text-accent" />
          <span>Check Health</span>
        </button>
      </div>
    </header>

    <main class="mx-auto w-full max-w-5xl p-6 space-y-6">
      <!-- 1. Settings Drawer -->
      <details class="group rounded-2xl border border-(--chrome-line) bg-(--chrome-surface)/40 p-4 transition-colors">
        <summary class="flex cursor-pointer items-center justify-between text-xs font-semibold text-(--chrome-text) select-none">
          <div class="flex items-center gap-2">
            <Icon name="settings" size={14} class="text-accent" />
            <span>Settings & Secrets (Masked per Invariant S8)</span>
          </div>
          <span class="text-xs text-(--chrome-text)/60 group-open:rotate-180 transition-transform">▼</span>
        </summary>
        {#if settings}
          <div class="mt-4 pt-4 border-t border-(--chrome-line) space-y-4 text-xs">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-(--chrome-text)/80">
                  <span class="mb-1 block">Provider</span>
                  <select
                    value={settings.provider.id}
                    onchange={(e) => patchSettings({ provider: { id: (e.target as HTMLSelectElement).value } })}
                    class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-1.5 text-xs text-(--chrome-text) focus:border-accent focus:outline-none"
                  >
                    <option value="mock">Mock LLM (deterministic fixtures)</option>
                    <option value="openrouter">OpenRouter (upstream API)</option>
                  </select>
                </label>
              </div>

              <div>
                <label class="block text-xs font-medium text-(--chrome-text)/80">
                  <span class="mb-1 block">Model</span>
                  <input
                    type="text"
                    value={settings.provider.model ?? ''}
                    placeholder={settings.provider.id === 'openrouter' ? 'anthropic/claude-3.5-haiku' : 'mock:envelope-directive'}
                    onblur={(e) => patchSettings({ provider: { model: (e.target as HTMLInputElement).value || null } })}
                    class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-1.5 text-xs text-(--chrome-text) focus:border-accent focus:outline-none font-mono"
                  />
                </label>
              </div>
            </div>

            <div>
              <label for="dev-openrouter-key" class="block text-xs font-medium text-(--chrome-text)/80 mb-1">OpenRouter API Key</label>
              <div class="flex gap-2">
                <input
                  id="dev-openrouter-key"
                  type="password"
                  bind:value={newApiKey}
                  placeholder={settings.openrouter.apiKeySet ? `•••••••• (${settings.openrouter.apiKeyHint}) [${settings.openrouter.source}]` : 'None configured'}
                  class="flex-1 rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-1.5 text-xs text-(--chrome-text) focus:border-accent focus:outline-none font-mono"
                />
                <button
                  type="button"
                  onclick={() => patchSettings({ openrouter: { apiKey: newApiKey } })}
                  disabled={!newApiKey.trim()}
                  class="rounded-xl bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-contrast hover:bg-accent/90 disabled:opacity-50 transition-colors"
                >
                  Set Key
                </button>
                {#if settings.openrouter.apiKeySet}
                  <button
                    type="button"
                    onclick={() => patchSettings({ openrouter: { apiKey: null } })}
                    class="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-500/20 transition-colors"
                  >
                    Clear Key
                  </button>
                {/if}
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-xs font-medium text-(--chrome-text)/80">
                  <span class="mb-1 block">Temperature</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={settings.generation.temperature}
                    onchange={(e) => patchSettings({ generation: { temperature: parseFloat((e.target as HTMLInputElement).value) } })}
                    class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-1.5 text-xs text-(--chrome-text) focus:border-accent focus:outline-none font-mono"
                  />
                </label>
              </div>
              <div>
                <label class="block text-xs font-medium text-(--chrome-text)/80">
                  <span class="mb-1 block">Max Tokens</span>
                  <input
                    type="number"
                    step="128"
                    min="16"
                    max="32000"
                    value={settings.generation.maxTokens}
                    onchange={(e) => patchSettings({ generation: { maxTokens: parseInt((e.target as HTMLInputElement).value, 10) } })}
                    class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-1.5 text-xs text-(--chrome-text) focus:border-accent focus:outline-none font-mono"
                  />
                </label>
              </div>
              <div>
                <label class="block text-xs font-medium text-(--chrome-text)/80">
                  <span class="mb-1 block">Context Length</span>
                  <input
                    type="number"
                    step="1024"
                    min="1024"
                    value={settings.generation.contextLength}
                    onchange={(e) => patchSettings({ generation: { contextLength: parseInt((e.target as HTMLInputElement).value, 10) } })}
                    class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-1.5 text-xs text-(--chrome-text) focus:border-accent focus:outline-none font-mono"
                  />
                </label>
              </div>
            </div>

            {#if settingsStatus}
              <p class="text-xs text-accent italic">{settingsStatus}</p>
            {/if}
          </div>
        {:else}
          <p class="mt-3 text-xs text-(--chrome-text)/60">Loading settings…</p>
        {/if}
      </details>

      <!-- 2. Chat Selector & Management Card -->
      <div class="rounded-2xl border border-(--chrome-line) bg-(--chrome-surface)/40 p-4 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="flex flex-wrap items-center gap-4">
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold text-(--chrome-text)/80">Character:</span>
              <select bind:value={selectedCharacterId} class="rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-1.5 text-xs text-(--chrome-text) focus:border-accent focus:outline-none">
                {#each characters as char}
                  <option value={char.id}>{char.name} ({char.id.slice(-6)})</option>
                {/each}
              </select>
              <button
                type="button"
                onclick={createChat}
                disabled={!selectedCharacterId}
                class="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-accent-contrast hover:bg-accent/90 disabled:opacity-50 transition-colors"
              >
                <Icon name="plus" size={13} />
                <span>New Chat</span>
              </button>
            </div>

            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold text-(--chrome-text)/80">Active Chat:</span>
              <select
                value={selectedChatId}
                onchange={(e) => selectChat((e.target as HTMLSelectElement).value)}
                class="rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-1.5 text-xs text-(--chrome-text) focus:border-accent focus:outline-none"
              >
                <option value="">-- select chat --</option>
                {#each chats as c}
                  <option value={c.id}>{c.title} ({c.id.slice(-6)}) [{c.messageCount} msgs]</option>
                {/each}
              </select>
            </div>
          </div>

          {#if currentChat}
            <button
              type="button"
              onclick={() => deleteChat(currentChat!.id)}
              class="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-500/20 transition-colors"
            >
              <Icon name="trash" size={13} />
              <span>Delete Chat</span>
            </button>
          {/if}
        </div>

        {#if currentChat}
          <div class="rounded-xl border border-(--chrome-line) bg-(--chrome-surface)/60 p-3 space-y-2 text-xs">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold text-(--chrome-text)">Chat Details:</span>
              <span class="rounded-md border border-(--chrome-line) bg-(--chrome-surface) px-2 py-0.5 text-[11px] text-(--chrome-text)/80 font-mono">
                Mode: <span class="text-accent">{currentChat.metadata.narrativeMode}</span>
              </span>
              <span class="rounded-md border border-(--chrome-line) bg-(--chrome-surface) px-2 py-0.5 text-[11px] text-(--chrome-text)/80 font-mono">
                Dialect: <span class="text-accent">{currentChat.metadata.envelopeDialect}</span>
              </span>
              <span class="rounded-md border border-(--chrome-line) bg-(--chrome-surface) px-2 py-0.5 text-[11px] text-(--chrome-text)/80 font-mono">
                Active Leaf: <span class="text-accent">{currentChat.activeLeafId ?? 'none'}</span>
              </span>
            </div>
            <div class="flex items-start gap-2 pt-2 border-t border-(--chrome-line)/50">
              <span class="font-semibold text-(--chrome-text)/80 pt-1 text-[11px]">Current Scene State:</span>
              <pre class="flex-1 rounded-lg border border-(--chrome-line) bg-(--chrome-bg) p-2 font-mono text-[11px] text-(--chrome-text) overflow-x-auto">{JSON.stringify(currentChat.metadata.currentState ?? {}, null, 2)}</pre>
            </div>
          </div>
        {/if}
      </div>

      {#if currentChat}
        <!-- 3. Active Branch Messages -->
        <div class="space-y-3">
          <h2 class="text-xs font-bold uppercase tracking-wider text-(--chrome-text)/90">
            Active Branch Messages ({messages.length})
          </h2>

          <div class="space-y-3">
            {#each messages as msg}
              <div class="rounded-2xl border border-(--chrome-line) {msg.role === 'user' ? 'bg-accent/5' : 'bg-(--chrome-surface)/50'} p-4 space-y-2.5 transition-colors">
                <div class="flex items-center justify-between">
                  <div class="flex flex-wrap items-center gap-2 text-xs">
                    <span class="rounded-md border border-(--chrome-line) bg-(--chrome-surface) px-2 py-0.5 font-mono text-[10px] text-(--chrome-text)/70">
                      [{msg.siblingIndex + 1}/{msg.siblingCount}]
                    </span>
                    <span class="font-semibold capitalize text-(--chrome-text)">{msg.role}</span>
                    {#if msg.senderName}
                      <span class="text-(--chrome-text)/60">({msg.narrativeRole}: <strong class="text-(--chrome-text)">{msg.senderName}</strong>)</span>
                    {:else}
                      <span class="text-(--chrome-text)/60">({msg.narrativeRole})</span>
                    {/if}
                    {#if msg.id === currentChat.activeLeafId}
                      <span class="rounded-md border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-400">
                        ACTIVE LEAF
                      </span>
                    {/if}
                  </div>

                  <div class="flex items-center gap-1.5">
                    {#if msg.siblingCount > 1}
                      <button
                        type="button"
                        onclick={() => swipeSibling(msg.id, 'prev')}
                        disabled={msg.siblingIndex === 0}
                        class="flex h-7 w-7 items-center justify-center rounded-lg border border-(--chrome-line) bg-(--chrome-surface) text-(--chrome-text) hover:border-accent/40 disabled:opacity-30 transition-colors"
                        title="Previous swipe sibling"
                      >
                        <Icon name="chevron-left" size={13} />
                      </button>
                      <button
                        type="button"
                        onclick={() => swipeSibling(msg.id, 'next')}
                        disabled={msg.siblingIndex === msg.siblingCount - 1}
                        class="flex h-7 w-7 items-center justify-center rounded-lg border border-(--chrome-line) bg-(--chrome-surface) text-(--chrome-text) hover:border-accent/40 disabled:opacity-30 transition-colors"
                        title="Next swipe sibling"
                      >
                        <Icon name="chevron-right" size={13} />
                      </button>
                    {/if}

                    {#if msg.role === 'assistant' && msg.parentId !== null}
                      <button
                        type="button"
                        onclick={() => regenerateMessage(msg.id)}
                        disabled={isGenerating}
                        class="flex h-7 w-7 items-center justify-center rounded-lg border border-(--chrome-line) bg-(--chrome-surface) text-(--chrome-text) hover:border-accent/40 disabled:opacity-30 transition-colors"
                        title="Regenerate this turn"
                      >
                        <Icon name="regenerate" size={13} />
                      </button>
                    {/if}

                    {#if msg.role === 'assistant' && msg.id === currentChat.activeLeafId}
                      <button
                        type="button"
                        onclick={() => continueMessage(msg.id)}
                        disabled={isGenerating}
                        class="flex h-7 w-7 items-center justify-center rounded-lg border border-(--chrome-line) bg-(--chrome-surface) text-accent hover:border-accent/40 disabled:opacity-30 transition-colors"
                        title="Continue generating from leaf"
                      >
                        <Icon name="continue" size={12} />
                      </button>
                    {/if}

                    <button
                      type="button"
                      onclick={() => deleteMessage(msg.id)}
                      disabled={isGenerating}
                      class="flex h-7 w-7 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 disabled:opacity-30 transition-colors"
                      title="Delete message and descendants"
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </div>

                {#if msg.metadata.directorNote}
                  <div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300">
                    🎬 <em class="font-medium">Director's Note:</em> {msg.metadata.directorNote}
                  </div>
                {/if}

                <!-- Monospaced code block for content -->
                <pre class="rounded-xl border border-(--chrome-line) bg-(--chrome-bg) p-3 font-mono text-xs text-(--chrome-text) whitespace-pre-wrap overflow-x-auto selection:bg-accent/30">{msg.content}</pre>

                {#if msg.segments && msg.segments.length > 0}
                  <div class="text-[11px] text-(--chrome-text)/60">
                    <span class="font-medium text-(--chrome-text)/80">Entities:</span> {msg.segments.map((s) => `${s.kind}${s.name ? `[${s.name}]` : ''}`).join(', ')}
                  </div>
                {/if}

                {#if msg.state}
                  <div class="text-[11px] text-accent font-mono">
                    <span class="font-medium">State:</span> <code>{JSON.stringify(msg.state)}</code>
                  </div>
                {/if}

                {#if msg.metrics}
                  <div class="text-[10px] font-mono text-(--chrome-text)/40">
                    {msg.metrics.provider}/{msg.metrics.model} · {msg.metrics.durationMs}ms · prompt: {msg.metrics.promptTokens ?? msg.metrics.promptTokensEstimated} · comp: {msg.metrics.completionTokens ?? 0}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>

        <!-- 4. Live Streaming Turn Display -->
        {#if isGenerating}
          <div class="rounded-2xl border-2 border-accent bg-accent/10 p-4 space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="relative flex h-2.5 w-2.5">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent"></span>
                </span>
                <strong class="text-xs font-semibold text-(--chrome-text)">Live Generation Stream ({streamTokensCount} tokens)</strong>
              </div>
              <button
                type="button"
                onclick={stopGeneration}
                class="inline-flex items-center gap-1.5 rounded-xl bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600 transition-colors shadow-sm"
              >
                <Icon name="stop" size={12} />
                <span>Stop</span>
              </button>
            </div>

            <p class="text-xs italic text-(--chrome-text)/80">{streamStatusText}</p>
            <pre class="max-h-64 overflow-y-auto rounded-xl border border-accent/40 bg-(--chrome-bg) p-3 font-mono text-xs text-(--chrome-text) whitespace-pre-wrap">{streamingBuffer}</pre>

            {#if streamingParsed}
              <details class="rounded-xl border border-(--chrome-line) bg-(--chrome-surface)/80 p-2.5">
                <summary class="cursor-pointer text-xs font-semibold text-accent select-none">Live Isomorphic Parser Diagnostics</summary>
                <pre class="mt-2 rounded-lg border border-(--chrome-line) bg-(--chrome-bg) p-2 text-[11px] font-mono text-(--chrome-text) overflow-x-auto">{JSON.stringify({
                  dialect: streamingParsed.dialect,
                  adherent: streamingParsed.adherent,
                  segments: streamingParsed.segments.map(s => [s.kind, s.name, s.text.slice(0, 40)]),
                  statePatch: streamingParsed.statePatch,
                  truncatedAt: streamingParsed.truncatedAt,
                  heldBack: streamingParsed.heldBack
                }, null, 2)}</pre>
              </details>
            {/if}
          </div>
        {/if}

        <!-- 5. Send Turn Box -->
        <div class="rounded-2xl border border-(--chrome-line) bg-(--chrome-surface)/40 p-4 space-y-4">
          <h3 class="text-xs font-bold uppercase tracking-wider text-(--chrome-text)/90">Send Turn</h3>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-(--chrome-text)/80">
                <span class="mb-1 block">Narrative Role</span>
                <select bind:value={inputNarrativeRole} class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-1.5 text-xs text-(--chrome-text) focus:border-accent focus:outline-none">
                  <option value="persona">Persona (User)</option>
                  <option value="narrator">Narrator</option>
                  <option value="npc">NPC</option>
                  <option value="character">Primary Character</option>
                </select>
              </label>
            </div>

            {#if inputNarrativeRole === 'npc'}
              <div>
                <label class="block text-xs font-medium text-(--chrome-text)/80">
                  <span class="mb-1 block">NPC Name</span>
                  <input
                    type="text"
                    bind:value={inputSenderName}
                    placeholder="e.g. Guard Captain"
                    class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-1.5 text-xs text-(--chrome-text) focus:border-accent focus:outline-none"
                  />
                </label>
              </div>
            {/if}
          </div>

          <div>
            <label class="block text-xs font-medium text-(--chrome-text)/80">
              <span class="mb-1 block">Director's Note (optional guidance for this turn)</span>
              <input
                type="text"
                bind:value={inputDirectorNote}
                placeholder="e.g. Make it tense and reveal the secret"
                class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-1.5 text-xs text-(--chrome-text) focus:border-accent focus:outline-none"
              />
            </label>
          </div>

          <div>
            <label class="block text-xs font-medium text-(--chrome-text)/80">
              <span class="mb-1 block">Message Content</span>
              <textarea
                bind:value={inputMessage}
                placeholder="Type message content here (or leave blank to send only director note)…"
                rows="3"
                class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) p-3 text-xs text-(--chrome-text) focus:border-accent focus:outline-none resize-y"
              ></textarea>
            </label>
          </div>

          <div class="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onclick={() => sendMessage(true)}
              disabled={isGenerating}
              class="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-contrast hover:bg-accent/90 disabled:opacity-50 transition-colors shadow-sm"
            >
              <Icon name="send" size={13} />
              <span>Send & Stream</span>
            </button>
            <button
              type="button"
              onclick={() => sendMessage(false)}
              disabled={isGenerating}
              class="inline-flex items-center gap-1.5 rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3.5 py-2 text-xs font-medium text-(--chrome-text) hover:border-accent/40 disabled:opacity-50 transition-colors"
            >
              <span>Insert User Turn Only (no gen)</span>
            </button>

            {#if currentChat.activeGenerationMessageId}
              <button
                type="button"
                onclick={() => reattachStream(currentChat!.activeGenerationMessageId!)}
                class="inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-3.5 py-2 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
              >
                <span>🔗 Reattach Stream</span>
              </button>
            {/if}
          </div>
        </div>

        <!-- 6. Scene State Override Panel -->
        <details class="group rounded-2xl border border-(--chrome-line) bg-(--chrome-surface)/40 p-4 transition-colors">
          <summary class="flex cursor-pointer items-center justify-between text-xs font-semibold text-(--chrome-text) select-none">
            <span>Override Scene State (PATCH /api/chats/:id/state)</span>
            <span class="text-xs text-(--chrome-text)/60 group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div class="mt-3 space-y-3 pt-3 border-t border-(--chrome-line)">
            <p class="text-xs text-(--chrome-text)/70">
              Provide a JSON state patch to override the active scene state.
            </p>
            <textarea
              bind:value={stateOverrideJson}
              rows="4"
              class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-bg) p-3 font-mono text-xs text-(--chrome-text) focus:border-accent focus:outline-none"
            ></textarea>
            <div class="flex items-center justify-between">
              <button
                type="button"
                onclick={applyStateOverride}
                class="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-accent-contrast hover:bg-accent/90 transition-colors"
              >
                <span>Apply Override</span>
              </button>
              {#if stateOverrideWarnings.length > 0}
                <div class="text-xs text-amber-400">
                  Warnings: {stateOverrideWarnings.join(', ')}
                </div>
              {/if}
            </div>
          </div>
        </details>
      {:else}
        <div class="rounded-2xl border border-(--chrome-line) bg-(--chrome-surface)/30 p-8 text-center">
          <p class="text-xs text-(--chrome-text)/60 italic">Please select an existing chat or create a new one above to inspect messages and generate turns.</p>
        </div>
      {/if}

      <!-- 7. Fixture Stream Diagnostics -->
      <details class="group rounded-2xl border border-(--chrome-line) bg-(--chrome-surface)/40 p-4 transition-colors">
        <summary class="flex cursor-pointer items-center justify-between text-xs font-semibold text-(--chrome-text) select-none">
          <div class="flex items-center gap-2">
            <Icon name="sparkles" size={14} class="text-accent" />
            <span>Diagnostic Fixture Stream (/api/chat/test-stream)</span>
          </div>
          <span class="text-xs text-(--chrome-text)/60 group-open:rotate-180 transition-transform">▼</span>
        </summary>
        <div class="mt-4 pt-4 border-t border-(--chrome-line) space-y-3">
          <div class="flex flex-wrap items-center gap-3">
            <label class="flex items-center gap-2 text-xs text-(--chrome-text)/80">
              <span>Script:</span>
              <select
                bind:value={selectedScript}
                disabled={testStreamStatus === 'streaming'}
                class="rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-1.5 text-xs text-(--chrome-text) focus:border-accent focus:outline-none font-mono"
              >
                {#each ENVELOPE_SCRIPT_IDS as id}
                  <option value={id}>{id}</option>
                {/each}
              </select>
            </label>
            <button
              type="button"
              onclick={runTestStream}
              disabled={testStreamStatus === 'streaming'}
              class="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-contrast hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              <span>Run Test Stream</span>
            </button>
            <div class="text-xs font-mono text-(--chrome-text)/70">
              Status: <span class="text-accent">{testStreamStatus}</span> | Deltas: {testStreamDeltas.join(', ')}
            </div>
          </div>

          {#if testStreamText}
            <pre class="max-h-64 overflow-y-auto rounded-xl border border-(--chrome-line) bg-(--chrome-bg) p-3 font-mono text-xs text-(--chrome-text) whitespace-pre-wrap">{testStreamText}</pre>
          {/if}

          {#if testStreamParsed}
            <pre class="rounded-xl border border-(--chrome-line) bg-(--chrome-bg) p-3 font-mono text-xs text-(--chrome-text) overflow-x-auto">{JSON.stringify({
              dialect: testStreamParsed.dialect,
              segments: testStreamParsed.segments.map(s => [s.kind, s.name, s.text.slice(0, 30)]),
              statePatch: testStreamParsed.statePatch,
              truncatedAt: testStreamParsed.truncatedAt
            }, null, 2)}</pre>
          {/if}
        </div>
      </details>
    </main>
  {/if}
</ShellSurface>

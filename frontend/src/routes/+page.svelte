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

  // Test Stream (Phase 0 / Phase 2 fixture runner)
  let selectedScript = $state<EnvelopeScriptId>('envelope-directive');
  let testStreamText = $state<string>('');
  let testStreamStatus = $state<string>('idle');
  let testStreamDeltas = $state<number[]>([]);
  let testStreamParsed = $state<ParseResult | null>(null);

  onMount(async () => {
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
      // Invariant S4: Final DB message replaces local buffer
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

<h1>FormaTavern Workbench (Phase 3 Bare Canvas)</h1>
<p><strong>Health:</strong> {health} <button onclick={refreshHealth}>Check</button></p>

<!-- Settings Drawer -->
<details style="margin-bottom: 1.5rem; border: 1px solid #ccc; padding: 0.5rem;">
  <summary><strong>⚙️ Settings & Secrets (Masked per S8)</strong></summary>
  {#if settings}
    <div style="margin-top: 0.5rem;">
      <label>
        Provider:
        <select
          value={settings.provider.id}
          onchange={(e) => patchSettings({ provider: { id: (e.target as HTMLSelectElement).value } })}
        >
          <option value="mock">Mock LLM (deterministic fixtures)</option>
          <option value="openrouter">OpenRouter (upstream API)</option>
        </select>
      </label>

      <label style="margin-left: 1rem;">
        Model:
        <input
          type="text"
          value={settings.provider.model ?? ''}
          placeholder={settings.provider.id === 'openrouter' ? 'anthropic/claude-3.5-haiku' : 'mock:envelope-directive'}
          onblur={(e) => patchSettings({ provider: { model: (e.target as HTMLInputElement).value || null } })}
        />
      </label>
    </div>

    <div style="margin-top: 0.5rem;">
      <label>
        OpenRouter API Key:
        <input
          type="password"
          bind:value={newApiKey}
          placeholder={settings.openrouter.apiKeySet ? `•••••••• (${settings.openrouter.apiKeyHint}) [${settings.openrouter.source}]` : 'None configured'}
        />
      </label>
      <button onclick={() => patchSettings({ openrouter: { apiKey: newApiKey } })} disabled={!newApiKey.trim()}>
        Set Key
      </button>
      {#if settings.openrouter.apiKeySet}
        <button onclick={() => patchSettings({ openrouter: { apiKey: null } })}>Clear Key</button>
      {/if}
    </div>

    <div style="margin-top: 0.5rem;">
      <label>
        Temperature:
        <input
          type="number"
          step="0.1"
          min="0"
          max="2"
          value={settings.generation.temperature}
          onchange={(e) => patchSettings({ generation: { temperature: parseFloat((e.target as HTMLInputElement).value) } })}
        />
      </label>
      <label style="margin-left: 1rem;">
        Max Tokens:
        <input
          type="number"
          step="128"
          min="16"
          max="32000"
          value={settings.generation.maxTokens}
          onchange={(e) => patchSettings({ generation: { maxTokens: parseInt((e.target as HTMLInputElement).value, 10) } })}
        />
      </label>
      <label style="margin-left: 1rem;">
        Context Length:
        <input
          type="number"
          step="1024"
          min="1024"
          value={settings.generation.contextLength}
          onchange={(e) => patchSettings({ generation: { contextLength: parseInt((e.target as HTMLInputElement).value, 10) } })}
        />
      </label>
    </div>

    {#if settingsStatus}
      <p><em>{settingsStatus}</em></p>
    {/if}
  {:else}
    <p>Loading settings…</p>
  {/if}
</details>

<hr />

<!-- Chat Selector & Creator -->
<div style="margin-bottom: 1rem;">
  <label>
    <strong>Character:</strong>
    <select bind:value={selectedCharacterId}>
      {#each characters as char}
        <option value={char.id}>{char.name} ({char.id})</option>
      {/each}
    </select>
  </label>
  <button onclick={createChat} disabled={!selectedCharacterId}>New Chat</button>

  <label style="margin-left: 2rem;">
    <strong>Active Chat:</strong>
    <select
      value={selectedChatId}
      onchange={(e) => selectChat((e.target as HTMLSelectElement).value)}
    >
      <option value="">-- select chat --</option>
      {#each chats as c}
        <option value={c.id}>{c.title} ({c.id.slice(-6)}) [msgs: {c.messageCount}]</option>
      {/each}
    </select>
  </label>

  {#if currentChat}
    <button onclick={() => deleteChat(currentChat!.id)} style="color: red; margin-left: 0.5rem;">
      Delete Chat
    </button>
  {/if}
</div>

{#if currentChat}
  <div style="background: #f4f4f5; padding: 0.5rem; margin-bottom: 1rem; border-radius: 4px;">
    <strong>Chat Details:</strong> Mode: <code>{currentChat.metadata.narrativeMode}</code> | Dialect: <code>{currentChat.metadata.envelopeDialect}</code> | Active Leaf: <code>{currentChat.activeLeafId ?? 'none'}</code>
    <br />
    <strong>Current Scene State:</strong> <code>{JSON.stringify(currentChat.metadata.currentState ?? {})}</code>
  </div>

  <!-- Messages List (Active Branch) -->
  <h2>Active Branch Messages ({messages.length})</h2>
  <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem;">
    {#each messages as msg}
      <div style="border: 1px solid #ddd; padding: 0.5rem; background: {msg.role === 'user' ? '#f0f9ff' : '#fafafa'};">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
          <div>
            <strong>[{msg.siblingIndex + 1}/{msg.siblingCount}]</strong>
            <em>{msg.role}</em>
            {#if msg.senderName}
              ({msg.narrativeRole}: <strong>{msg.senderName}</strong>)
            {:else}
              ({msg.narrativeRole})
            {/if}
            {#if msg.id === currentChat.activeLeafId}
              <span style="background: #22c55e; color: white; padding: 1px 4px; font-size: 0.75rem; border-radius: 2px;">ACTIVE LEAF</span>
            {/if}
          </div>

          <div>
            <!-- Sibling Swipes -->
            {#if msg.siblingCount > 1}
              <button
                onclick={() => swipeSibling(msg.id, 'prev')}
                disabled={msg.siblingIndex === 0}
                title="Previous swipe sibling"
              >
                ◀
              </button>
              <button
                onclick={() => swipeSibling(msg.id, 'next')}
                disabled={msg.siblingIndex === msg.siblingCount - 1}
                title="Next swipe sibling"
              >
                ▶
              </button>
            {/if}

            <!-- Regenerate (assistant turns) -->
            {#if msg.role === 'assistant' && msg.parentId !== null}
              <button onclick={() => regenerateMessage(msg.id)} disabled={isGenerating} title="Regenerate this turn">
                ↻
              </button>
            {/if}

            <!-- Continue (leaf assistant turns) -->
            {#if msg.role === 'assistant' && msg.id === currentChat.activeLeafId}
              <button onclick={() => continueMessage(msg.id)} disabled={isGenerating} title="Continue generating from leaf">
                ⏵
              </button>
            {/if}

            <!-- Delete Turn -->
            <button onclick={() => deleteMessage(msg.id)} disabled={isGenerating} title="Delete message and descendants" style="color: red;">
              ✕
            </button>
          </div>
        </div>

        {#if msg.metadata.directorNote}
          <div style="font-size: 0.85rem; color: #b45309; margin-bottom: 0.25rem;">
            🎬 <em>Director's Note:</em> {msg.metadata.directorNote}
          </div>
        {/if}

        <pre style="white-space: pre-wrap; margin: 0; background: white; padding: 0.5rem; border: 1px solid #eee;">{msg.content}</pre>

        {#if msg.segments && msg.segments.length > 0}
          <div style="font-size: 0.8rem; color: #666; margin-top: 0.25rem;">
            Entities: {msg.segments.map((s) => `${s.kind}${s.name ? `[${s.name}]` : ''}`).join(', ')}
          </div>
        {/if}

        {#if msg.state}
          <div style="font-size: 0.8rem; color: #0284c7; margin-top: 0.15rem;">
            State: {JSON.stringify(msg.state)}
          </div>
        {/if}

        {#if msg.metrics}
          <div style="font-size: 0.75rem; color: #71717a; margin-top: 0.15rem;">
            {msg.metrics.provider}/{msg.metrics.model} · {msg.metrics.durationMs}ms · prompt: {msg.metrics.promptTokens ?? msg.metrics.promptTokensEstimated} · comp: {msg.metrics.completionTokens ?? 0}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Live Streaming Turn Display -->
  {#if isGenerating}
    <div style="border: 2px solid #3b82f6; padding: 0.75rem; background: #eff6ff; margin-bottom: 1.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong>📡 Live Generation Stream ({streamTokensCount} tokens)</strong>
        <button onclick={stopGeneration} style="background: #ef4444; color: white; font-weight: bold;">
          ⏹ Stop
        </button>
      </div>

      <p style="margin: 0.25rem 0;"><em>{streamStatusText}</em></p>
      <pre style="white-space: pre-wrap; background: white; padding: 0.5rem; border: 1px solid #bfdbfe; max-height: 250px; overflow-y: auto;">{streamingBuffer}</pre>

      {#if streamingParsed}
        <details style="margin-top: 0.5rem;">
          <summary>Live Isomorphic Parser Diagnostics</summary>
          <pre style="font-size: 0.8rem;">{JSON.stringify({
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

  <!-- Send Input Form -->
  <div style="border: 1px solid #ccc; padding: 0.75rem; margin-bottom: 1.5rem;">
    <h3>Send Turn</h3>
    <div style="margin-bottom: 0.5rem;">
      <label>
        Narrative Role:
        <select bind:value={inputNarrativeRole}>
          <option value="persona">Persona (User)</option>
          <option value="narrator">Narrator</option>
          <option value="npc">NPC</option>
          <option value="character">Primary Character</option>
        </select>
      </label>

      {#if inputNarrativeRole === 'npc'}
        <label style="margin-left: 1rem;">
          NPC Name:
          <input type="text" bind:value={inputSenderName} placeholder="e.g. Guard Captain" />
        </label>
      {/if}
    </div>

    <div style="margin-bottom: 0.5rem;">
      <label>
        Director's Note (optional guidance for this turn):
        <input
          type="text"
          bind:value={inputDirectorNote}
          placeholder="e.g. Make it tense and reveal the secret"
          style="width: 100%; box-sizing: border-box;"
        />
      </label>
    </div>

    <div style="margin-bottom: 0.5rem;">
      <textarea
        bind:value={inputMessage}
        placeholder="Type message content here (or leave blank to send only director note)…"
        rows="3"
        style="width: 100%; box-sizing: border-box;"
      ></textarea>
    </div>

    <div style="display: flex; gap: 0.5rem;">
      <button onclick={() => sendMessage(true)} disabled={isGenerating} style="font-weight: bold;">
        Send & Stream
      </button>
      <button onclick={() => sendMessage(false)} disabled={isGenerating}>
        Insert User Turn Only (no gen)
      </button>

      {#if currentChat.activeGenerationMessageId}
        <button onclick={() => reattachStream(currentChat!.activeGenerationMessageId!)}>
          🔗 Reattach Stream
        </button>
      {/if}
    </div>
  </div>

  <!-- State Override Panel -->
  <details style="border: 1px solid #ccc; padding: 0.5rem; margin-bottom: 1.5rem;">
    <summary><strong>Override Scene State (PATCH /api/chats/:id/state)</strong></summary>
    <p style="font-size: 0.85rem; color: #555; margin: 0.25rem 0;">
      Provide a JSON state patch to override the active scene state.
    </p>
    <textarea bind:value={stateOverrideJson} rows="4" style="width: 100%; font-family: monospace;"></textarea>
    <br />
    <button onclick={applyStateOverride} style="margin-top: 0.25rem;">Apply Override</button>
    {#if stateOverrideWarnings.length > 0}
      <div style="color: #b45309; font-size: 0.85rem; margin-top: 0.25rem;">
        Warnings: {stateOverrideWarnings.join(', ')}
      </div>
    {/if}
  </details>
{:else}
  <p><em>Please select an existing chat or create a new one to begin.</em></p>
{/if}

<hr />

<!-- Phase 0/2 Fixture Stream Diagnostics -->
<details>
  <summary><strong>🧪 Diagnostic Fixture Stream (/api/chat/test-stream)</strong></summary>
  <div style="margin-top: 0.5rem;">
    <label>
      Script:
      <select bind:value={selectedScript} disabled={testStreamStatus === 'streaming'}>
        {#each ENVELOPE_SCRIPT_IDS as id}
          <option value={id}>{id}</option>
        {/each}
      </select>
    </label>
    <button onclick={runTestStream} disabled={testStreamStatus === 'streaming'}>
      Run test stream
    </button>
    <p>Status: {testStreamStatus} | Deltas: {testStreamDeltas.join(', ')}</p>
    <pre style="white-space: pre-wrap; background: #fafafa; padding: 0.5rem; border: 1px solid #eee;">{testStreamText}</pre>
    {#if testStreamParsed}
      <pre style="font-size: 0.8rem;">{JSON.stringify({
        dialect: testStreamParsed.dialect,
        segments: testStreamParsed.segments.map(s => [s.kind, s.name, s.text.slice(0, 30)]),
        statePatch: testStreamParsed.statePatch,
        truncatedAt: testStreamParsed.truncatedAt
      }, null, 2)}</pre>
    {/if}
  </div>
</details>

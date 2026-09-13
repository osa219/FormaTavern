<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import Kbd from '../ui/Kbd.svelte';
  import Spinner from '../ui/Spinner.svelte';
  import { settingsStore } from '$lib/state/settings.svelte';
  import { prefs } from '$lib/state/prefs.svelte';
  import { shellTheme } from '$lib/state/shellTheme.svelte';
  import type { SettingsPatch, ShellTheme } from '@formatavern/shared';
  import { HOOKS } from '@formatavern/shared';
  import CustomCssPanel from '../studio/CustomCssPanel.svelte';

  let {
    open = false,
    onClose
  }: {
    open: boolean;
    onClose: () => void;
  } = $props();

  let dialogEl = $state<HTMLDialogElement | null>(null);
  let activeTab = $state<'provider' | 'appearance' | 'generation' | 'narrative' | 'a11y' | 'shortcuts'>('provider');

  const ACCENT_PRESETS = ['#38bdf8', '#818cf8', '#a855f7', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#10b981', '#14b8a6'];
  const RADIUS_PRESETS = ['0px', '0.5rem', '1rem', '1.5rem', '2rem'];

  // OpenRouter key draft
  let apiKeyDraft = $state('');
  let apiKeySavedNotice = $state(false);

  // Custom provider drafts
  let customBaseUrlDraft = $state('');
  let customKeyDraft = $state('');

  // Gemini key draft
  let geminiKeyDraft = $state('');

  // Surface Accent Tint draft
  let tintDraft = $state<number>(0);

  $effect(() => {
    if (shellTheme.theme.tint) {
      const parsed = parseInt(shellTheme.theme.tint, 10);
      tintDraft = isNaN(parsed) ? 0 : parsed;
    } else {
      tintDraft = 0;
    }
  });

  // Debounce timers for numeric inputs
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let shellDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  function queueShellPatch(patch: Partial<ShellTheme>, delay = 400) {
    shellTheme.theme = {
      ...shellTheme.theme,
      ...patch
    };
    if (shellDebounceTimer) clearTimeout(shellDebounceTimer);
    shellDebounceTimer = setTimeout(() => {
      shellTheme.save(shellTheme.theme);
    }, delay);
  }

  $effect(() => {
    if (open) {
      if (!settingsStore.settings && !settingsStore.loading) {
        settingsStore.load();
      }
      if (dialogEl && !dialogEl.open) {
        dialogEl.showModal();
      }
    } else {
      if (dialogEl && dialogEl.open) {
        dialogEl.close();
      }
    }
  });

  function queuePatch(patch: SettingsPatch, delay = 400) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      settingsStore.patch(patch);
    }, delay);
  }

  async function handleSaveApiKey() {
    if (!apiKeyDraft.trim()) return;
    await settingsStore.patch({
      openrouter: { apiKey: apiKeyDraft.trim() }
    });
    apiKeyDraft = '';
    apiKeySavedNotice = true;
    setTimeout(() => {
      apiKeySavedNotice = false;
    }, 2500);
  }

  async function handleClearApiKey() {
    await settingsStore.patch({
      openrouter: { apiKey: null }
    });
    apiKeyDraft = '';
  }

  async function handleSaveCustomBaseUrl() {
    if (!customBaseUrlDraft.trim()) return;
    await settingsStore.patch({
      custom: { baseUrl: customBaseUrlDraft.trim() }
    });
    customBaseUrlDraft = '';
    apiKeySavedNotice = true;
    setTimeout(() => {
      apiKeySavedNotice = false;
    }, 2500);
  }

  async function handleSaveCustomKey() {
    if (!customKeyDraft.trim()) return;
    await settingsStore.patch({
      custom: { apiKey: customKeyDraft.trim() }
    });
    customKeyDraft = '';
    apiKeySavedNotice = true;
    setTimeout(() => {
      apiKeySavedNotice = false;
    }, 2500);
  }

  async function handleClearCustomKey() {
    await settingsStore.patch({
      custom: { apiKey: null }
    });
    customKeyDraft = '';
  }

  async function handleSaveGeminiKey() {
    if (!geminiKeyDraft.trim()) return;
    await settingsStore.patch({
      gemini: { apiKey: geminiKeyDraft.trim() }
    });
    geminiKeyDraft = '';
    apiKeySavedNotice = true;
    setTimeout(() => {
      apiKeySavedNotice = false;
    }, 2500);
  }

  async function handleClearGeminiKey() {
    await settingsStore.patch({
      gemini: { apiKey: null }
    });
    geminiKeyDraft = '';
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

  const s = $derived(settingsStore.settings);
</script>

<dialog
  bind:this={dialogEl}
  oncancel={handleCancel}
  onclick={handleBackdropClick}
  class="fixed inset-0 m-auto hidden open:flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-(--chrome-line) bg-(--chrome-surface) p-6 text-(--chrome-text) shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm max-sm:bottom-0 max-sm:top-auto max-sm:max-h-[90vh] max-sm:max-w-none max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 {HOOKS.shell.settings}"
  aria-labelledby="settings-title"
>
  <!-- Header -->
  <div class="mb-4 flex items-center justify-between border-b border-(--chrome-line) pb-3">
    <div class="flex items-center gap-2">
      <Icon name="settings" size={18} class="text-(--chrome-text)/60" />
      <h2 id="settings-title" class="text-base font-semibold text-(--chrome-text)">
        Settings
      </h2>
      {#if settingsStore.saving}
        <div class="flex items-center gap-1 text-xs text-(--chrome-text)/60">
          <Spinner size={12} />
          <span>Saving…</span>
        </div>
      {/if}
    </div>
    <button
      type="button"
      onclick={onClose}
      class="rounded-lg p-1 text-(--chrome-text)/60 hover:bg-(--chrome-line)/40 hover:text-(--chrome-text)"
      aria-label="Close settings"
    >
      <Icon name="close" size={16} />
    </button>
  </div>

  <!-- Tabs -->
  <div class="mb-5 flex border-b border-(--chrome-line) text-xs font-medium text-(--chrome-text)/60">
    <button
      type="button"
      onclick={() => (activeTab = 'provider')}
      class="border-b-2 px-3.5 py-2 transition-colors hover:text-(--chrome-text)"
      class:border-accent={activeTab === 'provider'}
      class:text-(--chrome-text)={activeTab === 'provider'}
      class:border-transparent={activeTab !== 'provider'}
    >
      Provider
    </button>
    <button
      type="button"
      onclick={() => (activeTab = 'appearance')}
      class="border-b-2 px-3.5 py-2 transition-colors hover:text-(--chrome-text)"
      class:border-accent={activeTab === 'appearance'}
      class:text-(--chrome-text)={activeTab === 'appearance'}
      class:border-transparent={activeTab !== 'appearance'}
    >
      Appearance
    </button>
    <button
      type="button"
      onclick={() => (activeTab = 'generation')}
      class="border-b-2 px-3.5 py-2 transition-colors hover:text-(--chrome-text)"
      class:border-accent={activeTab === 'generation'}
      class:text-(--chrome-text)={activeTab === 'generation'}
      class:border-transparent={activeTab !== 'generation'}
    >
      Generation
    </button>
    <button
      type="button"
      onclick={() => (activeTab = 'narrative')}
      class="border-b-2 px-3.5 py-2 transition-colors hover:text-(--chrome-text)"
      class:border-accent={activeTab === 'narrative'}
      class:text-(--chrome-text)={activeTab === 'narrative'}
      class:border-transparent={activeTab !== 'narrative'}
    >
      Narrative
    </button>
    <button
      type="button"
      onclick={() => (activeTab = 'a11y')}
      class="border-b-2 px-3.5 py-2 transition-colors hover:text-(--chrome-text)"
      class:border-accent={activeTab === 'a11y'}
      class:text-(--chrome-text)={activeTab === 'a11y'}
      class:border-transparent={activeTab !== 'a11y'}
    >
      Accessibility
    </button>
    <button
      type="button"
      onclick={() => (activeTab = 'shortcuts')}
      class="border-b-2 px-3.5 py-2 transition-colors hover:text-(--chrome-text)"
      class:border-accent={activeTab === 'shortcuts'}
      class:text-(--chrome-text)={activeTab === 'shortcuts'}
      class:border-transparent={activeTab !== 'shortcuts'}
    >
      Shortcuts
    </button>
  </div>

  <!-- Body -->
  <div class="flex-1 overflow-y-auto pr-1 text-xs text-(--chrome-text)/80">
    {#if activeTab === 'a11y'}
      <div class="flex flex-col gap-4">
        <p class="text-[11px] text-(--chrome-text)/60">
          Accessibility and display preferences are stored locally on this device.
        </p>

        <!-- Disable Character Themes -->
        <label class="flex items-center justify-between rounded-xl border border-(--chrome-line) bg-(--chrome-bg)/50 p-3 cursor-pointer hover:bg-(--chrome-line)/30">
          <div>
            <div class="font-medium text-(--chrome-text)">Disable Character Themes</div>
            <div class="text-[11px] text-(--chrome-text)/60">Forces neutral high-contrast A11Y theme across all chats</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.disableCharacterThemes}
            onchange={(e) => {
              prefs.disableCharacterThemes = e.currentTarget.checked;
              prefs.save();
            }}
            class="h-4 w-4 rounded border-(--chrome-line) bg-(--chrome-surface) accent-accent focus:ring-accent"
          />
        </label>

        <!-- Hide Custom Styling -->
        <label class="flex items-center justify-between rounded-xl border border-(--chrome-line) bg-(--chrome-bg)/50 p-3 cursor-pointer hover:bg-(--chrome-line)/30">
          <div>
            <div class="font-medium text-(--chrome-text)">Hide Custom Styling</div>
            <div class="text-[11px] text-(--chrome-text)/60">Hides creator-authored custom CSS across cards and chats</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.hideCustomStyling}
            onchange={(e) => {
              prefs.hideCustomStyling = e.currentTarget.checked;
              prefs.save();
            }}
            class="h-4 w-4 rounded border-(--chrome-line) bg-(--chrome-surface) accent-accent focus:ring-accent"
          />
        </label>

        <!-- Disable Reactive Theming -->
        <label class="flex items-center justify-between rounded-xl border border-(--chrome-line) bg-(--chrome-bg)/50 p-3 cursor-pointer hover:bg-(--chrome-line)/30">
          <div>
            <div class="font-medium text-(--chrome-text)">Disable Reactive Theming</div>
            <div class="text-[11px] text-(--chrome-text)/60">Keeps base character theme static without live scene state bindings</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.disableReactiveTheming}
            onchange={(e) => {
              prefs.disableReactiveTheming = e.currentTarget.checked;
              prefs.save();
            }}
            class="h-4 w-4 rounded border-(--chrome-line) bg-(--chrome-surface) accent-accent focus:ring-accent"
          />
        </label>

        <!-- Enter to Send -->
        <label class="flex items-center justify-between rounded-xl border border-(--chrome-line) bg-(--chrome-bg)/50 p-3 cursor-pointer hover:bg-(--chrome-line)/30">
          <div>
            <div class="font-medium text-(--chrome-text)">Enter Key Sends Message</div>
            <div class="text-[11px] text-(--chrome-text)/60">Press Enter to send, Shift+Enter for new lines</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.enterToSend}
            onchange={(e) => {
              prefs.enterToSend = e.currentTarget.checked;
              prefs.save();
            }}
            class="h-4 w-4 rounded border-(--chrome-line) bg-(--chrome-surface) accent-accent focus:ring-accent"
          />
        </label>

        <!-- Reduce Motion -->
        <div class="flex items-center justify-between rounded-xl border border-(--chrome-line) bg-(--chrome-bg)/50 p-3">
          <div>
            <div class="font-medium text-(--chrome-text)">Reduced Motion</div>
            <div class="text-[11px] text-(--chrome-text)/60">Controls transitions and stream animations</div>
          </div>
          <select
            value={prefs.reducedMotion}
            onchange={(e) => {
              prefs.reducedMotion = e.currentTarget.value as any;
              prefs.save();
            }}
            class="rounded-lg border border-(--chrome-line) bg-(--chrome-surface) px-2.5 py-1 text-xs text-(--chrome-text)"
          >
            <option value="system">Follow OS</option>
            <option value="on">Always reduce</option>
            <option value="off">Allow motion</option>
          </select>
        </div>

        <!-- Dev Mode -->
        <label class="flex items-center justify-between rounded-xl border border-(--chrome-line) bg-(--chrome-bg)/50 p-3 cursor-pointer hover:bg-(--chrome-line)/30">
          <div>
            <div class="font-medium text-(--chrome-text)">Developer Diagnostics Overlay</div>
            <div class="text-[11px] text-(--chrome-text)/60">Shows frame cost, commit counts, and raw envelope inspector</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.devMode}
            onchange={(e) => {
              prefs.devMode = e.currentTarget.checked;
              prefs.save();
            }}
            class="h-4 w-4 rounded border-(--chrome-line) bg-(--chrome-surface) accent-accent focus:ring-accent"
          />
        </label>
      </div>
    {:else if activeTab === 'shortcuts'}
      <div class="flex flex-col gap-3">
        <p class="text-[11px] text-(--chrome-text)/60">
          FormaTavern keyboard shortcuts designed for fluid, keyboard-first storytelling.
        </p>

        <div class="grid grid-cols-[1fr_auto] items-center gap-y-2.5 border-t border-(--chrome-line) pt-3">
          <span class="text-(--chrome-text)/80">Send message</span>
          <div class="flex items-center gap-1">
            <Kbd>Enter</Kbd> <span class="text-(--chrome-text)/50">or</span> <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd>
          </div>

          <span class="text-(--chrome-text)/80">Insert newline</span>
          <div>
            <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd>
          </div>

          <span class="text-(--chrome-text)/80">Stop generation / Close modal</span>
          <div>
            <Kbd>Esc</Kbd>
          </div>

          <span class="text-(--chrome-text)/80">Previous / Next swipe on latest turn</span>
          <div class="flex items-center gap-1">
            <Kbd>Alt</Kbd>+<Kbd>←</Kbd> <span class="text-(--chrome-text)/50">/</span> <Kbd>Alt</Kbd>+<Kbd>→</Kbd>
          </div>

          <span class="text-(--chrome-text)/80">Toggle Director drawer</span>
          <div>
            <Kbd>Alt</Kbd>+<Kbd>D</Kbd>
          </div>

          <span class="text-(--chrome-text)/80">Toggle State HUD popover</span>
          <div>
            <Kbd>Alt</Kbd>+<Kbd>S</Kbd>
          </div>

          <span class="text-(--chrome-text)/80">Toggle Navigation drawer</span>
          <div>
            <Kbd>Alt</Kbd>+<Kbd>N</Kbd>
          </div>

          <span class="text-(--chrome-text)/80">Focus composer</span>
          <div>
            <Kbd>/</Kbd>
          </div>
        </div>
      </div>
    {:else if !s}
      {#if settingsStore.error}
        <div class="flex h-48 flex-col items-center justify-center gap-3 text-center">
          <p class="text-xs text-red-400">{settingsStore.error}</p>
          <button
            type="button"
            onclick={() => settingsStore.load()}
            class="rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3.5 py-1.5 text-xs font-semibold text-(--chrome-text) transition-colors hover:bg-(--chrome-line)/40"
          >
            Retry
          </button>
        </div>
      {:else}
        <div class="flex h-48 items-center justify-center">
          <Spinner size={24} class="text-(--chrome-text)/50" />
        </div>
      {/if}
    {:else if activeTab === 'provider'}
      <div class="flex flex-col gap-4">
        <!-- Provider Selector -->
        <div>
          <label for="provider-select" class="mb-1 block font-medium text-(--chrome-text)">
            LLM Provider
          </label>
          <select
            id="provider-select"
            value={s.provider.id}
            onchange={(e) => settingsStore.patch({ provider: { id: e.currentTarget.value as any } })}
            class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-(--chrome-text) focus:border-accent focus:outline-none"
          >
            <option value="mock">Mock Engine (Offline fixtures)</option>
            <option value="openrouter">OpenRouter (Online LLMs)</option>
            <option value="custom">Custom OpenAI-compatible (Base URL)</option>
            <option value="gemini">Gemini (Google AI Studio)</option>
          </select>
        </div>

        <!-- Model Name / Preset -->
        <div>
          <label for="model-input" class="mb-1 block font-medium text-(--chrome-text)">
            Model
          </label>
          {#if s.provider.id === 'mock'}
            <select
              id="model-input"
              value={s.provider.model ?? 'mock:envelope-directive'}
              onchange={(e) => settingsStore.patch({ provider: { model: e.currentTarget.value } })}
              class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-(--chrome-text) focus:border-accent focus:outline-none"
            >
              <option value="mock:envelope-directive">mock:envelope-directive (Standard narrative)</option>
              <option value="mock:envelope-xml">mock:envelope-xml (XML format)</option>
              <option value="mock:envelope-prefix">mock:envelope-prefix (Prefix format)</option>
              <option value="mock:sloppy">mock:sloppy (Messy markdown & speech)</option>
              <option value="mock:persona-violation">mock:persona-violation (Truncation test)</option>
              <option value="mock:error">mock:error (Error state test)</option>
            </select>
          {:else}
            <input
              id="model-input"
              type="text"
              value={s.provider.model ?? ''}
              placeholder={s.provider.id === 'gemini'
                ? 'e.g. gemini-3.5-flash'
                : s.provider.id === 'custom'
                  ? 'e.g. llama3.1 (model id on your server)'
                  : 'e.g. anthropic/claude-3.5-sonnet or meta-llama/llama-3.3-70b-instruct'}
              oninput={(e) => queuePatch({ provider: { model: e.currentTarget.value } })}
              class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-(--chrome-text) focus:border-accent focus:outline-none"
            />
          {/if}
        </div>

        <!-- OpenRouter API Key -->
        {#if s.provider.id === 'openrouter'}
          <div class="rounded-xl border border-(--chrome-line) bg-(--chrome-bg)/50 p-4">
            <div class="mb-2 flex items-center justify-between">
              <span class="font-medium text-(--chrome-text)">API Key</span>
              <span class="text-[11px] text-(--chrome-text)/60">
                Current: {s.openrouter.apiKeyHint ?? 'Not set'} ({s.openrouter.source})
              </span>
            </div>
            <div class="flex gap-2">
              <input
                type="password"
                bind:value={apiKeyDraft}
                placeholder="Enter new OpenRouter key (sk-or-...)"
                class="flex-1 rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-(--chrome-text) focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onclick={handleSaveApiKey}
                disabled={!apiKeyDraft.trim()}
                class="rounded-xl bg-accent px-3.5 py-2 font-semibold text-accent-contrast transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                Save
              </button>
              {#if s.openrouter.apiKeySet}
                <button
                  type="button"
                  onclick={handleClearApiKey}
                  class="rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-(--chrome-text)/60 transition-colors hover:bg-red-950/40 hover:text-red-300"
                >
                  Clear Key
                </button>
              {/if}
            </div>
            {#if apiKeySavedNotice}
              <p class="mt-2 text-[11px] text-accent">API key saved securely.</p>
            {/if}
          </div>
        {/if}

        <!-- Custom provider endpoint + key -->
        {#if s.provider.id === 'custom'}
          <div class="rounded-xl border border-(--chrome-line) bg-(--chrome-bg)/50 p-4">
            <div class="mb-2 flex items-center justify-between">
              <span class="font-medium text-(--chrome-text)">Base URL</span>
              <span class="text-[11px] text-(--chrome-text)/60">
                Current: {s.custom.baseUrl ?? 'Not set'}
              </span>
            </div>
            <div class="flex gap-2">
              <input
                type="url"
                bind:value={customBaseUrlDraft}
                placeholder="e.g. http://localhost:11434/v1"
                class="flex-1 rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onclick={handleSaveCustomBaseUrl}
                disabled={!customBaseUrlDraft.trim()}
                class="rounded-xl bg-accent px-3.5 py-2 font-semibold text-accent-contrast transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                Save
              </button>
            </div>
            <div class="mb-2 mt-4 flex items-center justify-between">
              <span class="font-medium text-(--chrome-text)">API Key <span class="font-normal text-(--chrome-text)/60">(optional — leave empty for local servers)</span></span>
              <span class="text-[11px] text-(--chrome-text)/60">
                Current: {s.custom.apiKeyHint ?? 'Not set'} ({s.custom.source})
              </span>
            </div>
            <div class="flex gap-2">
              <input
                type="password"
                bind:value={customKeyDraft}
                placeholder="Optional key for this endpoint"
                class="flex-1 rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-(--chrome-text) focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onclick={handleSaveCustomKey}
                disabled={!customKeyDraft.trim()}
                class="rounded-xl bg-accent px-3.5 py-2 font-semibold text-accent-contrast transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                Save
              </button>
              {#if s.custom.apiKeySet}
                <button
                  type="button"
                  onclick={handleClearCustomKey}
                  class="rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-(--chrome-text)/60 transition-colors hover:bg-red-950/40 hover:text-red-300"
                >
                  Clear Key
                </button>
              {/if}
            </div>
            {#if apiKeySavedNotice}
              <p class="mt-2 text-[11px] text-accent">Custom endpoint saved.</p>
            {/if}
          </div>
        {/if}

        <!-- Gemini API Key -->
        {#if s.provider.id === 'gemini'}
          <div class="rounded-xl border border-(--chrome-line) bg-(--chrome-bg)/50 p-4">
            <div class="mb-2 flex items-center justify-between">
              <span class="font-medium text-(--chrome-text)">API Key</span>
              <span class="text-[11px] text-(--chrome-text)/60">
                Current: {s.gemini.apiKeyHint ?? 'Not set'} ({s.gemini.source})
              </span>
            </div>
            <p class="mb-2 text-[11px] text-(--chrome-text)/60">
              Get an Auth key from Google AI Studio. Uses the OpenAI-compatible endpoint.
            </p>
            <div class="flex gap-2">
              <input
                type="password"
                bind:value={geminiKeyDraft}
                placeholder="Enter new Gemini key (AI…)"
                class="flex-1 rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-(--chrome-text) focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onclick={handleSaveGeminiKey}
                disabled={!geminiKeyDraft.trim()}
                class="rounded-xl bg-accent px-3.5 py-2 font-semibold text-accent-contrast transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                Save
              </button>
              {#if s.gemini.apiKeySet}
                <button
                  type="button"
                  onclick={handleClearGeminiKey}
                  class="rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-(--chrome-text)/60 transition-colors hover:bg-red-950/40 hover:text-red-300"
                >
                  Clear Key
                </button>
              {/if}
            </div>
            {#if apiKeySavedNotice}
              <p class="mt-2 text-[11px] text-accent">API key saved securely.</p>
            {/if}
          </div>
        {/if}
      </div>
    {:else if activeTab === 'generation'}
      <div class="flex flex-col gap-4">
        <!-- Temperature -->
        <div>
          <div class="mb-1 flex justify-between text-(--chrome-text) font-medium">
            <label for="temp-slider">Temperature</label>
            <span class="font-mono text-(--chrome-text)/60">{s.generation.temperature}</span>
          </div>
          <input
            id="temp-slider"
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={s.generation.temperature}
            oninput={(e) => {
              const val = parseFloat(e.currentTarget.value);
              queuePatch({ generation: { temperature: val } });
            }}
            class="w-full accent-accent"
          />
        </div>

        <!-- Max Tokens -->
        <div>
          <div class="mb-1 flex justify-between text-(--chrome-text) font-medium">
            <label for="max-tokens">Max Tokens</label>
            <span class="font-mono text-(--chrome-text)/60">{s.generation.maxTokens}</span>
          </div>
          <input
            id="max-tokens"
            type="range"
            min="64"
            max="8192"
            step="64"
            value={s.generation.maxTokens}
            oninput={(e) => {
              const val = parseInt(e.currentTarget.value, 10);
              queuePatch({ generation: { maxTokens: val } });
            }}
            class="w-full accent-accent"
          />
        </div>

        <!-- Context Length -->
        <div>
          <label for="ctx-length" class="mb-1 block font-medium text-(--chrome-text)">
            Context Length (Tokens)
          </label>
          <input
            id="ctx-length"
            type="number"
            min="1024"
            max="128000"
            step="1024"
            value={s.generation.contextLength}
            onchange={(e) => {
              const val = parseInt(e.currentTarget.value, 10);
              if (val >= 1024) {
                settingsStore.patch({ generation: { contextLength: val } });
              }
            }}
            class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-(--chrome-text) focus:border-accent focus:outline-none"
          />
        </div>

        <!-- Top P -->
        <div>
          <div class="mb-1 flex justify-between text-(--chrome-text) font-medium">
            <label for="top-p">Top P (Nucleus Sampling)</label>
            <span class="font-mono text-(--chrome-text)/60">{s.generation.topP ?? 1}</span>
          </div>
          <input
            id="top-p"
            type="range"
            min="0.05"
            max="1"
            step="0.05"
            value={s.generation.topP ?? 1}
            oninput={(e) => {
              const val = parseFloat(e.currentTarget.value);
              queuePatch({ generation: { topP: val } });
            }}
            class="w-full accent-accent"
          />
        </div>
      </div>
    {:else if activeTab === 'narrative'}
      <div class="flex flex-col gap-4">
        <div>
          <label for="narrative-mode" class="mb-1 block font-medium text-(--chrome-text)">
            Default Narrative Mode
          </label>
          <select
            id="narrative-mode"
            value={s.narrative.defaultMode}
            onchange={(e) => settingsStore.patch({ narrative: { defaultMode: e.currentTarget.value as any } })}
            class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-(--chrome-text) focus:border-accent focus:outline-none"
          >
            <option value="narrative">Three-Track Narrative Envelope</option>
            <option value="classic">Classic Roleplay (Unenveloped prose)</option>
          </select>
        </div>

        <div>
          <label for="narrative-dialect" class="mb-1 block font-medium text-(--chrome-text)">
            Envelope Grammar Dialect
          </label>
          <select
            id="narrative-dialect"
            value={s.narrative.defaultDialect}
            onchange={(e) => settingsStore.patch({ narrative: { defaultDialect: e.currentTarget.value as any } })}
            class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-(--chrome-text) focus:border-accent focus:outline-none"
          >
            <option value="directive">Directive (::: narrator / ::: speech)</option>
            <option value="xml">XML Tags (&lt;narrator&gt; / &lt;speech&gt;)</option>
            <option value="prefix">Prefix (Narrator: / Character:)</option>
          </select>
        </div>

        <div>
          <label for="system-preamble" class="mb-1 block font-medium text-(--chrome-text)">
            Custom System Preamble
          </label>
          <textarea
            id="system-preamble"
            value={s.preamble ?? ''}
            placeholder="Optional guidance injected into Block 1 of the prompt..."
            rows={4}
            oninput={(e) => queuePatch({ preamble: e.currentTarget.value }, 600)}
            class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) p-3 font-mono text-xs text-(--chrome-text) focus:border-accent focus:outline-none"
          ></textarea>
        </div>
      </div>
    {:else if activeTab === 'appearance'}
      <div class="flex flex-col gap-5">
        <p class="text-[11px] text-(--chrome-text)/60">
          Customize the global shell appearance, chrome accent, and surface styling across the Foyer, Studio, and Personas.
        </p>

        <!-- Chrome Accent Color -->
        <div class="rounded-xl border border-(--chrome-line) bg-(--chrome-bg)/50 p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium text-(--chrome-text)">Chrome Accent Color</div>
              <div class="text-[11px] text-(--chrome-text)/60">Primary highlight color for buttons, borders, and active indicators</div>
            </div>
            <div class="flex items-center gap-2">
              <input
                type="color"
                value={shellTheme.theme.chrome?.accent || '#38bdf8'}
                oninput={(e) => {
                  const hex = e.currentTarget.value;
                  queueShellPatch({
                    chrome: { ...shellTheme.theme.chrome, accent: hex }
                  });
                }}
                class="h-7 w-7 rounded-lg border border-(--chrome-line) bg-transparent cursor-pointer p-0.5"
                title="Choose custom accent color"
              />
              <input
                type="text"
                value={shellTheme.theme.chrome?.accent || '#38bdf8'}
                onchange={(e) => {
                  const hex = e.currentTarget.value.trim();
                  if (hex) {
                    queueShellPatch({
                      chrome: { ...shellTheme.theme.chrome, accent: hex }
                    }, 0);
                  }
                }}
                class="w-24 rounded-lg border border-(--chrome-line) bg-(--chrome-surface) px-2 py-1 font-mono text-xs text-(--chrome-text) focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <!-- Color Presets -->
          <div class="flex flex-wrap items-center gap-2 pt-1">
            {#each ACCENT_PRESETS as preset}
              <button
                type="button"
                onclick={() => {
                  queueShellPatch({
                    chrome: { ...shellTheme.theme.chrome, accent: preset }
                  }, 0);
                }}
                class="h-6 w-6 rounded-full border border-white/10 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-accent"
                style="background-color: {preset};"
                aria-label="Set accent to {preset}"
              ></button>
            {/each}
          </div>
        </div>

        <!-- Surface Accent Tint Strength Slider -->
        <div class="rounded-xl border border-(--chrome-line) bg-(--chrome-bg)/50 p-4 space-y-2">
          <div class="flex items-center justify-between text-(--chrome-text) font-medium">
            <div>
              <label for="tint-slider" class="block">Surface Accent Tint</label>
              <span class="text-[11px] font-normal text-(--chrome-text)/60">Controls how much accent color blends into dark surfaces and chrome</span>
            </div>
            <span class="font-mono text-xs text-(--chrome-text)/70">
              {(() => {
                if (tintDraft === 0) return '0% (Pure Neutral)';
                if (tintDraft <= 4) return `${tintDraft}% (Subtle)`;
                if (tintDraft <= 8) return `${tintDraft}% (Ambient)`;
                return `${tintDraft}% (Vibrant)`;
              })()}
            </span>
          </div>
          <input
            id="tint-slider"
            type="range"
            min="0"
            max="15"
            step="1"
            bind:value={tintDraft}
            oninput={(e) => {
              const val = Number(e.currentTarget.value);
              tintDraft = val;
              document.documentElement.style.setProperty('--chrome-tint-strength', `${val}%`);
              queueShellPatch({ tint: `${val}%` });
            }}
            onchange={(e) => {
              const val = Number(e.currentTarget.value);
              tintDraft = val;
              document.documentElement.style.setProperty('--chrome-tint-strength', `${val}%`);
              queueShellPatch({ tint: `${val}%` }, 0);
            }}
            class="w-full accent-accent"
          />
        </div>

        <!-- Frosted vs Solid Chrome (forceSolidChrome) -->
        <label class="flex items-center justify-between rounded-xl border border-(--chrome-line) bg-(--chrome-bg)/50 p-3.5 cursor-pointer hover:bg-(--chrome-line)/30">
          <div>
            <div class="font-medium text-(--chrome-text)">Solid Chrome Surface</div>
            <div class="text-[11px] text-(--chrome-text)/60">Forces solid background on chrome bars and sheets (disables frosted glass blur)</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.forceSolidChrome}
            onchange={(e) => {
              prefs.forceSolidChrome = e.currentTarget.checked;
              prefs.save();
            }}
            class="h-4 w-4 rounded border-(--chrome-line) bg-(--chrome-surface) accent-accent focus:ring-accent"
          />
        </label>

        <!-- Surface Scrim Strength Slider -->
        <div class="rounded-xl border border-(--chrome-line) bg-(--chrome-bg)/50 p-4 space-y-2">
          <div class="flex items-center justify-between text-(--chrome-text) font-medium">
            <div>
              <label for="scrim-slider" class="block">Surface Scrim Opacity</label>
              <span class="text-[11px] font-normal text-(--chrome-text)/60">Controls background darkness/opacity behind chrome elements</span>
            </div>
            <span class="font-mono text-(--chrome-text)/60">
              {shellTheme.theme.scrim ?? '0.8'}
            </span>
          </div>
          <input
            id="scrim-slider"
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={shellTheme.theme.scrim ? parseFloat(shellTheme.theme.scrim) : 0.8}
            disabled={prefs.forceSolidChrome}
            oninput={(e) => {
              const val = e.currentTarget.value;
              queueShellPatch({ scrim: val });
            }}
            class="w-full accent-accent disabled:opacity-40"
          />
        </div>

        <!-- Foyer Title Override -->
        <div class="rounded-xl border border-(--chrome-line) bg-(--chrome-bg)/50 p-4 space-y-2">
          <label for="foyer-title" class="block font-medium text-(--chrome-text)">
            Foyer Header Title
          </label>
          <div class="text-[11px] text-(--chrome-text)/60">Custom label displayed in the top bar navigation header on the Foyer page</div>
          <input
            id="foyer-title"
            type="text"
            maxlength="40"
            value={shellTheme.theme.labels?.foyerTitle ?? ''}
            placeholder="FormaTavern"
            oninput={(e) => {
              const val = e.currentTarget.value;
              queueShellPatch({
                labels: { ...shellTheme.theme.labels, foyerTitle: val || undefined }
              });
            }}
            class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3.5 py-2 text-(--chrome-text) focus:border-accent focus:outline-none"
          />
        </div>

        <!-- Card Layout & Density -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- Card Density -->
          <div class="rounded-xl border border-(--chrome-line) bg-(--chrome-bg)/50 p-4 space-y-2">
            <label for="card-density" class="block font-medium text-(--chrome-text)">
              Card Density
            </label>
            <div class="text-[11px] text-(--chrome-text)/60">Controls padding and spacing in companion cards</div>
            <select
              id="card-density"
              value={shellTheme.theme.card?.density ?? 'regular'}
              onchange={(e) => {
                const density = e.currentTarget.value as 'compact' | 'regular' | 'airy';
                queueShellPatch({
                  card: { ...shellTheme.theme.card, density }
                }, 0);
              }}
              class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-(--chrome-text) focus:border-accent focus:outline-none"
            >
              <option value="compact">Compact (Dense)</option>
              <option value="regular">Regular (Balanced)</option>
              <option value="airy">Airy (Spacious)</option>
            </select>
          </div>

          <!-- Card Radius -->
          <div class="rounded-xl border border-(--chrome-line) bg-(--chrome-bg)/50 p-4 space-y-2">
            <label for="card-radius" class="block font-medium text-(--chrome-text)">
              Card Corner Radius
            </label>
            <div class="text-[11px] text-(--chrome-text)/60">Border radius for companion cards</div>
            <div class="flex items-center gap-2">
              <select
                id="card-radius"
                value={RADIUS_PRESETS.includes(shellTheme.theme.card?.radius ?? '1.5rem') ? (shellTheme.theme.card?.radius ?? '1.5rem') : 'custom'}
                onchange={(e) => {
                  const val = e.currentTarget.value;
                  if (val !== 'custom') {
                    queueShellPatch({
                      card: { ...shellTheme.theme.card, radius: val }
                    }, 0);
                  }
                }}
                class="flex-1 rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-(--chrome-text) focus:border-accent focus:outline-none text-xs"
              >
                <option value="0px">Sharp (0px)</option>
                <option value="0.5rem">Subtle (8px)</option>
                <option value="1rem">Rounded (16px)</option>
                <option value="1.5rem">Default (24px)</option>
                <option value="2rem">Pill (32px)</option>
                {#if !RADIUS_PRESETS.includes(shellTheme.theme.card?.radius ?? '1.5rem')}
                  <option value="custom">Custom</option>
                {/if}
              </select>
              <input
                type="text"
                placeholder="1.5rem"
                value={shellTheme.theme.card?.radius ?? '1.5rem'}
                oninput={(e) => {
                  const val = e.currentTarget.value.trim();
                  if (val) {
                    queueShellPatch({
                      card: { ...shellTheme.theme.card, radius: val }
                    });
                  }
                }}
                class="w-24 rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-2.5 py-2 font-mono text-xs text-(--chrome-text) focus:border-accent focus:outline-none text-center"
                title="Custom CSS corner radius (e.g. 12px, 0.75rem, 0px)"
              />
            </div>
          </div>
        </div>

        <!-- Foyer / Shell Background -->
        <div class="rounded-xl border border-(--chrome-line) bg-(--chrome-bg)/50 p-4 space-y-3">
          <div class="font-medium text-(--chrome-text)">Foyer Background</div>
          <div class="text-[11px] text-(--chrome-text)/60">Optional backdrop image and overlay styling for the shell</div>
          <div class="space-y-2">
            <input
              type="text"
              placeholder="Background image URL (e.g. /assets/backgrounds/foyer.jpg)"
              value={shellTheme.theme.background?.image ?? ''}
              oninput={(e) => {
                const img = e.currentTarget.value.trim();
                queueShellPatch({
                  background: {
                    ...shellTheme.theme.background,
                    image: img || undefined
                  }
                });
              }}
              class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3.5 py-2 text-(--chrome-text) focus:border-accent focus:outline-none font-mono text-xs"
            />
            <div class="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Blur (e.g. 0px, 8px)"
                value={shellTheme.theme.background?.blur ?? ''}
                oninput={(e) => {
                  const blur = e.currentTarget.value.trim();
                  queueShellPatch({
                    background: {
                      ...shellTheme.theme.background,
                      blur: blur || undefined
                    }
                  });
                }}
                class="rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-(--chrome-text) focus:border-accent focus:outline-none font-mono text-xs"
              />
              <input
                type="text"
                placeholder="Overlay (e.g. rgba(0,0,0,0.6))"
                value={shellTheme.theme.background?.overlay ?? ''}
                oninput={(e) => {
                  const overlay = e.currentTarget.value.trim();
                  queueShellPatch({
                    background: {
                      ...shellTheme.theme.background,
                      overlay: overlay || undefined
                    }
                  });
                }}
                class="rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-(--chrome-text) focus:border-accent focus:outline-none font-mono text-xs"
              />
            </div>
          </div>
        </div>

        <!-- Shell Custom CSS -->
        <div class="rounded-xl border border-(--chrome-line) bg-(--chrome-bg)/50 p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium text-(--chrome-text)">Shell Custom CSS</div>
              <div class="text-[11px] text-(--chrome-text)/60">Scoped CSS rules applied to the Foyer, Studio, and Personas shell surfaces</div>
            </div>
          </div>
          <div class="h-[420px]">
            <CustomCssPanel
              value={shellTheme.theme.customCss ?? ''}
              onchange={(val: string) => {
                queueShellPatch({ customCss: val || undefined });
              }}
              scope="shell"
            />
          </div>
        </div>
      </div>
    {/if}
  </div>
</dialog>

<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import Kbd from '../ui/Kbd.svelte';
  import Spinner from '../ui/Spinner.svelte';
  import { settingsStore } from '$lib/state/settings.svelte';
  import { providerConfigsStore } from '$lib/state/providerConfigs.svelte';
  import { prefs } from '$lib/state/prefs.svelte';
  import { shellTheme } from '$lib/state/shellTheme.svelte';
  import type { ProviderConfigView, SettingsPatch, ShellTheme } from '@formatavern/shared';
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

  // Provider configuration editor drafts
  let editingId = $state<string | null>(null);
  let isNewEditor = $state(false);
  let draftName = $state('');
  let draftType = $state<ProviderConfigView['providerType']>('openrouter');
  let draftBaseUrl = $state('');
  let draftKey = $state('');
  let draftModel = $state('');
  let draftPrompt = $state('');
  let editorError = $state<string | null>(null);
  let confirmDeleteId = $state<string | null>(null);
  let configsRequested = $state(false);

  const CONFIG_TYPE_LABELS: Record<ProviderConfigView['providerType'], string> = {
    openrouter: 'OpenRouter',
    custom: 'Custom OpenAI-compatible',
    gemini: 'Gemini (OpenAI-compatible)',
    'gemini-interactions': 'Gemini Native (Interactions API)'
  };

  const MODEL_PLACEHOLDERS: Record<ProviderConfigView['providerType'], string> = {
    openrouter: 'e.g. anthropic/claude-3.5-sonnet',
    custom: 'e.g. llama3.1 (model id on your server)',
    gemini: 'e.g. gemini-3.5-flash',
    'gemini-interactions': 'e.g. gemini-3.5-flash'
  };

  function configSubtitle(cfg: ProviderConfigView): string {
    const model = cfg.model ?? 'default model';
    if (cfg.providerType === 'custom') {
      let host = cfg.baseUrl ?? 'no URL yet';
      try {
        if (cfg.baseUrl) host = new URL(cfg.baseUrl).host;
      } catch { /* keep raw value */ }
      return `${model} · ${host}`;
    }
    return `${model} · ${CONFIG_TYPE_LABELS[cfg.providerType]}`;
  }

  function openNewConfig() {
    editingId = null;
    isNewEditor = true;
    draftName = '';
    draftType = 'openrouter';
    draftBaseUrl = '';
    draftKey = '';
    draftModel = '';
    draftPrompt = '';
    editorError = null;
    confirmDeleteId = null;
  }

  function openEditConfig(cfg: ProviderConfigView) {
    editingId = cfg.id;
    isNewEditor = false;
    draftName = cfg.name;
    draftType = cfg.providerType;
    draftBaseUrl = cfg.baseUrl ?? '';
    draftKey = '';
    draftModel = cfg.model ?? '';
    draftPrompt = cfg.customPrompt ?? '';
    editorError = null;
    confirmDeleteId = null;
  }

  function closeEditor() {
    editingId = null;
    isNewEditor = false;
    editorError = null;
    confirmDeleteId = null;
  }

  function editorAsPatch(): { name?: string; baseUrl?: string | null; apiKey?: string | null; model?: string | null; customPrompt?: string | null } {
    const patch: { name?: string; baseUrl?: string | null; apiKey?: string | null; model?: string | null; customPrompt?: string | null } = {};
    if (draftName.trim()) patch.name = draftName.trim();
    if (draftType === 'custom') {
      patch.baseUrl = draftBaseUrl.trim() ? draftBaseUrl.trim() : null;
    }
    if (draftKey.trim()) patch.apiKey = draftKey.trim();
    patch.model = draftModel.trim() ? draftModel.trim() : null;
    patch.customPrompt = draftPrompt.trim() ? draftPrompt.trim() : null;
    return patch;
  }

  async function saveEditor() {
    editorError = null;
    if (!draftName.trim()) {
      editorError = 'Give the configuration a name.';
      return;
    }
    if (isNewEditor) {
      const created = await providerConfigsStore.create({
        name: draftName.trim(),
        providerType: draftType,
        ...(draftType === 'custom' && draftBaseUrl.trim() ? { baseUrl: draftBaseUrl.trim() } : {}),
        ...(draftKey.trim() ? { apiKey: draftKey.trim() } : {}),
        ...(draftModel.trim() ? { model: draftModel.trim() } : {}),
        ...(draftPrompt.trim() ? { customPrompt: draftPrompt.trim() } : {})
      });
      if (created) closeEditor();
    } else if (editingId) {
      const ok = await providerConfigsStore.patch(editingId, editorAsPatch());
      if (ok) closeEditor();
      else editorError = 'Save failed — see the message above.';
    }
  }

  async function deleteEditorConfig() {
    if (!editingId) return;
    if (confirmDeleteId !== editingId) {
      confirmDeleteId = editingId;
      setTimeout(() => {
        if (confirmDeleteId === editingId) confirmDeleteId = null;
      }, 4000);
      return;
    }
    const ok = await providerConfigsStore.remove(editingId);
    if (ok) closeEditor();
  }

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

  $effect(() => {
    if (open && activeTab === 'provider' && !editingId && !isNewEditor && !configsRequested) {
      configsRequested = true;
      providerConfigsStore.load();
    }
    if (!open && configsRequested) {
      configsRequested = false;
    }
  });

  function queuePatch(patch: SettingsPatch, delay = 400) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      settingsStore.patch(patch);
    }, delay);
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
      {@const activeConfigId = s.provider.activeConfigId ?? null}
      <div class="flex flex-col gap-4">
        {#if editingId !== null || isNewEditor}
          <!-- Config editor is rendered below; list hidden while editing -->
        {:else}
        <!-- Mock Engine (built-in, no key) -->
        <button
          type="button"
          onclick={() => providerConfigsStore.useMock()}
          class="flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-(--chrome-line)/30 {activeConfigId === null
            ? 'border-accent bg-(--chrome-line)/20'
            : 'border-(--chrome-line) bg-(--chrome-bg)/50'}"
        >
          <span
            class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border {activeConfigId === null ? 'border-accent' : 'border-(--chrome-text)/40'}"
          >
            {#if activeConfigId === null}
              <span class="h-2 w-2 rounded-full bg-accent"></span>
            {/if}
          </span>
          <span>
            <span class="block font-medium text-(--chrome-text)">Mock Engine</span>
            <span class="block text-[11px] text-(--chrome-text)/60">Offline fixtures · no key needed</span>
          </span>
        </button>

        {#if activeConfigId === null}
          <div>
            <label for="mock-model-input" class="mb-1 block font-medium text-(--chrome-text)">
              Mock script
            </label>
            <select
              id="mock-model-input"
              value={s.provider.model?.startsWith('mock:') ? s.provider.model : 'mock:envelope-directive'}
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
          </div>
        {/if}

        <!-- Saved configurations -->
        <div>
          <div class="mb-1 flex items-center justify-between">
            <span class="font-medium text-(--chrome-text)">Provider configurations</span>
            <button
              type="button"
              onclick={openNewConfig}
              class="rounded-lg border border-(--chrome-line) bg-(--chrome-surface) px-2.5 py-1 text-[11px] font-semibold text-(--chrome-text) transition-colors hover:bg-(--chrome-line)/40"
            >
              + New
            </button>
          </div>
          {#if providerConfigsStore.loading && providerConfigsStore.configs.length === 0}
            <div class="flex h-16 items-center justify-center">
              <Spinner size={18} class="text-(--chrome-text)/50" />
            </div>
          {:else if providerConfigsStore.configs.length === 0}
            {#if providerConfigsStore.error}
              <div class="flex flex-col items-center gap-2 rounded-xl border border-red-900/50 p-3 text-center">
                <p class="text-[11px] text-red-400">{providerConfigsStore.error}</p>
                <button
                  type="button"
                  onclick={() => providerConfigsStore.load()}
                  class="rounded-lg border border-(--chrome-line) bg-(--chrome-surface) px-2.5 py-1 text-[11px] font-semibold text-(--chrome-text) transition-colors hover:bg-(--chrome-line)/40"
                >
                  Retry
                </button>
              </div>
            {:else}
              <p class="rounded-xl border border-dashed border-(--chrome-line) p-3 text-[11px] text-(--chrome-text)/60">
                No configurations yet. Add one for OpenRouter, a local server, or Gemini — each keeps its own key, model, and prompt.
              </p>
            {/if}
          {:else}
            <div class="flex flex-col gap-2">
              {#each providerConfigsStore.configs as cfg (cfg.id)}
                <div
                  class="flex items-center gap-3 rounded-xl border p-3 transition-colors {cfg.id === activeConfigId
                    ? 'border-accent bg-(--chrome-line)/20'
                    : 'border-(--chrome-line) bg-(--chrome-bg)/50'}"
                >
                  <button
                    type="button"
                    onclick={() => providerConfigsStore.activate(cfg.id)}
                    class="flex min-w-0 flex-1 items-center gap-3 text-left"
                    aria-label="Use {cfg.name}"
                  >
                    <span
                      class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border {cfg.id === activeConfigId ? 'border-accent' : 'border-(--chrome-text)/40'}"
                    >
                      {#if cfg.id === activeConfigId}
                        <span class="h-2 w-2 rounded-full bg-accent"></span>
                      {/if}
                    </span>
                    <span class="min-w-0">
                      <span class="block truncate font-medium text-(--chrome-text)">{cfg.name}</span>
                      <span class="block truncate font-mono text-[11px] text-(--chrome-text)/60">{configSubtitle(cfg)}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onclick={() => openEditConfig(cfg)}
                    class="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-(--chrome-text)/60 transition-colors hover:bg-(--chrome-line)/40 hover:text-(--chrome-text)"
                  >
                    Edit
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
        {/if}

        {#if editingId !== null || isNewEditor}
          {@const editingCfg = editingId
            ? (providerConfigsStore.configs.find((c) => c.id === editingId) ?? null)
            : null}
          <div class="rounded-xl border border-(--chrome-line) bg-(--chrome-bg)/50 p-4">
            <div class="mb-3 font-medium text-(--chrome-text)">
              {isNewEditor ? 'New configuration' : `Editing: ${editingCfg?.name ?? ''}`}
            </div>
            <label for="cfg-name" class="mb-1 block font-medium text-(--chrome-text)">Name</label>
            <input
              id="cfg-name"
              type="text"
              maxlength="64"
              bind:value={draftName}
              placeholder="e.g. OpenRouter 1"
              class="mb-3 w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-(--chrome-text) focus:border-accent focus:outline-none"
            />
            {#if isNewEditor}
              <label for="cfg-type" class="mb-1 block font-medium text-(--chrome-text)">Provider type</label>
              <select
                id="cfg-type"
                bind:value={draftType}
                class="mb-3 w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-(--chrome-text) focus:border-accent focus:outline-none"
              >
                <option value="openrouter">OpenRouter</option>
                <option value="custom">Custom OpenAI-compatible</option>
                <option value="gemini">Gemini (OpenAI-compatible)</option>
                <option value="gemini-interactions">Gemini Native (Interactions API)</option>
              </select>
            {:else}
              <p class="mb-3 text-[11px] text-(--chrome-text)/60">
                Type: {editingCfg ? CONFIG_TYPE_LABELS[editingCfg.providerType] : ''}
              </p>
            {/if}
            {#if draftType === 'custom'}
              <label for="cfg-url" class="mb-1 block font-medium text-(--chrome-text)">Base URL</label>
              <input
                id="cfg-url"
                type="url"
                bind:value={draftBaseUrl}
                placeholder="https://openrouter.ai/api/v1 — /chat/completions is added automatically"
                class="mb-3 w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
              />
            {/if}
            <div class="mb-1 flex items-center justify-between">
              <label for="cfg-key" class="font-medium text-(--chrome-text)">
                API Key{#if draftType === 'custom'} <span class="font-normal text-(--chrome-text)/60">(optional)</span>{/if}
              </label>
              {#if editingCfg}
                <span class="text-[11px] text-(--chrome-text)/60">
                  Current: {editingCfg.apiKeyHint ?? 'Not set'} ({editingCfg.source})
                </span>
              {/if}
            </div>
            <input
              id="cfg-key"
              type="password"
              bind:value={draftKey}
              placeholder={editingCfg?.apiKeySet ? '•••••• (set) — enter a new key to replace' : 'Enter key'}
              class="mb-3 w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-(--chrome-text) focus:border-accent focus:outline-none"
            />
            <label for="cfg-model" class="mb-1 block font-medium text-(--chrome-text)">Model</label>
            <input
              id="cfg-model"
              type="text"
              bind:value={draftModel}
              placeholder={MODEL_PLACEHOLDERS[draftType]}
              class="mb-3 w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-(--chrome-text) focus:border-accent focus:outline-none"
            />
            <label for="cfg-prompt" class="mb-1 block font-medium text-(--chrome-text)">Custom prompt</label>
            <textarea
              id="cfg-prompt"
              bind:value={draftPrompt}
              rows={3}
              maxlength="2000"
              placeholder="Extra instructions sent with every request using this config."
              class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) p-3 font-mono text-xs text-(--chrome-text) focus:border-accent focus:outline-none"
            ></textarea>
            <p class="mb-3 text-[11px] text-(--chrome-text)/60">
              Sent with every request while this configuration is active, right below the global prompt. Plain instructions only — no envelope blocks.
            </p>
            {#if editorError}
              <p class="mb-2 text-[11px] text-red-400">{editorError}</p>
            {/if}
            {#if editingId && providerConfigsStore.lastTest?.id === editingId}
              {@const tres = providerConfigsStore.lastTest.result}
              {#if tres.ok}
                <p class="mb-2 text-[11px] text-accent">Connection OK{tres.latencyMs !== undefined ? ` · ${tres.latencyMs}ms` : ''}.</p>
              {:else}
                <p class="mb-2 text-[11px] text-red-400">Test failed{tres.code ? ` (${tres.code})` : ''}: {tres.message ?? 'unknown error'}</p>
              {/if}
            {/if}
            <div class="flex flex-wrap gap-2">
              {#if editingId}
                <button
                  type="button"
                  onclick={() => editingId && providerConfigsStore.test(editingId)}
                  disabled={providerConfigsStore.testingId === editingId}
                  class="rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-(--chrome-text)/80 transition-colors hover:bg-(--chrome-line)/40 disabled:opacity-50"
                >
                  {providerConfigsStore.testingId === editingId ? 'Testing…' : 'Test'}
                </button>
                <button
                  type="button"
                  onclick={async () => {
                    const cfg = editingId ? providerConfigsStore.configs.find((c) => c.id === editingId) : null;
                    if (cfg) {
                      const copy = await providerConfigsStore.duplicate(cfg);
                      if (copy) openEditConfig(copy);
                    }
                  }}
                  class="rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-(--chrome-text)/80 transition-colors hover:bg-(--chrome-line)/40"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  onclick={deleteEditorConfig}
                  class="rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-(--chrome-text)/60 transition-colors hover:bg-red-950/40 hover:text-red-300"
                >
                  {confirmDeleteId === editingId ? 'Confirm delete?' : 'Delete'}
                </button>
              {/if}
              <span class="flex-1"></span>
              <button
                type="button"
                onclick={closeEditor}
                class="rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3.5 py-2 text-(--chrome-text)/80 transition-colors hover:bg-(--chrome-line)/40"
              >
                Cancel
              </button>
              <button
                type="button"
                onclick={saveEditor}
                disabled={!draftName.trim() || providerConfigsStore.saving}
                class="rounded-xl bg-accent px-3.5 py-2 font-semibold text-accent-contrast transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                Save
              </button>
            </div>
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

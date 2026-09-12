<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { CharacterDraft } from '$lib/studio/draft.svelte';
  import { HOOKS, type SurfaceScope } from '@formatavern/shared';
  import { loadCustomCss } from '@formatavern/shared/customCss/loader';
  import type { SanitizeIssue, LintIssue, ChatRestrictionIssue } from '@formatavern/shared/customCss';
  import { toasts } from '$lib/state/toasts.svelte';
  import { CUSTOM_CSS_PRESETS, type CustomCssPreset } from '$lib/custom/presets';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';

  interface Props {
    draft?: CharacterDraft;
    value?: string;
    onchange?: (val: string) => void;
    scope?: SurfaceScope;
  }

  let { draft, value, onchange, scope = 'character' }: Props = $props();

  let textarea = $state<HTMLTextAreaElement>();
  let activeTab = $state<'editor' | 'hooks' | 'fonts'>('editor');
  let copiedHook = $state<string | null>(null);

  // Font Manager State (Slice 5)
  let uploadedFonts = $state<Array<{ name: string; path: string; mime: string; format: string }>>([]);
  let uploadingFont = $state(false);
  let fontFileInput = $state<HTMLInputElement>();

  // Combine session-uploaded fonts with any @font-face rules authored in the sheet
  const parsedSheetFonts = $derived.by(() => {
    const list: Array<{ name: string; path: string; format: string }> = [];
    const regex = /@font-face\s*\{[^}]*font-family:\s*['"]([^'"]+)['"][^}]*src:\s*url\(['"]([^'"]+)['"]\)(?:\s*format\(['"]([^'"]+)['"]\))?/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(code)) !== null) {
      const name = match[1];
      const path = match[2];
      const format = match[3] || 'font';
      if (name && path && !list.some((f) => f.path === path)) {
        list.push({ name, path, format });
      }
    }
    return list;
  });

  const availableFonts = $derived.by(() => {
    const combined = [...uploadedFonts];
    for (const f of parsedSheetFonts) {
      if (!combined.some((c) => c.path === f.path)) {
        combined.push({ name: f.name, path: f.path, mime: 'font', format: f.format });
      }
    }
    return combined;
  });

  const targetScope = $derived(draft ? 'character' : scope);
  const code = $derived(draft ? (draft.card.customCss ?? '') : (value ?? ''));

  function updateCode(newVal: string) {
    if (draft) {
      draft.card.customCss = newVal;
    } else {
      onchange?.(newVal);
    }
  }

  const MAX_CHARS = 131_072;
  const charCount = $derived(code.length);
  const percentUsed = $derived(Math.min(100, Math.round((charCount / MAX_CHARS) * 100)));
  const placeholderText = $derived(
    targetScope === 'shell'
      ? `/* Shell custom CSS.\n   Example:\n   .ft-foyer-header {\n     border-bottom: 1px solid var(--theme-accent);\n   }\n*/`
      : `/* Author custom CSS scoped to companion showcase.\n   Example:\n   .ft-hero {\n     border: 1px solid var(--theme-accent);\n   }\n*/`
  );

  let reports = $state<SanitizeIssue[]>([]);
  let lints = $state<LintIssue[]>([]);
  let chatRestrictions = $state<ChatRestrictionIssue[]>([]);
  let isAnalyzing = $state(false);
  let debounceTimer: any = null;

  $effect(() => {
    const currentCode = code;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (!currentCode.trim()) {
        reports = [];
        lints = [];
        chatRestrictions = [];
        return;
      }
      isAnalyzing = true;
      try {
        const { sanitizeCss, lintSheet, lintChatRestrictions } = await loadCustomCss();
        const out = sanitizeCss(currentCode, targetScope);
        reports = out.report;
        lints = lintSheet(currentCode, targetScope);
        chatRestrictions = targetScope === 'character' ? lintChatRestrictions(currentCode) : [];
      } catch (err: any) {
        reports = [{ kind: 'parse-fatal', detail: err?.message ?? 'Unknown CSS parse error' }];
        lints = [];
        chatRestrictions = [];
      } finally {
        isAnalyzing = false;
      }
    }, 150);

    return () => clearTimeout(debounceTimer);
  });

  onDestroy(() => {
    clearTimeout(debounceTimer);
  });

  const fatalError = $derived(reports.find((r) => r.kind === 'parse-fatal'));
  const droppedRules = $derived(reports.filter((r) => r.kind === 'dropped-rule'));
  const droppedDecls = $derived(reports.filter((r) => r.kind === 'dropped-declaration'));
  const droppedAtRules = $derived(reports.filter((r) => r.kind === 'dropped-at-rule'));
  const renamedKeyframes = $derived(reports.filter((r) => r.kind === 'renamed-keyframes'));
  const notes = $derived(reports.filter((r) => r.kind === 'note'));

  function insertSnippet(snippet: string) {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = code;
    const before = current.slice(0, start);
    let prefix = '';
    if (before.length > 0 && !before.endsWith('\n')) {
      prefix = '\n\n';
    } else if (before.endsWith('\n') && !before.endsWith('\n\n')) {
      prefix = '\n';
    }
    const fullSnippet = prefix + snippet;
    const updated = before + fullSnippet + current.slice(end);
    updateCode(updated);

    setTimeout(() => {
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(start + fullSnippet.length, start + fullSnippet.length);
    }, 0);
  }

  async function copyHook(hookName: string) {
    const selector = `.${hookName}`;
    try {
      await navigator.clipboard.writeText(selector);
      copiedHook = hookName;
      setTimeout(() => {
        if (copiedHook === hookName) copiedHook = null;
      }, 1500);
      toasts.success(`Copied ${selector}`);
    } catch {
      toasts.error(`Failed to copy ${selector}`);
    }
  }

  async function handleFontUpload(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;
    const file = files[0];

    if (file.size > 4 * 1024 * 1024) {
      toasts.error('Font file exceeds maximum allowed size of 4 MiB');
      return;
    }

    uploadingFont = true;
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('scope', 'fonts');
      formData.append('targetId', draft ? draft.ownerId : 'global');

      const res = await fetch('/api/assets/upload', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Font upload failed');
      }

      const meta = await res.json();
      const format =
        meta.mime === 'font/woff2'
          ? 'woff2'
          : meta.mime === 'font/woff'
            ? 'woff'
            : meta.mime === 'font/otf'
              ? 'opentype'
              : 'truetype';
      const baseName =
        file.name
          .replace(/\.[^/.]+$/, '')
          .replace(/[^a-zA-Z0-9_-]/g, ' ')
          .trim() || 'CustomFont';

      uploadedFonts = [
        ...uploadedFonts,
        { name: baseName, path: meta.path, mime: meta.mime, format }
      ];
      toasts.success(`Uploaded font ${file.name}`);
    } catch (err: any) {
      toasts.error(err.message || 'Failed to upload font');
    } finally {
      uploadingFont = false;
      if (fontFileInput) fontFileInput.value = '';
    }
  }

  function insertFontFaceSnippet(font: { name: string; path: string; format: string }) {
    const snippet = `@font-face {\n  font-family: '${font.name}';\n  src: url('${font.path}') format('${font.format}');\n  font-display: swap;\n}\n\n.ft-hero, .ft-showcase-body {\n  font-family: '${font.name}', sans-serif;\n}\n`;
    insertSnippet(snippet);
    toasts.success(`Inserted @font-face & showcase style rule for ${font.name}`);
  }

  function insertFontRuleOnly(font: { name: string }) {
    const snippet = `.ft-hero, .ft-showcase-body {\n  font-family: '${font.name}', sans-serif;\n}\n`;
    insertSnippet(snippet);
    toasts.success(`Inserted showcase rule for ${font.name}`);
  }

  function applyPreset(preset: CustomCssPreset) {
    if (code.trim() && code.trim() !== preset.css.trim()) {
      if (typeof window !== 'undefined' && !window.confirm(
        `Replace current custom CSS with the "${preset.name}" starter preset? Any unsaved edits will be replaced.`
      )) {
        return;
      }
    }
    updateCode(preset.css);
    toasts.success(`Loaded "${preset.name}" preset`);
  }
</script>

<div class="flex flex-col h-full space-y-4">
  <!-- Toolbar: Quick Snippets & Size Meter -->
  <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900/80 p-2.5 shrink-0">
    <div class="flex flex-wrap items-center gap-1.5">
      {#if targetScope === 'shell'}
        <button
          type="button"
          onclick={() => insertSnippet('.ft-foyer-header {\n  /* Header styling */\n}\n')}
          class="rounded-lg border border-neutral-800 bg-neutral-850 px-2.5 py-1 text-xs font-mono text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
        >
          .ft-foyer-header
        </button>
        <button
          type="button"
          onclick={() => insertSnippet('.ft-foyer-grid {\n  /* Companion grid styling */\n}\n')}
          class="rounded-lg border border-neutral-800 bg-neutral-850 px-2.5 py-1 text-xs font-mono text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
        >
          .ft-foyer-grid
        </button>
        <button
          type="button"
          onclick={() => insertSnippet('.ft-char-card {\n  /* Card styling */\n}\n')}
          class="rounded-lg border border-neutral-800 bg-neutral-850 px-2.5 py-1 text-xs font-mono text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
        >
          .ft-char-card
        </button>
      {:else}
        <button
          type="button"
          onclick={() => insertSnippet('.ft-hero {\n  border: 1px solid var(--theme-accent);\n}\n')}
          class="rounded-lg border border-neutral-800 bg-neutral-850 px-2.5 py-1 text-xs font-mono text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
        >
          .ft-hero
        </button>
        <button
          type="button"
          onclick={() => insertSnippet('.ft-showcase-body {\n  /* Custom showcase styling */\n}\n')}
          class="rounded-lg border border-neutral-800 bg-neutral-850 px-2.5 py-1 text-xs font-mono text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
        >
          .ft-showcase-body
        </button>
        <button
          type="button"
          onclick={() => insertSnippet('.ft-action-hub {\n  /* Custom action buttons */\n}\n')}
          class="rounded-lg border border-neutral-800 bg-neutral-850 px-2.5 py-1 text-xs font-mono text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
        >
          .ft-action-hub
        </button>
        <button
          type="button"
          onclick={() => insertSnippet('.ft-decor-layer[data-slot="1"] {\n  /* Custom decor sticker styling */\n}\n')}
          class="rounded-lg border border-neutral-800 bg-neutral-850 px-2.5 py-1 text-xs font-mono text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
        >
          .ft-decor-layer
        </button>
        <button
          type="button"
          onclick={() => insertSnippet('.ft-bubble-char {\n  /* Companion speech bubble styling */\n}\n')}
          class="rounded-lg border border-neutral-800 bg-neutral-850 px-2.5 py-1 text-xs font-mono text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
        >
          .ft-bubble-char
        </button>
      {/if}
      <button
        type="button"
        onclick={() => insertSnippet('@keyframes float {\n  0%, 100% { transform: translateY(0); }\n  50% { transform: translateY(-6px); }\n}\n')}
        class="rounded-lg border border-neutral-800 bg-neutral-850 px-2.5 py-1 text-xs font-mono text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
      >
        @keyframes
      </button>
    </div>

    <!-- Size Meter & Status -->
    <div class="flex items-center gap-3 text-xs font-mono">
      <div class="flex items-center gap-2">
        <span class="text-neutral-400">
          {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()}
        </span>
        <div class="h-2 w-20 rounded-full bg-neutral-800 overflow-hidden">
          <div
            class="h-full transition-colors {percentUsed > 95
              ? 'bg-red-500'
              : percentUsed > 80
                ? 'bg-amber-500'
                : 'bg-accent'}"
            style="width: {percentUsed}%"
          ></div>
        </div>
      </div>

      {#if fatalError}
        <span class="inline-flex items-center gap-1 rounded bg-red-500/20 px-2 py-0.5 text-[11px] font-semibold text-red-300 border border-red-500/40">
          Parse Error
        </span>
      {:else if isAnalyzing}
        <span class="text-neutral-500 text-[11px]">Validating...</span>
      {:else if code.trim()}
        <span class="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 border border-emerald-500/40">
          Valid
        </span>
      {/if}
    </div>
  </div>

  <!-- Presets Row (Slice 7) -->
  <div class="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-neutral-800/80 bg-neutral-900/50 px-3 py-2 text-xs">
    <div class="flex items-center gap-2 text-neutral-400">
      <span class="font-semibold text-neutral-300">Start from a preset:</span>
      <span class="text-[11px] text-neutral-500 hidden sm:inline">Curated starter sheets (under 8 KB, lint-clean)</span>
    </div>
    <div class="flex flex-wrap items-center gap-1.5">
      {#each CUSTOM_CSS_PRESETS as preset (preset.id)}
        <button
          type="button"
          onclick={() => applyPreset(preset)}
          class="rounded-lg border border-neutral-800 bg-neutral-850 px-2.5 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-800 hover:text-white hover:border-neutral-700 transition-colors"
          title={preset.description}
        >
          {preset.name}
        </button>
      {/each}
    </div>
  </div>

  <!-- Fatal Parse Error Alert -->
  {#if fatalError}
    <div class="rounded-xl border border-red-500/50 bg-red-950/40 p-3 text-xs text-red-200">
      <div class="flex items-center gap-2 font-semibold text-red-300">
        <span aria-hidden="true" class="text-sm">⚠</span>
        <span>CSS Syntax Error (blocks saving)</span>
      </div>
      <p class="mt-1 font-mono text-[11px] text-red-300/80">{fatalError.detail}</p>
    </div>
  {/if}

  <!-- Main Grid: Editor on Left, Diagnostics/Hooks on Right -->
  <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 flex-1 min-h-0">
    <!-- Code Editor Area -->
    <div class="xl:col-span-2 flex flex-col min-h-[350px] h-full rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
      <div class="flex items-center justify-between border-b border-neutral-800/80 bg-neutral-900/60 px-3 py-1.5 text-xs text-neutral-400">
        <span class="font-mono text-[11px]">custom.css</span>
        <span class="text-[11px] text-neutral-500">Pure CSS • Scoped to {targetScope === 'shell' ? 'Shell Surface' : 'Character Page'}</span>
      </div>
      <textarea
        bind:this={textarea}
        value={code}
        oninput={(e) => updateCode(e.currentTarget.value)}
        placeholder={placeholderText}
        spellcheck="false"
        class="flex-1 w-full resize-none bg-transparent p-4 font-mono text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none leading-relaxed"
      ></textarea>
    </div>

    <!-- Inspector / Hooks Reference Sidebar -->
    <div class="flex flex-col min-h-[300px] h-full rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
      <!-- Tabs -->
      <div class="flex border-b border-neutral-800 bg-neutral-900/80 px-2 pt-1 gap-1 text-xs">
        <button
          type="button"
          onclick={() => (activeTab = 'editor')}
          class="rounded-t-lg px-3 py-1.5 transition-colors {activeTab === 'editor'
            ? 'bg-neutral-850 text-white font-semibold border-b-2 border-accent'
            : 'text-neutral-400 hover:text-neutral-200'}"
        >
          Diagnostics ({reports.length + lints.length + chatRestrictions.length})
        </button>
        <button
          type="button"
          onclick={() => (activeTab = 'hooks')}
          class="rounded-t-lg px-3 py-1.5 transition-colors {activeTab === 'hooks'
            ? 'bg-neutral-850 text-white font-semibold border-b-2 border-accent'
            : 'text-neutral-400 hover:text-neutral-200'}"
        >
          Hooks Reference
        </button>
        <button
          type="button"
          onclick={() => (activeTab = 'fonts')}
          class="rounded-t-lg px-3 py-1.5 transition-colors {activeTab === 'fonts'
            ? 'bg-neutral-850 text-white font-semibold border-b-2 border-accent'
            : 'text-neutral-400 hover:text-neutral-200'}"
        >
          Fonts ({availableFonts.length})
        </button>
      </div>

      <!-- Tab Content -->
      <div class="flex-1 overflow-y-auto p-3 text-xs space-y-3">
        {#if activeTab === 'editor'}
          {#if reports.length === 0 && lints.length === 0 && chatRestrictions.length === 0}
            <div class="flex flex-col items-center justify-center h-48 text-center text-neutral-500">
              <p class="text-[11px]">No issues detected.</p>
              <p class="text-[10px] text-neutral-600 mt-1">Raw CSS is preserved in storage. Policy-sanitized styles render in preview.</p>
            </div>
          {:else}
            <!-- Sanitizer Reports -->
            {#if droppedRules.length > 0}
              <div class="rounded-lg border border-amber-500/30 bg-amber-950/20 p-2.5 space-y-1">
                <div class="font-semibold text-amber-300 text-[11px]">Dropped Selectors ({droppedRules.length})</div>
                {#each droppedRules as r}
                  <div class="text-[11px] font-mono text-neutral-300">
                    <span class="text-amber-400">{r.selector}</span>: {r.reason}
                  </div>
                {/each}
              </div>
            {/if}

            {#if droppedDecls.length > 0}
              <div class="rounded-lg border border-amber-500/30 bg-amber-950/20 p-2.5 space-y-1">
                <div class="font-semibold text-amber-300 text-[11px]">Dropped Declarations ({droppedDecls.length})</div>
                {#each droppedDecls as d}
                  <div class="text-[11px] font-mono text-neutral-300">
                    <span class="text-amber-400">{d.property}</span> in {d.selector} ({d.reason})
                  </div>
                {/each}
              </div>
            {/if}

            <!-- Chat Reading View Restrictions (Invariant C7) -->
            {#if chatRestrictions.length > 0}
              <div class="rounded-lg border border-amber-500/40 bg-amber-950/25 p-2.5 space-y-2">
                <div class="flex items-center gap-1.5 font-semibold text-amber-300 text-[11px]">
                  <span>Chat Surface Restrictions ({chatRestrictions.length})</span>
                </div>
                <p class="text-[10px] text-neutral-400">
                  Allowed on the Author Showcase, but stripped in chat to maintain reading stability:
                </p>
                {#each chatRestrictions as cr}
                  <div class="text-[11px] border-l-2 border-amber-500/50 pl-2 space-y-0.5">
                    <div class="font-mono text-[10px] text-amber-400 font-semibold">{cr.property} in {cr.selector}</div>
                    <div class="text-neutral-300 text-[11px]">{cr.message}</div>
                  </div>
                {/each}
              </div>
            {/if}

            {#if droppedAtRules.length > 0}
              <div class="rounded-lg border border-amber-500/30 bg-amber-950/20 p-2.5 space-y-1">
                <div class="font-semibold text-amber-300 text-[11px]">Dropped At-Rules ({droppedAtRules.length})</div>
                {#each droppedAtRules as a}
                  <div class="text-[11px] font-mono text-neutral-300">
                    <span class="text-amber-400">@{a.atRule}</span>: {a.reason}
                  </div>
                {/each}
              </div>
            {/if}

            {#if renamedKeyframes.length > 0}
              <div class="rounded-lg border border-neutral-700/50 bg-neutral-850/50 p-2.5 space-y-1">
                <div class="font-semibold text-neutral-300 text-[11px]">Scoped Keyframes ({renamedKeyframes.length})</div>
                {#each renamedKeyframes as k}
                  <div class="text-[11px] font-mono text-neutral-400">
                    {k.from} → <span class="text-accent">{k.to}</span>
                  </div>
                {/each}
              </div>
            {/if}

            {#if notes.length > 0}
              <div class="rounded-lg border border-neutral-700/50 bg-neutral-850/50 p-2.5 space-y-1">
                <div class="font-semibold text-neutral-300 text-[11px]">Notes ({notes.length})</div>
                {#each notes as n}
                  <div class="text-[11px] text-neutral-400">{n.detail}</div>
                {/each}
              </div>
            {/if}

            <!-- Lints -->
            {#if lints.length > 0}
              <div class="rounded-lg border border-sky-500/30 bg-sky-950/20 p-2.5 space-y-2">
                <div class="font-semibold text-sky-300 text-[11px]">Style Suggestions ({lints.length})</div>
                {#each lints as lint}
                  <div class="text-[11px] border-l-2 border-sky-500/50 pl-2">
                    <div class="font-mono text-[10px] text-sky-400 font-semibold">{lint.code}</div>
                    <div class="text-neutral-300">{lint.message}</div>
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
        {:else if activeTab === 'hooks'}
          <!-- Hooks Reference List -->
          <div class="space-y-4">
            <p class="text-[11px] text-neutral-400">
              Click any hook to copy its selector. Use these stable contract classes in your CSS.
            </p>

            {#if targetScope === 'shell'}
              <!-- Shell Surface Hooks -->
              <div class="space-y-1.5">
                <div class="text-[10px] font-mono uppercase tracking-wider text-neutral-500">Shell Surface</div>
                <div class="grid grid-cols-1 gap-1">
                  {#each Object.entries(HOOKS.shell) as [name, hook]}
                    <button
                      type="button"
                      onclick={() => copyHook(hook)}
                      class="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-850/60 px-2.5 py-1.5 text-left font-mono text-[11px] text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
                    >
                      <span>.{hook}</span>
                      <span class="text-[10px] text-neutral-500">
                        {copiedHook === hook ? '✓ Copied' : name}
                      </span>
                    </button>
                  {/each}
                </div>
              </div>

              <!-- Chrome Components Hooks -->
              <div class="space-y-1.5">
                <div class="text-[10px] font-mono uppercase tracking-wider text-neutral-500">Chrome Components</div>
                <div class="grid grid-cols-1 gap-1">
                  {#each Object.entries(HOOKS.chrome) as [name, hook]}
                    <button
                      type="button"
                      onclick={() => copyHook(hook)}
                      class="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-850/60 px-2.5 py-1.5 text-left font-mono text-[11px] text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
                    >
                      <span>.{hook}</span>
                      <span class="text-[10px] text-neutral-500">
                        {copiedHook === hook ? '✓ Copied' : name}
                      </span>
                    </button>
                  {/each}
                </div>
              </div>
            {:else}
              <!-- Character Surface Hooks -->
              <div class="space-y-1.5">
                <div class="text-[10px] font-mono uppercase tracking-wider text-neutral-500">Character Surface</div>
                <div class="grid grid-cols-1 gap-1">
                  {#each Object.entries(HOOKS.character) as [name, hook]}
                    <button
                      type="button"
                      onclick={() => copyHook(hook)}
                      class="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-850/60 px-2.5 py-1.5 text-left font-mono text-[11px] text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
                    >
                      <span>.{hook}</span>
                      <span class="text-[10px] text-neutral-500">
                        {copiedHook === hook ? '✓ Copied' : name}
                      </span>
                    </button>
                  {/each}
                </div>
              </div>

              <!-- Chat & Speech Hooks -->
              <div class="space-y-1.5">
                <div class="text-[10px] font-mono uppercase tracking-wider text-neutral-500">Speech & Turns</div>
                <div class="grid grid-cols-1 gap-1">
                  {#each Object.entries(HOOKS.chat) as [name, hook]}
                    <button
                      type="button"
                      onclick={() => copyHook(hook)}
                      class="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-850/60 px-2.5 py-1.5 text-left font-mono text-[11px] text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
                    >
                      <span>.{hook}</span>
                      <span class="text-[10px] text-neutral-500">
                        {copiedHook === hook ? '✓ Copied' : name}
                      </span>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {:else if activeTab === 'fonts'}
          <!-- Fonts Manager (Slice 5) -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-semibold text-neutral-300">Companion Fonts</span>
              <input
                type="file"
                accept=".woff2,.woff,.ttf,.otf"
                class="hidden"
                bind:this={fontFileInput}
                onchange={handleFontUpload}
              />
              <button
                type="button"
                disabled={uploadingFont}
                onclick={() => fontFileInput?.click()}
                class="inline-flex items-center gap-1.5 rounded-lg bg-neutral-800 px-2.5 py-1 text-xs font-semibold text-neutral-200 hover:bg-neutral-750 disabled:opacity-50 border border-neutral-700"
              >
                {#if uploadingFont}
                  <Spinner size={12} class="mr-1" />
                  <span>Uploading…</span>
                {:else}
                  <Icon name="upload" size={12} />
                  <span>Upload Font</span>
                {/if}
              </button>
            </div>

            <p class="text-[10px] text-neutral-400 leading-relaxed">
              Upload local font files (.woff2, .woff, .ttf, .otf, max 4 MiB). Declaring <code class="font-mono text-neutral-300">@font-face</code> registers the font with the browser; use <strong>Apply Rule</strong> or set <code class="font-mono text-neutral-300">font-family: '{availableFonts[0]?.name || 'YourFont'}'</code> on selectors like <code class="font-mono text-neutral-300">.ft-hero</code> to style your companion.
            </p>

            {#if availableFonts.length === 0}
              <div class="flex h-36 flex-col items-center justify-center rounded-xl border border-dashed border-neutral-800 p-4 text-center text-xs text-neutral-500">
                <p>No fonts uploaded or declared yet.</p>
                <p class="text-[10px] text-neutral-600 mt-1">Upload a font above to generate safe @font-face rules.</p>
              </div>
            {:else}
              <div class="space-y-2">
                {#each availableFonts as font (font.path)}
                  <div class="p-2.5 rounded-lg border border-neutral-800 bg-neutral-850/60 space-y-2">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <span class="text-xs font-semibold text-neutral-200">{font.name}</span>
                        <span class="rounded bg-neutral-800 px-1.5 py-0.5 text-[9px] font-mono uppercase text-accent border border-neutral-700">
                          {font.format}
                        </span>
                      </div>
                    </div>
                    <div class="font-mono text-[10px] text-neutral-500 truncate" title={font.path}>
                      {font.path}
                    </div>
                    <div class="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onclick={() => insertFontFaceSnippet(font)}
                        class="rounded bg-accent/20 border border-accent/40 px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent/30 transition-colors"
                        title="Insert @font-face definition AND style rule for showcase"
                      >
                        Insert @font-face + Rule
                      </button>
                      <button
                        type="button"
                        onclick={() => insertFontRuleOnly(font)}
                        class="rounded bg-neutral-800 border border-neutral-700 px-2 py-1 text-[11px] text-neutral-200 hover:bg-neutral-750 transition-colors"
                        title="Insert CSS rule applying this font family to .ft-hero and .ft-showcase-body"
                      >
                        Apply Rule (.ft-hero)
                      </button>
                      <button
                        type="button"
                        onclick={async () => {
                          const snippet = `@font-face {\n  font-family: '${font.name}';\n  src: url('${font.path}') format('${font.format}');\n  font-display: swap;\n}`;
                          await navigator.clipboard.writeText(snippet);
                          toasts.success('Copied @font-face snippet');
                        }}
                        class="rounded bg-neutral-800 border border-neutral-700 px-2 py-1 text-[11px] text-neutral-400 hover:text-neutral-200 hover:bg-neutral-750 transition-colors"
                      >
                        Copy Snippet
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

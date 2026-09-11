<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { CharacterDraft } from '$lib/studio/draft.svelte';
  import { HOOKS } from '@formatavern/shared';
  import { loadCustomCss } from '@formatavern/shared/customCss/loader';
  import type { SanitizeIssue, LintIssue } from '@formatavern/shared/customCss';
  import { toasts } from '$lib/state/toasts.svelte';

  let { draft }: { draft: CharacterDraft } = $props();

  let textarea = $state<HTMLTextAreaElement>();
  let activeTab = $state<'editor' | 'hooks'>('editor');
  let copiedHook = $state<string | null>(null);

  const MAX_CHARS = 131_072;
  const charCount = $derived((draft.card.customCss ?? '').length);
  const percentUsed = $derived(Math.min(100, Math.round((charCount / MAX_CHARS) * 100)));
  const placeholderText = `/* Author custom CSS scoped to companion showcase.\n   Example:\n   .ft-hero {\n     border: 1px solid var(--theme-accent);\n   }\n*/`;

  let reports = $state<SanitizeIssue[]>([]);
  let lints = $state<LintIssue[]>([]);
  let isAnalyzing = $state(false);
  let debounceTimer: any = null;

  $effect(() => {
    const code = draft.card.customCss ?? '';
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (!code.trim()) {
        reports = [];
        lints = [];
        return;
      }
      isAnalyzing = true;
      try {
        const { sanitizeCss, lintSheet } = await loadCustomCss();
        const out = sanitizeCss(code, 'character');
        reports = out.report;
        lints = lintSheet(code);
      } catch (err: any) {
        reports = [{ kind: 'parse-fatal', detail: err?.message ?? 'Unknown CSS parse error' }];
        lints = [];
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
    const current = draft.card.customCss ?? '';
    draft.card.customCss = current.slice(0, start) + snippet + current.slice(end);

    setTimeout(() => {
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(start + snippet.length, start + snippet.length);
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
</script>

<div class="flex flex-col h-full space-y-4">
  <!-- Toolbar: Quick Snippets & Size Meter -->
  <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900/80 p-2.5 shrink-0">
    <div class="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onclick={() => insertSnippet('.ft-hero {\n  /* Custom hero styling */\n}\n')}
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
      {:else if (draft.card.customCss ?? '').trim()}
        <span class="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 border border-emerald-500/40">
          Valid
        </span>
      {/if}
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
        <span class="text-[11px] text-neutral-500">Pure CSS • Scoped to Character Page</span>
      </div>
      <textarea
        bind:this={textarea}
        bind:value={draft.card.customCss}
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
          Diagnostics ({reports.length + lints.length})
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
      </div>

      <!-- Tab Content -->
      <div class="flex-1 overflow-y-auto p-3 text-xs space-y-3">
        {#if activeTab === 'editor'}
          {#if reports.length === 0 && lints.length === 0}
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
        {:else}
          <!-- Hooks Reference List -->
          <div class="space-y-4">
            <p class="text-[11px] text-neutral-400">
              Click any hook to copy its selector. Use these stable contract classes in your CSS.
            </p>

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
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

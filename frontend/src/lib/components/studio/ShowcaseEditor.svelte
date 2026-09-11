<script lang="ts">
  import type { CharacterDraft } from '$lib/studio/draft.svelte';
  import ShowcaseBody from '$lib/components/showcase/ShowcaseBody.svelte';

  let { draft }: { draft: CharacterDraft } = $props();

  let textarea = $state<HTMLTextAreaElement>();
  let activeMode = $state<'split' | 'edit' | 'preview'>('split');

  const byteLength = $derived(new TextEncoder().encode(draft.card.showcase ?? '').length);
  const maxBytes = 65_536;
  const percentUsed = $derived(Math.min(100, Math.round((byteLength / maxBytes) * 100)));

  function insertSnippet(before: string, after = '') {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = draft.card.showcase ?? '';
    const selected = current.slice(start, end);
    const replacement = `${before}${selected || 'text'}${after}`;

    draft.card.showcase = current.slice(0, start) + replacement + current.slice(end);

    setTimeout(() => {
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + (selected.length || 4));
    }, 0);
  }
</script>

<div class="space-y-4 flex flex-col h-full">
  <!-- Toolbar & Size Meter -->
  <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900/80 p-2.5">
    <div class="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onclick={() => insertSnippet('## ', '\n')}
        class="rounded-lg border border-neutral-800 bg-neutral-850 px-2.5 py-1 text-xs font-mono text-neutral-300 hover:bg-neutral-800 hover:text-white"
      >
        ## Heading
      </button>

      <button
        type="button"
        onclick={() => insertSnippet('> ', '\n')}
        class="rounded-lg border border-neutral-800 bg-neutral-850 px-2.5 py-1 text-xs font-mono text-neutral-300 hover:bg-neutral-800 hover:text-white"
      >
        &gt; Quote
      </button>

      <button
        type="button"
        onclick={() => insertSnippet('<p style="text-align: center;">', '</p>')}
        class="rounded-lg border border-neutral-800 bg-neutral-850 px-2.5 py-1 text-xs font-mono text-neutral-300 hover:bg-neutral-800 hover:text-white"
      >
        Centered &lt;p&gt;
      </button>

      <button
        type="button"
        onclick={() => insertSnippet('<span style="color: #38bdf8;">', '</span>')}
        class="rounded-lg border border-neutral-800 bg-neutral-850 px-2.5 py-1 text-xs font-mono text-neutral-300 hover:bg-neutral-800 hover:text-white"
      >
        Colored &lt;span&gt;
      </button>
    </div>

    <!-- Size Meter & Split Toggle -->
    <div class="flex items-center gap-4 text-xs font-mono">
      <div class="flex items-center gap-2">
        <span class="text-neutral-400">Size:</span>
        <span class="{percentUsed > 90 ? 'text-red-400 font-bold' : 'text-neutral-300'}">
          {(byteLength / 1024).toFixed(1)} / 64 KiB ({percentUsed}%)
        </span>
        <div class="h-1.5 w-16 overflow-hidden rounded-full bg-neutral-800">
          <div
            class="h-full {percentUsed > 90 ? 'bg-red-500' : 'bg-accent'}"
            style="width: {percentUsed}%;"
          ></div>
        </div>
      </div>

      <div class="hidden sm:flex rounded-lg bg-neutral-950 p-0.5 border border-neutral-800">
        <button
          type="button"
          onclick={() => (activeMode = 'split')}
          class="rounded px-2 py-0.5 text-[11px] {activeMode === 'split' ? 'bg-neutral-800 text-white' : 'text-neutral-400'}"
        >
          Split
        </button>
        <button
          type="button"
          onclick={() => (activeMode = 'edit')}
          class="rounded px-2 py-0.5 text-[11px] {activeMode === 'edit' ? 'bg-neutral-800 text-white' : 'text-neutral-400'}"
        >
          Edit
        </button>
        <button
          type="button"
          onclick={() => (activeMode = 'preview')}
          class="rounded px-2 py-0.5 text-[11px] {activeMode === 'preview' ? 'bg-neutral-800 text-white' : 'text-neutral-400'}"
        >
          Preview
        </button>
      </div>
    </div>
  </div>

  <!-- Editor / Preview Grid -->
  <div class="grid flex-1 gap-4 {activeMode === 'split' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'} min-h-[420px]">
    <!-- Markdown Input -->
    {#if activeMode === 'split' || activeMode === 'edit'}
      <div class="flex flex-col rounded-2xl border border-neutral-800 bg-neutral-900 p-3 overflow-hidden">
        <textarea
          bind:this={textarea}
          bind:value={draft.card.showcase}
          placeholder="Write rich markdown and inline-styled HTML for your companion's showcase page..."
          class="flex-1 w-full bg-transparent p-2 text-sm font-mono text-neutral-200 placeholder-neutral-500 focus:outline-none resize-none leading-relaxed"
        ></textarea>
      </div>
    {/if}

    <!-- Live Showcase Preview -->
    {#if activeMode === 'split' || activeMode === 'preview'}
      <div
        data-ft-surface="character"
        class="flex flex-col rounded-2xl border border-neutral-800 bg-neutral-950 p-6 overflow-y-auto max-h-[600px]"
      >
        {#if draft.card.showcase}
          <ShowcaseBody markdown={draft.card.showcase} />
        {:else}
          <div class="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-neutral-850 text-neutral-500 text-xs">
            Preview will render here as you type markdown.
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

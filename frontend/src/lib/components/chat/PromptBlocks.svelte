<script lang="ts">
  import { toasts } from '$lib/state/toasts.svelte';
  import { prefs } from '$lib/state/prefs.svelte';
  import Icon from '../ui/Icon.svelte';
  import { blockLabel, type PreviewData } from '$lib/prompt/preview';
  import { copyToClipboard } from '$lib/utils/clipboard';

  let { data }: { data: PreviewData } = $props();

  async function copyText(text: string, label: string) {
    const ok = await copyToClipboard(text);
    if (ok) {
      toasts.success(`${label} copied to clipboard`);
    } else {
      toasts.error('Failed to copy to clipboard');
    }
  }

  const bottomIds = $derived(data.blocks.filter((b) => ['9a', '9b', '9c'].includes(b.id) && b.included));
  const lastHistory = $derived(data.history.length > 0 ? data.history[data.history.length - 1] : null);
  const bottomOnLastTurn = $derived(lastHistory?.role === 'user' && bottomIds.length > 0);

  const budget = $derived.by(() => {
    const t = data.tokens;
    const pct = (n: number) => (t.available > 0 ? Math.min(100, (n / t.available) * 100) : 0);
    return {
      staticPct: pct(t.static),
      historyPct: pct(t.history),
      bottomPct: pct(t.bottom),
      over: t.total > t.available
    };
  });
</script>

<div class="space-y-4">
  <!-- Budget bar -->
  <div>
    <div class="flex h-2 w-full overflow-hidden rounded-full bg-(--chrome-line)/50" aria-hidden="true">
      <div class="h-full bg-sky-500/80" style="width: {budget.staticPct}%"></div>
      <div class="h-full bg-violet-500/80" style="width: {budget.historyPct}%"></div>
      <div class="h-full bg-emerald-500/80" style="width: {budget.bottomPct}%"></div>
    </div>
    <div class="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-(--chrome-text)/70">
      <span><span class="text-sky-400">■</span> static {data.tokens.static}</span>
      <span><span class="text-violet-400">■</span> history {data.tokens.history}</span>
      <span><span class="text-emerald-400">■</span> bottom {data.tokens.bottom}</span>
      <span class={budget.over ? 'text-red-300' : ''}>total {data.tokens.total} / {data.tokens.available}</span>
      {#if data.tokens.droppedTurns > 0}
        <span class="text-amber-300">{data.tokens.droppedTurns} turns dropped</span>
      {/if}
    </div>
  </div>

  {#if data.warnings.length > 0}
    <div class="rounded-xl border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-xs text-amber-200/90">
      {#each data.warnings as w (w)}
        <p>{w}</p>
      {/each}
    </div>
  {/if}

  <!-- Blocks in canonical backend order -->
  <div class="space-y-1.5">
    {#each data.blocks as block (block.id)}
      <details class="rounded-xl border border-(--chrome-line) bg-(--chrome-bg) text-xs">
        <summary class="flex cursor-pointer items-center gap-2 px-3 py-2 select-none">
          <span
            class="h-2 w-2 shrink-0 rounded-full {block.included ? 'bg-emerald-400' : 'bg-(--chrome-line)'}"
            title={block.included ? 'Included' : 'Skipped'}
            aria-hidden="true"
          ></span>
          <span class="font-mono text-[10px] text-(--chrome-text)/50">{block.id}</span>
          <span class="flex-1 truncate font-medium text-(--chrome-text)">{blockLabel(block.id)}</span>
          <span class="font-mono text-[10px] text-(--chrome-text)/50">{block.tokens}t</span>
          {#if block.included && block.text}
            <button
              type="button"
              onclick={(e) => {
                e.preventDefault();
                void copyText(block.text!, `Block ${block.id}`);
              }}
              class="rounded p-1 text-(--chrome-text)/50 hover:bg-(--chrome-line)/50 hover:text-(--chrome-text) transition-colors"
              title="Copy block {block.id}"
              aria-label="Copy block {block.id}"
            >
              <Icon name="copy" size={12} />
            </button>
          {/if}
        </summary>
        <div class="border-t border-(--chrome-line)/60 px-3 py-2">
          {#if block.id === '8'}
            <!-- Block 8 has no inline text: its content IS the history section below. -->
            {#if block.included}
              <p class="text-[11px] text-(--chrome-text)/70">
                Shown in <span class="text-(--chrome-text)">History as sent</span> below
                ({data.history.length} turns, {block.tokens}t).
              </p>
            {:else}
              <p class="text-[11px] text-(--chrome-text)/50">Skipped — {block.reason ?? 'empty'}.</p>
            {/if}
          {:else if block.included && block.text}
            <pre class="max-h-64 overflow-y-auto font-mono text-[11px] whitespace-pre-wrap text-(--chrome-text)/90">{block.text}</pre>
          {:else}
            <p class="text-[11px] text-(--chrome-text)/50">Skipped — {block.reason ?? 'empty'}.</p>
          {/if}
        </div>
      </details>
    {/each}
  </div>

  <!-- History as sent -->
  <div>
    <h4 class="mb-1.5 text-xs font-semibold uppercase tracking-wider text-(--chrome-text)/70">History as sent ({data.history.length})</h4>
    {#if data.history.length === 0}
      <p class="text-[11px] text-(--chrome-text)/50">No history yet — the next turn starts from the static prompt.</p>
    {:else}
      <div class="space-y-1.5">
        {#each data.history as turn, i (i)}
          <div class="rounded-xl border border-(--chrome-line) bg-(--chrome-bg) px-3 py-2">
            <div class="mb-1 flex items-center gap-2">
              <span
                class="rounded px-1.5 py-0.5 font-mono text-[10px] {turn.role === 'user'
                  ? 'bg-sky-950 text-sky-300'
                  : turn.role === 'assistant'
                    ? 'bg-violet-950 text-violet-300'
                    : 'bg-(--chrome-line) text-(--chrome-text)/80'}"
              >
                {turn.role}
              </span>
              {#if bottomOnLastTurn && i === data.history.length - 1}
                <span class="rounded bg-emerald-950 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300" title="Bottom blocks 9a/9b/9c ride on this turn">
                  +bottom {bottomIds.map((b) => b.id).join('/')}
                </span>
              {/if}
            </div>
            <pre class="max-h-40 overflow-y-auto font-mono text-[11px] whitespace-pre-wrap text-(--chrome-text)/90">{turn.content}</pre>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- System prompt, prefill, stops -->
  <details class="rounded-xl border border-(--chrome-line) bg-(--chrome-bg) text-xs">
    <summary class="flex cursor-pointer items-center gap-2 px-3 py-2 select-none">
      <span class="flex-1 font-medium text-(--chrome-text)">Full system prompt</span>
      <button
        type="button"
        onclick={(e) => {
          e.preventDefault();
          void copyText(data.systemPrompt, 'System prompt');
        }}
        class="rounded p-1 text-(--chrome-text)/50 hover:bg-(--chrome-line)/50 hover:text-(--chrome-text) transition-colors"
        title="Copy system prompt"
        aria-label="Copy system prompt"
      >
        <Icon name="copy" size={12} />
      </button>
    </summary>
    <div class="border-t border-(--chrome-line)/60 px-3 py-2">
      <pre class="max-h-64 overflow-y-auto font-mono text-[11px] whitespace-pre-wrap text-(--chrome-text)/90">{data.systemPrompt}</pre>
    </div>
  </details>

  <div class="grid grid-cols-2 gap-1.5 text-xs">
    <details class="rounded-xl border border-(--chrome-line) bg-(--chrome-bg)">
      <summary class="cursor-pointer px-3 py-2 font-medium text-(--chrome-text) select-none">Prefill</summary>
      <div class="border-t border-(--chrome-line)/60 px-3 py-2">
        <pre class="font-mono text-[11px] whitespace-pre-wrap text-(--chrome-text)/90">{data.assistantPrefill ?? '(none)'}</pre>
      </div>
    </details>
    <details class="rounded-xl border border-(--chrome-line) bg-(--chrome-bg)">
      <summary class="cursor-pointer px-3 py-2 font-medium text-(--chrome-text) select-none">Stops ({data.stop.length})</summary>
      <div class="border-t border-(--chrome-line)/60 px-3 py-2">
        <pre class="font-mono text-[11px] whitespace-pre-wrap text-(--chrome-text)/90">{data.stop.length > 0 ? data.stop.join('\n') : '(none)'}</pre>
      </div>
    </details>
  </div>

  {#if prefs.devMode}
    <details class="rounded-xl border border-(--chrome-line) bg-(--chrome-bg) text-xs">
      <summary class="cursor-pointer px-3 py-2 font-medium text-(--chrome-text) select-none">Raw JSON (dev)</summary>
      <div class="border-t border-(--chrome-line)/60 px-3 py-2">
        <pre class="max-h-64 overflow-y-auto font-mono text-[10px] whitespace-pre-wrap text-(--chrome-text)/70">{JSON.stringify(data, null, 2)}</pre>
      </div>
    </details>
  {/if}
</div>

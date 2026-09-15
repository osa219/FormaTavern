<script lang="ts">
  import { api, toUiError } from '$lib/api';
  import { HOOKS } from '@formatavern/shared';
  import Icon from '$lib/components/ui/Icon.svelte';
  import PromptBlocks from '$lib/components/chat/PromptBlocks.svelte';
  import type { CharacterDraft } from '$lib/studio/draft.svelte';
  import { isStudioPreviewData, type StudioPreviewData } from '$lib/prompt/preview';

  let { draft }: { draft: CharacterDraft } = $props();

  type Status = 'loading' | 'ready' | 'error' | 'budget';
  let status = $state<Status>('loading');
  let data = $state<StudioPreviewData | null>(null);
  let errorMsg = $state('');
  let stale = $state(false);
  let firstRun = true;
  let debounce: any = null;

  // Live-resolve from the unsaved card: prompt-relevant fields only (style and
  // showcase never reach the prompt, so they must not refetch it).
  const cardKey = $derived(
    JSON.stringify({
      name: draft.card.name,
      description: draft.card.description,
      personality: draft.card.personality,
      scenario: draft.card.scenario,
      exampleDialogue: draft.card.exampleDialogue,
      firstMessage: draft.card.firstMessage,
      stateSchema: draft.card.stateSchema
    })
  );

  async function load() {
    status = 'loading';
    errorMsg = '';
    try {
      const { data: res, error } = await (api.api.characters as any)['prompt-preview'].post({
        card: draft.card
      });
      if (error) {
        status = (error as any)?.status === 413 ? 'budget' : 'error';
        errorMsg = toUiError(error).message;
        return;
      }
      if (!isStudioPreviewData(res)) {
        status = 'error';
        errorMsg = 'Unexpected preview response from server.';
        return;
      }
      data = res;
      status = 'ready';
    } catch (err: any) {
      status = 'error';
      errorMsg = toUiError(err).message;
    }
  }

  $effect(() => {
    void cardKey;
    if (firstRun) {
      firstRun = false;
      void load();
      return;
    }
    stale = true;
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      stale = false;
      void load();
    }, 500);
    return () => clearTimeout(debounce);
  });

  const emptyCore = $derived(
    [draft.card.description, draft.card.personality, draft.card.scenario, draft.card.exampleDialogue].every(
      (f) => (f ?? '').trim() === ''
    )
  );
</script>

<div class="space-y-4 text-xs leading-relaxed text-neutral-300 {HOOKS.shell.studioPrompt}">
  <div class="flex items-center justify-between gap-2">
    <div class="flex items-center gap-2">
      <h3 class="font-semibold uppercase tracking-wider text-accent">Card prompt preview</h3>
      {#if data}
        <span class="rounded border border-neutral-800 bg-neutral-950 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
          {data.prompt.dialect}
        </span>
      {/if}
      {#if stale}
        <span class="font-mono text-[10px] text-neutral-500" aria-live="polite">Updating…</span>
      {/if}
    </div>
    <button
      type="button"
      onclick={() => load()}
      disabled={status === 'loading'}
      class="flex items-center gap-1 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-[11px] text-neutral-400 hover:text-neutral-200 disabled:opacity-40"
      title="Refresh preview"
      aria-label="Refresh preview"
    >
      <Icon name="regenerate" size={12} />
      <span>Refresh</span>
    </button>
  </div>

  <p class="text-[11px] text-neutral-500">
    What this card would send before any history exists, resolved live from your unsaved edits.
    Read-only — nothing is written.
  </p>

  {#if emptyCore}
    <div class="rounded-xl border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-amber-200/90" role="note">
      This card is nearly empty — description, personality, scenario, and example dialogue are all
      blank (see the Voice tab). The model would invent nearly everything from the format template alone.
    </div>
  {/if}

  {#if status === 'loading' && !data}
    <p class="text-neutral-500" aria-live="polite">Assembling prompt…</p>
  {:else if status === 'error'}
    <div class="rounded-xl border border-red-900/60 bg-red-950/20 p-3 text-red-200" role="alert">
      <p class="font-semibold">Preview failed</p>
      <p class="mt-1">{errorMsg}</p>
    </div>
  {:else if status === 'budget'}
    <div class="rounded-xl border border-amber-900/60 bg-amber-950/20 p-3 text-amber-200" role="alert">
      <p class="font-semibold">Over budget — sending would fail the same way</p>
      <p class="mt-1">{errorMsg}</p>
    </div>
  {:else if data}
    <PromptBlocks data={data.prompt} />

    <!-- Greeting parse -->
    <div>
      <h4 class="mb-1.5 font-semibold uppercase tracking-wider text-neutral-400">Greeting</h4>
      {#if !data.greeting}
        <p class="text-[11px] text-neutral-500">No greeting set — chats would open with an empty first turn.</p>
      {:else}
        <div class="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2">
          <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
            {#each data.greeting.segments as seg, i (i)}
              <span class="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-300">
                {seg.kind}{seg.name ? `:${seg.name}` : ''}
              </span>
            {/each}
            {#if data.greeting.adherent}
              <span class="rounded bg-emerald-950 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">clean parse</span>
            {:else}
              <span class="rounded bg-amber-950 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">needs state block</span>
            {/if}
          </div>
          {#if data.greeting.warnings.length > 0}
            <div class="mb-1.5 text-[11px] text-amber-200/90">
              {#each data.greeting.warnings as w (w)}
                <p>{w}</p>
              {/each}
            </div>
          {/if}
          <pre class="max-h-40 overflow-y-auto font-mono text-[11px] whitespace-pre-wrap text-neutral-300">{data.greeting.text}</pre>
        </div>
      {/if}
    </div>
  {/if}
</div>

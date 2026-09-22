<script lang="ts">
  import { onMount } from 'svelte';
  import type { CharacterDraft } from '$lib/studio/draft.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import { api, toUiError } from '$lib/api';
  import { toasts } from '$lib/state/toasts.svelte';

  let { draft }: { draft: CharacterDraft } = $props();

  interface GreetingReview {
    original: string;
    rewritten: string;
    warnings: string[];
  }

  let reviews = $state<Record<string, GreetingReview | undefined>>({});
  let rewritingKey = $state<string | null>(null);

  function envelopeOverride(key: string): string | undefined {
    const envelope = draft.card.greetingEnvelope;
    if (!envelope) return undefined;
    if (key === 'first') return envelope.first;
    return envelope.alternates?.[key.slice(4)];
  }

  function clearEnvelopeOverride(key: string) {
    const envelope = draft.card.greetingEnvelope;
    if (!envelope) return;
    if (key === 'first') {
      envelope.first = undefined;
    } else if (envelope.alternates) {
      delete envelope.alternates[key.slice(4)];
    }
    if (envelope.first === undefined && (envelope.alternates === undefined || Object.keys(envelope.alternates).length === 0)) {
      draft.card.greetingEnvelope = undefined;
    }
  }

  async function rewriteGreeting(key: string, text: string) {
    if (!text.trim() || rewritingKey) return;
    rewritingKey = key;
    try {
      const { data, error } = await (api.api.characters as any)['greeting-rewrite'].post({
        text,
        characterName: draft.card.name || undefined
      });
      if (error) {
        toasts.error(toUiError(error).message);
        return;
      }
      reviews[key] = {
        original: text,
        rewritten: (data as any).text ?? '',
        warnings: (data as any).warnings ?? []
      };
    } catch (err: any) {
      toasts.error(toUiError(err).message);
    } finally {
      rewritingKey = null;
    }
  }

  function acceptReview(key: string) {
    const review = reviews[key];
    if (!review) return;
    if (!draft.card.greetingEnvelope) draft.card.greetingEnvelope = {};
    if (key === 'first') {
      draft.card.greetingEnvelope.first = review.rewritten;
    } else {
      if (!draft.card.greetingEnvelope.alternates) draft.card.greetingEnvelope.alternates = {};
      draft.card.greetingEnvelope.alternates[key.slice(4)] = review.rewritten;
    }
    reviews[key] = undefined;
    toasts.success('Reviewed envelope greeting saved — original kept for classical chats');
  }

  function alternates(): string[] {
    if (!draft.card.alternateGreetings) draft.card.alternateGreetings = [];
    return draft.card.alternateGreetings;
  }

  function addGreeting() {
    alternates().push('');
  }

  function deleteGreeting(index: number) {
    alternates().splice(index, 1);
  }

  function moveGreeting(index: number, direction: -1 | 1) {
    const list = alternates();
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    const [item] = list.splice(index, 1);
    list.splice(target, 0, item);
  }

  function duplicateGreeting(index: number) {
    const list = alternates();
    list.splice(index + 1, 0, list[index]);
  }

  function greetingExcerpt(text: string): string {
    const singleLine = text.replace(/\s+/g, ' ').trim();
    if (!singleLine) return 'Empty — pruned on save';
    return singleLine.length > 80 ? `${singleLine.slice(0, 80)}…` : singleLine;
  }

  let encodeFn = $state<((text: string) => number[]) | null>(null);

  onMount(async () => {
    try {
      // Dynamic import to preserve bundle budget for chat routes
      const tokenizer = await import('gpt-tokenizer');
      if (typeof tokenizer.encode === 'function') {
        encodeFn = tokenizer.encode;
      }
    } catch {
      // Fallback: character count / 4
      encodeFn = (text: string) => new Array(Math.ceil(text.length / 4));
    }
  });

  function getTokenCount(text?: string): string {
    if (!text) return '0 tokens';
    if (!encodeFn) return `~${Math.ceil(text.length / 4)} tokens`;
    try {
      const count = encodeFn(text).length;
      return `${count.toLocaleString()} tokens`;
    } catch {
      return `~${Math.ceil(text.length / 4)} tokens`;
    }
  }

  const totalVoiceTokens = $derived.by(() => {
    const combined = [
      draft.card.description,
      draft.card.personality,
      draft.card.scenario,
      draft.card.firstMessage,
      ...(draft.card.alternateGreetings ?? []),
      draft.card.exampleDialogue
    ].filter(Boolean).join('\n\n');
    return getTokenCount(combined);
  });
</script>

<div class="space-y-6 max-w-3xl">
  <!-- Voice Overview Bar -->
  <div class="flex items-center justify-between rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-4 py-3 text-xs">
    <div>
      <span class="font-semibold text-(--chrome-text)">System Prompt & Greeting Context</span>
      <p class="text-(--chrome-text)/60 mt-0.5">These fields build the character's core mind, memories, and voice.</p>
    </div>
    <div class="text-right font-mono text-xs">
      <span class="text-(--chrome-text)/60">Total Voice Weight:</span>
      <span class="ml-1 font-semibold text-accent">{totalVoiceTokens}</span>
    </div>
  </div>

  <!-- Description -->
  <div>
    <div class="flex items-center justify-between mb-1.5">
      <label for="voice-description" class="block text-xs font-semibold text-(--chrome-text) uppercase tracking-wider">
        Description / Core Lore <span class="text-accent">*</span>
      </label>
      <span class="text-[11px] font-mono text-(--chrome-text)/50">
        {getTokenCount(draft.card.description)}
      </span>
    </div>
    <textarea
      id="voice-description"
      bind:value={draft.card.description}
      rows={4}
      placeholder="Background, identity, relationship to the user, and key memories..."
      class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) p-3 text-sm text-(--chrome-text) placeholder-(--chrome-text)/40 focus:border-accent focus:outline-none leading-relaxed"
    ></textarea>
    {#if draft.issuesByPath.has('/description')}
      <p class="mt-1 text-xs text-red-400">{draft.issuesByPath.get('/description')![0].message}</p>
    {/if}
  </div>

  <!-- Personality -->
  <div>
    <div class="flex items-center justify-between mb-1.5">
      <label for="voice-personality" class="block text-xs font-semibold text-(--chrome-text) uppercase tracking-wider">
        Personality & Tone <span class="text-accent">*</span>
      </label>
      <span class="text-[11px] font-mono text-(--chrome-text)/50">
        {getTokenCount(draft.card.personality)}
      </span>
    </div>
    <textarea
      id="voice-personality"
      bind:value={draft.card.personality}
      rows={3}
      placeholder="Mannerisms, speech cadence, habits, emotional responses, quirks..."
      class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) p-3 text-sm text-(--chrome-text) placeholder-(--chrome-text)/40 focus:border-accent focus:outline-none leading-relaxed"
    ></textarea>
    {#if draft.issuesByPath.has('/personality')}
      <p class="mt-1 text-xs text-red-400">{draft.issuesByPath.get('/personality')![0].message}</p>
    {/if}
  </div>

  <!-- Scenario -->
  <div>
    <div class="flex items-center justify-between mb-1.5">
      <label for="voice-scenario" class="block text-xs font-semibold text-(--chrome-text) uppercase tracking-wider">
        Scenario & Circumstance <span class="text-accent">*</span>
      </label>
      <span class="text-[11px] font-mono text-(--chrome-text)/50">
        {getTokenCount(draft.card.scenario)}
      </span>
    </div>
    <textarea
      id="voice-scenario"
      bind:value={draft.card.scenario}
      rows={3}
      placeholder="The immediate context, location, stakes, or premise of the encounter..."
      class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) p-3 text-sm text-(--chrome-text) placeholder-(--chrome-text)/40 focus:border-accent focus:outline-none leading-relaxed"
    ></textarea>
    {#if draft.issuesByPath.has('/scenario')}
      <p class="mt-1 text-xs text-red-400">{draft.issuesByPath.get('/scenario')![0].message}</p>
    {/if}
  </div>

  <!-- Envelope greeting mode -->
  <div class="rounded-xl border border-(--chrome-line) bg-(--chrome-surface)/60 p-3.5">
    <div class="mb-1.5 flex items-center justify-between gap-2">
      <span class="block text-xs font-semibold text-(--chrome-text) uppercase tracking-wider">
        Envelope Greeting
      </span>
      <select
        value={draft.card.greetingMode ?? 'prologue'}
        oninput={(e) => {
          draft.card.greetingMode = (e.currentTarget.value || undefined) as any;
        }}
        class="rounded-lg border border-(--chrome-line) bg-(--chrome-bg) px-2 py-1 text-xs text-(--chrome-text) focus:border-accent focus:outline-none"
        aria-label="Envelope greeting mode"
      >
        <option value="prologue">Prologue tag (default)</option>
        <option value="split">Split voices</option>
        <option value="ai">AI rewrite + review</option>
      </select>
    </div>
    <p class="text-xs text-(--chrome-text)/50 leading-relaxed">
      How greetings are sent in three-track envelope chats. Already-tagged greetings convert automatically.
      Originals are never rewritten — classical chats always use the authentic text.
    </p>
  </div>

  <!-- First Message (Greeting 1, primary) -->
  <div>
    <div class="flex items-center justify-between mb-1.5">
      <label for="voice-first-message" class="block text-xs font-semibold text-(--chrome-text) uppercase tracking-wider">
        Greeting 1 — First Message <span class="text-accent">*</span>
      </label>
      <span class="text-[11px] font-mono text-(--chrome-text)/50">
        {getTokenCount(draft.card.firstMessage)}
      </span>
    </div>
    <textarea
      id="voice-first-message"
      bind:value={draft.card.firstMessage}
      rows={5}
      placeholder={`Opening roleplay turn. You can use standard narrative envelopes:\n"Stay behind me," Eldrin says. *He gestures toward the doorway.*\n<narrator>Dust falls from the vault arches.</narrator>`}
      class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) p-3 text-sm text-(--chrome-text) placeholder-(--chrome-text)/40 focus:border-accent focus:outline-none leading-relaxed font-mono"
    ></textarea>
    {#if draft.issuesByPath.has('/firstMessage')}
      <p class="mt-1 text-xs text-red-400">{draft.issuesByPath.get('/firstMessage')![0].message}</p>
    {/if}
    {#if (draft.card.greetingMode ?? 'prologue') === 'ai'}
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onclick={() => rewriteGreeting('first', draft.card.firstMessage)}
          disabled={!draft.card.firstMessage.trim() || rewritingKey !== null}
          class="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20 disabled:opacity-50"
        >
          {#if rewritingKey === 'first'}
            <Spinner size={12} />
            <span>Rewriting…</span>
          {:else}
            <Icon name="sparkles" size={12} />
            <span>AI rewrite…</span>
          {/if}
        </button>
        {#if envelopeOverride('first')}
          <span class="text-[11px] text-(--chrome-text)/60">Reviewed override saved</span>
          <button
            type="button"
            onclick={() => clearEnvelopeOverride('first')}
            class="text-[11px] text-red-400 hover:text-red-300"
          >
            Clear
          </button>
        {/if}
      </div>
      {#if reviews['first']}
        <div class="mt-2 rounded-xl border border-accent/30 bg-(--chrome-bg)/60 p-3 space-y-2">
          <p class="text-[11px] font-semibold text-(--chrome-text)">Review rewritten greeting</p>
          {#if reviews['first']!.warnings.length > 0}
            <p class="text-[11px] text-amber-300">Parser notes: {reviews['first']!.warnings.join(', ')}</p>
          {/if}
          <pre class="whitespace-pre-wrap rounded-lg bg-(--chrome-surface) p-2 font-mono text-[11px] text-(--chrome-text)/80">{reviews['first']!.rewritten}</pre>
          <div class="flex gap-2">
            <button
              type="button"
              onclick={() => acceptReview('first')}
              class="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-accent-contrast hover:bg-accent/90"
            >
              Accept
            </button>
            <button
              type="button"
              onclick={() => (reviews['first'] = undefined)}
              class="rounded-lg border border-(--chrome-line) px-2.5 py-1.5 text-xs text-(--chrome-text)/80 hover:bg-(--chrome-line)/40"
            >
              Discard
            </button>
          </div>
        </div>
      {/if}
    {/if}
    <p class="mt-1 text-xs text-(--chrome-text)/50">
      Previewed in real-time in the Live Aesthetic Preview rail.
    </p>
  </div>

  <!-- Alternate Greetings -->
  <div>
    <div class="flex items-center justify-between mb-1.5">
      <span class="block text-xs font-semibold text-(--chrome-text) uppercase tracking-wider">
        Alternate Greetings ({alternates().length})
      </span>
      <button
        type="button"
        onclick={addGreeting}
        class="inline-flex items-center gap-1 rounded-lg border border-(--chrome-line) bg-(--chrome-surface) px-2 py-1 text-[11px] font-semibold text-(--chrome-text) hover:bg-(--chrome-line)/40"
      >
        <Icon name="plus" size={12} />
        <span>Add greeting</span>
      </button>
    </div>
    <p class="mb-2 text-xs text-(--chrome-text)/50">
      Extra opening lines readers can pick when starting a chat. Empty ones are pruned on save; use ↑ ↓ to reorder.
    </p>

    {#each alternates() as _, i}
      <div class="mb-2 rounded-xl border border-(--chrome-line) bg-(--chrome-surface)/60 p-3">
        <div class="mb-1.5 flex items-center justify-between gap-2">
          <span class="truncate text-xs font-semibold text-(--chrome-text)" title={alternates()[i]}>
            Greeting {i + 2} · {greetingExcerpt(alternates()[i])}
          </span>
          <span class="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onclick={() => moveGreeting(i, -1)}
              disabled={i === 0}
              class="rounded p-1 text-(--chrome-text)/60 hover:bg-(--chrome-line)/40 hover:text-(--chrome-text) disabled:opacity-30"
              title="Move up"
              aria-label="Move greeting {i + 2} up"
            >
              <Icon name="chevron-up" size={13} />
            </button>
            <button
              type="button"
              onclick={() => moveGreeting(i, 1)}
              disabled={i === alternates().length - 1}
              class="rounded p-1 text-(--chrome-text)/60 hover:bg-(--chrome-line)/40 hover:text-(--chrome-text) disabled:opacity-30"
              title="Move down"
              aria-label="Move greeting {i + 2} down"
            >
              <Icon name="chevron-down" size={13} />
            </button>
            <button
              type="button"
              onclick={() => duplicateGreeting(i)}
              class="rounded p-1 text-(--chrome-text)/60 hover:bg-(--chrome-line)/40 hover:text-(--chrome-text)"
              title="Duplicate"
              aria-label="Duplicate greeting {i + 2}"
            >
              <Icon name="copy" size={13} />
            </button>
            <button
              type="button"
              onclick={() => deleteGreeting(i)}
              class="rounded p-1 text-(--chrome-text)/60 hover:bg-red-500/20 hover:text-red-300"
              title="Delete"
              aria-label="Delete greeting {i + 2}"
            >
              <Icon name="trash" size={13} />
            </button>
          </span>
        </div>
        <textarea
          value={alternates()[i]}
          oninput={(e) => {
            alternates()[i] = e.currentTarget.value;
          }}
          rows={3}
          placeholder="Another opening line for this character..."
          class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) p-3 text-sm text-(--chrome-text) placeholder-(--chrome-text)/40 focus:border-accent focus:outline-none leading-relaxed font-mono"
          aria-label="Alternate greeting {i + 2}"
        ></textarea>
        <div class="mt-1 flex items-center justify-between gap-2">
          <div>
            {#if (draft.card.greetingMode ?? 'prologue') === 'ai'}
              <button
                type="button"
                onclick={() => rewriteGreeting(`alt-${i}`, alternates()[i])}
                disabled={!alternates()[i]?.trim() || rewritingKey !== null}
                class="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent/20 disabled:opacity-50"
              >
                {#if rewritingKey === `alt-${i}`}
                  <Spinner size={12} />
                  <span>Rewriting…</span>
                {:else}
                  <Icon name="sparkles" size={12} />
                  <span>AI rewrite…</span>
                {/if}
              </button>
              {#if envelopeOverride(`alt-${i}`)}
                <span class="ml-2 text-[11px] text-(--chrome-text)/60">Override saved</span>
                <button
                  type="button"
                  onclick={() => clearEnvelopeOverride(`alt-${i}`)}
                  class="ml-1 text-[11px] text-red-400 hover:text-red-300"
                >
                  Clear
                </button>
              {/if}
            {/if}
          </div>
          <span class="text-[11px] font-mono text-(--chrome-text)/50">
            {getTokenCount(alternates()[i])}
          </span>
        </div>
        {#if (draft.card.greetingMode ?? 'prologue') === 'ai' && reviews[`alt-${i}`]}
          <div class="mt-2 rounded-xl border border-accent/30 bg-(--chrome-bg)/60 p-3 space-y-2">
            <p class="text-[11px] font-semibold text-(--chrome-text)">Review rewritten greeting</p>
            {#if reviews[`alt-${i}`]!.warnings.length > 0}
              <p class="text-[11px] text-amber-300">Parser notes: {reviews[`alt-${i}`]!.warnings.join(', ')}</p>
            {/if}
            <pre class="whitespace-pre-wrap rounded-lg bg-(--chrome-surface) p-2 font-mono text-[11px] text-(--chrome-text)/80">{reviews[`alt-${i}`]!.rewritten}</pre>
            <div class="flex gap-2">
              <button
                type="button"
                onclick={() => acceptReview(`alt-${i}`)}
                class="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-accent-contrast hover:bg-accent/90"
              >
                Accept
              </button>
              <button
                type="button"
                onclick={() => (reviews[`alt-${i}`] = undefined)}
                class="rounded-lg border border-(--chrome-line) px-2.5 py-1.5 text-xs text-(--chrome-text)/80 hover:bg-(--chrome-line)/40"
              >
                Discard
              </button>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Example Dialogue -->
  <div>
    <div class="flex items-center justify-between mb-1.5">
      <label for="voice-examples" class="block text-xs font-semibold text-(--chrome-text) uppercase tracking-wider">
        Example Dialogue (Optional)
      </label>
      <span class="text-[11px] font-mono text-(--chrome-text)/50">
        {getTokenCount(draft.card.exampleDialogue)}
      </span>
    </div>
    <textarea
      id="voice-examples"
      bind:value={draft.card.exampleDialogue}
      rows={4}
      placeholder={`<START>\n{{user}}: "Can the ritual be undone?"\n{{char}}: "Undone? No. Deflected, perhaps—if you possess the courage to pay the toll."`}
      class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) p-3 text-sm text-(--chrome-text) placeholder-(--chrome-text)/40 focus:border-accent focus:outline-none leading-relaxed font-mono"
    ></textarea>
  </div>
</div>

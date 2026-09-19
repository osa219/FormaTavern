<script lang="ts">
  import { onMount } from 'svelte';
  import type { CharacterDraft } from '$lib/studio/draft.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';

  let { draft }: { draft: CharacterDraft } = $props();

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
        <div class="mt-1 text-right text-[11px] font-mono text-(--chrome-text)/50">
          {getTokenCount(alternates()[i])}
        </div>
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

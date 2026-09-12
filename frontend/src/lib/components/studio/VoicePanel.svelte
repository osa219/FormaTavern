<script lang="ts">
  import { onMount } from 'svelte';
  import type { CharacterDraft } from '$lib/studio/draft.svelte';

  let { draft }: { draft: CharacterDraft } = $props();

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
      <p class="text-(--chrome-text)/60 mt-0.5">These fields build the companion's core mind, memories, and voice.</p>
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

  <!-- First Message -->
  <div>
    <div class="flex items-center justify-between mb-1.5">
      <label for="voice-first-message" class="block text-xs font-semibold text-(--chrome-text) uppercase tracking-wider">
        First Message (Greeting) <span class="text-accent">*</span>
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

<script lang="ts">
  import type { CharacterDraft } from '$lib/studio/draft.svelte';
  import { themeToCssVars, serializeVars } from '$lib/theme/cssVars';
  import { parseGreeting } from '$lib/studio/greetingPreview';
  import SpeechBubble from '$lib/components/chat/SpeechBubble.svelte';
  import NarratorBlock from '$lib/components/chat/NarratorBlock.svelte';
  import CustomStyleOutlet from '$lib/components/custom/CustomStyleOutlet.svelte';

  let { draft }: { draft: CharacterDraft } = $props();

  const themeVars = $derived(serializeVars(themeToCssVars(draft.previewTheme.theme)));
  const greetingResult = $derived(parseGreeting(draft.card.firstMessage, draft.card.name || 'Companion'));
  const segments = $derived(greetingResult.segments);

  let activeTab = $state<'greeting' | 'samples'>('greeting');
</script>

<div class="flex flex-col h-full rounded-2xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
  <!-- Header: Title + Tab Toggle -->
  <div class="flex items-center justify-between border-b border-neutral-800 px-4 py-2.5 bg-neutral-900/80">
    <div class="flex items-center gap-2">
      <span class="text-xs font-semibold uppercase tracking-wider text-accent">
        Live Aesthetic Preview
      </span>
    </div>

    <div class="flex items-center rounded-lg bg-neutral-950 p-0.5 border border-neutral-800">
      <button
        type="button"
        onclick={() => (activeTab = 'greeting')}
        class="rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors {activeTab === 'greeting'
          ? 'bg-neutral-800 text-neutral-100 shadow-sm'
          : 'text-neutral-400 hover:text-neutral-200'}"
      >
        Greeting
      </button>
      <button
        type="button"
        onclick={() => (activeTab = 'samples')}
        class="rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors {activeTab === 'samples'
          ? 'bg-neutral-800 text-neutral-100 shadow-sm'
          : 'text-neutral-400 hover:text-neutral-200'}"
      >
        Turn Samples
      </button>
    </div>
  </div>

  <!-- Simulated State Pills (if schema has keys) -->
  {#if draft.card.stateSchema && Object.keys(draft.card.stateSchema).length > 0}
    <div class="flex flex-wrap items-center gap-1.5 border-b border-neutral-800/80 bg-neutral-950/60 px-4 py-2 text-xs">
      <span class="text-[10px] font-mono uppercase tracking-wider text-neutral-500 mr-1">
        Simulate:
      </span>
      {#each Object.entries(draft.card.stateSchema) as [key, schema] (key)}
        {#if schema.type === 'enum' && schema.values}
          <div class="flex items-center gap-1 rounded bg-neutral-900 px-2 py-1 text-[11px] border border-neutral-800">
            <span class="text-neutral-400 font-mono">{key}:</span>
            <select
              value={draft.previewState[key] ?? schema.values[0]}
              onchange={(e) => {
                draft.previewState[key] = (e.target as HTMLSelectElement).value;
              }}
              class="bg-transparent text-accent font-semibold focus:outline-none"
            >
              {#each schema.values as val (val)}
                <option value={val} class="bg-neutral-900 text-neutral-200">{val}</option>
              {/each}
            </select>
          </div>
        {:else if schema.type === 'int'}
          <div class="flex items-center gap-1.5 rounded bg-neutral-900 px-2 py-1 text-[11px] border border-neutral-800">
            <span class="text-neutral-400 font-mono">{key}: {draft.previewState[key] ?? 0}</span>
            <input
              type="range"
              min={schema.min ?? 0}
              max={schema.max ?? 100}
              value={draft.previewState[key] ?? 0}
              oninput={(e) => {
                draft.previewState[key] = Number((e.target as HTMLInputElement).value);
              }}
              class="w-16 accent-accent h-1"
            />
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  <!-- Viewport Root applying author theme CSS variables -->
  <div
    style="{themeVars};"
    data-ft-surface="character"
    class="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-neutral-950 font-(--theme-font-family) text-neutral-100"
  >
    <CustomStyleOutlet scope="character" css={draft.card.customCss} />
    {#if activeTab === 'greeting'}
      {#if segments.length === 0}
        <div class="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-800 text-center p-6 text-neutral-500 text-xs">
          <p>Type a First Message in the Voice tab to preview your opening greeting.</p>
        </div>
      {:else}
        {#each segments as seg, idx (idx)}
          {#if seg.kind === 'narrator'}
            <NarratorBlock text={seg.text} />
          {:else}
            <SpeechBubble
              variant={seg.kind}
              name={seg.name}
              primaryName={draft.card.name || 'Companion'}
              text={seg.text}
            />
          {/if}
        {/each}
      {/if}
    {:else}
      <!-- Turn Samples Mode: Shows all 4 bubble variants -->
      <div class="space-y-4">
        <NarratorBlock text="The chamber falls silent as ancient starlight filters through the dome." />

        <SpeechBubble
          variant="character"
          primaryName={draft.card.name || 'Companion'}
          name={draft.card.name || 'Companion'}
          text="The celestial alignments are shifting. We must begin before the eclipse reaches totality."
        />

        <SpeechBubble
          variant="persona"
          name="You"
          text="I have prepared the focus lenses. Are you ready?"
        />

        <SpeechBubble
          variant="npc"
          name="Observatory Scribe"
          hue={190}
          text="Careful with the refraction prism! The crystal cannot be replaced."
        />
      </div>
    {/if}
  </div>
</div>

<script lang="ts">
  import type { CharacterCard } from '@formatavern/shared';
  import { HOOKS } from '@formatavern/shared';
  import type { CharacterDraft } from '$lib/studio/draft.svelte';
  import { themeToCssVars, serializeVars } from '$lib/theme/cssVars';
  import { parseGreeting } from '$lib/studio/greetingPreview';
  import SpeechBubble from '$lib/components/chat/SpeechBubble.svelte';
  import NarratorBlock from '$lib/components/chat/NarratorBlock.svelte';
  import CustomStyleOutlet from '$lib/components/custom/CustomStyleOutlet.svelte';
  import ShowcaseHero from '$lib/components/showcase/ShowcaseHero.svelte';
  import ShowcaseBody from '$lib/components/showcase/ShowcaseBody.svelte';
  import DecorLayers from '$lib/components/custom/DecorLayers.svelte';

  let {
    draft,
    activeStudioTab = 'identity'
  }: {
    draft: CharacterDraft;
    activeStudioTab?: string;
  } = $props();

  const themeVars = $derived(serializeVars(themeToCssVars(draft.previewTheme.theme)));
  const fx = $derived(draft.card.style?.fx?.bubble ?? 'none');
  const decor = $derived(draft.card.style?.decor ?? []);
  const greetingResult = $derived(parseGreeting(draft.card.firstMessage, draft.card.name || 'Companion'));
  const segments = $derived(greetingResult.segments);

  const previewCard = $derived<CharacterCard>({
    id: draft.characterId || 'preview-companion',
    name: draft.card.name || 'Companion',
    avatar: draft.card.avatar,
    tagline: draft.card.tagline,
    creator: draft.card.creator,
    description: draft.card.description,
    personality: draft.card.personality,
    scenario: draft.card.scenario,
    firstMessage: draft.card.firstMessage,
    showcase: draft.card.showcase,
    customCss: draft.card.customCss,
    tags: draft.card.tags ?? [],
    style: draft.card.style
  });

  let activeTab = $state<'showcase' | 'greeting' | 'samples'>('showcase');

  $effect(() => {
    if (activeStudioTab === 'css' || activeStudioTab === 'showcase') {
      activeTab = 'showcase';
    } else if (activeStudioTab === 'voice') {
      activeTab = 'greeting';
    }
  });
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
        onclick={() => (activeTab = 'showcase')}
        class="rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors {activeTab === 'showcase'
          ? 'bg-neutral-800 text-neutral-100 shadow-sm'
          : 'text-neutral-400 hover:text-neutral-200'}"
      >
        Showcase
      </button>
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
    class="relative flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-neutral-950 font-(--theme-font-family) text-neutral-100"
  >
    <CustomStyleOutlet scope="character" css={draft.card.customCss} />
    <DecorLayers layers={decor} fixed={false} />
    {#if activeTab === 'showcase'}
      <!-- Showcase Mode: Hero + Action Hub + Showcase Body + Dialogue Sample -->
      <div class="space-y-6">
        <ShowcaseHero character={previewCard} />

        <!-- Mock Action Hub with .ft-action-hub hook -->
        <div class="{HOOKS.character.actionHub} flex items-center justify-between gap-3 p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800/80 backdrop-blur-sm">
          <div class="flex items-center gap-2">
            <span class="inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            <span class="text-xs font-medium text-neutral-300">Ready to chat</span>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-xl px-3.5 py-1.5 text-xs font-medium bg-accent text-accent-contrast font-semibold shadow-sm hover:opacity-90 transition-opacity"
            >
              {draft.card.labels?.startStory || 'Start New Story'}
            </button>
          </div>
        </div>

        {#if draft.card.showcase}
          <div class="rounded-2xl border border-neutral-800/80 bg-neutral-900/40 p-4">
            <ShowcaseBody markdown={draft.card.showcase} />
          </div>
        {:else}
          <div class="rounded-2xl border border-dashed border-neutral-800 p-4 text-center text-xs text-neutral-500">
            *No showcase markdown authored yet.*
          </div>
        {/if}

        <div class="space-y-3 pt-2">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Dialogue Sample</span>
          <NarratorBlock text="The chamber falls silent as ancient starlight filters through the dome." />
          <SpeechBubble
            variant="character"
            primaryName={draft.card.name || 'Companion'}
            name={draft.card.name || 'Companion'}
            text="The celestial alignments are shifting. We must begin before the eclipse reaches totality."
            {fx}
          />
        </div>
      </div>
    {:else if activeTab === 'greeting'}
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
              fx={seg.kind === 'character' ? fx : 'none'}
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
          {fx}
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

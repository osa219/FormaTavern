<script lang="ts">
  import { resolveLayout, type CharacterCard, type Segment } from '@formatavern/shared';
  import { HOOKS } from '@formatavern/shared';
  import type { CharacterDraft } from '$lib/studio/draft.svelte';
  import { themeToCssVars, serializeVars } from '$lib/theme/cssVars';
  import { parseGreeting } from '$lib/studio/greetingPreview';
  import { layoutRootAttrs, layoutRootStyle } from '$lib/chat/layoutAttrs';
  import SpeechBubble from '$lib/components/chat/SpeechBubble.svelte';
  import NarratorBlock from '$lib/components/chat/NarratorBlock.svelte';
  import TurnRow from '$lib/components/chat/TurnRow.svelte';
  import CustomStyleOutlet from '$lib/components/custom/CustomStyleOutlet.svelte';
  import ShowcaseHero from '$lib/components/showcase/ShowcaseHero.svelte';
  import ShowcaseBody from '$lib/components/showcase/ShowcaseBody.svelte';
  import DecorLayers from '$lib/components/custom/DecorLayers.svelte';
  import Backdrop from '$lib/components/chat/Backdrop.svelte';

  let {
    draft,
    activeStudioTab = 'identity'
  }: {
    draft: CharacterDraft;
    activeStudioTab?: string;
  } = $props();

  let previewMode = $state<'narrative' | 'classic'>('narrative');
  const resolvedLayout = $derived(resolveLayout(draft.card.layout, previewMode));
  const rootAttrs = $derived(layoutRootAttrs(resolvedLayout));
  const rootStyle = $derived(layoutRootStyle(resolvedLayout));

  const themeVars = $derived(serializeVars(themeToCssVars(draft.previewTheme.theme)));
  const previewBg = $derived(draft.previewTheme.theme.background.image ?? null);
  const previewChromeReset = `
    --n-950: #313338;
    --n-900: #38393c;
    --n-800: #44464d;
    --n-700: #545660;
    --n-600: #6b6e7b;
    --n-500: #888b99;
    --n-400: #a5a8b6;
    --n-300: #c2c5d3;
    --n-200: #e0e2ec;
    --n-100: #f0f1f6;
    --n-50:  #fbfbfe;
    --chrome-bg: color-mix(in oklab, #313338, var(--theme-accent) var(--chrome-tint-strength, 0%));
    --chrome-surface: color-mix(in oklab, #38393c, var(--theme-accent) calc(var(--chrome-tint-strength, 0%) * 1.25));
    --chrome-line: color-mix(in oklab, #44464d, var(--theme-accent) calc(var(--chrome-tint-strength, 0%) * 1.5));
    --chrome-focus: #e0e2ec;
    --chrome-text: #f0f1f6;
    color-scheme: dark;
  `;
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
    } else if (activeStudioTab === 'layout') {
      activeTab = 'samples';
    }
  });
</script>

<div class="flex flex-col h-full rounded-2xl border border-(--chrome-line) bg-(--chrome-surface)/50 overflow-hidden">
  <!-- Header: Title + Tab Toggle -->
  <div class="flex items-center justify-between border-b border-(--chrome-line) px-4 py-2.5 bg-(--chrome-surface)/80">
    <div class="flex items-center gap-2">
      <span class="text-xs font-semibold uppercase tracking-wider text-accent">
        Live Aesthetic Preview
      </span>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        onclick={() => (previewMode = previewMode === 'narrative' ? 'classic' : 'narrative')}
        class="rounded-lg px-2 py-1 text-[11px] font-mono border border-(--chrome-line) bg-(--chrome-bg) transition-colors {previewMode === 'narrative'
          ? 'text-accent font-semibold'
          : 'text-amber-300 font-semibold'}"
        title="Toggle simulated chat mode (Narrative vs Classic)"
      >
        Mode: {previewMode}
      </button>

      <div class="flex items-center rounded-lg bg-(--chrome-bg) p-0.5 border border-(--chrome-line)">
        <button
          type="button"
          onclick={() => (activeTab = 'showcase')}
          class="rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors {activeTab === 'showcase'
            ? 'bg-(--chrome-surface) text-(--chrome-text) shadow-sm'
            : 'text-(--chrome-text)/60 hover:text-(--chrome-text)'}"
        >
          Showcase
        </button>
        <button
          type="button"
          onclick={() => (activeTab = 'greeting')}
          class="rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors {activeTab === 'greeting'
            ? 'bg-(--chrome-surface) text-(--chrome-text) shadow-sm'
            : 'text-(--chrome-text)/60 hover:text-(--chrome-text)'}"
        >
          Greeting
        </button>
        <button
          type="button"
          onclick={() => (activeTab = 'samples')}
          class="rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors {activeTab === 'samples'
            ? 'bg-(--chrome-surface) text-(--chrome-text) shadow-sm'
            : 'text-(--chrome-text)/60 hover:text-(--chrome-text)'}"
        >
          Turn Samples
        </button>
      </div>
    </div>
  </div>

  <!-- Simulated State Pills (if schema has keys) -->
  {#if draft.card.stateSchema && Object.keys(draft.card.stateSchema).length > 0}
    <div class="flex flex-wrap items-center gap-1.5 border-b border-(--chrome-line) bg-(--chrome-bg)/60 px-4 py-2 text-xs">
      <span class="text-[10px] font-mono uppercase tracking-wider text-(--chrome-text)/50 mr-1">
        Simulate:
      </span>
      {#each Object.entries(draft.card.stateSchema) as [key, schema] (key)}
        {#if schema.type === 'enum' && schema.values}
          <div class="flex items-center gap-1 rounded bg-(--chrome-surface) px-2 py-1 text-[11px] border border-(--chrome-line)">
            <span class="text-(--chrome-text)/70 font-mono">{key}:</span>
            <select
              value={draft.previewState[key] ?? schema.values[0]}
              onchange={(e) => {
                draft.previewState[key] = (e.target as HTMLSelectElement).value;
              }}
              class="bg-transparent text-accent font-semibold focus:outline-none"
            >
              {#each schema.values as val (val)}
                <option value={val} class="bg-(--chrome-surface) text-(--chrome-text)">{val}</option>
              {/each}
            </select>
          </div>
        {:else if schema.type === 'int'}
          <div class="flex items-center gap-1.5 rounded bg-(--chrome-surface) px-2 py-1 text-[11px] border border-(--chrome-line)">
            <span class="text-(--chrome-text)/70 font-mono">{key}: {draft.previewState[key] ?? 0}</span>
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
    style="{themeVars}; {previewChromeReset}"
    data-ft-surface="character"
    class="relative isolate flex-1 overflow-hidden flex flex-col bg-(--chrome-bg) font-(--theme-font-family) text-(--chrome-text)"
  >
    <CustomStyleOutlet scope="character" css={draft.card.customCss} />
    <Backdrop image={previewBg} />
    <DecorLayers layers={decor} fixed={false} />
    <div class="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
    {#if activeTab === 'showcase'}
      <!-- Showcase Mode: Hero + Action Hub + Showcase Body + Dialogue Sample -->
      <div class="space-y-6">
        <ShowcaseHero character={previewCard} />

        <!-- Mock Action Hub with .ft-action-hub hook -->
        <div class="{HOOKS.character.actionHub} flex items-center justify-between gap-3 p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800/80 backdrop-blur-sm">
          <div class="flex items-center gap-2">
            <span class="inline-flex h-2 w-2 rounded-full bg-accent"></span>
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

        <div class="space-y-3 pt-2 {HOOKS.chat.messageLog}" {...rootAttrs} style={rootStyle}>
          <span class="text-[11px] font-semibold uppercase tracking-wider text-(--chrome-text)/60">Dialogue Sample</span>
          <article class="turn {HOOKS.chat.turn}" data-role="system" data-headers={resolvedLayout.headers}>
            <TurnRow
              kind="narrator"
              primaryName={draft.card.name || 'Companion'}
              layout={resolvedLayout}
            >
              <NarratorBlock text="The chamber falls silent as ancient starlight filters through the dome." />
            </TurnRow>
          </article>
          <article class="turn {HOOKS.chat.turn}" data-role="character" data-headers={resolvedLayout.headers}>
            <TurnRow
              kind="character"
              primaryName={draft.card.name || 'Companion'}
              name={draft.card.name || 'Companion'}
              layout={resolvedLayout}
              avatarSrc={draft.card.avatar}
            >
              <SpeechBubble
                variant="character"
                primaryName={draft.card.name || 'Companion'}
                name={draft.card.name || 'Companion'}
                text="The celestial alignments are shifting. We must begin before the eclipse reaches totality."
                {fx}
              />
            </TurnRow>
          </article>
        </div>
      </div>
    {:else if activeTab === 'greeting'}
      {#if segments.length === 0}
        <div class="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-800 text-center p-6 text-neutral-500 text-xs">
          <p>Type a First Message in the Voice tab to preview your opening greeting.</p>
        </div>
      {:else}
        <div class="space-y-4 {HOOKS.chat.messageLog}" {...rootAttrs} style={rootStyle}>
          <article class="turn {HOOKS.chat.turn}" data-role="character" data-headers={resolvedLayout.headers}>
            {#each segments as seg, idx (idx)}
              <TurnRow
                kind={seg.kind}
                name={seg.name}
                primaryName={draft.card.name || 'Companion'}
                hue={seg.kind === 'npc' ? 190 : null}
                layout={resolvedLayout}
                avatarSrc={seg.kind === 'character' ? draft.card.avatar : null}
              >
                {#if seg.kind === 'narrator'}
                  <NarratorBlock text={seg.text} />
                {:else}
                  <SpeechBubble
                    variant={seg.kind}
                    name={seg.name}
                    primaryName={draft.card.name || 'Companion'}
                    text={seg.text}
                    fx={seg.kind === 'character' ? fx : 'none'}
                    hue={seg.kind === 'npc' ? 190 : undefined}
                  />
                {/if}
              </TurnRow>
            {/each}
          </article>
        </div>
      {/if}
    {:else}
      <!-- Turn Samples Mode: Shows all 4 voice variants in layout context -->
      <div class="space-y-4 {HOOKS.chat.messageLog}" {...rootAttrs} style={rootStyle}>
        <article class="turn {HOOKS.chat.turn}" data-role="system" data-headers={resolvedLayout.headers}>
          <TurnRow
            kind="narrator"
            primaryName={draft.card.name || 'Companion'}
            layout={resolvedLayout}
          >
            <NarratorBlock text="The chamber falls silent as ancient starlight filters through the dome." />
          </TurnRow>
        </article>

        <article class="turn {HOOKS.chat.turn}" data-role="character" data-headers={resolvedLayout.headers}>
          <TurnRow
            kind="character"
            primaryName={draft.card.name || 'Companion'}
            name={draft.card.name || 'Companion'}
            layout={resolvedLayout}
            avatarSrc={draft.card.avatar}
          >
            <SpeechBubble
              variant="character"
              primaryName={draft.card.name || 'Companion'}
              name={draft.card.name || 'Companion'}
              text="The celestial alignments are shifting. We must begin before the eclipse reaches totality."
              {fx}
            />
          </TurnRow>
        </article>

        <article class="turn {HOOKS.chat.turn}" data-role="persona" data-headers={resolvedLayout.headers}>
          <TurnRow
            kind="persona"
            primaryName={draft.card.name || 'Companion'}
            name="You"
            layout={resolvedLayout}
          >
            <SpeechBubble
              variant="persona"
              primaryName={draft.card.name || 'Companion'}
              name="You"
              text="I have prepared the focus lenses. Are you ready?"
            />
          </TurnRow>
        </article>

        <article class="turn {HOOKS.chat.turn}" data-role="character" data-headers={resolvedLayout.headers}>
          <TurnRow
            kind="npc"
            primaryName={draft.card.name || 'Companion'}
            name="Observatory Scribe"
            hue={190}
            layout={resolvedLayout}
          >
            <SpeechBubble
              variant="npc"
              primaryName={draft.card.name || 'Companion'}
              name="Observatory Scribe"
              hue={190}
              text="Careful with the refraction prism! The crystal cannot be replaced."
            />
          </TurnRow>
        </article>
      </div>
    {/if}
    </div>
  </div>
</div>

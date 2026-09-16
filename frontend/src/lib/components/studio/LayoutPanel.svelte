<script lang="ts">
  import type { CharacterDraft } from '$lib/studio/draft.svelte';
  import { CLASSIC_LAYOUT, type CharacterLayout } from '@formatavern/shared';
  import { toasts } from '$lib/state/toasts.svelte';

  let { draft }: { draft: CharacterDraft } = $props();

  const isNeutral = $derived(!draft.card.layout);

  function ensureLayout(): CharacterLayout {
    if (!draft.card.layout) {
      draft.card.layout = {
        align: 'uniform-left',
        container: 'row',
        narrator: 'dim-only',
        tails: false,
        names: { showCharacter: true, showPersona: true, showNpc: true, format: 'plain' },
        avatars: { character: false, persona: false, npc: false, shape: 'circle', size: '2rem' }
      };
    }
    return draft.card.layout;
  }

  function applyClassicPreset() {
    draft.card.layout = JSON.parse(JSON.stringify(CLASSIC_LAYOUT));
    toasts.success('Applied Classic layout preset (split bubbles with tails)');
  }

  function resetToNeutral() {
    draft.card.layout = undefined;
    toasts.success('Reset layout to Neutral baseline');
  }

  // Getters with fallbacks
  const currentAlign = $derived(draft.card.layout?.align ?? 'uniform-left');
  const currentContainer = $derived(draft.card.layout?.container ?? 'row');
  const currentHeaders = $derived(draft.card.layout?.headers ?? 'auto');
  const currentNarrator = $derived(draft.card.layout?.narrator ?? 'dim-only');
  const currentTails = $derived(Boolean(draft.card.layout?.tails));
  const currentNameFormat = $derived(draft.card.layout?.names?.format ?? 'plain');

  const showCharName = $derived(draft.card.layout?.names?.showCharacter ?? true);
  const showPersonaName = $derived(draft.card.layout?.names?.showPersona ?? true);
  const showNpcName = $derived(draft.card.layout?.names?.showNpc ?? true);

  const showCharAvatar = $derived(draft.card.layout?.avatars?.character ?? false);
  const showPersonaAvatar = $derived(draft.card.layout?.avatars?.persona ?? false);
  const showNpcAvatar = $derived(draft.card.layout?.avatars?.npc ?? false);
  const avatarShape = $derived(draft.card.layout?.avatars?.shape ?? 'circle');
  const avatarSize = $derived(draft.card.layout?.avatars?.size ?? '2rem');

  // Updaters
  function updateAlign(align: 'uniform-left' | 'split') {
    const l = ensureLayout();
    l.align = align;
  }

  function updateContainer(container: 'row' | 'bubble' | 'flat') {
    const l = ensureLayout();
    l.container = container;
  }

  function updateHeaders(headers: 'auto' | 'single' | 'voices') {
    const l = ensureLayout();
    if (headers === 'auto') {
      delete l.headers;
    } else {
      l.headers = headers;
    }
  }

  function updateNarrator(narrator: 'dim-only' | 'inline' | 'centered') {
    const l = ensureLayout();
    l.narrator = narrator;
  }

  function updateTails(tails: boolean) {
    const l = ensureLayout();
    l.tails = tails;
  }

  function updateNameFormat(format: 'plain' | 'classic') {
    const l = ensureLayout();
    if (!l.names) l.names = { showCharacter: true, showPersona: true, showNpc: true, format: 'plain' };
    l.names.format = format;
  }

  function updateNameShow(kind: 'character' | 'persona' | 'npc', val: boolean) {
    const l = ensureLayout();
    if (!l.names) l.names = { showCharacter: true, showPersona: true, showNpc: true, format: 'plain' };
    if (kind === 'character') l.names.showCharacter = val;
    if (kind === 'persona') l.names.showPersona = val;
    if (kind === 'npc') l.names.showNpc = val;
  }

  function updateAvatarShow(kind: 'character' | 'persona' | 'npc', val: boolean) {
    const l = ensureLayout();
    if (!l.avatars) l.avatars = { character: false, persona: false, npc: false, shape: 'circle', size: '2rem' };
    if (kind === 'character') l.avatars.character = val;
    if (kind === 'persona') l.avatars.persona = val;
    if (kind === 'npc') l.avatars.npc = val;
  }

  function updateAvatarShape(shape: 'circle' | 'rounded' | 'square') {
    const l = ensureLayout();
    if (!l.avatars) l.avatars = { character: false, persona: false, npc: false, shape: 'circle', size: '2rem' };
    l.avatars.shape = shape;
  }

  function updateAvatarSize(size: string) {
    const l = ensureLayout();
    if (!l.avatars) l.avatars = { character: false, persona: false, npc: false, shape: 'circle', size: '2rem' };
    l.avatars.size = size.trim() || undefined;
  }
</script>

<div class="space-y-8 max-w-3xl">
  <!-- Header with Quick Presets -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-(--chrome-line) pb-4">
    <div>
      <div class="flex items-center gap-2">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-(--chrome-text)">
          Chat Message Layout & Structure
        </h3>
        {#if isNeutral}
          <span class="rounded bg-accent/15 px-2 py-0.5 text-[10px] font-mono text-accent border border-accent/30">
            Neutral Baseline Active
          </span>
        {:else}
          <span class="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-mono text-amber-300 border border-amber-500/30">
            Custom Layout Stamped
          </span>
        {/if}
      </div>
      <p class="text-xs text-(--chrome-text)/70 mt-1">
        Configure how chat messages, headers, avatars, and dialogue boxes render during roleplay.
      </p>
    </div>

    <div class="flex items-center gap-2 shrink-0">
      <button
        type="button"
        onclick={applyClassicPreset}
        class="rounded-lg border border-(--chrome-line) bg-(--chrome-surface) px-3 py-1.5 text-xs font-medium text-(--chrome-text) hover:bg-(--chrome-line)/40 hover:border-accent/40 transition-colors"
        title="Apply split alignment, bubbles, and tails"
      >
        Classic Preset
      </button>
      <button
        type="button"
        onclick={resetToNeutral}
        class="rounded-lg border border-(--chrome-line) bg-(--chrome-surface) px-3 py-1.5 text-xs font-medium text-(--chrome-text)/70 hover:text-(--chrome-text) hover:bg-(--chrome-line)/40 transition-colors"
        title="Clear custom layout and restore neutral baseline"
      >
        Reset to Neutral
      </button>
    </div>
  </div>

  <!-- 1. Alignment & Container Section -->
  <div class="space-y-4">
    <h4 class="text-xs font-mono uppercase tracking-wider text-accent">1. Flow & Container Geometry</h4>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <!-- Alignment -->
      <div>
        <label for="layout-align-select" class="block text-[11px] font-mono text-(--chrome-text)/70 mb-1">
          Turn Alignment
        </label>
        <select
          id="layout-align-select"
          value={currentAlign}
          onchange={(e) => updateAlign((e.target as HTMLSelectElement).value as any)}
          class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
        >
          <option value="uniform-left">Uniform Left (All turns share left gutter)</option>
          <option value="split">Split (User right, Companion left)</option>
        </select>
        <p class="mt-1 text-[11px] text-(--chrome-text)/50">
          Uniform left delivers clean reader flow without role-pushed gutters.
        </p>
      </div>

      <!-- Container -->
      <div>
        <label for="layout-container-select" class="block text-[11px] font-mono text-(--chrome-text)/70 mb-1">
          Container Shape
        </label>
        <select
          id="layout-container-select"
          value={currentContainer}
          onchange={(e) => updateContainer((e.target as HTMLSelectElement).value as any)}
          class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
        >
          <option value="row">Row (Flat reading lines, fixed max measure)</option>
          <option value="bubble">Bubble (Floating cards with padding and radius)</option>
          <option value="flat">Minimal Flat (Zero card chrome)</option>
        </select>
        <p class="mt-1 text-[11px] text-(--chrome-text)/50">
          Bubble container activates the theme bubble radius, padding, and tail options.
        </p>
      </div>
    </div>

    <!-- Speech Tails Option -->
    <div class="rounded-xl border border-(--chrome-line) bg-(--chrome-surface)/40 p-3.5 space-y-2">
      <label class="flex items-center gap-2.5 cursor-pointer {currentContainer !== 'bubble' ? 'opacity-50 cursor-not-allowed' : ''}">
        <input
          type="checkbox"
          checked={currentTails}
          disabled={currentContainer !== 'bubble'}
          onchange={(e) => updateTails((e.target as HTMLInputElement).checked)}
          class="accent-accent rounded"
        />
        <span class="text-xs font-medium text-(--chrome-text)">
          Display Speech Tails
        </span>
      </label>
      <p class="text-[11px] text-(--chrome-text)/50 pl-6">
        {#if currentContainer === 'bubble'}
          Speech tails point toward speaker alignment.
        {:else}
          Tails require the <strong>Bubble</strong> container mode. In row/flat containers, tails are automatically disabled (Invariant L5).
        {/if}
      </p>
    </div>
  </div>

  <!-- 2. Headers & Granularity -->
  <div class="space-y-4">
    <h4 class="text-xs font-mono uppercase tracking-wider text-accent">2. Headers & Voice Attribution</h4>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <!-- Headers Granularity -->
      <div>
        <label for="layout-headers-select" class="block text-[11px] font-mono text-(--chrome-text)/70 mb-1">
          Header Granularity
        </label>
        <select
          id="layout-headers-select"
          value={currentHeaders}
          onchange={(e) => updateHeaders((e.target as HTMLSelectElement).value as any)}
          class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
        >
          <option value="auto">Auto (Follow chat mode)</option>
          <option value="voices">Per-Voice Headers (Label each speaking segment)</option>
          <option value="single">Single Turn Header (Collapsed turn header with inline tags)</option>
        </select>
        <p class="mt-1 text-[11px] text-(--chrome-text)/50">
          In single header mode, multi-voice envelopes keep inline voice tags for NPCs to prevent misattribution (Invariant L8).
        </p>
      </div>

      <!-- Narrator Treatment -->
      <div>
        <label for="layout-narrator-select" class="block text-[11px] font-mono text-(--chrome-text)/70 mb-1">
          Narrator Treatment
        </label>
        <select
          id="layout-narrator-select"
          value={currentNarrator}
          onchange={(e) => updateNarrator((e.target as HTMLSelectElement).value as any)}
          class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
        >
          <option value="dim-only">Dim-Only (Inline text with dimmed neutral tone)</option>
          <option value="inline">In-line (Regular body weight and color)</option>
          <option value="centered">Centered (Classic storybook set-piece with italic styling)</option>
        </select>
        <p class="mt-1 text-[11px] text-(--chrome-text)/50">
          Inert in classic single-voice chats where narrator blocks are not parsed.
        </p>
      </div>
    </div>
  </div>

  <!-- 3. Name Labels -->
  <div class="space-y-4">
    <h4 class="text-xs font-mono uppercase tracking-wider text-accent">3. Speaker Name Labels</h4>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label for="layout-name-format-select" class="block text-[11px] font-mono text-(--chrome-text)/70 mb-1">
          Label Typography & Format
        </label>
        <select
          id="layout-name-format-select"
          value={currentNameFormat}
          onchange={(e) => updateNameFormat((e.target as HTMLSelectElement).value as any)}
          class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
        >
          <option value="plain">Plain (Natural weight, matches body text color)</option>
          <option value="classic">Classic (Uppercase, tracked, accent colored)</option>
        </select>
      </div>

      <div>
        <span class="block text-[11px] font-mono text-(--chrome-text)/70 mb-2">
          Show Name Labels For:
        </span>
        <div class="flex flex-wrap gap-4 pt-1">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showCharName}
              onchange={(e) => updateNameShow('character', (e.target as HTMLInputElement).checked)}
              class="accent-accent rounded"
            />
            <span class="text-xs text-(--chrome-text)">Companion</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showPersonaName}
              onchange={(e) => updateNameShow('persona', (e.target as HTMLInputElement).checked)}
              class="accent-accent rounded"
            />
            <span class="text-xs text-(--chrome-text)">User Persona</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showNpcName}
              onchange={(e) => updateNameShow('npc', (e.target as HTMLInputElement).checked)}
              class="accent-accent rounded"
            />
            <span class="text-xs text-(--chrome-text)">NPC Voices</span>
          </label>
        </div>
      </div>
    </div>
  </div>

  <!-- 4. Avatars -->
  <div class="space-y-4">
    <h4 class="text-xs font-mono uppercase tracking-wider text-accent">4. Speaker Avatars</h4>

    <div class="space-y-3">
      <span class="block text-[11px] font-mono text-(--chrome-text)/70">
        Display Avatars In Chat Rows For:
      </span>
      <div class="flex flex-wrap gap-5">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showCharAvatar}
            onchange={(e) => updateAvatarShow('character', (e.target as HTMLInputElement).checked)}
            class="accent-accent rounded"
          />
          <span class="text-xs text-(--chrome-text)">Companion</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showPersonaAvatar}
            onchange={(e) => updateAvatarShow('persona', (e.target as HTMLInputElement).checked)}
            class="accent-accent rounded"
          />
          <span class="text-xs text-(--chrome-text)">User Persona</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showNpcAvatar}
            onchange={(e) => updateAvatarShow('npc', (e.target as HTMLInputElement).checked)}
            class="accent-accent rounded"
          />
          <span class="text-xs text-(--chrome-text)">NPC Voices</span>
        </label>
      </div>
      <p class="text-[11px] text-(--chrome-text)/50">
        When avatars are disabled, zero avatar elements are rendered in the DOM. When enabled without an image, monogram initials are displayed with a colored hue ring for NPCs.
      </p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
      <!-- Shape -->
      <div>
        <label for="layout-avatar-shape-select" class="block text-[11px] font-mono text-(--chrome-text)/70 mb-1">
          Avatar Shape
        </label>
        <select
          id="layout-avatar-shape-select"
          value={avatarShape}
          onchange={(e) => updateAvatarShape((e.target as HTMLSelectElement).value as any)}
          class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
        >
          <option value="circle">Circle (rounded-full)</option>
          <option value="rounded">Rounded Square (rounded-md)</option>
          <option value="square">Square (rounded-none)</option>
        </select>
      </div>

      <!-- Size -->
      <div>
        <label for="layout-avatar-size-input" class="block text-[11px] font-mono text-(--chrome-text)/70 mb-1">
          Avatar Size CSS Token
        </label>
        <input
          id="layout-avatar-size-input"
          type="text"
          value={avatarSize}
          placeholder="2rem"
          onchange={(e) => updateAvatarSize((e.target as HTMLInputElement).value)}
          class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
        />
        <p class="mt-1 text-[11px] text-(--chrome-text)/50">
          Applied via <code class="text-accent">--msg-avatar-size</code>. E.g. <code class="text-accent">1.75rem</code>, <code class="text-accent">2rem</code>, <code class="text-accent">2.5rem</code>.
        </p>
      </div>
    </div>
  </div>

  <!-- Mode Matrix Explanatory Notice -->
  <div class="rounded-xl border border-(--chrome-line) bg-(--chrome-surface)/30 p-4 space-y-2">
    <div class="flex items-center gap-2">
      <span class="text-xs font-semibold text-accent uppercase tracking-wider">Mode Matrix Reference</span>
    </div>
    <p class="text-xs text-(--chrome-text)/70 leading-relaxed">
      FormaTavern natively supports both <strong>Narrative</strong> (multi-voice envelope) and <strong>Classic</strong> (single-voice) chats. Alignment, containers, and avatar settings apply universally. In Classic chats, each turn is a single message, so headers are forced to single and NPC / narrator controls are marked inert.
    </p>
  </div>
</div>

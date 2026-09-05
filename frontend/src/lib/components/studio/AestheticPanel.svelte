<script lang="ts">
  import type { CharacterDraft } from '$lib/studio/draft.svelte';
  import { DEFAULT_CHARACTER_THEME } from '@formatavern/shared';

  let { draft }: { draft: CharacterDraft } = $props();

  const bundledFonts = [
    'Cinzel Variable, serif',
    'Playfair Display Variable, serif',
    'Inter Variable, sans-serif',
    'JetBrains Mono Variable, monospace'
  ];

  function resetToDefaults() {
    draft.card.style = JSON.parse(JSON.stringify(DEFAULT_CHARACTER_THEME));
  }
</script>

<div class="space-y-8 max-w-3xl">
  <div class="flex items-center justify-between border-b border-neutral-800 pb-3">
    <div>
      <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-200">
        Companion Chameleon Styling
      </h3>
      <p class="text-xs text-neutral-400 mt-0.5">
        Configures the visual aesthetic and color palette applied to chat sessions.
      </p>
    </div>
    <button
      type="button"
      onclick={resetToDefaults}
      class="text-xs text-neutral-400 hover:text-neutral-200"
    >
      Reset to defaults
    </button>
  </div>

  <!-- Typography -->
  <div class="space-y-4">
    <h4 class="text-xs font-mono uppercase tracking-wider text-accent">1. Typography</h4>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="sm:col-span-2">
        <label for="style-font-family" class="block text-[11px] font-mono text-neutral-400 mb-1">
          Font Family
        </label>
        <input
          id="style-font-family"
          type="text"
          list="fonts-list"
          bind:value={draft.card.style.font.family}
          class="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs font-mono text-neutral-100 focus:border-accent focus:outline-none"
        />
        <datalist id="fonts-list">
          {#each bundledFonts as f (f)}
            <option value={f}></option>
          {/each}
        </datalist>
      </div>

      <div>
        <label for="style-font-size" class="block text-[11px] font-mono text-neutral-400 mb-1">
          Base Size
        </label>
        <input
          id="style-font-size"
          type="text"
          bind:value={draft.card.style.font.size}
          placeholder="1rem"
          class="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs font-mono text-neutral-100 focus:border-accent focus:outline-none"
        />
      </div>
    </div>
  </div>

  <!-- Color Tokens -->
  <div class="space-y-4">
    <h4 class="text-xs font-mono uppercase tracking-wider text-accent">2. Color Palette</h4>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
      <!-- Accent -->
      <div>
        <label for="color-accent" class="block text-[11px] font-mono text-neutral-400 mb-1">Primary Accent</label>
        <div class="flex items-center gap-2">
          <input
            type="color"
            bind:value={draft.card.style.colors.accent}
            class="h-8 w-9 cursor-pointer rounded border border-neutral-700 bg-transparent p-0"
          />
          <input
            id="color-accent"
            type="text"
            bind:value={draft.card.style.colors.accent}
            class="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs font-mono text-neutral-200"
          />
        </div>
      </div>

      <!-- Character Bubble Bg -->
      <div>
        <label for="color-char-bg" class="block text-[11px] font-mono text-neutral-400 mb-1">Companion Bubble Bg</label>
        <div class="flex items-center gap-2">
          <input
            type="color"
            bind:value={draft.card.style.colors.charBubbleBg}
            class="h-8 w-9 cursor-pointer rounded border border-neutral-700 bg-transparent p-0"
          />
          <input
            id="color-char-bg"
            type="text"
            bind:value={draft.card.style.colors.charBubbleBg}
            class="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs font-mono text-neutral-200"
          />
        </div>
      </div>

      <!-- Character Bubble Text -->
      <div>
        <label for="color-char-text" class="block text-[11px] font-mono text-neutral-400 mb-1">Companion Text</label>
        <div class="flex items-center gap-2">
          <input
            type="color"
            bind:value={draft.card.style.colors.charBubbleText}
            class="h-8 w-9 cursor-pointer rounded border border-neutral-700 bg-transparent p-0"
          />
          <input
            id="color-char-text"
            type="text"
            bind:value={draft.card.style.colors.charBubbleText}
            class="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs font-mono text-neutral-200"
          />
        </div>
      </div>

      <!-- Quote Color -->
      <div>
        <label for="color-quote" class="block text-[11px] font-mono text-neutral-400 mb-1">Speech Quotes</label>
        <div class="flex items-center gap-2">
          <input
            type="color"
            value={draft.card.style.colors.quote || '#fde047'}
            oninput={(e) => (draft.card.style.colors.quote = (e.target as HTMLInputElement).value)}
            class="h-8 w-9 cursor-pointer rounded border border-neutral-700 bg-transparent p-0"
          />
          <input
            id="color-quote"
            type="text"
            bind:value={draft.card.style.colors.quote}
            class="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs font-mono text-neutral-200"
          />
        </div>
      </div>

      <!-- Action Color -->
      <div>
        <label for="color-action" class="block text-[11px] font-mono text-neutral-400 mb-1">Action Asterisks</label>
        <div class="flex items-center gap-2">
          <input
            type="color"
            value={draft.card.style.colors.action || '#94a3b8'}
            oninput={(e) => (draft.card.style.colors.action = (e.target as HTMLInputElement).value)}
            class="h-8 w-9 cursor-pointer rounded border border-neutral-700 bg-transparent p-0"
          />
          <input
            id="color-action"
            type="text"
            bind:value={draft.card.style.colors.action}
            class="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs font-mono text-neutral-200"
          />
        </div>
      </div>

      <!-- Narrator Text Color -->
      <div>
        <label for="color-narrator" class="block text-[11px] font-mono text-neutral-400 mb-1">Narrator Blocks</label>
        <div class="flex items-center gap-2">
          <input
            type="color"
            value={draft.card.style.colors.narratorText || '#cbd5e1'}
            oninput={(e) => (draft.card.style.colors.narratorText = (e.target as HTMLInputElement).value)}
            class="h-8 w-9 cursor-pointer rounded border border-neutral-700 bg-transparent p-0"
          />
          <input
            id="color-narrator"
            type="text"
            bind:value={draft.card.style.colors.narratorText}
            class="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs font-mono text-neutral-200"
          />
        </div>
      </div>
    </div>
  </div>

  <!-- Bubble Geometry -->
  <div class="space-y-4">
    <h4 class="text-xs font-mono uppercase tracking-wider text-accent">3. Bubble Geometry</h4>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div>
        <label for="bubble-radius" class="block text-[11px] font-mono text-neutral-400 mb-1">Corner Radius</label>
        <input
          id="bubble-radius"
          type="text"
          bind:value={draft.card.style.bubble.radius}
          placeholder="1rem"
          class="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs font-mono text-neutral-100 focus:border-accent focus:outline-none"
        />
      </div>

      <div>
        <label for="char-tail" class="block text-[11px] font-mono text-neutral-400 mb-1">Companion Tail</label>
        <select
          id="char-tail"
          bind:value={draft.card.style.bubble.charTail}
          class="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs font-mono text-neutral-100 focus:border-accent focus:outline-none"
        >
          <option value="left">Left (standard)</option>
          <option value="none">None (minimal)</option>
        </select>
      </div>

      <div>
        <label for="bubble-padding" class="block text-[11px] font-mono text-neutral-400 mb-1">Internal Padding</label>
        <input
          id="bubble-padding"
          type="text"
          bind:value={draft.card.style.bubble.padding}
          placeholder="1rem 1.25rem"
          class="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs font-mono text-neutral-100 focus:border-accent focus:outline-none"
        />
      </div>
    </div>
  </div>

  <!-- Background Environment -->
  <div class="space-y-4">
    <h4 class="text-xs font-mono uppercase tracking-wider text-accent">4. Ambient Background</h4>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="sm:col-span-2">
        <label for="bg-image" class="block text-[11px] font-mono text-neutral-400 mb-1">Background Image URL</label>
        <input
          id="bg-image"
          type="text"
          bind:value={draft.card.style.background.image}
          placeholder="/assets/backgrounds/observatory.jpg"
          class="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs font-mono text-neutral-100 focus:border-accent focus:outline-none"
        />
      </div>

      <div>
        <label for="bg-blur" class="block text-[11px] font-mono text-neutral-400 mb-1">Blur Amount</label>
        <input
          id="bg-blur"
          type="text"
          bind:value={draft.card.style.background.blur}
          placeholder="0px"
          class="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs font-mono text-neutral-100 focus:border-accent focus:outline-none"
        />
      </div>
    </div>
  </div>
</div>

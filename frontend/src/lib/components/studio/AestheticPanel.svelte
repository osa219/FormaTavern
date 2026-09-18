<script lang="ts">
  import type { CharacterDraft } from '$lib/studio/draft.svelte';
  import { DEFAULT_CHARACTER_THEME } from '@formatavern/shared';
  import { toasts } from '$lib/state/toasts.svelte';
  import { authStore } from '$lib/auth/store.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';

  let { draft }: { draft: CharacterDraft } = $props();

  let uploadingDecorIdx = $state<number | null>(null);
  let decorFileInputs = $state<HTMLInputElement[]>([]);

  const bundledFonts = [
    'Cinzel Variable, serif',
    'Playfair Display Variable, serif',
    'Inter Variable, sans-serif',
    'JetBrains Mono Variable, monospace'
  ];

  function resetToDefaults() {
    draft.card.style = JSON.parse(JSON.stringify(DEFAULT_CHARACTER_THEME));
  }

  async function handleDecorUpload(e: Event, idx: number) {
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;
    const file = files[0];

    uploadingDecorIdx = idx;
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('scope', draft.characterId ? 'character' : 'draft');
      formData.append('targetId', draft.ownerId);

      const res = await fetch('/api/assets/upload', {
        method: 'POST',
        headers: authStore.authHeaders(),
        body: formData
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Image upload failed');
      }

      const data = await res.json();
      if (draft.card.style.decor && draft.card.style.decor[idx]) {
        draft.card.style.decor[idx].image = data.path;
      }
      toasts.success('Uploaded decor image');
    } catch (err: any) {
      toasts.error(err.message || 'Failed to upload decor image');
    } finally {
      uploadingDecorIdx = null;
      if (decorFileInputs[idx]) decorFileInputs[idx].value = '';
    }
  }
</script>

<div class="space-y-8 max-w-3xl">
  <div class="flex items-center justify-between border-b border-(--chrome-line) pb-3">
    <div>
      <h3 class="text-xs font-semibold uppercase tracking-wider text-(--chrome-text)">
        Character Chameleon Styling
      </h3>
      <p class="text-xs text-(--chrome-text)/70 mt-0.5">
        Configures the visual aesthetic and color palette applied to chat sessions.
      </p>
    </div>
    <button
      type="button"
      onclick={resetToDefaults}
      class="text-xs text-(--chrome-text)/70 hover:text-(--chrome-text) transition-colors"
    >
      Reset to defaults
    </button>
  </div>

  <!-- Typography -->
  <div class="space-y-4">
    <h4 class="text-xs font-mono uppercase tracking-wider text-accent">1. Typography</h4>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="sm:col-span-2">
        <label for="style-font-family" class="block text-[11px] font-mono text-(--chrome-text)/70 mb-1">
          Font Family
        </label>
        <input
          id="style-font-family"
          type="text"
          list="fonts-list"
          bind:value={draft.card.style.font.family}
          class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
        />
        <datalist id="fonts-list">
          {#each bundledFonts as f (f)}
            <option value={f}></option>
          {/each}
        </datalist>
      </div>

      <div>
        <label for="style-font-size" class="block text-[11px] font-mono text-(--chrome-text)/70 mb-1">
          Base Size
        </label>
        <input
          id="style-font-size"
          type="text"
          bind:value={draft.card.style.font.size}
          placeholder="1rem"
          class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
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
        <label for="color-accent" class="block text-[11px] font-mono text-(--chrome-text)/70 mb-1">Primary Accent</label>
        <div class="flex items-center gap-2">
          <input
            type="color"
            bind:value={draft.card.style.colors.accent}
            class="h-8 w-9 cursor-pointer rounded border border-(--chrome-line) bg-transparent p-0"
          />
          <input
            id="color-accent"
            type="text"
            bind:value={draft.card.style.colors.accent}
            class="w-full rounded-lg border border-(--chrome-line) bg-(--chrome-surface) px-2 py-1 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      <!-- Character Bubble Bg -->
      <div>
        <label for="color-char-bg" class="block text-[11px] font-mono text-(--chrome-text)/70 mb-1">Character Bubble Bg</label>
        <div class="flex items-center gap-2">
          <input
            type="color"
            bind:value={draft.card.style.colors.charBubbleBg}
            class="h-8 w-9 cursor-pointer rounded border border-(--chrome-line) bg-transparent p-0"
          />
          <input
            id="color-char-bg"
            type="text"
            bind:value={draft.card.style.colors.charBubbleBg}
            class="w-full rounded-lg border border-(--chrome-line) bg-(--chrome-surface) px-2 py-1 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      <!-- Character Bubble Text -->
      <div>
        <label for="color-char-text" class="block text-[11px] font-mono text-(--chrome-text)/70 mb-1">Character Text</label>
        <div class="flex items-center gap-2">
          <input
            type="color"
            bind:value={draft.card.style.colors.charBubbleText}
            class="h-8 w-9 cursor-pointer rounded border border-(--chrome-line) bg-transparent p-0"
          />
          <input
            id="color-char-text"
            type="text"
            bind:value={draft.card.style.colors.charBubbleText}
            class="w-full rounded-lg border border-(--chrome-line) bg-(--chrome-surface) px-2 py-1 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      <!-- Quote Color -->
      <div>
        <label for="color-quote" class="block text-[11px] font-mono text-(--chrome-text)/70 mb-1">Speech Quotes</label>
        <div class="flex items-center gap-2">
          <input
            type="color"
            value={draft.card.style.colors.quote || '#fde047'}
            oninput={(e) => (draft.card.style.colors.quote = (e.target as HTMLInputElement).value)}
            class="h-8 w-9 cursor-pointer rounded border border-(--chrome-line) bg-transparent p-0"
          />
          <input
            id="color-quote"
            type="text"
            bind:value={draft.card.style.colors.quote}
            class="w-full rounded-lg border border-(--chrome-line) bg-(--chrome-surface) px-2 py-1 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      <!-- Action Color -->
      <div>
        <label for="color-action" class="block text-[11px] font-mono text-(--chrome-text)/70 mb-1">Action Asterisks</label>
        <div class="flex items-center gap-2">
          <input
            type="color"
            value={draft.card.style.colors.action || '#94a3b8'}
            oninput={(e) => (draft.card.style.colors.action = (e.target as HTMLInputElement).value)}
            class="h-8 w-9 cursor-pointer rounded border border-(--chrome-line) bg-transparent p-0"
          />
          <input
            id="color-action"
            type="text"
            bind:value={draft.card.style.colors.action}
            class="w-full rounded-lg border border-(--chrome-line) bg-(--chrome-surface) px-2 py-1 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      <!-- Narrator Text Color -->
      <div>
        <label for="color-narrator" class="block text-[11px] font-mono text-(--chrome-text)/70 mb-1">Narrator Blocks</label>
        <div class="flex items-center gap-2">
          <input
            type="color"
            value={draft.card.style.colors.narratorText || '#cbd5e1'}
            oninput={(e) => (draft.card.style.colors.narratorText = (e.target as HTMLInputElement).value)}
            class="h-8 w-9 cursor-pointer rounded border border-(--chrome-line) bg-transparent p-0"
          />
          <input
            id="color-narrator"
            type="text"
            bind:value={draft.card.style.colors.narratorText}
            class="w-full rounded-lg border border-(--chrome-line) bg-(--chrome-surface) px-2 py-1 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
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
        <label for="bubble-radius" class="block text-[11px] font-mono text-(--chrome-text)/70 mb-1">Corner Radius</label>
        <input
          id="bubble-radius"
          type="text"
          bind:value={draft.card.style.bubble.radius}
          placeholder="1rem"
          class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
        />
      </div>

      <div>
        <label for="char-tail" class="block text-[11px] font-mono text-(--chrome-text)/70 mb-1">Character Tail</label>
        <select
          id="char-tail"
          bind:value={draft.card.style.bubble.charTail}
          class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
        >
          <option value="left">Left (standard)</option>
          <option value="none">None (minimal)</option>
        </select>
      </div>

      <div>
        <label for="bubble-padding" class="block text-[11px] font-mono text-(--chrome-text)/70 mb-1">Internal Padding</label>
        <input
          id="bubble-padding"
          type="text"
          bind:value={draft.card.style.bubble.padding}
          placeholder="1rem 1.25rem"
          class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
        />
      </div>
    </div>
  </div>

  <!-- Background Environment -->
  <div class="space-y-4">
    <h4 class="text-xs font-mono uppercase tracking-wider text-accent">4. Ambient Background</h4>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="sm:col-span-2">
        <label for="bg-image" class="block text-[11px] font-mono text-(--chrome-text)/70 mb-1">Background Image URL</label>
        <input
          id="bg-image"
          type="text"
          bind:value={draft.card.style.background.image}
          placeholder="/assets/backgrounds/observatory.jpg"
          class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
        />
      </div>

      <div>
        <label for="bg-blur" class="block text-[11px] font-mono text-(--chrome-text)/70 mb-1">Blur Amount</label>
        <input
          id="bg-blur"
          type="text"
          bind:value={draft.card.style.background.blur}
          placeholder="0px"
          class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
        />
      </div>
    </div>
  </div>

  <!-- Motion Presets (Slice 5) -->
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h4 class="text-xs font-mono uppercase tracking-wider text-accent">5. Motion Presets</h4>
      <span class="text-[10px] text-(--chrome-text)/50 font-mono">Compositor-only • Reduced-motion safe</span>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {#each [
        { id: 'none', label: 'None', desc: 'Static bubbles' },
        { id: 'breathe', label: 'Breathe', desc: '6s gentle scale pulse' },
        { id: 'float', label: 'Float', desc: '8s subtle vertical bob' },
        { id: 'glow', label: 'Glow', desc: '4s accent ring aura' }
      ] as preset (preset.id)}
        <button
          type="button"
          onclick={() => {
            if (!draft.card.style.fx) draft.card.style.fx = {};
            draft.card.style.fx.bubble = preset.id as any;
          }}
          class="flex flex-col items-start p-3 rounded-xl border text-left transition-colors {(draft.card.style.fx?.bubble ?? 'none') === preset.id
            ? 'border-accent bg-accent/10 text-(--chrome-text)'
            : 'border-(--chrome-line) bg-(--chrome-surface)/60 text-(--chrome-text)/70 hover:border-(--chrome-line) hover:text-(--chrome-text)'}"
        >
          <span class="text-xs font-semibold text-(--chrome-text)">{preset.label}</span>
          <span class="text-[10px] text-(--chrome-text)/50 mt-1 leading-tight">{preset.desc}</span>
        </button>
      {/each}
    </div>
  </div>

  <!-- Decor Layers (Slice 5 — C13 Cap: ≤ 2) -->
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h4 class="text-xs font-mono uppercase tracking-wider text-accent">6. Scenery Pins & Page-Dolls (Decor)</h4>
        <p class="text-[11px] text-(--chrome-text)/70 mt-0.5">
          Fixed decorative graphics (transparent PNG/WebP scenery pins, corner emblems, stickers, or badges) placed on the character surface (max 2 layers).
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-[11px] font-mono text-(--chrome-text)/50">
          {(draft.card.style.decor?.length ?? 0)} / 2 layers
        </span>
        {#if (draft.card.style.decor?.length ?? 0) < 2}
          <button
            type="button"
            onclick={() => {
              if (!draft.card.style.decor) draft.card.style.decor = [];
              const defaultImage = draft.card.avatar || '';
              draft.card.style.decor.push({
                image: defaultImage,
                position: draft.card.style.decor.length === 0 ? 'bottom-right' : 'top-left',
                opacity: 0.9,
                blur: '0px'
              });
            }}
            class="inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20 transition-colors shadow-sm"
          >
            <Icon name="plus" size={13} />
            <span>Add Decor Layer</span>
          </button>
        {:else}
          <span class="inline-flex items-center gap-1 rounded-lg border border-(--chrome-line) bg-(--chrome-surface) px-2.5 py-1 text-[11px] font-medium text-(--chrome-text)/70">
            <Icon name="check" size={12} class="text-accent" />
            <span>Maximum 2 reached</span>
          </span>
        {/if}
      </div>
    </div>

    {#if !draft.card.style.decor || draft.card.style.decor.length === 0}
      <div class="flex h-20 items-center justify-center rounded-xl border border-dashed border-(--chrome-line) text-xs text-(--chrome-text)/50">
        No decorative layers configured. Add a character pin, corner sticker, or scenery emblem.
      </div>
    {:else}
      <div class="space-y-3">
        {#each draft.card.style.decor as layer, idx (idx)}
          <div class="p-3.5 rounded-xl border border-(--chrome-line) bg-(--chrome-surface)/60 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-mono font-semibold text-(--chrome-text)">
                Layer #{idx + 1}
              </span>
              <button
                type="button"
                onclick={() => {
                  draft.card.style.decor?.splice(idx, 1);
                  if (draft.card.style.decor?.length === 0) {
                    draft.card.style.decor = undefined;
                  }
                }}
                class="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Remove
              </button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="sm:col-span-2">
                <label for="decor-img-{idx}" class="block text-[10px] font-mono text-(--chrome-text)/70 mb-1">
                  Image Asset (Sticker, Chibi, Pin, or Ornament)
                </label>
                <div class="flex items-center gap-2">
                  {#if layer.image}
                    <img
                      src={layer.image}
                      alt="Decor preview"
                      class="h-9 w-9 shrink-0 rounded-lg border border-(--chrome-line) bg-(--chrome-bg) object-contain p-0.5"
                    />
                  {:else}
                    <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-(--chrome-line) bg-(--chrome-bg) text-(--chrome-text)/40">
                      <Icon name="upload" size={13} />
                    </div>
                  {/if}
                  <input
                    id="decor-img-{idx}"
                    type="text"
                    bind:value={layer.image}
                    placeholder="/assets/characters/... or data:image/..."
                    class="w-full rounded-lg border border-(--chrome-line) bg-(--chrome-bg) px-2.5 py-1.5 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
                  />
                  <input
                    type="file"
                    accept="image/png,image/webp,image/jpeg,image/gif"
                    class="hidden"
                    bind:this={decorFileInputs[idx]}
                    onchange={(e) => handleDecorUpload(e, idx)}
                  />
                  <button
                    type="button"
                    disabled={uploadingDecorIdx === idx}
                    onclick={() => decorFileInputs[idx]?.click()}
                    class="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-(--chrome-line) bg-(--chrome-surface) px-2.5 py-1.5 text-xs font-semibold text-(--chrome-text) hover:bg-(--chrome-line)/40 disabled:opacity-50 transition-colors"
                  >
                    {#if uploadingDecorIdx === idx}
                      <Spinner size={12} />
                      <span>Uploading…</span>
                    {:else}
                      <Icon name="upload" size={12} />
                      <span>Upload</span>
                    {/if}
                  </button>
                  {#if draft.card.avatar && layer.image !== draft.card.avatar}
                    <button
                      type="button"
                      onclick={() => (layer.image = draft.card.avatar!)}
                      class="shrink-0 rounded-lg border border-(--chrome-line) bg-(--chrome-surface) px-2.5 py-1.5 text-xs text-(--chrome-text)/70 hover:bg-(--chrome-line)/40 hover:text-(--chrome-text) transition-colors"
                      title="Use character avatar as decor pin"
                    >
                      Avatar
                    </button>
                  {/if}
                </div>
              </div>

              <div>
                <label for="decor-pos-{idx}" class="block text-[10px] font-mono text-(--chrome-text)/70 mb-1">
                  Anchor Position
                </label>
                <select
                  id="decor-pos-{idx}"
                  bind:value={layer.position}
                  class="w-full rounded-lg border border-(--chrome-line) bg-(--chrome-bg) px-2.5 py-1.5 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
                >
                  <option value="bottom-right">Bottom-Right (Standard)</option>
                  <option value="bottom-left">Bottom-Left</option>
                  <option value="bottom-center">Bottom-Center</option>
                  <option value="top-left">Top-Left</option>
                  <option value="top-right">Top-Right</option>
                  <option value="top-center">Top-Center</option>
                  <option value="center">Center</option>
                </select>
              </div>

              <div>
                <label for="decor-opacity-{idx}" class="block text-[10px] font-mono text-(--chrome-text)/70 mb-1">
                  Opacity ({layer.opacity ?? 1})
                </label>
                <input
                  id="decor-opacity-{idx}"
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  bind:value={layer.opacity}
                  class="w-full accent-accent h-1.5 mt-2"
                />
              </div>

              <!-- Size / Scaling (Dual-track: Quick presets + Freeform CSS) -->
              <div class="sm:col-span-2 space-y-1.5 pt-1">
                <div class="flex items-center justify-between">
                  <label for="decor-size-{idx}" class="block text-[10px] font-mono text-(--chrome-text)/70">
                    Size / Scale
                  </label>
                  <div class="flex items-center gap-1 text-[10px] font-mono">
                    {#each [
                      { label: 'Default', val: '' },
                      { label: 'Small', val: '120px' },
                      { label: 'Medium', val: '220px' },
                      { label: 'Large', val: '340px' }
                    ] as preset}
                      <button
                        type="button"
                        onclick={() => (layer.size = preset.val ? preset.val : undefined)}
                        class="rounded px-1.5 py-0.5 transition-colors {(layer.size || '') === preset.val
                          ? 'bg-accent/20 text-accent font-semibold'
                          : 'bg-(--chrome-bg) text-(--chrome-text)/70 hover:text-(--chrome-text) hover:bg-(--chrome-line)/40'}"
                      >
                        {preset.label}
                      </button>
                    {/each}
                  </div>
                </div>
                <input
                  id="decor-size-{idx}"
                  type="text"
                  bind:value={layer.size}
                  placeholder="e.g. 240px, 30vw, 15rem (blank = default fit)"
                  class="w-full rounded-lg border border-(--chrome-line) bg-(--chrome-bg) px-2.5 py-1.5 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
                />
              </div>

              <!-- Position Nudge (X / Y Offsets) -->
              <div class="sm:col-span-2 space-y-1.5 pt-1">
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-mono text-(--chrome-text)/70">
                    Position Nudge (Fine-tune coordinates)
                  </span>
                  <span class="text-[9px] font-mono text-(--chrome-text)/50">
                    Offset from anchor point (e.g. 15px, -20px)
                  </span>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label for="decor-offset-x-{idx}" class="block text-[9px] font-mono text-(--chrome-text)/50 mb-0.5">X Offset</label>
                    <input
                      id="decor-offset-x-{idx}"
                      type="text"
                      value={layer.offset?.x ?? ''}
                      oninput={(e) => {
                        const val = (e.target as HTMLInputElement).value;
                        if (!layer.offset) layer.offset = {};
                        layer.offset.x = val;
                      }}
                      placeholder="0px (e.g. 10px, -20px)"
                      class="w-full rounded-lg border border-(--chrome-line) bg-(--chrome-bg) px-2.5 py-1 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div>
                    <label for="decor-offset-y-{idx}" class="block text-[9px] font-mono text-(--chrome-text)/50 mb-0.5">Y Offset</label>
                    <input
                      id="decor-offset-y-{idx}"
                      type="text"
                      value={layer.offset?.y ?? ''}
                      oninput={(e) => {
                        const val = (e.target as HTMLInputElement).value;
                        if (!layer.offset) layer.offset = {};
                        layer.offset.y = val;
                      }}
                      placeholder="0px (e.g. 10px, -20px)"
                      class="w-full rounded-lg border border-(--chrome-line) bg-(--chrome-bg) px-2.5 py-1 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Action Hub Labels (Slice 5) -->
  <div class="space-y-4">
    <div>
      <h4 class="text-xs font-mono uppercase tracking-wider text-accent">7. Call to Action & Labels</h4>
      <p class="text-[11px] text-(--chrome-text)/70 mt-0.5">
        Customizes prominent interface button text for this character.
      </p>
    </div>
    <div>
      <label for="label-start-story" class="block text-[11px] font-mono text-(--chrome-text)/70 mb-1">
        Primary Start Button Text (max 40 chars)
      </label>
      <input
        id="label-start-story"
        type="text"
        maxlength="40"
        value={draft.card.labels?.startStory ?? ''}
        oninput={(e) => {
          const val = (e.target as HTMLInputElement).value;
          if (!draft.card.labels) draft.card.labels = {};
          draft.card.labels.startStory = val ? val : undefined;
        }}
        placeholder="Start New Chat (default)"
        class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-2 text-xs font-mono text-(--chrome-text) focus:border-accent focus:outline-none"
      />
    </div>
  </div>
</div>

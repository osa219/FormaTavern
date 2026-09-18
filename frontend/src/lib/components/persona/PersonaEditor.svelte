<script lang="ts">
  import type { Persona, PersonaCreate, PersonaPatch, ThemeOverrides } from '@formatavern/shared';
  import { cropImageToBlob, loadImage } from '$lib/assets/crop';
  import { toasts } from '$lib/state/toasts.svelte';
  import { authStore } from '$lib/auth/store.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import BubblePreview from './BubblePreview.svelte';

  let {
    persona,
    onSave,
    onCancel
  }: {
    persona?: Persona;
    onSave: (data: PersonaCreate | { id: string; patch: PersonaPatch }) => Promise<void>;
    onCancel?: () => void;
  } = $props();

  let name = $state('');
  let description = $state('');
  let avatar = $state<string | null>(null);
  let isDefault = $state(false);

  // Bubble style state
  let userBubbleBg = $state('#0f172a');
  let userBubbleText = $state('#f8fafc');
  let userBubbleBorder = $state('transparent');
  let bubbleRadius = $state('1rem');
  let userTail = $state<'right' | 'none'>('right');

  $effect(() => {
    if (persona) {
      name = persona.name;
      description = persona.description;
      avatar = persona.avatar ?? null;
      isDefault = persona.isDefault ?? false;
      userBubbleBg = persona.styleOverrides?.colors?.userBubbleBg ?? '#0f172a';
      userBubbleText = persona.styleOverrides?.colors?.userBubbleText ?? '#f8fafc';
      userBubbleBorder = persona.styleOverrides?.colors?.userBubbleBorder ?? 'transparent';
      bubbleRadius = persona.styleOverrides?.bubble?.radius ?? '1rem';
      userTail = persona.styleOverrides?.bubble?.userTail ?? 'right';
    }
  });

  let saving = $state(false);
  let uploading = $state(false);
  let fileInput: HTMLInputElement;

  const styleOverrides = $derived<ThemeOverrides>({
    ...(persona?.styleOverrides?.font ? { font: persona.styleOverrides.font } : {}),
    ...(persona?.styleOverrides?.background ? { background: persona.styleOverrides.background } : {}),
    ...(persona?.styleOverrides?.decor ? { decor: persona.styleOverrides.decor } : {}),
    ...(persona?.styleOverrides?.fx ? { fx: persona.styleOverrides.fx } : {}),
    colors: {
      userBubbleBg,
      userBubbleText,
      userBubbleBorder
    },
    bubble: {
      radius: bubbleRadius,
      userTail
    }
  });

  async function handleFileChange(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;
    const file = files[0];

    uploading = true;
    try {
      const url = URL.createObjectURL(file);
      const img = await loadImage(url);
      const croppedBlob = await cropImageToBlob(img, undefined, 512);
      URL.revokeObjectURL(url);

      const formData = new FormData();
      formData.append('file', croppedBlob, 'avatar.webp');
      formData.append('scope', 'persona');
      if (persona?.id) formData.append('targetId', persona.id);

      const res = await fetch('/api/assets/upload', {
        method: 'POST',
        headers: authStore.authHeaders(),
        body: formData
      });

      if (!res.ok) {
        throw new Error('Avatar upload failed');
      }

      const data = await res.json();
      avatar = data.path;
      toasts.success('Avatar uploaded');
    } catch (err: any) {
      toasts.error(err.message || 'Failed to upload avatar');
    } finally {
      uploading = false;
      if (fileInput) fileInput.value = '';
    }
  }

  function resetStyles() {
    userBubbleBg = '#0f172a';
    userBubbleText = '#f8fafc';
    userBubbleBorder = 'transparent';
    bubbleRadius = '1rem';
    userTail = 'right';
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toasts.error('Persona name is required');
      return;
    }

    saving = true;
    try {
      if (persona?.id) {
        // Edit mode
        await onSave({
          id: persona.id,
          patch: {
            name: name.trim(),
            description: description.trim(),
            avatar: avatar || undefined,
            styleOverrides,
            expectedUpdatedAt: persona.updatedAt ?? Date.now()
          }
        });
      } else {
        // Create mode
        await onSave({
          name: name.trim(),
          description: description.trim(),
          avatar: avatar || undefined,
          isDefault,
          styleOverrides
        });
      }
    } finally {
      saving = false;
    }
  }
</script>

<form onsubmit={handleSubmit} class="space-y-6">
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
    <!-- Left Column: Basic Details -->
    <div class="space-y-5">
      <!-- Name -->
      <div>
        <label for="persona-name" class="block text-xs font-semibold text-(--chrome-text)/80 uppercase tracking-wider mb-1.5">
          Persona Name
        </label>
        <input
          id="persona-name"
          type="text"
          bind:value={name}
          placeholder="e.g. Detective, Wanderer, Yourself"
          maxlength={120}
          required
          class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3.5 py-2.5 text-sm text-(--chrome-text) placeholder:text-(--chrome-text)/40 focus:border-accent focus:outline-none"
        />
      </div>

      <!-- Avatar Upload -->
      <div>
        <span class="block text-xs font-semibold text-(--chrome-text)/80 uppercase tracking-wider mb-1.5">
          Avatar
        </span>
        <div class="flex items-center gap-4">
          {#if avatar}
            <img
              src={avatar}
              alt="Avatar preview"
              class="h-16 w-16 rounded-full object-cover border border-(--chrome-line) select-none shrink-0"
            />
          {:else}
            <div class="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-(--chrome-line)/30 text-lg font-bold text-(--chrome-text)/60 border border-(--chrome-line) select-none">
              {name ? name.slice(0, 1).toUpperCase() : '?'}
            </div>
          {/if}

          <div class="flex flex-col gap-2">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              class="hidden"
              bind:this={fileInput}
              onchange={handleFileChange}
            />
            <button
              type="button"
              disabled={uploading}
              onclick={() => fileInput?.click()}
              class="inline-flex items-center gap-1.5 rounded-lg border border-(--chrome-line) bg-(--chrome-surface) px-3 py-1.5 text-xs font-medium text-(--chrome-text) hover:bg-(--chrome-line)/40 disabled:opacity-50"
            >
              {#if uploading}
                <Spinner size={12} class="mr-1" />
                <span>Cropping & uploading…</span>
              {:else}
                <Icon name="upload" size={13} />
                <span>Choose Image</span>
              {/if}
            </button>
            {#if avatar}
              <button
                type="button"
                onclick={() => (avatar = null)}
                class="text-left text-xs text-red-400 hover:underline"
              >
                Remove avatar
              </button>
            {/if}
          </div>
        </div>
      </div>

      <!-- Bio / Description -->
      <div>
        <label for="persona-desc" class="block text-xs font-semibold text-(--chrome-text)/80 uppercase tracking-wider mb-1.5">
          Description / Persona Bio
        </label>
        <textarea
          id="persona-desc"
          bind:value={description}
          rows={4}
          placeholder="Describe your role, backstory, tone, or personality for the AI character..."
          class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3.5 py-2.5 text-sm text-(--chrome-text) placeholder:text-(--chrome-text)/40 focus:border-accent focus:outline-none"
        ></textarea>
        <p class="mt-1 text-xs text-(--chrome-text)/60">
          This is included in the model's system prompt to identify who you are playing.
        </p>
      </div>

      {#if !persona?.id}
        <!-- Set default checkbox on create -->
        <label class="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            bind:checked={isDefault}
            class="h-4 w-4 rounded border-(--chrome-line) bg-(--chrome-surface) accent-accent focus:ring-0"
          />
          <span class="text-sm text-(--chrome-text)">Set as default persona for new chats</span>
        </label>
      {/if}
    </div>

    <!-- Right Column: Speech Bubble Aesthetics & Live Preview -->
    <div class="space-y-5 rounded-2xl border border-(--chrome-line) bg-(--chrome-bg)/50 p-5">
      <div class="flex items-center justify-between">
        <h4 class="text-xs font-semibold uppercase tracking-wider text-(--chrome-text)">
          Speech Bubble Styling
        </h4>
        <button
          type="button"
          onclick={resetStyles}
          class="text-xs text-(--chrome-text)/60 hover:text-(--chrome-text)"
        >
          Reset to default
        </button>
      </div>

      <!-- Controls -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="bg-color" class="block text-[11px] font-mono text-(--chrome-text)/60 mb-1">Background</label>
          <div class="flex items-center gap-2">
            <input
              type="color"
              bind:value={userBubbleBg}
              class="h-8 w-10 cursor-pointer rounded border border-(--chrome-line) bg-transparent p-0"
            />
            <input
              id="bg-color"
              type="text"
              bind:value={userBubbleBg}
              class="w-full rounded-lg border border-(--chrome-line) bg-(--chrome-surface) px-2 py-1 text-xs font-mono text-(--chrome-text)"
            />
          </div>
        </div>

        <div>
          <label for="text-color" class="block text-[11px] font-mono text-(--chrome-text)/60 mb-1">Text Color</label>
          <div class="flex items-center gap-2">
            <input
              type="color"
              bind:value={userBubbleText}
              class="h-8 w-10 cursor-pointer rounded border border-(--chrome-line) bg-transparent p-0"
            />
            <input
              id="text-color"
              type="text"
              bind:value={userBubbleText}
              class="w-full rounded-lg border border-(--chrome-line) bg-(--chrome-surface) px-2 py-1 text-xs font-mono text-(--chrome-text)"
            />
          </div>
        </div>

        <div>
          <label for="border-color" class="block text-[11px] font-mono text-(--chrome-text)/60 mb-1">Border Color</label>
          <div class="flex items-center gap-2">
            <input
              type="color"
              value={userBubbleBorder === 'transparent' ? '#334155' : userBubbleBorder}
              oninput={(e) => (userBubbleBorder = (e.target as HTMLInputElement).value)}
              class="h-8 w-10 cursor-pointer rounded border border-(--chrome-line) bg-transparent p-0"
            />
            <input
              id="border-color"
              type="text"
              bind:value={userBubbleBorder}
              class="w-full rounded-lg border border-(--chrome-line) bg-(--chrome-surface) px-2 py-1 text-xs font-mono text-(--chrome-text)"
            />
          </div>
        </div>

        <div>
          <label for="tail-select" class="block text-[11px] font-mono text-(--chrome-text)/60 mb-1">Tail Side</label>
          <select
            id="tail-select"
            bind:value={userTail}
            class="w-full rounded-lg border border-(--chrome-line) bg-(--chrome-surface) px-2 py-1.5 text-xs text-(--chrome-text) focus:outline-none"
          >
            <option value="right">Right (standard)</option>
            <option value="none">None (minimalist)</option>
          </select>
        </div>
      </div>

      <!-- Bubble Radius -->
      <div>
        <div class="flex justify-between text-[11px] font-mono text-(--chrome-text)/60 mb-1">
          <span>Corner Radius</span>
          <span>{bubbleRadius}</span>
        </div>
        <input
          type="range"
          min="0"
          max="2"
          step="0.125"
          value={parseFloat(bubbleRadius) || 1}
          oninput={(e) => (bubbleRadius = `${(e.target as HTMLInputElement).value}rem`)}
          class="w-full accent-accent"
        />
      </div>

      <!-- Live Preview Area -->
      <div class="pt-2">
        <span class="block text-[11px] font-mono uppercase tracking-wider text-(--chrome-text)/60 mb-2">
          Live Chat Appearance
        </span>
        <BubblePreview
          name={name || 'You'}
          {avatar}
          {styleOverrides}
        />
      </div>
    </div>
  </div>

  <!-- Footer Actions -->
  <div class="flex items-center justify-end gap-3 border-t border-(--chrome-line) pt-5">
    {#if onCancel}
      <button
        type="button"
        onclick={onCancel}
        class="rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-4 py-2 text-xs font-semibold text-(--chrome-text) hover:bg-(--chrome-line)/40"
      >
        Cancel
      </button>
    {/if}

    <button
      type="submit"
      disabled={saving || !name.trim()}
      class="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2 text-xs font-semibold text-accent-contrast hover:bg-accent/90 disabled:opacity-50"
    >
      {#if saving}
        <Spinner size={14} />
        <span>Saving…</span>
      {:else}
        <span>Save Persona</span>
      {/if}
    </button>
  </div>
</form>

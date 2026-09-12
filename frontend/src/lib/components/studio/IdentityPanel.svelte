<script lang="ts">
  import type { CharacterDraft } from '$lib/studio/draft.svelte';
  import { normalizeTag, SUGGESTED_TAGS, displayTag } from '@formatavern/shared';
  import { cropImageToBlob, loadImage } from '$lib/assets/crop';
  import { toasts } from '$lib/state/toasts.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';

  let { draft }: { draft: CharacterDraft } = $props();

  let tagInput = $state('');
  let uploading = $state(false);
  let fileInput: HTMLInputElement;

  function addTag(val: string) {
    const raw = val.trim();
    if (!raw) return;
    const normalized = normalizeTag(raw);
    if (!normalized) return;

    const currentTags = draft.card.tags ?? [];
    if (currentTags.length >= 12) {
      toasts.error('Maximum 12 tags permitted');
      return;
    }
    if (currentTags.includes(normalized)) {
      tagInput = '';
      return;
    }

    draft.card.tags = [...currentTags, normalized];
    tagInput = '';
  }

  function removeTag(tag: string) {
    draft.card.tags = (draft.card.tags ?? []).filter((t) => t !== tag);
  }

  function handleTagKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === 'Backspace' && !tagInput && (draft.card.tags?.length ?? 0) > 0) {
      removeTag(draft.card.tags![draft.card.tags!.length - 1]);
    }
  }

  async function handleAvatarUpload(e: Event) {
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
      formData.append('scope', draft.characterId ? 'character' : 'draft');
      formData.append('targetId', draft.ownerId);

      const res = await fetch('/api/assets/upload', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        throw new Error('Avatar upload failed');
      }

      const data = await res.json();
      draft.card.avatar = data.path;
      toasts.success('Avatar uploaded');
    } catch (err: any) {
      toasts.error(err.message || 'Failed to upload avatar');
    } finally {
      uploading = false;
      if (fileInput) fileInput.value = '';
    }
  }
</script>

<div class="space-y-6 max-w-2xl">
  <!-- Name & Avatar Row -->
  <div class="flex flex-col sm:flex-row items-start gap-6">
    <!-- Avatar Uploader -->
    <div class="flex flex-col items-center gap-2 shrink-0">
      <span class="block text-xs font-semibold text-(--chrome-text) uppercase tracking-wider">
        Avatar
      </span>
      <div class="relative group">
        {#if draft.card.avatar}
          <img
            src={draft.card.avatar}
            alt="Character avatar"
            class="h-24 w-24 rounded-2xl object-cover border border-(--chrome-line) shadow-md"
          />
        {:else}
          <div class="flex h-24 w-24 items-center justify-center rounded-2xl bg-(--chrome-surface) text-2xl font-bold text-(--chrome-text)/60 border border-(--chrome-line) shadow-md">
            {draft.card.name ? draft.card.name.slice(0, 1).toUpperCase() : '?'}
          </div>
        {/if}

        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          class="hidden"
          bind:this={fileInput}
          onchange={handleAvatarUpload}
        />

        <button
          type="button"
          disabled={uploading}
          onclick={() => fileInput?.click()}
          class="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-semibold"
        >
          {#if uploading}
            <Spinner size={16} />
          {:else}
            <Icon name="upload" size={16} />
            <span class="mt-1 text-[11px]">Upload</span>
          {/if}
        </button>
      </div>

      {#if draft.card.avatar}
        <button
          type="button"
          onclick={() => (draft.card.avatar = undefined)}
          class="text-xs text-red-400 hover:underline"
        >
          Remove
        </button>
      {/if}
    </div>

    <!-- Name & Tagline Inputs -->
    <div class="space-y-4 flex-1 w-full">
      <div>
        <label for="identity-name" class="block text-xs font-semibold text-(--chrome-text) uppercase tracking-wider mb-1.5">
          Companion Name <span class="text-accent">*</span>
        </label>
        <input
          id="identity-name"
          type="text"
          bind:value={draft.card.name}
          placeholder="e.g. Eldrin Vance, Chronomancer"
          maxlength={120}
          required
          class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3.5 py-2.5 text-sm text-(--chrome-text) placeholder-(--chrome-text)/40 focus:border-accent focus:outline-none"
        />
        {#if draft.issuesByPath.has('/name')}
          <p class="mt-1 text-xs text-red-400">{draft.issuesByPath.get('/name')![0].message}</p>
        {/if}
      </div>

      <div>
        <label for="identity-tagline" class="block text-xs font-semibold text-(--chrome-text) uppercase tracking-wider mb-1.5">
          Tagline
        </label>
        <input
          id="identity-tagline"
          type="text"
          bind:value={draft.card.tagline}
          placeholder="A one-line summary for cards and discovery"
          maxlength={140}
          class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3.5 py-2.5 text-sm text-(--chrome-text) placeholder-(--chrome-text)/40 focus:border-accent focus:outline-none"
        />
      </div>
    </div>
  </div>

  <!-- Creator Credit -->
  <div>
    <label for="identity-creator" class="block text-xs font-semibold text-(--chrome-text) uppercase tracking-wider mb-1.5">
      Author / Creator Credit
    </label>
    <input
      id="identity-creator"
      type="text"
      bind:value={draft.card.creator}
      placeholder="Your handle or attribution (optional)"
      maxlength={80}
      class="w-full rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3.5 py-2.5 text-sm text-(--chrome-text) placeholder-(--chrome-text)/40 focus:border-accent focus:outline-none"
    />
  </div>

  <!-- Tags Chip Input -->
  <div>
    <div class="flex items-center justify-between mb-1.5">
      <label for="tag-input" class="block text-xs font-semibold text-(--chrome-text) uppercase tracking-wider">
        Tags ({draft.card.tags?.length ?? 0}/12)
      </label>
      <span class="text-[11px] text-(--chrome-text)/50 font-mono">Press Enter or comma to add</span>
    </div>

    <div class="flex flex-wrap items-center gap-1.5 rounded-xl border border-(--chrome-line) bg-(--chrome-surface) p-2 focus-within:border-accent">
      {#each draft.card.tags ?? [] as tag (tag)}
        <span class="inline-flex items-center gap-1 rounded-md bg-(--chrome-bg) px-2 py-1 text-xs font-mono text-(--chrome-text) border border-(--chrome-line)">
          <span>{displayTag(tag)}</span>
          <button
            type="button"
            onclick={() => removeTag(tag)}
            class="text-(--chrome-text)/60 hover:text-red-400"
            aria-label="Remove tag"
          >
            <Icon name="close" size={12} />
          </button>
        </span>
      {/each}

      <input
        id="tag-input"
        type="text"
        list="suggested-tags-list"
        bind:value={tagInput}
        onkeydown={handleTagKeydown}
        onblur={() => { if (tagInput) addTag(tagInput); }}
        placeholder={draft.card.tags?.length ? 'Add another tag...' : 'e.g. fantasy, sci-fi, roleplay...'}
        class="flex-1 min-w-[140px] bg-transparent px-2 py-1 text-xs text-(--chrome-text) placeholder-(--chrome-text)/40 focus:outline-none font-mono"
      />
      <datalist id="suggested-tags-list">
        {#each SUGGESTED_TAGS as suggested (suggested)}
          <option value={suggested}></option>
        {/each}
      </datalist>
    </div>
  </div>
</div>

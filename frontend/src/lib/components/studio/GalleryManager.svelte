<script lang="ts">
  import type { CharacterDraft } from '$lib/studio/draft.svelte';
  import { cropImageToBlob, loadImage } from '$lib/assets/crop';
  import { toasts } from '$lib/state/toasts.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';

  let {
    draft,
    onSelectImage
  }: {
    draft: CharacterDraft;
    onSelectImage?: (path: string) => void;
  } = $props();

  let uploadedImages = $state<string[]>([]);
  let uploading = $state(false);
  let fileInput: HTMLInputElement;

  async function handleUpload(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;
    const file = files[0];

    uploading = true;
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('scope', draft.characterId ? 'character' : 'draft');
      formData.append('targetId', draft.ownerId);

      const res = await fetch('/api/assets/upload', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        throw new Error('Upload failed');
      }

      const data = await res.json();
      uploadedImages = [...uploadedImages, data.path];
      toasts.success('Image uploaded to character gallery');
    } catch (err: any) {
      toasts.error(err.message || 'Upload failed');
    } finally {
      uploading = false;
      if (fileInput) fileInput.value = '';
    }
  }

  function copyPath(path: string) {
    navigator.clipboard.writeText(`![Image](${path})`);
    toasts.success('Copied markdown snippet to clipboard');
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <span class="text-xs font-semibold uppercase tracking-wider text-(--chrome-text)">
      Character Asset Gallery
    </span>
    <input
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      class="hidden"
      bind:this={fileInput}
      onchange={handleUpload}
    />
    <button
      type="button"
      disabled={uploading}
      onclick={() => fileInput?.click()}
      class="inline-flex items-center gap-1.5 rounded-xl bg-(--chrome-surface) px-3 py-1.5 text-xs font-semibold text-(--chrome-text) hover:bg-(--chrome-line)/40 disabled:opacity-50 border border-(--chrome-line) transition-colors"
    >
      {#if uploading}
        <Spinner size={12} class="mr-1" />
        <span>Uploading…</span>
      {:else}
        <Icon name="upload" size={13} />
        <span>Upload Asset</span>
      {/if}
    </button>
  </div>

  {#if uploadedImages.length === 0}
    <div class="flex h-28 items-center justify-center rounded-xl border border-dashed border-(--chrome-line) text-xs text-(--chrome-text)/50">
      No assets uploaded to this character yet.
    </div>
  {:else}
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {#each uploadedImages as imgPath (imgPath)}
        <div class="group relative aspect-square overflow-hidden rounded-xl border border-(--chrome-line) bg-(--chrome-surface)">
          <img
            src={imgPath}
            alt="Character gallery item"
            class="h-full w-full object-cover select-none"
            loading="lazy"
            decoding="async"
          />
          <div class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
            {#if onSelectImage}
              <button
                type="button"
                onclick={() => onSelectImage(imgPath)}
                class="rounded bg-accent px-2 py-1 text-[11px] font-semibold text-accent-contrast"
              >
                Insert
              </button>
            {/if}
            <button
              type="button"
              onclick={() => copyPath(imgPath)}
              class="rounded bg-black/70 px-2 py-1 text-[11px] text-white hover:bg-black/90 transition-colors"
            >
              Copy Link
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

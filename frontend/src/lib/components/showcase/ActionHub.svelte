<script lang="ts">
  import { goto } from '$app/navigation';
  import type { CharacterCard, ImportPreviewChat, Persona } from '@formatavern/shared';
  import { HOOKS } from '@formatavern/shared';
  import { api, toUiError } from '$lib/api';
  import { authStore } from '$lib/auth/store.svelte';
  import { toasts } from '$lib/state/toasts.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import PersonaPicker from './PersonaPicker.svelte';
  import ConfirmDialog from '$lib/components/dialogs/ConfirmDialog.svelte';

  let {
    character,
    personas = []
  }: {
    character: CharacterCard;
    personas: Persona[];
  } = $props();

  let pickerOpen = $state(false);
  let startingStory = $state(false);
  let menuOpen = $state(false);
  let confirmDeleteOpen = $state(false);
  let storiesCount = $state(0);
  let deleting = $state(false);
  let chatFileInput = $state<HTMLInputElement | null>(null);
  let chatParsing = $state(false);
  let chatPreview = $state<ImportPreviewChat | null>(null);
  let chatPreviewFile = $state<File | null>(null);
  let chatImportConfirmOpen = $state(false);
  let chatImporting = $state(false);
  let exporting = $state<string | null>(null);

  function toggleMenu(e: MouseEvent) {
    e.stopPropagation();
    menuOpen = !menuOpen;
  }

  async function handleStartNewStory(personaId: string) {
    pickerOpen = false;
    startingStory = true;
    try {
      const res = await (api.api.chats.post as any)({
        characterId: character.id,
        personaId
      });
      if (res.error) {
        toasts.error(toUiError(res.error).message);
        return;
      }
      if (res.data?.id) {
        goto(`/chat/${res.data.id}`);
      }
    } catch (err: any) {
      toasts.error(toUiError(err).message);
    } finally {
      startingStory = false;
    }
  }

  async function handleDuplicate() {
    menuOpen = false;
    try {
      const res = await (api.api.characters({ id: character.id }).duplicate.post as any)();
      if (res.error) {
        toasts.error(toUiError(res.error).message);
        return;
      }
      toasts.success('Character duplicated');
      if (res.data?.id) {
        goto(`/character/${res.data.id}`);
      }
    } catch (err: any) {
      toasts.error(toUiError(err).message);
    }
  }

  async function promptDelete() {
    menuOpen = false;
    try {
      const res = await (api.api.characters({ id: character.id }).usage.get as any)();
      if (res.data && typeof res.data.chats === 'number') {
        storiesCount = res.data.chats;
      }
    } catch {
      storiesCount = 0;
    }
    confirmDeleteOpen = true;
  }

  async function handleConfirmDelete() {
    deleting = true;
    confirmDeleteOpen = false;
    try {
      const res = await (api.api.characters({ id: character.id }).delete as any)({
        query: { cascade: 'chats' }
      });
      if (res.error) {
        toasts.error(toUiError(res.error).message);
        return;
      }
      toasts.success('Character deleted');
      goto('/');
    } catch (err: any) {
      toasts.error(toUiError(err).message);
    } finally {
      deleting = false;
    }
  }

  function openChatImport() {
    menuOpen = false;
    chatFileInput?.click();
  }

  async function handleExport(kind: 'png' | 'json' | 'charx') {
    if (exporting) return;
    menuOpen = false;
    exporting = kind;
    try {
      const url =
        kind === 'charx'
          ? `/api/characters/${character.id}/export.charx`
          : kind === 'json'
            ? `/api/characters/${character.id}/export.png?format=json`
            : `/api/characters/${character.id}/export.png`;
      const res = await fetch(url, { headers: authStore.authHeaders() });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || `Export failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const fallbackExt = kind === 'charx' ? 'charx' : kind;
      const filename = match?.[1] ?? `${character.id}.${fallbackExt}`;
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
      toasts.success(`Exported "${character.name}" (${kind.toUpperCase()})`);
    } catch (err: any) {
      toasts.error(err?.message || 'Could not export this card.');
    } finally {
      exporting = null;
    }
  }

  async function handleChatFileChange(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (chatFileInput) chatFileInput.value = '';
    if (!files || files.length === 0) return;
    const file = files[0];
    chatParsing = true;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/import/preview', {
        method: 'POST',
        headers: authStore.authHeaders(),
        body: formData
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || `Preview failed (HTTP ${res.status})`);
      }
      const preview = (await res.json()) as ImportPreviewChat;
      if (preview.kind !== 'chat') {
        toasts.error('This looks like a character card. Use the Foyer Import button to review it in Studio instead.');
        return;
      }
      chatPreview = preview;
      chatPreviewFile = file;
      chatImportConfirmOpen = true;
    } catch (err: any) {
      toasts.error(err?.message || 'Could not parse this chat file.');
    } finally {
      chatParsing = false;
    }
  }

  async function handleConfirmChatImport() {
    if (!chatPreview || !chatPreviewFile || chatImporting) return;
    chatImporting = true;
    try {
      const formData = new FormData();
      formData.append('file', chatPreviewFile);
      let endpoint = '/api/import/jsonl';
      if (chatPreview.format === 'custom-engine-chat') {
        endpoint = '/api/import/custom-engine/single';
      } else {
        formData.append('characterId', character.id);
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: authStore.authHeaders(),
        body: formData
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || `Import failed (HTTP ${res.status})`);
      }
      const data = await res.json();
      const chatId = data?.id ?? data?.report?.insertedChats;
      toasts.success(`Imported "${chatPreview.title}" (${chatPreview.messageCount} messages)`);
      chatImportConfirmOpen = false;
      chatPreview = null;
      chatPreviewFile = null;
      if (typeof chatId === 'string') goto(`/chat/${chatId}`);
      else goto('/chats');
    } catch (err: any) {
      toasts.error(err?.message || 'Could not import this chat file.');
    } finally {
      chatImporting = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return;
    }

    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      pickerOpen = true;
    } else if (e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      goto(`/character/${character.id}/edit`);
    } else if (e.key === 'Escape') {
      pickerOpen = false;
      menuOpen = false;
      confirmDeleteOpen = false;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} onclick={() => { if (menuOpen) menuOpen = false; }} />

<div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-800/80 bg-neutral-900/60 p-4 backdrop-blur-md {HOOKS.character.actionHub}">
  <div class="flex items-center gap-3">
    <!-- Start New Chat Button -->
    <button
      type="button"
      disabled={startingStory}
      onclick={() => (pickerOpen = true)}
      class="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-xs font-semibold text-accent-contrast transition-colors hover:bg-accent/90 disabled:opacity-50 shadow-md"
    >
      {#if startingStory}
        <Spinner size={14} />
        <span>Starting…</span>
      {:else}
        <Icon name="sparkles" size={14} />
        <span>{character.labels?.startStory || 'Start New Chat'}</span>
        <kbd class="ml-1.5 rounded bg-black/20 px-1.5 py-0.5 text-[10px] font-mono text-neutral-800">
          N
        </kbd>
      {/if}
    </button>

    <!-- Edit Character Link -->
    <a
      href="/character/{character.id}/edit"
      class="inline-flex items-center gap-1.5 rounded-xl border border-neutral-800 bg-neutral-850 px-4 py-2.5 text-xs font-semibold text-neutral-200 transition-colors hover:bg-neutral-800"
    >
      <Icon name="edit" size={14} />
      <span>Edit</span>
      <kbd class="ml-1 rounded bg-neutral-750 px-1.5 py-0.5 text-[10px] font-mono text-neutral-400">
        E
      </kbd>
    </a>
  </div>

  <!-- More Actions (⋯) -->
  <div class="relative">
    <button
      type="button"
      onclick={toggleMenu}
      class="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-850 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
      aria-label="More actions"
    >
      <Icon name="more-horizontal" size={16} />
    </button>

    {#if menuOpen}
      <div class="absolute right-0 top-11 z-20 w-48 rounded-xl border border-neutral-800 bg-neutral-900 py-1.5 shadow-xl">
        <button
          type="button"
          onclick={handleDuplicate}
          class="flex w-full items-center gap-2 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800"
        >
          <Icon name="copy" size={13} />
          <span>Duplicate Character</span>
        </button>

        <button
          type="button"
          onclick={openChatImport}
          class="flex w-full items-center gap-2 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800"
        >
          <Icon name="upload" size={13} />
          <span>{chatParsing ? 'Parsing chat file…' : 'Import chat'}</span>
        </button>

        <button
          type="button"
          onclick={() => handleExport('png')}
          disabled={exporting !== null}
          class="flex w-full items-center gap-2 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
        >
          <Icon name="arrow-down" size={13} />
          <span>{exporting === 'png' ? 'Exporting PNG…' : 'Export PNG (TavernCard)'}</span>
        </button>

        <button
          type="button"
          onclick={() => handleExport('json')}
          disabled={exporting !== null}
          class="flex w-full items-center gap-2 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
        >
          <Icon name="arrow-down" size={13} />
          <span>{exporting === 'json' ? 'Exporting JSON…' : 'Export JSON (TavernCard)'}</span>
        </button>

        <button
          type="button"
          onclick={() => handleExport('charx')}
          disabled={exporting !== null}
          class="flex w-full items-center gap-2 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
        >
          <Icon name="arrow-down" size={13} />
          <span>{exporting === 'charx' ? 'Exporting CharX…' : 'Export CharX (.charx)'}</span>
        </button>

        <button
          type="button"
          onclick={promptDelete}
          class="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-neutral-800"
        >
          <Icon name="trash" size={13} />
          <span>Delete Character</span>
        </button>
      </div>
    {/if}
  </div>
</div>

<!-- Persona Picker Popover/Modal -->
<PersonaPicker
  open={pickerOpen}
  characterId={character.id}
  {personas}
  onSelect={handleStartNewStory}
  onClose={() => (pickerOpen = false)}
/>

<!-- Confirm Delete Dialog -->
<ConfirmDialog
  open={confirmDeleteOpen}
  title="Delete Character"
  message={storiesCount > 0
    ? `Are you sure you want to delete "${character.name}" and its ${storiesCount} ${storiesCount === 1 ? 'chat' : 'chats'}? All associated messages and data will be permanently deleted.`
    : `Are you sure you want to delete "${character.name}"? This action cannot be undone.`}
  confirmLabel="Delete Everything"
  danger={true}
  onConfirm={handleConfirmDelete}
  onCancel={() => {
    confirmDeleteOpen = false;
  }}
/>

<!-- Hidden chat transcript picker -->
<input
  type="file"
  accept=".jsonl,.json"
  class="hidden"
  bind:this={chatFileInput}
  onchange={handleChatFileChange}
/>

<!-- Confirm Chat Import Dialog -->
<ConfirmDialog
  open={chatImportConfirmOpen}
  title="Import chat"
  message={chatPreview
    ? `Import "${chatPreview.title}" (${chatPreview.messageCount} ${chatPreview.messageCount === 1 ? 'message' : 'messages'}) into ${character.name}?`
    : 'Import this chat transcript?'}
  confirmLabel={chatImporting ? 'Importing…' : 'Import'}
  danger={false}
  onConfirm={handleConfirmChatImport}
  onCancel={() => {
    chatImportConfirmOpen = false;
    chatPreview = null;
    chatPreviewFile = null;
  }}
/>

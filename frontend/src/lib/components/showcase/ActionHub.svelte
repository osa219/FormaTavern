<script lang="ts">
  import { goto } from '$app/navigation';
  import type { CharacterCard, Persona } from '@formatavern/shared';
  import { HOOKS } from '@formatavern/shared';
  import { api, toUiError } from '$lib/api';
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

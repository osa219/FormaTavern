<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { Persona } from '@formatavern/shared';
  import { HOOKS } from '@formatavern/shared';
  import { personasStore } from '$lib/state/personas.svelte';
  import { toasts } from '$lib/state/toasts.svelte';

  import Icon from '$lib/components/ui/Icon.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import PersonaCard from '$lib/components/persona/PersonaCard.svelte';
  import ConfirmDialog from '$lib/components/dialogs/ConfirmDialog.svelte';
  import ShellSurface from '$lib/components/custom/ShellSurface.svelte';

  onMount(() => {
    personasStore.load();
  });

  let deleteTarget = $state<Persona | null>(null);
  let confirmDeleteOpen = $state(false);
  let reassignModalOpen = $state(false);
  let conflictChatsCount = $state(0);
  let reassignToId = $state<string>('');

  function handlePromptDelete(p: Persona) {
    deleteTarget = p;
    confirmDeleteOpen = true;
  }

  async function executeDelete(reassignTo?: string) {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id;

    const res = await personasStore.remove(targetId, reassignTo);
    if (!res.success && res.conflictChats) {
      conflictChatsCount = res.conflictChats;
      confirmDeleteOpen = false;
      const otherPersonas = personasStore.items.filter((p) => p.id !== targetId);
      reassignToId = otherPersonas[0]?.id ?? '';
      reassignModalOpen = true;
      return;
    }

    deleteTarget = null;
    confirmDeleteOpen = false;
    reassignModalOpen = false;
  }

  async function handleSetDefault(id: string) {
    await personasStore.setDefault(id);
  }
</script>

<ShellSurface class={HOOKS.shell.personas}>
  <!-- Header -->
  <header class="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-neutral-800/80 chrome-bar px-6">
    <div class="flex items-center gap-3">
      <a
        href="/"
        class="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200"
      >
        <Icon name="arrow-left" size={14} />
        <span>Foyer</span>
      </a>
      <span class="text-neutral-700">/</span>
      <h1 class="text-sm font-bold tracking-wide text-neutral-100 uppercase">
        Personas & Aliases
      </h1>
    </div>

    <a
      href="/personas/new"
      class="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-accent/90"
    >
      <Icon name="plus" size={14} />
      <span>New Persona</span>
    </a>
  </header>

  <main class="mx-auto max-w-5xl px-6 py-8">
    <div class="mb-8">
      <h2 class="text-2xl font-bold tracking-tight text-neutral-100 sm:text-3xl">
        Your User Personas
      </h2>
      <p class="mt-1 text-sm text-neutral-400">
        Personas define your role, description, and speech bubble appearance across stories. The default persona is automatically used when starting new stories.
      </p>
    </div>

    {#if personasStore.loading && personasStore.items.length === 0}
      <div class="flex h-48 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900/50 text-xs text-neutral-400">
        <Spinner size={16} class="mr-2" />
        <span>Loading personas…</span>
      </div>
    {:else}
      <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
        {#each personasStore.items as persona (persona.id)}
          <PersonaCard
            {persona}
            onSetDefault={handleSetDefault}
            onDelete={handlePromptDelete}
            onEdit={(id) => goto(`/personas/${id}/edit`)}
          />
        {/each}
      </div>
    {/if}
  </main>
</ShellSurface>

<!-- Confirm Delete Dialog -->
<ConfirmDialog
  open={confirmDeleteOpen}
  title="Delete Persona"
  message={`Are you sure you want to delete "${deleteTarget?.name}"?`}
  confirmLabel="Delete"
  danger={true}
  onConfirm={() => executeDelete()}
  onCancel={() => {
    confirmDeleteOpen = false;
    deleteTarget = null;
  }}
/>

<!-- Reassign In-Use Stories Modal -->
{#if reassignModalOpen && deleteTarget}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
    <div class="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
      <h3 class="text-base font-semibold text-neutral-100">
        Persona In Use
      </h3>
      <p class="mt-2 text-xs leading-relaxed text-neutral-400">
        "{deleteTarget.name}" is currently used by <span class="font-semibold text-neutral-200">{conflictChatsCount} {conflictChatsCount === 1 ? 'story' : 'stories'}</span>.
        Please choose another persona to reassign them to before deleting:
      </p>

      <div class="mt-4">
        <label for="reassign-select" class="block text-[11px] font-mono text-neutral-400 uppercase tracking-wider mb-1.5">
          Reassign Stories To
        </label>
        <select
          id="reassign-select"
          bind:value={reassignToId}
          class="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-xs text-neutral-100 focus:border-accent focus:outline-none"
        >
          {#each personasStore.items.filter((p) => p.id !== deleteTarget?.id) as opt (opt.id)}
            <option value={opt.id}>{opt.name} {opt.isDefault ? '(Default)' : ''}</option>
          {/each}
        </select>
      </div>

      <div class="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onclick={() => {
            reassignModalOpen = false;
            deleteTarget = null;
          }}
          class="rounded-xl border border-neutral-800 bg-neutral-850 px-4 py-2 text-xs font-semibold text-neutral-300 hover:bg-neutral-800"
        >
          Cancel
        </button>

        <button
          type="button"
          disabled={!reassignToId}
          onclick={() => executeDelete(reassignToId)}
          class="rounded-xl bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
        >
          Reassign & Delete
        </button>
      </div>
    </div>
  </div>
{/if}

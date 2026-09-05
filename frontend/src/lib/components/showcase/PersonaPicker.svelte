<script lang="ts">
  import { onMount } from 'svelte';
  import type { Persona } from '@formatavern/shared';
  import Icon from '$lib/components/ui/Icon.svelte';

  let {
    open,
    characterId,
    personas = [],
    onSelect,
    onClose
  }: {
    open: boolean;
    characterId: string;
    personas: Persona[];
    onSelect: (personaId: string) => void;
    onClose: () => void;
  } = $props();

  let selectedId = $state<string>('');

  $effect(() => {
    if (!open) return;
    try {
      const stored = localStorage.getItem(`ft.lastPersona.${characterId}`);
      if (stored && personas.some((p) => p.id === stored)) {
        selectedId = stored;
        return;
      }
    } catch {}

    const def = personas.find((p) => p.isDefault) ?? personas[0];
    if (def) selectedId = def.id;
  });

  function handleConfirm() {
    if (!selectedId) return;
    try {
      localStorage.setItem(`ft.lastPersona.${characterId}`, selectedId);
    } catch {}
    onSelect(selectedId);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
    <div class="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-semibold text-neutral-100">
          Choose Your Persona
        </h3>
        <button
          type="button"
          onclick={onClose}
          class="rounded-lg p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
          aria-label="Close"
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      <p class="mt-1 text-xs text-neutral-400">
        Select the persona you will embody in this story.
      </p>

      <div class="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
        {#each personas as p (p.id)}
          <label
            class="flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors {selectedId === p.id
              ? 'border-accent bg-accent/10'
              : 'border-neutral-800 bg-neutral-850/50 hover:bg-neutral-850'}"
          >
            <div class="flex items-center gap-3 min-w-0">
              <input
                type="radio"
                name="persona-choice"
                value={p.id}
                bind:group={selectedId}
                class="sr-only"
              />
              {#if p.avatar}
                <img
                  src={p.avatar}
                  alt={p.name}
                  class="h-9 w-9 rounded-full object-cover border border-neutral-700 select-none shrink-0"
                />
              {:else}
                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-neutral-200 border border-neutral-700 select-none">
                  {p.name.slice(0, 1).toUpperCase()}
                </div>
              {/if}

              <div class="min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="truncate text-sm font-semibold text-neutral-100">{p.name}</span>
                  {#if p.isDefault}
                    <span class="rounded-full bg-accent/20 px-1.5 py-0.2 text-[9px] font-semibold text-accent">
                      Default
                    </span>
                  {/if}
                </div>
                {#if p.description}
                  <p class="truncate text-xs text-neutral-400">{p.description}</p>
                {/if}
              </div>
            </div>

            <div class="ml-2 shrink-0">
              <div
                class="flex h-4 w-4 items-center justify-center rounded-full border {selectedId === p.id
                  ? 'border-accent bg-accent'
                  : 'border-neutral-600'}"
              >
                {#if selectedId === p.id}
                  <div class="h-1.5 w-1.5 rounded-full bg-neutral-950"></div>
                {/if}
              </div>
            </div>
          </label>
        {/each}
      </div>

      <div class="mt-4 flex items-center justify-between border-t border-neutral-800/80 pt-4">
        <a
          href="/personas"
          class="text-xs text-neutral-400 underline hover:text-neutral-200"
        >
          Manage personas…
        </a>

        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick={onClose}
            class="rounded-xl border border-neutral-800 bg-neutral-850 px-3.5 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-neutral-800"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={!selectedId}
            onclick={handleConfirm}
            class="rounded-xl bg-accent px-4 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-accent/90 disabled:opacity-50"
          >
            Start Story
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

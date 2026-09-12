<script lang="ts">
  import type { Persona } from '@formatavern/shared';
  import Icon from '$lib/components/ui/Icon.svelte';
  import BubblePreview from './BubblePreview.svelte';

  let {
    persona,
    onSetDefault,
    onDelete,
    onEdit
  }: {
    persona: Persona;
    onSetDefault?: (id: string) => void;
    onDelete?: (persona: Persona) => void;
    onEdit?: (id: string) => void;
  } = $props();

  let menuOpen = $state(false);

  function toggleMenu(e: MouseEvent) {
    e.stopPropagation();
    menuOpen = !menuOpen;
  }

  function handleSetDefault(e: MouseEvent) {
    e.stopPropagation();
    menuOpen = false;
    onSetDefault?.(persona.id);
  }

  function handleDelete(e: MouseEvent) {
    e.stopPropagation();
    menuOpen = false;
    onDelete?.(persona);
  }

  function handleEdit(e: MouseEvent) {
    e.stopPropagation();
    menuOpen = false;
    onEdit?.(persona.id);
  }
</script>

<svelte:window onclick={() => { if (menuOpen) menuOpen = false; }} />

<div class="relative flex flex-col justify-between rounded-2xl border border-(--chrome-line) bg-(--chrome-surface) p-5 transition-colors hover:border-accent/40 text-(--chrome-text)">
  <!-- Header: Avatar + Name + Default Badge + Menu -->
  <div class="flex items-start justify-between gap-3">
    <div class="flex items-center gap-3 min-w-0">
      {#if persona.avatar}
        <img
          src={persona.avatar}
          alt={persona.name}
          class="h-11 w-11 rounded-full object-cover border border-(--chrome-line) select-none shrink-0"
          loading="lazy"
          decoding="async"
        />
      {:else}
        <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-(--chrome-line)/30 text-sm font-semibold text-(--chrome-text) border border-(--chrome-line) select-none">
          {persona.name.slice(0, 1).toUpperCase()}
        </div>
      {/if}

      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <h3 class="truncate text-base font-semibold text-(--chrome-text)">{persona.name}</h3>
          {#if persona.isDefault}
            <span class="inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent border border-accent/30">
              Default
            </span>
          {/if}
        </div>
        {#if persona.description}
          <p class="mt-0.5 line-clamp-2 text-xs text-(--chrome-text)/70">
            {persona.description}
          </p>
        {:else}
          <p class="mt-0.5 text-xs text-(--chrome-text)/50 italic">No description provided</p>
        {/if}
      </div>
    </div>

    <!-- Actions Menu -->
    <div class="relative shrink-0">
      <button
        type="button"
        onclick={toggleMenu}
        class="flex h-8 w-8 items-center justify-center rounded-lg text-(--chrome-text)/60 transition-colors hover:bg-(--chrome-line)/40 hover:text-(--chrome-text)"
        aria-label="Persona options"
      >
        <Icon name="more-horizontal" size={16} />
      </button>

      {#if menuOpen}
        <div class="absolute right-0 top-9 z-20 w-44 rounded-xl border border-(--chrome-line) bg-(--chrome-surface) py-1.5 shadow-xl text-(--chrome-text)">
          <button
            type="button"
            onclick={handleEdit}
            class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-(--chrome-text) hover:bg-(--chrome-line)/40"
          >
            <Icon name="edit" size={13} />
            <span>Edit Persona</span>
          </button>

          {#if !persona.isDefault}
            <button
              type="button"
              onclick={handleSetDefault}
              class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-(--chrome-text) hover:bg-(--chrome-line)/40"
            >
              <Icon name="star" size={13} />
              <span>Make Default</span>
            </button>

            <button
              type="button"
              onclick={handleDelete}
              class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-(--chrome-line)/40"
            >
              <Icon name="trash" size={13} />
              <span>Delete</span>
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- Bubble Preview -->
  <div class="mt-4">
    <BubblePreview
      name={persona.name}
      avatar={persona.avatar}
      styleOverrides={persona.styleOverrides}
    />
  </div>
</div>

<script lang="ts">
  import { goto } from '$app/navigation';
  import type { CharacterSummary } from '@formatavern/shared';
  import { displayTag, HOOKS } from '@formatavern/shared';
  import Icon from '$lib/components/ui/Icon.svelte';

  let {
    companion,
    onStartStory
  }: {
    companion: CharacterSummary;
    onStartStory?: (characterId: string) => void;
  } = $props();

  const accent = $derived(companion.style?.colors?.accent ?? '#38bdf8');
  const visibleTags = $derived((companion.tags ?? []).slice(0, 3));
  const overflowCount = $derived(Math.max(0, (companion.tags?.length ?? 0) - 3));
</script>

<div
  role="button"
  tabindex="0"
  onclick={() => goto(`/character/${companion.id}`)}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      goto(`/character/${companion.id}`);
    }
  }}
  class="group relative flex flex-col justify-between overflow-hidden border border-neutral-800/80 bg-neutral-900/60 transition-colors hover:border-neutral-700 hover:bg-neutral-850/80 cursor-pointer text-left shadow-lg hover:shadow-xl {HOOKS.chrome.card}"
>
  <!-- Subtle accent glow -->
  <div
    class="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-10 blur-2xl transition-opacity group-hover:opacity-25"
    style="background-color: {accent};"
  ></div>

  <!-- Top: Avatar + Name + Swatch -->
  <div class="relative flex items-start gap-4">
    {#if companion.avatar}
      <img
        src={companion.avatar}
        alt={companion.name}
        class="h-14 w-14 rounded-2xl object-cover border border-neutral-700 select-none shrink-0 shadow-md"
        loading="lazy"
        decoding="async"
      />
    {:else}
      <div
        class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-neutral-800 text-lg font-bold text-neutral-300 border border-neutral-700 select-none shadow-md"
      >
        {companion.name.slice(0, 1).toUpperCase()}
      </div>
    {/if}

    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <h3 class="truncate text-base font-semibold text-neutral-100 group-hover:text-white">
          {companion.name}
        </h3>
        <!-- Swatch dot -->
        <span
          class="h-2 w-2 rounded-full shrink-0"
          style="background-color: {accent};"
          title="Companion theme accent"
        ></span>
      </div>

      {#if companion.tagline}
        <p class="mt-1 line-clamp-2 text-xs text-neutral-400 font-light leading-relaxed">
          {companion.tagline}
        </p>
      {/if}
    </div>
  </div>

  <!-- Tags & Story Count Footer -->
  <div class="relative mt-5 pt-3 border-t border-neutral-800/60 flex items-center justify-between gap-2 text-xs">
    <!-- Tag chips -->
    <div class="flex flex-wrap items-center gap-1 overflow-hidden">
      {#each visibleTags as tag (tag)}
        <span class="rounded bg-neutral-800/80 px-1.5 py-0.5 text-[10px] font-mono text-neutral-400 border border-neutral-700/60">
          {displayTag(tag)}
        </span>
      {/each}
      {#if overflowCount > 0}
        <span class="text-[10px] font-mono text-neutral-500">
          +{overflowCount}
        </span>
      {/if}
    </div>

    <!-- Story count or hover actions -->
    <div class="shrink-0">
      <span class="font-mono text-[11px] text-neutral-500 group-hover:hidden">
        {companion.storyCount} {companion.storyCount === 1 ? 'story' : 'stories'}
      </span>

      <div class="hidden group-hover:flex items-center gap-1.5">
        {#if onStartStory}
          <button
            type="button"
            onclick={(e) => {
              e.stopPropagation();
              onStartStory(companion.id);
            }}
            class="rounded-lg bg-accent px-2 py-1 text-[11px] font-semibold text-accent-contrast hover:bg-accent/90"
            title="Start new story with default persona"
          >
            Start
          </button>
        {/if}
        <button
          type="button"
          onclick={(e) => {
            e.stopPropagation();
            goto(`/character/${companion.id}/edit`);
          }}
          class="rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 text-[11px] font-medium text-neutral-300 hover:text-white"
          title="Edit companion"
        >
          Edit
        </button>
      </div>
    </div>
  </div>
</div>

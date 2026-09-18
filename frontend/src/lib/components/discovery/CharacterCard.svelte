<script lang="ts">
  import { goto } from '$app/navigation';
  import type { CharacterSummary } from '@formatavern/shared';
  import { displayTag, HOOKS } from '@formatavern/shared';
  import Icon from '$lib/components/ui/Icon.svelte';

  let {
    character,
    companion,
    onStartStory
  }: {
    character?: CharacterSummary;
    companion?: CharacterSummary;
    onStartStory?: (characterId: string) => void;
  } = $props();

  const activeCharacter = $derived(character ?? companion!);
  const accent = $derived(activeCharacter?.style?.colors?.accent ?? '#38bdf8');
  const visibleTags = $derived((activeCharacter?.tags ?? []).slice(0, 3));
  const overflowCount = $derived(Math.max(0, (activeCharacter?.tags?.length ?? 0) - 3));
</script>

<div
  role="button"
  tabindex="0"
  onclick={() => goto(`/character/${activeCharacter.id}`)}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      goto(`/character/${activeCharacter.id}`);
    }
  }}
  class="group relative flex flex-col justify-between overflow-hidden border border-(--chrome-line) bg-(--chrome-surface) transition-colors hover:border-accent/40 cursor-pointer text-left shadow-lg hover:shadow-xl {HOOKS.chrome.card}"
>
  <!-- Subtle accent glow -->
  <div
    class="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-10 blur-2xl transition-opacity group-hover:opacity-25"
    style="background-color: {accent};"
  ></div>

  <!-- Top: Avatar + Name + Swatch -->
  <div class="relative flex items-start gap-4">
    {#if activeCharacter.avatar}
      <img
        src={activeCharacter.avatar}
        alt={activeCharacter.name}
        class="h-14 w-14 rounded-2xl object-cover border border-(--chrome-line) select-none shrink-0 shadow-md"
        loading="lazy"
        decoding="async"
      />
    {:else}
      <div
        class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-(--chrome-bg) text-lg font-bold text-(--chrome-text) border border-(--chrome-line) select-none shadow-md"
      >
        {activeCharacter.name.slice(0, 1).toUpperCase()}
      </div>
    {/if}

    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <h3 class="truncate text-base font-semibold text-(--chrome-text) group-hover:text-accent">
          {activeCharacter.name}
        </h3>
        <!-- Swatch dot -->
        <span
          class="h-2 w-2 rounded-full shrink-0"
          style="background-color: {accent};"
          title="Character theme accent"
        ></span>
      </div>

      {#if activeCharacter.tagline}
        <p class="mt-1 line-clamp-2 text-xs text-(--chrome-text)/70 font-light leading-relaxed">
          {activeCharacter.tagline}
        </p>
      {/if}
    </div>
  </div>

  <!-- Tags & Story Count Footer -->
  <div class="relative mt-5 pt-3 border-t border-(--chrome-line) flex items-center justify-between gap-2 text-xs">
    <!-- Tag chips -->
    <div class="flex flex-wrap items-center gap-1 overflow-hidden">
      {#each visibleTags as tag (tag)}
        <span class="rounded bg-(--chrome-bg)/80 px-1.5 py-0.5 text-[10px] font-mono text-(--chrome-text)/70 border border-(--chrome-line)">
          {displayTag(tag)}
        </span>
      {/each}
      {#if overflowCount > 0}
        <span class="text-[10px] font-mono text-(--chrome-text)/50">
          +{overflowCount}
        </span>
      {/if}
    </div>

    <!-- Chat count or hover actions -->
    <div class="shrink-0">
      <span class="font-mono text-[11px] text-(--chrome-text)/50 group-hover:hidden">
        {activeCharacter.storyCount} {activeCharacter.storyCount === 1 ? 'chat' : 'chats'}
      </span>

      <div class="hidden group-hover:flex items-center gap-1.5">
        {#if onStartStory}
          <button
            type="button"
            onclick={(e) => {
              e.stopPropagation();
              onStartStory(activeCharacter.id);
            }}
            class="rounded-lg bg-accent px-2 py-1 text-[11px] font-semibold text-accent-contrast hover:bg-accent/90"
            title="Start new chat with default persona"
          >
            Chat
          </button>
        {/if}
        <button
          type="button"
          onclick={(e) => {
            e.stopPropagation();
            goto(`/character/${activeCharacter.id}/edit`);
          }}
          class="rounded-lg border border-(--chrome-line) bg-(--chrome-surface) p-1 text-(--chrome-text)/70 hover:text-(--chrome-text)"
          title="Edit character in studio"
        >
          Edit
        </button>
      </div>
    </div>
  </div>
</div>

<script lang="ts">
  import type { CharacterCard } from '@formatavern/shared';
  import TagChips from './TagChips.svelte';
  import CreatorCredit from './CreatorCredit.svelte';

  let {
    character
  }: {
    character: CharacterCard;
  } = $props();

  const accent = $derived(character.style?.colors?.accent ?? '#38bdf8');
</script>

<div class="relative overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6 md:p-8 backdrop-blur-md">
  <!-- Subtle Chameleon Glow from Character Accent -->
  <div
    class="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full opacity-15 blur-3xl"
    style="background-color: {accent};"
  ></div>

  <div class="relative flex flex-col gap-6 sm:flex-row sm:items-center">
    <!-- Character Avatar -->
    {#if character.avatar}
      <img
        src={character.avatar}
        alt={character.name}
        class="h-28 w-28 rounded-2xl object-cover border border-neutral-700/80 shadow-xl select-none shrink-0"
        loading="lazy"
        decoding="async"
      />
    {:else}
      <div
        class="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl bg-neutral-800 text-3xl font-bold text-neutral-300 border border-neutral-700 select-none shadow-xl"
      >
        {character.name.slice(0, 1).toUpperCase()}
      </div>
    {/if}

    <!-- Metadata -->
    <div class="space-y-2 min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-3">
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-100">
          {character.name}
        </h1>
        <CreatorCredit creator={character.creator} />
      </div>

      {#if (character as any).tagline}
        <p class="text-sm sm:text-base text-neutral-300 font-light leading-relaxed">
          {(character as any).tagline}
        </p>
      {/if}

      <div class="pt-2">
        <TagChips tags={character.tags} />
      </div>
    </div>
  </div>
</div>

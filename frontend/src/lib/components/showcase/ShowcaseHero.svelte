<script lang="ts">
  import type { CharacterCard } from '@formatavern/shared';
  import { HOOKS, resolveCharacterName } from '@formatavern/shared';
  import TagChips from './TagChips.svelte';
  import CreatorCredit from './CreatorCredit.svelte';

  let {
    character
  }: {
    character: CharacterCard;
  } = $props();

  const accent = $derived(character.style?.colors?.accent ?? '#38bdf8');
  const characterName = $derived(resolveCharacterName(character));
  const showCharacterName = $derived(characterName !== character.name);
</script>

<div class="relative overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6 md:p-8 backdrop-blur-md {HOOKS.character.hero}">
  <!-- Subtle Chameleon Glow from Character Accent -->
  <div
    class="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full opacity-15 blur-3xl"
    style="background-color: {accent};"
  ></div>

  <div class="relative flex flex-col gap-6">
    <!-- Character Avatar: full-width immersive banner, single column.
         Neutral sizing only (no theme tint, no overlay) so custom CSS
         can override without fighting the default layout. -->
    {#if character.avatar}
      <img
        src={character.avatar}
        alt={character.name}
        class="block h-auto w-full rounded-2xl border border-neutral-700/80 shadow-xl select-none"
        loading="lazy"
        decoding="async"
      />
    {:else}
      <div
        class="flex h-48 w-full items-center justify-center rounded-2xl bg-neutral-800 text-5xl font-bold text-neutral-300 border border-neutral-700 select-none shadow-xl"
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
        {#if (character as any).version}
          <span class="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-[11px] font-mono text-neutral-300">
            {(character as any).version}
          </span>
        {/if}
        {#if (character as any).origin}
          <span class="rounded-md border border-neutral-700 bg-neutral-800/60 px-2 py-0.5 text-[11px] font-mono text-neutral-400">
            {(character as any).origin}
          </span>
        {/if}
        <CreatorCredit creator={character.creator} creatorUrl={(character as any).creatorUrl} />
      </div>

      {#if showCharacterName}
        <p class="text-sm text-neutral-400">
          Character: <span class="font-medium text-neutral-200">{characterName}</span>
        </p>
      {/if}

      {#if (character as any).tagline}
        <p class="text-sm sm:text-base text-neutral-300 font-light leading-relaxed">
          {(character as any).tagline}
        </p>
      {/if}

      {#if (character as any).characterUrl}
        <p class="text-xs text-neutral-400">
          Character source:
          <a
            href={(character as any).characterUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="underline decoration-neutral-600 underline-offset-2 hover:text-neutral-200"
          >{(character as any).characterUrl}</a>
        </p>
      {/if}

      <div class="pt-2">
        <TagChips tags={character.tags} />
      </div>
    </div>
  </div>
</div>

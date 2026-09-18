<script lang="ts">
  import { defaultState, resolveTheme, shellToThemeOverrides, HOOKS, type CharacterCard as CharacterCardType } from '@formatavern/shared';
  import { themeToCssVars } from '$lib/theme/cssVars';
  import { shellTheme } from '$lib/state/shellTheme.svelte';
  import Icon from '../ui/Icon.svelte';
  import Spinner from '../ui/Spinner.svelte';

  let {
    character,
    onStartChat,
    creating = false
  }: {
    character: CharacterCardType;
    onStartChat?: (characterId: string) => void;
    creating?: boolean;
  } = $props();

  const resolved = $derived(
    resolveTheme({
      global: shellToThemeOverrides(shellTheme.theme),
      character: character.style,
      bindings: character.stateBindings,
      state: defaultState(character),
      a11y: {
        disableCharacterThemes: false,
        disableReactiveTheming: false
      }
    })
  );

  const cssVars = $derived(themeToCssVars(resolved.theme));

  const styleAttr = $derived.by(() => {
    return Object.entries(cssVars)
      .map(([k, v]) => `${k}: ${v}`)
      .join('; ');
  });

  const previewDialogue = $derived.by(() => {
    if (!character.firstMessage) return 'Greetings, traveler.';
    const lines = character.firstMessage.split('\n').map((l) => l.trim()).filter(Boolean);
    const speechLine = lines.find((l) => l.includes('"') || l.includes('“'));
    if (speechLine) {
      const match = speechLine.match(/["“]([^"”]+)["”]/);
      if (match) return `“${match[1].slice(0, 75)}…”`;
    }
    return lines[0]?.slice(0, 80) ?? 'Greetings.';
  });
</script>

<div
  style={styleAttr}
  data-transitions="off"
  class="relative flex flex-col justify-between overflow-hidden border border-neutral-800/90 bg-neutral-900/90 shadow-xl transition-colors duration-200 hover:border-neutral-700 hover:shadow-2xl {HOOKS.chrome.card}"
>
  <!-- Ambient Gradient Swatch Background -->
  <div
    class="pointer-events-none absolute inset-0 opacity-40"
    style="background: var(--theme-bg-gradient);"
  ></div>
  <div
    class="pointer-events-none absolute inset-0 opacity-60"
    style="background-color: var(--theme-bg-overlay);"
  ></div>

  <!-- Content -->
  <div class="relative z-10 flex flex-col gap-4">
    <!-- Character Header -->
    <div class="flex items-start justify-between gap-3">
      <div>
        <h3
          class="text-lg font-bold tracking-tight text-neutral-100"
          style="font-family: var(--theme-font-display);"
        >
          {character.name}
        </h3>
        {#if character.description}
          <p class="mt-0.5 line-clamp-2 text-xs leading-relaxed text-neutral-400">
            {character.description}
          </p>
        {/if}
      </div>

      {#if character.avatar}
        <img
          src={character.avatar}
          alt={character.name}
          class="h-12 w-12 rounded-xl object-cover ring-1 ring-neutral-700"
        />
      {:else}
        <div
          class="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-800 text-sm font-semibold text-neutral-300 ring-1 ring-neutral-700"
        >
          {character.name.slice(0, 2).toUpperCase()}
        </div>
      {/if}
    </div>

    <!-- Live Chameleon Swatch Preview -->
    <div
      class="flex flex-col gap-2 rounded-xl border border-neutral-800/60 bg-black/30 p-3 text-xs"
      style="font-family: var(--theme-font-body);"
    >
      <div class="flex items-center gap-1 text-[10px] uppercase tracking-wider text-neutral-400">
        <span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
        <span>Theme Preview</span>
      </div>

      <!-- Sample speech bubble with live character tokens -->
      <div
        class="self-start rounded-xl p-2.5 shadow-sm"
        style="
          background-color: var(--theme-bubble-char-bg);
          color: var(--theme-bubble-char-text);
          border: 1px solid var(--theme-bubble-char-border);
        "
      >
        <div class="mb-0.5 text-[10px] font-semibold opacity-75">
          {character.name}
        </div>
        <p class="text-xs italic leading-relaxed">
          {previewDialogue}
        </p>
      </div>
    </div>
  </div>

  <!-- Start Action -->
  <div class="relative z-10 mt-5 pt-3 border-t border-neutral-800/60">
    <button
      type="button"
      onclick={() => onStartChat?.(character.id)}
      disabled={creating}
      class="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-100 py-2.5 px-4 text-xs font-semibold text-neutral-900 transition-colors hover:bg-white disabled:opacity-50"
    >
      {#if creating}
        <Spinner size={14} class="text-neutral-900" />
        <span>Creating chat…</span>
      {:else}
        <Icon name="sparkles" size={14} />
        <span>Start New Chat</span>
      {/if}
    </button>
  </div>
</div>

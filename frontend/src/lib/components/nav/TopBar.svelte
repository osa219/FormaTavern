<script lang="ts">
  import type { CharacterCard, ChatView, StateVector } from '@formatavern/shared';
  import { HOOKS } from '@formatavern/shared';
  import Icon from '../ui/Icon.svelte';
  import StateHud from '../hud/StateHud.svelte';

  let {
    character = null,
    chat = null,
    currentState = {},
    stateSource = 'initial',
    stateWarnings = [],
    onToggleNav,
    onToggleSettings,
    onToggleLore,
    onOverrideState
  }: {
    character?: CharacterCard | null;
    chat?: ChatView | null;
    currentState?: StateVector;
    stateSource?: 'initial' | 'patch' | 'inherited' | 'override';
    stateWarnings?: string[];
    onToggleNav: () => void;
    onToggleSettings: () => void;
    onToggleLore?: () => void;
    onOverrideState?: (patch: StateVector) => void;
  } = $props();

</script>

<header
  style="backdrop-filter: var(--chrome-backdrop-filter, blur(12px)); font-family: var(--chrome-font, var(--theme-font-family)); color: var(--chrome-text, inherit);"
  class="relative z-30 flex h-14 w-full items-center justify-between border-b border-neutral-800/80 bg-neutral-900/50 px-3 {HOOKS.chrome.topbar}"
>
  <!-- Left: Navigation Menu & Home -->
  <div class="flex items-center gap-2">
    <button
      type="button"
      onclick={onToggleNav}
      class="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-850 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      aria-label="Open navigation drawer (Alt+N)"
      title="Stories (Alt+N)"
    >
      <Icon name="menu" size={16} />
    </button>

    <a
      href="/"
      class="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-800/60 bg-neutral-850/60 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      aria-label="Return to Foyer"
      title="Return to Foyer"
    >
      <Icon name="sparkles" size={14} class="text-accent" />
    </a>
  </div>

  <!-- Center: Character & Story Info -->
  {#if character}
    <div class="flex items-center gap-2.5 overflow-hidden px-2 text-center">
      {#if character.avatar}
        <img
          src={character.avatar}
          alt={character.name}
          class="h-7 w-7 rounded-lg object-cover ring-1 ring-neutral-700"
        />
      {/if}
      <div class="flex flex-col items-start leading-tight">
        <span
          class="truncate text-sm font-semibold text-neutral-100"
          style="font-family: var(--theme-font-display);"
        >
          {character.name}
        </span>
        {#if chat?.title && chat.title !== character.name}
          <span class="truncate text-[11px] text-neutral-400">
            {chat.title}
          </span>
        {/if}
      </div>
    </div>
  {:else}
    <div></div>
  {/if}

  <!-- Right: State HUD & Settings -->
  <div class="flex items-center gap-2">
    {#if character}
      <StateHud
        {currentState}
        {stateSource}
        {stateWarnings}
        schema={character.stateSchema}
        onOverride={onOverrideState}
      />
    {/if}

    {#if onToggleLore}
      <button
        type="button"
        onclick={onToggleLore}
        class="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-850 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label="Open lore codex (Alt+L)"
        title="Codex & Lore (Alt+L)"
      >
        <Icon name="book" size={16} />
      </button>
    {/if}

    <button
      type="button"
      onclick={onToggleSettings}
      class="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-850 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      aria-label="Open settings"
      title="Settings"
    >
      <Icon name="settings" size={16} />
    </button>
  </div>
</header>

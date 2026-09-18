<script lang="ts">
  import type { PageData } from './$types';
  import type { CharacterCard, ChatView, Persona } from '@formatavern/shared';
  import { resolveTheme, shellToThemeOverrides } from '@formatavern/shared';
  import { serializeVars, themeToCssVars } from '$lib/theme/cssVars';
  import { prefs } from '$lib/state/prefs.svelte';
  import { shellTheme } from '$lib/state/shellTheme.svelte';
  import { api, toUiError } from '$lib/api';
  import { toasts } from '$lib/state/toasts.svelte';

  import Icon from '$lib/components/ui/Icon.svelte';
  import Backdrop from '$lib/components/chat/Backdrop.svelte';
  import DecorLayers from '$lib/components/custom/DecorLayers.svelte';
  import ShowcaseHero from '$lib/components/showcase/ShowcaseHero.svelte';
  import ActionHub from '$lib/components/showcase/ActionHub.svelte';
  import ResumeMenu from '$lib/components/showcase/ResumeMenu.svelte';
  import ShowcaseBody from '$lib/components/showcase/ShowcaseBody.svelte';
  import ConfirmDialog from '$lib/components/dialogs/ConfirmDialog.svelte';
  import CustomStyleOutlet from '$lib/components/custom/CustomStyleOutlet.svelte';
  import { selectPartitionSurface } from '@formatavern/shared';

  let { data }: { data: PageData } = $props();

  const character = $derived(data.character as CharacterCard);
  // Marked sheets inject only the showcase partition (possibly nothing);
  // unmarked legacy sheets keep pre-partition behavior (whole sheet, C4-contained).
  const showcaseCss = $derived(
    selectPartitionSurface(character.customCss, 'showcase') || null
  );
  let chats = $state<ChatView[]>([]);
  const personas = $derived((data.personas ?? []) as Persona[]);

  // Showcase is a theme root for this character: character.style only
  // (no bindings, no persona), per the Phase 5 blueprint. Static content
  // page, so transitions stay off. Derived from the resolved theme so the
  // a11y kill-switch (disableCharacterThemes) is honored for backdrop too.
  const showcaseTheme = $derived(
    resolveTheme({
      global: shellToThemeOverrides(shellTheme.theme),
      character: character.style,
      a11y: {
        disableCharacterThemes: prefs.disableCharacterThemes,
        disableReactiveTheming: true
      }
    })
  );
  const showcaseStyle = $derived(serializeVars(themeToCssVars(showcaseTheme.theme)));
  const showcaseBg = $derived(showcaseTheme.theme.background.image ?? null);
  const showcaseDecor = $derived(showcaseTheme.theme.decor ?? []);

  $effect(() => {
    chats = data.chats ?? [];
  });

  let deleteChatId = $state<string | null>(null);
  let confirmDeleteChatOpen = $state(false);

  function promptDeleteChat(id: string) {
    deleteChatId = id;
    confirmDeleteChatOpen = true;
  }

  async function handleConfirmDeleteChat() {
    if (!deleteChatId) return;
    const id = deleteChatId;
    deleteChatId = null;
    confirmDeleteChatOpen = false;

    try {
      const res = await api.api.chats({ id }).delete();
      if (res.error) {
        toasts.error(toUiError(res.error).message);
        return;
      }
      chats = chats.filter((c) => c.id !== id);
      toasts.success('Chat deleted');
    } catch (err: any) {
      toasts.error(toUiError(err).message);
    }
  }
</script>

<svelte:head>
  <title>{character.name} — FormaTavern</title>
</svelte:head>

<div
  style={showcaseStyle}
  data-transitions="off"
  data-ft-surface="character"
  class="relative isolate min-h-screen bg-(--chrome-bg) text-(--chrome-text) font-sans"
>
  <CustomStyleOutlet scope="character" css={showcaseCss} />

  <!-- Ambient character backdrop (image + overlay, or accent gradient fallback) -->
  <Backdrop image={showcaseBg} />

  <!-- Fixed decor layers (scenery pins / page dolls) -->
  <DecorLayers layers={showcaseDecor} />

  <!-- Top Bar -->
  <header class="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-(--chrome-line) chrome-bar px-6">
    <div class="flex items-center gap-3">
      <a
        href="/"
        class="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200"
      >
        <Icon name="arrow-left" size={14} />
        <span>Foyer</span>
      </a>
      <span class="text-neutral-700">/</span>
      <span class="truncate text-xs font-semibold text-neutral-300">
        {character.name}
      </span>
    </div>

    <div class="flex items-center gap-2">
      <a
        href="/personas"
        class="flex items-center gap-1.5 rounded-lg border border-(--chrome-line) bg-(--chrome-surface) px-3 py-1.5 text-xs text-(--chrome-text)/80 hover:border-accent/40 hover:text-(--chrome-text) transition-colors"
      >
        <Icon name="user" size={13} />
        <span>Personas</span>
      </a>
    </div>
  </header>

  <main class="mx-auto max-w-4xl px-6 py-8 space-y-8">
    <!-- Showcase Hero -->
    <ShowcaseHero {character} />

    <!-- Action Hub (Start Story / Edit / Duplicate / Delete) -->
    <ActionHub {character} {personas} />

    <!-- Main Character Body / Showcase -->
    <section class="rounded-3xl border border-neutral-800 bg-neutral-900/40 p-6 md:p-8 space-y-8">
      {#if character.showcase}
        <ShowcaseBody markdown={character.showcase} />
      {:else}
        <!-- Generated Profile Fallback for Imported or Plain Cards -->
        <div class="space-y-6">
          {#if character.description}
            <div>
              <h2 class="text-xs font-semibold uppercase tracking-wider text-accent mb-2">
                About
              </h2>
              <p class="text-sm leading-relaxed text-neutral-300 whitespace-pre-wrap">
                {character.description}
              </p>
            </div>
          {/if}

          {#if character.scenario}
            <div class="border-t border-neutral-800/60 pt-5">
              <h2 class="text-xs font-semibold uppercase tracking-wider text-accent mb-2">
                The Scene
              </h2>
              <p class="text-sm leading-relaxed text-neutral-300 whitespace-pre-wrap">
                {character.scenario}
              </p>
            </div>
          {/if}

          {#if character.firstMessage}
            <div class="border-t border-neutral-800/60 pt-5">
              <h2 class="text-xs font-semibold uppercase tracking-wider text-accent mb-2">
                Opening Words
              </h2>
              <blockquote class="border-l-2 border-accent/60 pl-4 py-1 text-sm italic text-neutral-300">
                "{character.firstMessage.slice(0, 300)}{character.firstMessage.length > 300 ? '…' : ''}"
              </blockquote>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Author Fields Collapsible Disclosure -->
      {#if character.personality || character.exampleDialogue}
        <details class="group rounded-2xl border border-neutral-800/70 bg-neutral-900/60 p-4 transition-colors">
          <summary class="flex cursor-pointer items-center justify-between text-xs font-semibold uppercase tracking-wider text-neutral-400 hover:text-neutral-200 select-none">
            <span>Author Prompt Fields (Debug / Reference)</span>
            <span class="transition-transform group-open:rotate-180">▾</span>
          </summary>

          <div class="mt-4 space-y-4 border-t border-neutral-800/60 pt-4 font-mono text-xs text-neutral-300">
            {#if character.personality}
              <div>
                <span class="block text-[11px] text-neutral-500 uppercase tracking-wider mb-1">
                  Personality
                </span>
                <pre class="overflow-x-auto rounded-xl bg-(--chrome-surface) border border-(--chrome-line) p-3 text-xs leading-relaxed text-(--chrome-text) whitespace-pre-wrap">{character.personality}</pre>
              </div>
            {/if}

            {#if character.exampleDialogue}
              <div>
                <span class="block text-[11px] text-neutral-500 uppercase tracking-wider mb-1">
                  Example Dialogue
                </span>
                <pre class="overflow-x-auto rounded-xl bg-(--chrome-surface) border border-(--chrome-line) p-3 text-xs leading-relaxed text-(--chrome-text) whitespace-pre-wrap">{character.exampleDialogue}</pre>
              </div>
            {/if}
          </div>
        </details>
      {/if}
    </section>

    <!-- Resume Existing Chats Menu -->
    {#if chats.length > 0}
      <ResumeMenu {chats} onDeleteChat={promptDeleteChat} />
    {/if}
  </main>

  <!-- Confirm Delete Chat Dialog -->
  <ConfirmDialog
    open={confirmDeleteChatOpen}
    title="Delete Chat"
    message="Are you sure you want to delete this chat? All messages will be permanently lost."
    confirmLabel="Delete"
    danger={true}
    onConfirm={handleConfirmDeleteChat}
    onCancel={() => {
      confirmDeleteChatOpen = false;
      deleteChatId = null;
    }}
  />
</div>

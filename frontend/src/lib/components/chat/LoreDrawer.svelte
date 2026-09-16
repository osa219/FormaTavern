<script lang="ts">
  import type { CharacterCard, ChatView, Persona, StateVector } from '@formatavern/shared';
  import { HOOKS } from '@formatavern/shared';
  import ShowcaseBody from '$lib/components/showcase/ShowcaseBody.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import PromptTab from './PromptTab.svelte';
  import type { PromptDraft } from '$lib/prompt/preview';

  let {
    open,
    character,
    chat = null,
    currentPersona = null,
    personas = [],
    currentState = {},
    busy = false,
    initialTab = 'about',
    promptDraft = null,
    onClose,
    onSwitchPersona,
    onOpenStateOverride,
    onEditSettings
  }: {
    open: boolean;
    character: CharacterCard;
    chat?: ChatView | null;
    currentPersona?: Persona | null;
    personas?: Persona[];
    currentState?: StateVector;
    busy?: boolean;
    initialTab?: LoreTab;
    promptDraft?: PromptDraft | null;
    onClose: () => void;
    onSwitchPersona: (personaId: string) => Promise<void>;
    onOpenStateOverride?: () => void;
    onEditSettings?: () => void;
  } = $props();

  type LoreTab = 'about' | 'voice' | 'you' | 'state' | 'prompt';
  // Note: only the drawer's *content* unmounts on close (`{#if open}` below) —
  // this component (and its state) persists. So the entry point owns the tab:
  // every open syncs to it (a mount-time seed silently keeps the last tab,
  // which broke the composer's Preview jump).
  let activeTab = $state<LoreTab>('about');

  $effect(() => {
    if (open) activeTab = initialTab;
  });
  let switching = $state(false);

  async function handleSelectPersona(e: Event) {
    const personaId = (e.target as HTMLSelectElement).value;
    if (!personaId || personaId === currentPersona?.id) return;
    switching = true;
    try {
      await onSwitchPersona(personaId);
    } finally {
      switching = false;
    }
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
  <div class="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-xs">
    <!-- Slide-over drawer -->
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Companion Lore and Info"
      class="flex h-full w-full max-w-[28rem] flex-col border-l border-neutral-800 bg-neutral-900/95 font-sans text-neutral-100 shadow-2xl backdrop-blur-md {HOOKS.chat.loreDrawer}"
    >
      <!-- Drawer Header -->
      <div class="flex items-center justify-between border-b border-neutral-800 px-5 py-3.5">
        <div class="flex items-center gap-2.5">
          <Icon name="book" size={16} class="text-accent" />
          <h2 class="text-xs font-bold uppercase tracking-wider text-neutral-200">
            Lore & Companion Codex
          </h2>
        </div>

        <button
          type="button"
          onclick={onClose}
          class="rounded-lg p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          aria-label="Close lore drawer"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      <!-- Tabs Navigation -->
      <div class="flex border-b border-neutral-800 bg-neutral-950/60 px-4 text-xs font-medium">
        {#each [
          { id: 'about', label: 'About' },
          { id: 'voice', label: 'Voice' },
          { id: 'you', label: 'You (Persona)' },
          { id: 'state', label: 'State' },
          { id: 'prompt', label: 'Prompt' }
        ] as tab (tab.id)}
          <button
            type="button"
            onclick={() => (activeTab = tab.id as LoreTab)}
            class="border-b-2 px-3.5 py-2.5 transition-colors {activeTab === tab.id
              ? 'border-accent text-accent font-semibold'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'}"
          >
            {tab.label}
          </button>
        {/each}
      </div>

      <!-- Tab Content Area -->
      <div class="flex-1 overflow-y-auto p-5 space-y-6">
        <!-- ABOUT TAB -->
        {#if activeTab === 'about'}
          {#if chat?.metadata}
            <div class="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span class="text-neutral-500">This conversation speaks</span>
              <span class="rounded border border-neutral-800 bg-neutral-950 px-1.5 py-0.5 font-mono text-neutral-300">
                {chat.metadata.narrativeMode === 'narrative' ? (chat.metadata.envelopeDialect ?? 'directive') : 'classic prose'}
              </span>
              <span class="text-neutral-500" title="The format is set when the chat is created and never changes mid-story">locked at creation</span>
            </div>
          {/if}
          {#if character.showcase}
            <ShowcaseBody markdown={character.showcase} />
          {:else}
            <div class="space-y-4 text-xs leading-relaxed text-neutral-300">
              {#if character.description}
                <div>
                  <h3 class="font-semibold uppercase tracking-wider text-accent mb-1.5">Description</h3>
                  <p class="whitespace-pre-wrap">{character.description}</p>
                </div>
              {/if}

              {#if character.scenario}
                <div class="border-t border-neutral-800 pt-3">
                  <h3 class="font-semibold uppercase tracking-wider text-accent mb-1.5">The Scene</h3>
                  <p class="whitespace-pre-wrap">{character.scenario}</p>
                </div>
              {/if}
            </div>
          {/if}

        <!-- VOICE TAB -->
        {:else if activeTab === 'voice'}
          <div class="space-y-4 text-xs text-neutral-300">
            <div>
              <h3 class="font-semibold uppercase tracking-wider text-accent mb-1">Personality</h3>
              <pre class="overflow-x-auto rounded-xl bg-neutral-950 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">{character.personality || 'None specified'}</pre>
            </div>

            {#if character.exampleDialogue}
              <div class="border-t border-neutral-800 pt-3">
                <h3 class="font-semibold uppercase tracking-wider text-accent mb-1">Example Dialogue</h3>
                <pre class="overflow-x-auto rounded-xl bg-neutral-950 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">{character.exampleDialogue}</pre>
              </div>
            {/if}
          </div>

        <!-- YOU (PERSONA) TAB -->
        {:else if activeTab === 'you'}
          <div class="space-y-5 text-xs">
            <div class="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 space-y-3">
              <span class="block text-[11px] font-mono text-neutral-400 uppercase tracking-wider">
                Active Persona
              </span>

              {#if currentPersona}
                <div class="flex items-center gap-3">
                  {#if currentPersona.avatar}
                    <img
                      src={currentPersona.avatar}
                      alt={currentPersona.name}
                      class="h-10 w-10 rounded-full object-cover border border-neutral-700 select-none shrink-0"
                    />
                  {:else}
                    <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-sm font-semibold text-neutral-200 border border-neutral-700">
                      {currentPersona.name.slice(0, 1).toUpperCase()}
                    </div>
                  {/if}
                  <div>
                    <h4 class="text-sm font-semibold text-neutral-100">{currentPersona.name}</h4>
                    <p class="text-neutral-400 line-clamp-2 mt-0.5">{currentPersona.description || 'No description'}</p>
                  </div>
                </div>
              {:else}
                <p class="text-neutral-400 italic">No specific persona active.</p>
              {/if}
            </div>

            <!-- Switch Persona Selector -->
            <div>
              <label for="switch-persona-select" class="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                Switch Persona
              </label>

              {#if busy}
                <p class="mb-2 text-[11px] text-amber-400/90 font-mono">
                  Persona switching is disabled while the companion is generating.
                </p>
              {/if}

              <select
                id="switch-persona-select"
                disabled={busy || switching || personas.length <= 1}
                value={currentPersona?.id ?? ''}
                onchange={handleSelectPersona}
                class="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 focus:border-accent focus:outline-none disabled:opacity-50"
              >
                {#each personas as p (p.id)}
                  <option value={p.id}>
                    {p.name} {p.id === currentPersona?.id ? '(Current)' : ''}
                  </option>
                {/each}
              </select>

              <p class="mt-2 text-[11px] text-neutral-500 leading-relaxed">
                Switching personas updates your future prompt identity. Previous turns in the story remain intact.
              </p>
            </div>
          </div>

        <!-- STATE TAB -->
        {:else if activeTab === 'state'}
          <div class="space-y-4 text-xs">
            <div class="flex items-center justify-between">
              <span class="font-semibold uppercase tracking-wider text-accent text-[11px]">
                Current Narrative State
              </span>

              {#if onOpenStateOverride}
                <button
                  type="button"
                  onclick={() => {
                    onClose();
                    onOpenStateOverride();
                  }}
                  class="text-[11px] text-accent underline hover:text-accent/80 font-mono"
                >
                  Manual Override…
                </button>
              {/if}
            </div>

            {#if !character.stateSchema || Object.keys(character.stateSchema).length === 0}
              <p class="text-neutral-500 italic">This companion has no state schema variables configured.</p>
            {:else}
              <div class="overflow-hidden rounded-xl border border-neutral-800">
                <table class="w-full text-left text-xs font-mono">
                  <thead class="border-b border-neutral-800 bg-neutral-950/80 text-neutral-400 text-[11px]">
                    <tr>
                      <th class="p-2.5">Key</th>
                      <th class="p-2.5">Type</th>
                      <th class="p-2.5">Value</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-neutral-800/60 bg-neutral-900/40">
                    {#each Object.entries(character.stateSchema) as [key, schema] (key)}
                      <tr>
                        <td class="p-2.5 font-semibold text-neutral-200">{key}</td>
                        <td class="p-2.5 text-neutral-400">{schema.type}</td>
                        <td class="p-2.5 text-accent">{String(currentState[key] ?? schema.default ?? '—')}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>

        <!-- PROMPT TAB -->
        {:else if activeTab === 'prompt'}
          {#if chat}
            <PromptTab
              chatId={chat.id}
              draft={promptDraft}
              onEditSettings={() => onEditSettings?.()}
              onEditVoice={() => (activeTab = 'voice')}
            />
          {:else}
            <p class="text-xs text-neutral-500 italic">Open a chat to preview its prompt.</p>
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}

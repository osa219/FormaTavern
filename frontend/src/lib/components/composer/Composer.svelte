<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import Spinner from '../ui/Spinner.svelte';
  import VoiceSelect from './VoiceSelect.svelte';
  import DirectorDrawer from './DirectorDrawer.svelte';
  import { autosize } from '$lib/actions/autosize';
  import { prefs } from '$lib/state/prefs.svelte';
  import type { NarrativeRole } from '@formatavern/shared';
  import { HOOKS } from '@formatavern/shared';

  let {
    busy = false,
    personaName = 'Traveler',
    primaryCharName = 'Character',
    npcs = {},
    standingDirection = '',
    directorOpen = $bindable(false),
    onSend,
    onStop,
    onStandingChange,
    onPreview
  }: {
    busy?: boolean;
    personaName?: string;
    primaryCharName?: string;
    npcs?: Record<string, unknown>;
    standingDirection?: string;
    directorOpen?: boolean;
    onSend: (payload: {
      message?: string;
      directorNote?: string;
      narrativeRole?: NarrativeRole;
      senderName?: string;
    }) => void;
    onStop: () => void;
    onStandingChange: (dir: string) => void;
    onPreview?: (draft: {
      message?: string;
      directorNote?: string;
      narrativeRole?: NarrativeRole;
      senderName?: string;
    }) => void;
  } = $props();

  let messageText = $state<string>('');
  let directorNote = $state<string>('');
  let narrativeRole = $state<NarrativeRole>('persona');
  let npcName = $state<string>('');
  let shakeInput = $state<boolean>(false);

  const placeholder = $derived(
    narrativeRole === 'narrator'
      ? 'Narrate the scene…'
      : narrativeRole === 'npc'
        ? `Speak as ${npcName || 'NPC'}…`
        : narrativeRole === 'character'
          ? `Speak as ${primaryCharName}…`
          : `Speak as ${personaName}…`
  );

  const canSend = $derived(messageText.trim().length > 0 || directorNote.trim().length > 0);

  function submit() {
    if (busy) return;
    if (!canSend) return;

    const payload = {
      message: messageText || undefined,
      directorNote: directorNote || undefined,
      narrativeRole,
      senderName: narrativeRole === 'npc' ? npcName : undefined
    };

    messageText = '';
    directorNote = '';
    onSend(payload);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.metaKey || (prefs.enterToSend && !e.shiftKey)) {
        e.preventDefault();
        if (busy) {
          shakeInput = true;
          setTimeout(() => (shakeInput = false), 350);
          return;
        }
        submit();
      }
    }
  }
</script>

<div class="relative w-full border-t border-neutral-800/40 bg-neutral-950/30 p-3 md:px-6 backdrop-blur-sm {HOOKS.chat.composer}">
  <DirectorDrawer
    open={directorOpen}
    {directorNote}
    {standingDirection}
    onNoteChange={(note) => (directorNote = note)}
    {onStandingChange}
    onClose={() => (directorOpen = false)}
  />

  <div class="mx-auto flex max-w-4xl flex-col gap-2">
    <!-- Top toolbar: Voice select + Director toggle -->
    <div class="flex items-center justify-between">
      <VoiceSelect
        role={narrativeRole}
        {npcName}
        {personaName}
        {primaryCharName}
        {npcs}
        onRoleChange={(r) => (narrativeRole = r)}
        onNpcNameChange={(n) => (npcName = n)}
      />

      <div class="flex items-center gap-1.5">
        {#if directorNote.trim()}
          <span class="rounded bg-amber-950/60 border border-amber-800/80 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
            Note attached
          </span>
        {/if}
        <button
          type="button"
          onclick={() =>
            onPreview?.({
              message: messageText || undefined,
              directorNote: directorNote || undefined,
              narrativeRole,
              senderName: narrativeRole === 'npc' ? npcName || undefined : undefined
            })}
          disabled={!canSend}
          class="flex items-center gap-1 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200 transition-colors disabled:opacity-40"
          title="Preview prompt with this draft"
          aria-label="Preview prompt with this draft"
        >
          <Icon name="sparkles" size={13} />
          <span>Preview</span>
        </button>
        <button
          type="button"
          onclick={() => (directorOpen = !directorOpen)}
          class="flex items-center gap-1 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
          title="Toggle Director drawer (Alt+D)"
          aria-label="Toggle Director drawer"
        >
          <Icon name="director" size={13} />
          <span>Director</span>
        </button>
      </div>
    </div>

    <!-- Input row -->
    <div
      class="relative flex items-end gap-2 rounded-xl border border-neutral-800 bg-neutral-900/90 p-1.5 shadow-inner transition-colors focus-within:border-neutral-700 {shakeInput ? 'animate-pulse' : ''}"
    >
      <textarea
        use:autosize
        bind:value={messageText}
        onkeydown={handleKeydown}
        {placeholder}
        rows="1"
        data-composer-input="true"
        class="max-h-48 min-h-[2.5rem] w-full resize-none bg-transparent px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
        aria-label="Message prompt"
      ></textarea>

      <!-- Send / Stop Button Morph (Invariant U6: identical footprint) -->
      <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center">
        {#if busy}
          <button
            type="button"
            onclick={onStop}
            class="flex h-9 w-9 items-center justify-center rounded-lg bg-red-600 text-white shadow hover:bg-red-700 active:scale-95 transition-colors"
            title="Stop generation (Esc)"
            aria-label="Stop generation"
          >
            <Icon name="stop" size={16} />
          </button>
        {:else}
          <button
            type="button"
            onclick={submit}
            disabled={!canSend}
            class="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-contrast shadow hover:opacity-90 disabled:opacity-30 disabled:hover:opacity-30 active:scale-95 transition-colors"
            title="Send turn (Enter)"
            aria-label="Send turn"
          >
            <Icon name="send" size={16} />
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>

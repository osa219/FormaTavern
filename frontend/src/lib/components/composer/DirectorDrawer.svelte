<script lang="ts">
  import Icon from '../ui/Icon.svelte';

  let {
    open = false,
    directorNote = '',
    standingDirection = '',
    onNoteChange,
    onStandingChange,
    onClose
  }: {
    open: boolean;
    directorNote: string;
    standingDirection: string;
    onNoteChange: (note: string) => void;
    onStandingChange: (dir: string) => void;
    onClose: () => void;
  } = $props();

  let saveState = $state<'idle' | 'saving' | 'saved'>('idle');
  let debounceTimer: any = null;

  function handleStandingInput(val: string) {
    onStandingChange(val);
    saveState = 'saving';
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      saveState = 'saved';
      setTimeout(() => {
        saveState = 'idle';
      }, 1500);
    }, 600);
  }
</script>

{#if open}
  <div
    class="mb-2 w-full rounded-lg border border-neutral-800 bg-neutral-950/95 p-3 text-xs text-neutral-300 shadow-xl backdrop-blur-md transition-opacity"
    role="region"
    aria-label="Director controls"
  >
    <div class="mb-2 flex items-center justify-between">
      <div class="flex items-center gap-1.5 font-medium text-amber-500">
        <Icon name="director" size={14} />
        <span>Director Guidance</span>
      </div>
      <button
        type="button"
        onclick={onClose}
        class="rounded p-1 text-neutral-400 hover:text-neutral-200"
        aria-label="Close director drawer"
      >
        <Icon name="close" size={14} />
      </button>
    </div>

    <!-- One-shot note -->
    <div class="mb-2.5">
      <label for="director-note-input" class="mb-1 block text-[11px] text-neutral-400">
        Next Turn Note (single-use guidance for the upcoming reply)
      </label>
      <input
        id="director-note-input"
        type="text"
        value={directorNote}
        oninput={(e) => onNoteChange((e.target as HTMLInputElement).value)}
        placeholder="e.g. Focus on Eldrin's reaction to the artifact…"
        class="w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-500 focus:border-amber-600 focus:outline-none"
      />
    </div>

    <!-- Standing direction -->
    <div>
      <div class="mb-1 flex items-center justify-between text-[11px] text-neutral-400">
        <label for="standing-direction-input">
          Standing Direction (persistent across all turns in this chat)
        </label>
        {#if saveState === 'saving'}
          <span class="text-neutral-500">Saving…</span>
        {:else if saveState === 'saved'}
          <span class="text-emerald-500">Saved</span>
        {/if}
      </div>
      <input
        id="standing-direction-input"
        type="text"
        value={standingDirection}
        oninput={(e) => handleStandingInput((e.target as HTMLInputElement).value)}
        placeholder="e.g. Keep prose atmospheric, slow-paced and mysterious…"
        class="w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-500 focus:border-amber-600 focus:outline-none"
      />
    </div>
  </div>
{/if}

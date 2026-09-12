<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import type { CharacterDraft } from '$lib/studio/draft.svelte';
  import { HOOKS } from '@formatavern/shared';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';

  import IdentityPanel from './IdentityPanel.svelte';
  import VoicePanel from './VoicePanel.svelte';
  import ShowcaseEditor from './ShowcaseEditor.svelte';
  import AestheticPanel from './AestheticPanel.svelte';
  import StatePanel from './StatePanel.svelte';
  import BindingsPanel from './BindingsPanel.svelte';
  import GalleryManager from './GalleryManager.svelte';
  import CustomCssPanel from './CustomCssPanel.svelte';
  import LivePreview from './LivePreview.svelte';
  import ConfirmDialog from '$lib/components/dialogs/ConfirmDialog.svelte';
  import ShellSurface from '$lib/components/custom/ShellSurface.svelte';

  let { draft }: { draft: CharacterDraft } = $props();

  type StudioTab = 'identity' | 'voice' | 'showcase' | 'aesthetic' | 'css' | 'state' | 'bindings' | 'gallery';
  let activeTab = $state<StudioTab>('identity');
  let saving = $state(false);
  let discardConfirmOpen = $state(false);
  let mobilePreviewOpen = $state(false);

  onMount(() => {
    draft.startAutosave();
  });

  onDestroy(() => {
    draft.stopAutosave();
  });

  function beforeUnload(e: BeforeUnloadEvent) {
    if (draft.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  }

  async function handleSave(openShowcase = false) {
    saving = true;
    try {
      const result = await draft.save();
      if (result === 'saved') {
        if (openShowcase) {
          goto(`/character/${draft.characterId || draft.card.name}`);
        }
      }
    } finally {
      saving = false;
    }
  }
</script>

<svelte:window onbeforeunload={beforeUnload} />

<ShellSurface class="h-[100dvh] overflow-hidden {HOOKS.shell.studio}">
  <!-- Publish Bar / Header -->
  <header class="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-(--chrome-line) chrome-bar px-6 shrink-0">
    <div class="flex items-center gap-4 min-w-0">
      <a
        href="/"
        class="flex items-center gap-1.5 text-xs text-(--chrome-text)/60 hover:text-(--chrome-text) shrink-0"
      >
        <Icon name="arrow-left" size={14} />
        <span>Foyer</span>
      </a>
      <span class="text-(--chrome-text)/40">/</span>
      <div class="truncate text-xs font-semibold text-(--chrome-text)">
        {draft.card.name || 'Untitled Companion'}
      </div>
      {#if draft.dirty}
        <span class="inline-flex items-center rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-mono text-amber-300 border border-amber-500/30">
          Unsaved Changes
        </span>
      {:else}
        <span class="inline-flex items-center rounded border border-(--chrome-line) bg-(--chrome-surface) px-2 py-0.5 text-[10px] font-mono text-(--chrome-text)/60">
          Saved
        </span>
      {/if}
    </div>

    <!-- Right Controls: Issues Counter + Actions -->
    <div class="flex items-center gap-3 shrink-0">
      {#if draft.issues.length > 0}
        <div class="flex items-center gap-1.5 rounded-lg bg-red-500/15 px-2.5 py-1 text-xs font-mono text-red-300 border border-red-500/30">
          <span>⚠</span>
          <span>{draft.issues.length} issue(s)</span>
        </div>
      {/if}

      <button
        type="button"
        onclick={() => (mobilePreviewOpen = !mobilePreviewOpen)}
        class="lg:hidden rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-1.5 text-xs font-semibold text-(--chrome-text)"
      >
        {mobilePreviewOpen ? 'Editor' : 'Preview'}
      </button>

      {#if draft.dirty}
        <button
          type="button"
          onclick={() => (discardConfirmOpen = true)}
          class="rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-3 py-1.5 text-xs font-semibold text-(--chrome-text) hover:bg-(--chrome-line)/40"
        >
          Discard
        </button>
      {/if}

      <button
        type="button"
        disabled={saving || draft.issues.length > 0}
        onclick={() => handleSave(false)}
        class="inline-flex items-center gap-1.5 rounded-xl border border-(--chrome-line) bg-(--chrome-surface) px-4 py-1.5 text-xs font-semibold text-(--chrome-text) hover:bg-(--chrome-line)/40 disabled:opacity-50"
      >
        {#if saving}
          <Spinner size={12} />
        {/if}
        <span>Save</span>
      </button>

      <button
        type="button"
        disabled={saving || draft.issues.length > 0}
        onclick={() => handleSave(true)}
        class="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-1.5 text-xs font-semibold text-accent-contrast hover:bg-accent/90 disabled:opacity-50 shadow-md"
      >
        <span>Save & Open</span>
      </button>
    </div>
  </header>

  <!-- Studio Workspace -->
  <div class="grid flex-1 grid-cols-1 lg:grid-cols-12 overflow-hidden">
    <!-- Left Rail: Tabs & Content (7 Cols) -->
    <div class="{mobilePreviewOpen ? 'hidden lg:flex' : 'flex'} lg:col-span-7 flex-col border-r border-(--chrome-line) overflow-hidden">
      <!-- Tabs Bar -->
      <nav class="flex h-11 items-center gap-1 border-b border-(--chrome-line) px-4 shrink-0 overflow-x-auto" aria-label="Studio sections">
        {#each [
          { id: 'identity', label: 'Identity' },
          { id: 'voice', label: 'Voice' },
          { id: 'showcase', label: 'Showcase' },
          { id: 'aesthetic', label: 'Aesthetic' },
          { id: 'css', label: 'Custom CSS' },
          { id: 'state', label: 'State' },
          { id: 'bindings', label: 'Bindings' },
          { id: 'gallery', label: 'Gallery' }
        ] as tab}
          <button
            type="button"
            onclick={() => (activeTab = tab.id as StudioTab)}
            class="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors {activeTab === tab.id
              ? 'bg-(--chrome-surface) text-(--chrome-text) font-semibold shadow-xs border border-(--chrome-line)'
              : 'text-(--chrome-text)/60 hover:text-(--chrome-text) hover:bg-(--chrome-surface)/50'}"
          >
            {tab.label}
          </button>
        {/each}
      </nav>

      <!-- Active Tab Panel -->
      <div class="flex-1 overflow-y-auto p-6">
        {#if activeTab === 'identity'}
          <IdentityPanel {draft} />
        {:else if activeTab === 'voice'}
          <VoicePanel {draft} />
        {:else if activeTab === 'showcase'}
          <ShowcaseEditor {draft} />
        {:else if activeTab === 'aesthetic'}
          <AestheticPanel {draft} />
        {:else if activeTab === 'css'}
          <CustomCssPanel {draft} />
        {:else if activeTab === 'state'}
          <StatePanel {draft} />
        {:else if activeTab === 'bindings'}
          <BindingsPanel {draft} />
        {:else if activeTab === 'gallery'}
          <GalleryManager {draft} />
        {/if}
      </div>
    </div>

    <!-- Right Rail: Live Preview (5 Cols) -->
    <div class="{mobilePreviewOpen ? 'flex' : 'hidden lg:flex'} lg:col-span-5 flex-col p-4 bg-(--chrome-bg) border-l border-(--chrome-line) overflow-hidden">
      <LivePreview {draft} activeStudioTab={activeTab} />
    </div>
  </div>

  <!-- Discard Confirm Dialog -->
  <ConfirmDialog
    open={discardConfirmOpen}
    title="Discard Unsaved Changes"
    message="Are you sure you want to discard all changes since the last save? This cannot be undone."
    confirmLabel="Discard"
    danger={true}
    onConfirm={() => {
      draft.discard();
      discardConfirmOpen = false;
    }}
    onCancel={() => {
      discardConfirmOpen = false;
    }}
  />
</ShellSurface>

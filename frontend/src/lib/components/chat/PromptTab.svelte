<script lang="ts">
  import { api, toUiError } from '$lib/api';
  import { HOOKS } from '@formatavern/shared';
  import Icon from '../ui/Icon.svelte';
  import PromptBlocks from './PromptBlocks.svelte';
  import { isPreviewData, type PreviewData, type PromptDraft } from '$lib/prompt/preview';

  let {
    chatId,
    draft = null,
    onEditSettings,
    onEditVoice
  }: {
    chatId: string;
    draft?: PromptDraft | null;
    onEditSettings?: () => void;
    onEditVoice?: () => void;
  } = $props();

  type Status = 'loading' | 'ready' | 'error' | 'budget';
  let status = $state<Status>('loading');
  let data = $state<PreviewData | null>(null);
  let errorMsg = $state('');

  const hasDraft = $derived(
    draft !== null && ((draft.message?.trim() ?? '') !== '' || (draft.directorNote?.trim() ?? '') !== '')
  );

  async function load() {
    status = 'loading';
    data = null;
    errorMsg = '';
    try {
      const payload = hasDraft
        ? {
            draft: {
              message: draft!.message || undefined,
              directorNote: draft!.directorNote || undefined,
              narrativeRole: draft!.narrativeRole,
              senderName: draft!.senderName || undefined
            }
          }
        : {};
      const { data: res, error } = await (api.api.chats({ id: chatId }) as any)['prompt-preview'].post(payload);
      if (error) {
        const ui = toUiError(error);
        if ((error as any)?.status === 413) {
          status = 'budget';
        } else {
          status = 'error';
        }
        errorMsg = ui.message;
        return;
      }
      if (!isPreviewData(res)) {
        status = 'error';
        errorMsg = 'Unexpected preview response from server.';
        return;
      }
      data = res;
      status = 'ready';
    } catch (err: any) {
      status = 'error';
      errorMsg = toUiError(err).message;
    }
  }

  // Refetch when the tab opens on a new chat or a new explicit draft arrives.
  $effect(() => {
    void chatId;
    void JSON.stringify(draft ?? null);
    void load();
  });
</script>

<div class="space-y-4 text-xs leading-relaxed text-neutral-300 {HOOKS.chat.promptPreview}">
  <div class="flex items-center justify-between gap-2">
    <div class="flex items-center gap-2">
      <h3 class="font-semibold uppercase tracking-wider text-accent">Prompt preview</h3>
      {#if data}
        <span class="rounded border border-neutral-800 bg-neutral-950 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
          {data.dialect}
        </span>
      {/if}
    </div>
    <button
      type="button"
      onclick={load}
      disabled={status === 'loading'}
      class="flex items-center gap-1 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-[11px] text-neutral-400 hover:text-neutral-200 disabled:opacity-40"
      title="Refresh preview"
      aria-label="Refresh preview"
    >
      <Icon name="regenerate" size={12} />
      <span>Refresh</span>
    </button>
  </div>

  <p class="text-[11px] text-neutral-500">
    {#if hasDraft}
      What would be sent on the next turn, <span class="text-amber-300">including your unsent draft</span>.
    {:else}
      What would be sent on the next turn from the current leaf. Read-only — nothing is written.
    {/if}
  </p>

  {#if status === 'loading'}
    <p class="text-neutral-500" aria-live="polite">Assembling prompt…</p>
  {:else if status === 'error'}
    <div class="rounded-xl border border-red-900/60 bg-red-950/20 p-3 text-red-200" role="alert">
      <p class="font-semibold">Preview failed</p>
      <p class="mt-1">{errorMsg}</p>
    </div>
  {:else if status === 'budget'}
    <div class="rounded-xl border border-amber-900/60 bg-amber-950/20 p-3 text-amber-200" role="alert">
      <p class="font-semibold">Over budget — sending would fail the same way</p>
      <p class="mt-1">{errorMsg}</p>
    </div>
  {:else if data}
    <PromptBlocks {data} />

    <div class="flex items-center gap-2 border-t border-neutral-800 pt-3">
      <button
        type="button"
        onclick={() => onEditSettings?.()}
        class="rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-[11px] text-neutral-300 hover:text-neutral-100"
      >
        Edit in Settings
      </button>
      <button
        type="button"
        onclick={() => onEditVoice?.()}
        class="rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-[11px] text-neutral-300 hover:text-neutral-100"
      >
        Edit in Voice
      </button>
    </div>
  {/if}
</div>

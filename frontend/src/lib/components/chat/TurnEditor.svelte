<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../ui/Icon.svelte';
  import { HOOKS } from '@formatavern/shared';
  import type { MessageWithTree } from '@formatavern/shared';
  import { autosize } from '$lib/actions/autosize';
  import { formatReasoningDuration } from '$lib/settings/generation';
  import { media } from '$lib/state/media.svelte';

  let {
    message,
    saving = false,
    onSave,
    onCancel
  }: {
    message: MessageWithTree;
    saving?: boolean;
    onSave?: (newContent: string) => void;
    onCancel?: () => void;
  } = $props();

  const REASONING_TAG_RE = /<(think|thinking|reasoning)\b[^>]*>([\s\S]*?)<\/\1>/i;

  function parseInitial() {
    const raw = message.content ?? '';
    const match = raw.match(REASONING_TAG_RE);
    if (match) {
      const reasoning = match[2].trim();
      const content = raw.replace(REASONING_TAG_RE, '').trim();
      return { reasoning, content };
    }
    const metaReasoning = message.metadata?.reasoning?.trim() ?? '';
    return {
      reasoning: metaReasoning,
      content: raw.trim()
    };
  }

  const initial = parseInitial();
  let reasoningDraft = $state(initial.reasoning);
  let contentDraft = $state(initial.content);
  let reasoningOpen = $state(false);
  let rootEl = $state<HTMLElement | null>(null);
  let contentAreaEl = $state<HTMLTextAreaElement | null>(null);

  onMount(() => {
    // Prevent abrupt default focus scrolling from browser
    contentAreaEl?.focus({ preventScroll: true });

    let r2: number | null = null;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => {
        if (!rootEl) return;
        rootEl.scrollIntoView({
          behavior: media.reducedMotion ? 'instant' : 'smooth',
          block: 'start'
        });
      });
    });

    return () => {
      cancelAnimationFrame(r1);
      if (r2 !== null) cancelAnimationFrame(r2);
    };
  });

  const hasReasoning = $derived(reasoningDraft.length > 0 || Boolean(initial.reasoning));
  const dirty = $derived(
    contentDraft !== initial.content || reasoningDraft !== initial.reasoning
  );

  const durationLabel = $derived.by(() => {
    const ms = message.metadata?.reasoningDurationMs;
    return ms ? `Thought for ${formatReasoningDuration(ms)}` : 'Thought';
  });

  function commit() {
    if (saving || !dirty) return;
    let finalContent = contentDraft.trim();
    if (reasoningDraft.trim().length > 0) {
      finalContent = `<think>\n${reasoningDraft.trim()}\n</think>\n\n${finalContent}`;
    }
    onSave?.(finalContent);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (!saving) onCancel?.();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
  }
</script>

<div
  bind:this={rootEl}
  class="relative my-2 w-full rounded-2xl border border-accent/40 bg-(--chrome-surface)/95 p-3.5 shadow-xl backdrop-blur-md transition-colors focus-within:border-accent/80 focus-within:ring-1 focus-within:ring-accent/30 {HOOKS.chat.turnEditor}"
>
  <!-- Header with title and floating actions -->
  <div class="mb-2 flex items-center justify-between gap-2 select-none">
    <div class="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-accent">
      <Icon name="edit" size={13} />
      <span>Edit Turn</span>
    </div>

    <div class="flex items-center gap-1">
      <button
        type="button"
        onclick={() => onCancel?.()}
        disabled={saving}
        class="flex h-6 w-6 items-center justify-center rounded text-(--chrome-text)/60 hover:bg-(--chrome-line)/40 hover:text-(--chrome-text) transition-colors disabled:opacity-40"
        title="Cancel edit (Esc)"
        aria-label="Cancel edit"
      >
        <Icon name="close" size={13} />
      </button>
      <button
        type="button"
        onclick={commit}
        disabled={saving || !dirty}
        class="flex h-6 w-6 items-center justify-center rounded text-accent hover:bg-accent/20 transition-colors disabled:opacity-40"
        title="Save edit (Ctrl+Enter)"
        aria-label="Save edit"
      >
        <Icon name="check" size={13} />
      </button>
    </div>
  </div>

  <!-- Collapsible Thinking / Reasoning Section -->
  {#if hasReasoning}
    <details
      bind:open={reasoningOpen}
      class="group mb-2.5 rounded-lg border border-(--chrome-line)/40 bg-(--chrome-bg)/50 text-xs transition-colors"
    >
      <summary
        class="flex cursor-pointer select-none items-center justify-between px-2.5 py-1.5 font-mono text-[11px] text-(--chrome-text)/70 hover:text-(--chrome-text) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
      >
        <div class="flex items-center gap-1.5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="h-3 w-3 shrink-0 transition-transform duration-150 group-open:rotate-90 text-(--chrome-text)/50 group-hover:text-(--chrome-text)"
            aria-hidden="true"
          >
            <path
              fill-rule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clip-rule="evenodd"
            />
          </svg>
          <span class="font-medium">{durationLabel}</span>
        </div>
        <span class="text-[10px] opacity-60">
          {reasoningOpen ? 'Click to collapse' : 'Click to expand / edit thinking'}
        </span>
      </summary>

      <div class="border-t border-(--chrome-line)/30 p-2">
        <textarea
          use:autosize={{ minRows: 2, maxRows: 15 }}
          bind:value={reasoningDraft}
          onkeydown={handleKeydown}
          disabled={saving}
          placeholder="Thinking process / scratchpad..."
          aria-label="Edit thinking scratchpad"
          class="w-full resize-y border-0 bg-transparent font-mono text-[11px] leading-relaxed text-(--chrome-text)/80 placeholder:text-(--chrome-text)/30 focus:outline-none focus:ring-0 block"
        ></textarea>
      </div>
    </details>
  {/if}

  <!-- Main Narrative Content Editor -->
  <textarea
    use:autosize={{ minRows: 3, maxRows: 35 }}
    bind:this={contentAreaEl}
    bind:value={contentDraft}
    onkeydown={handleKeydown}
    disabled={saving}
    rows={3}
    title="Plain prose — Ctrl+Enter saves, Esc cancels"
    aria-label="Edit turn content"
    placeholder="Message content..."
    class="w-full resize-y border-0 bg-transparent px-1 py-0.5 text-sm leading-relaxed text-(--chrome-text) placeholder:text-(--chrome-text)/40 focus:outline-none focus:ring-0 disabled:opacity-60 max-h-[70vh] overflow-y-auto block font-sans"
  ></textarea>
</div>

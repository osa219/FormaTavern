<script lang="ts">
  import { formatReasoningDuration } from '$lib/settings/generation';

  let {
    reasoning = null,
    durationMs = null,
    isThinking = false,
    streaming = false
  }: {
    reasoning?: string | null;
    durationMs?: number | null;
    isThinking?: boolean;
    streaming?: boolean;
  } = $props();

  const hasReasoning = $derived(Boolean(reasoning && reasoning.trim().length > 0));
  const activeThinking = $derived(Boolean(streaming && isThinking));
  const durationLabel = $derived(
    durationMs ? `Thought for ${formatReasoningDuration(durationMs)}` : 'Thought for a moment'
  );
</script>

{#if hasReasoning || activeThinking}
  <details
    class="reasoning-block group my-1.5 rounded-lg border border-(--chrome-line)/40 bg-(--chrome-surface)/25 px-3 py-2 text-xs transition-colors"
    open={activeThinking ? true : undefined}
  >
    <summary
      class="flex cursor-pointer select-none items-center gap-2 font-mono text-(--chrome-text)/70 hover:text-(--chrome-text) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        class="h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-open:rotate-90 text-(--chrome-text)/50 group-hover:text-(--chrome-text)"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
          clip-rule="evenodd"
        />
      </svg>

      <span class="flex items-center gap-1.5 font-medium">
        {#if activeThinking}
          <span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent"></span>
          <span>Thinking…</span>
        {:else}
          <span>{durationLabel}</span>
        {/if}
      </span>
    </summary>

    {#if hasReasoning}
      <div
        class="mt-2.5 max-h-80 overflow-y-auto border-l-2 border-accent pl-3 py-1 font-mono text-[11px] leading-relaxed text-(--chrome-text)/70 whitespace-pre-wrap selection:bg-accent/20"
      >
        {reasoning}
      </div>
    {/if}
  </details>
{/if}

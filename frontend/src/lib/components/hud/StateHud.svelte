<script lang="ts">
  import type { StateField, StateVector } from '@formatavern/shared';
  import StateOverridePopover from './StateOverridePopover.svelte';

  let {
    currentState = {},
    stateSource = 'initial',
    stateWarnings = [],
    schema = {},
    onOverride,
    onOpenState
  }: {
    currentState?: StateVector;
    stateSource?: 'initial' | 'patch' | 'inherited' | 'override';
    stateWarnings?: string[];
    schema?: Record<string, StateField>;
    onOverride?: (patch: StateVector) => void;
    onOpenState?: () => void;
  } = $props();

  let popoverOpen = $state(false);
  let changedKeys = $state<Set<string>>(new Set());
  let prevState: StateVector = {};

  // Detect changed state keys to flash the status dot briefly.
  $effect(() => {
    const next = currentState ?? {};
    const newlyChanged = new Set<string>();
    for (const [k, v] of Object.entries(next)) {
      if (prevState[k] !== undefined && prevState[k] !== v) {
        newlyChanged.add(k);
      }
    }
    prevState = { ...next };

    if (newlyChanged.size > 0) {
      changedKeys = newlyChanged;
      const t = setTimeout(() => {
        changedKeys = new Set();
      }, 1200);
      return () => clearTimeout(t);
    }
  });

  const sourceMeta: Record<string, { glyph: string; label: string }> = {
    patch: { glyph: '◆', label: 'patch' },
    inherited: { glyph: '◇', label: 'inherited' },
    override: { glyph: '✎', label: 'override' },
    initial: { glyph: '○', label: 'initial' }
  };

  const currentSource = $derived(sourceMeta[stateSource] ?? sourceMeta.initial);
  const hasUpdate = $derived(changedKeys.size > 0);

  // Full values for the tooltip; the pill itself stays a tiny dot.
  const stateSummary = $derived.by(() => {
    const entries = Object.entries(currentState ?? {});
    if (entries.length === 0) return 'no values yet';
    return entries.map(([k, v]) => `${k}: ${String(v)}`).join(' · ');
  });

  function activate() {
    // Prefer the full State tab when the host offers it; otherwise fall
    // back to the inline override popover (studio previews).
    if (onOpenState) {
      onOpenState();
    } else {
      popoverOpen = !popoverOpen;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      activate();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="relative flex items-center gap-2 text-xs">
  <button
    type="button"
    onclick={activate}
    class="flex items-center gap-1.5 rounded-lg border border-neutral-800/80 bg-neutral-900/60 px-2.5 py-1.5 text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-850 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    aria-label="Open state details (Alt+S)"
    aria-expanded={popoverOpen}
    aria-haspopup="dialog"
    title={`State (${currentSource.label}): ${stateSummary}`}
  >
    <span class="font-mono text-xs {hasUpdate ? 'text-accent font-bold' : 'opacity-75'}">
      <span class={hasUpdate ? '' : 'text-accent'}>{currentSource.glyph}</span>
    </span>

    {#if stateWarnings.length > 0}
      <span class="rounded bg-amber-950/80 px-1 py-0.2 text-[10px] text-amber-300" title={stateWarnings.join('; ')}>
        ⚠
      </span>
    {/if}
  </button>

  <StateOverridePopover
    open={popoverOpen}
    {schema}
    {currentState}
    onSubmit={(patch) => {
      onOverride?.(patch);
      popoverOpen = false;
    }}
    onClose={() => {
      popoverOpen = false;
    }}
  />
</div>

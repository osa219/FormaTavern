<script lang="ts">
  import type { StateField, StateVector } from '@formatavern/shared';
  import Icon from '../ui/Icon.svelte';
  import StateOverridePopover from './StateOverridePopover.svelte';

  let {
    currentState = {},
    stateSource = 'initial',
    stateWarnings = [],
    schema = {},
    onOverride
  }: {
    currentState?: StateVector;
    stateSource?: 'initial' | 'patch' | 'inherited' | 'override';
    stateWarnings?: string[];
    schema?: Record<string, StateField>;
    onOverride?: (patch: StateVector) => void;
  } = $props();

  let popoverOpen = $state(false);
  let changedKeys = $state<Set<string>>(new Set());
  let prevState: StateVector = {};

  // Detect changed state keys to apply a subtle pulse effect
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
      }, 700);
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

  // Format ambient state chips
  const chips = $derived.by(() => {
    if (!currentState) return [];
    const entries = Object.entries(currentState);
    return entries.map(([k, v]) => {
      let display = '';
      if (k.toLowerCase() === 'affinity') {
        display = `♥ ${v}`;
      } else if (typeof v === 'boolean') {
        display = v ? k : `no ${k}`;
      } else if (typeof v === 'string' || typeof v === 'number') {
        display = `${v}`;
      } else {
        display = `${k}: ${v}`;
      }
      return { key: k, display, changed: changedKeys.has(k) };
    });
  });

  function togglePopover() {
    popoverOpen = !popoverOpen;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      popoverOpen = !popoverOpen;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="relative flex items-center gap-2 text-xs">
  <button
    type="button"
    onclick={togglePopover}
    class="flex items-center gap-2 rounded-lg border border-neutral-800/80 bg-neutral-900/60 px-2.5 py-1.5 text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-850 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    aria-label="Toggle state override popover (Alt+S)"
    aria-expanded={popoverOpen}
    aria-haspopup="dialog"
  >
    <!-- Source Glyph -->
    <span
      class="font-mono text-xs opacity-75"
      title={stateWarnings.length > 0 ? `Warnings: ${stateWarnings.join(', ')}` : `Source: ${currentSource.label}`}
    >
      <span class="text-accent">{currentSource.glyph}</span> {currentSource.label}
    </span>

    {#if stateWarnings.length > 0}
      <span class="rounded bg-amber-950/80 px-1 py-0.2 text-[10px] text-amber-300" title={stateWarnings.join('; ')}>
        ⚠
      </span>
    {/if}

    <!-- Separator -->
    {#if chips.length > 0}
      <span class="text-neutral-600">·</span>
    {/if}

    <!-- Ambient Chips -->
    <div class="flex items-center gap-1.5 opacity-80">
      {#each chips as chip, i (chip.key)}
        {#if i > 0}
          <span class="text-neutral-600">·</span>
        {/if}
        <span
          class="transition-opacity duration-300"
          class:text-accent={chip.changed}
          class:font-semibold={chip.changed}
        >
          {chip.display}
        </span>
      {/each}
    </div>

    <Icon name="sparkles" size={12} class="text-neutral-500" />
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

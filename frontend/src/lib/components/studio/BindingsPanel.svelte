<script lang="ts">
  import type { CharacterDraft } from '$lib/studio/draft.svelte';
  import { THEME_PATH_CATEGORIES } from '$lib/studio/bindingsModel';
  import type { StateBinding } from '@formatavern/shared';
  import Icon from '$lib/components/ui/Icon.svelte';

  let { draft }: { draft: CharacterDraft } = $props();

  function addBinding() {
    if (!draft.card.stateBindings) draft.card.stateBindings = [];

    const firstKey = Object.keys(draft.card.stateSchema ?? {})[0] || 'mood';
    const firstField = draft.card.stateSchema?.[firstKey];
    const firstVal = firstField?.type === 'enum' ? firstField.values?.[0] ?? 'default' : 'active';

    draft.card.stateBindings.push({
      when: { [firstKey]: firstVal },
      set: { 'colors.accent': '#ef4444' }
    });
  }

  function removeBinding(index: number) {
    if (!draft.card.stateBindings) return;
    draft.card.stateBindings = draft.card.stateBindings.filter((_, i) => i !== index);
  }

  function moveBinding(index: number, direction: -1 | 1) {
    if (!draft.card.stateBindings) return;
    const target = index + direction;
    if (target < 0 || target >= draft.card.stateBindings.length) return;
    const copy = [...draft.card.stateBindings];
    const temp = copy[index];
    copy[index] = copy[target];
    copy[target] = temp;
    draft.card.stateBindings = copy;
  }
</script>

<div class="space-y-6 max-w-3xl">
  <div class="flex items-center justify-between border-b border-neutral-800 pb-3">
    <div>
      <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-200">
        Reactive State Bindings (Chameleon Overrides)
      </h3>
      <p class="text-xs text-neutral-400 mt-0.5">
        Automatically override typography, colors, or atmosphere when narrative state conditions are met. (Evaluated top-to-bottom).
      </p>
    </div>

    <button
      type="button"
      onclick={addBinding}
      class="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-accent/90"
    >
      <Icon name="plus" size={13} />
      <span>New Binding</span>
    </button>
  </div>

  {#if !draft.card.stateBindings || draft.card.stateBindings.length === 0}
    <div class="flex h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-800 text-neutral-500 text-xs text-center p-4">
      <p>No reactive theme bindings created yet.</p>
      <p class="text-neutral-600 mt-1">Bind state conditions (like "mood: enraged") to red accent colors or background changes.</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each draft.card.stateBindings as binding, idx (idx)}
        <div class="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-mono font-semibold text-neutral-400">
              Rule #{idx + 1}
            </span>

            <div class="flex items-center gap-1">
              <button
                type="button"
                disabled={idx === 0}
                onclick={() => moveBinding(idx, -1)}
                class="rounded p-1 text-neutral-400 hover:text-white disabled:opacity-30"
                title="Move up"
              >
                ▲
              </button>
              <button
                type="button"
                disabled={idx === draft.card.stateBindings.length - 1}
                onclick={() => moveBinding(idx, 1)}
                class="rounded p-1 text-neutral-400 hover:text-white disabled:opacity-30"
                title="Move down"
              >
                ▼
              </button>
              <button
                type="button"
                onclick={() => removeBinding(idx)}
                class="rounded p-1 text-neutral-500 hover:text-red-400 ml-2"
                title="Remove binding"
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          </div>

          <!-- When / Set Grid -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            <!-- WHEN Condition -->
            <div class="space-y-2 rounded-xl border border-neutral-850 bg-neutral-950/60 p-3">
              <span class="block text-[11px] uppercase tracking-wider text-accent">WHEN</span>
              {#each Object.entries(binding.when) as [stateKey, stateVal] (stateKey)}
                <div class="flex items-center gap-2">
                  <span class="text-neutral-300">{stateKey} ==</span>
                  <input
                    type="text"
                    value={stateVal}
                    oninput={(e) => {
                      binding.when[stateKey] = (e.target as HTMLInputElement).value;
                    }}
                    class="flex-1 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-neutral-100 focus:outline-none"
                  />
                </div>
              {/each}
            </div>

            <!-- SET Style Override -->
            <div class="space-y-2 rounded-xl border border-neutral-850 bg-neutral-950/60 p-3">
              <span class="block text-[11px] uppercase tracking-wider text-accent">SET</span>
              {#each Object.entries(binding.set) as [themePath, tokenVal] (themePath)}
                <div class="space-y-1.5">
                  <select
                    value={themePath}
                    onchange={(e) => {
                      const newPath = (e.target as HTMLSelectElement).value;
                      const val = binding.set[themePath];
                      delete binding.set[themePath];
                      binding.set[newPath] = val;
                    }}
                    class="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
                  >
                    {#each THEME_PATH_CATEGORIES as cat (cat.label)}
                      <optgroup label={cat.label}>
                        {#each cat.paths as p (p.path)}
                          <option value={p.path}>{p.label} ({p.path})</option>
                        {/each}
                      </optgroup>
                    {/each}
                  </select>

                  <input
                    type="text"
                    value={tokenVal}
                    oninput={(e) => {
                      binding.set[themePath] = (e.target as HTMLInputElement).value;
                    }}
                    placeholder="Token value (e.g. #ef4444, 2rem)..."
                    class="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 focus:outline-none"
                  />
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

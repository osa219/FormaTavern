<script lang="ts">
  import type { CharacterDraft } from '$lib/studio/draft.svelte';
  import type { StateField } from '@formatavern/shared';
  import Icon from '$lib/components/ui/Icon.svelte';

  let { draft }: { draft: CharacterDraft } = $props();

  let newKey = $state('');

  function addField() {
    const key = newKey.trim().toLowerCase();
    if (!key) return;
    if (!draft.card.stateSchema) draft.card.stateSchema = {};
    if (draft.card.stateSchema[key]) return;

    draft.card.stateSchema[key] = {
      type: 'enum',
      values: ['default', 'alt'],
      default: 'default'
    };

    if (!draft.card.initialState) draft.card.initialState = {};
    draft.card.initialState[key] = 'default';
    newKey = '';
  }

  function removeField(key: string) {
    if (draft.card.stateSchema) {
      delete draft.card.stateSchema[key];
    }
    if (draft.card.initialState) {
      delete draft.card.initialState[key];
    }
  }

  function updateFieldType(key: string, type: 'enum' | 'int' | 'string') {
    if (!draft.card.stateSchema || !draft.card.stateSchema[key]) return;
    if (type === 'enum') {
      draft.card.stateSchema[key] = { type: 'enum', values: ['default', 'alt'], default: 'default' };
      if (draft.card.initialState) draft.card.initialState[key] = 'default';
    } else if (type === 'int') {
      draft.card.stateSchema[key] = { type: 'int', min: 0, max: 100, default: 0 };
      if (draft.card.initialState) draft.card.initialState[key] = 0;
    } else {
      draft.card.stateSchema[key] = { type: 'string', default: '' };
      if (draft.card.initialState) draft.card.initialState[key] = '';
    }
  }
</script>

<div class="space-y-6 max-w-3xl">
  <div class="flex items-center justify-between border-b border-neutral-800 pb-3">
    <div>
      <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-200">
        Narrative State Schema
      </h3>
      <p class="text-xs text-neutral-400 mt-0.5">
        Define persistent state variables that the companion model can track and mutate in the narrative envelope.
      </p>
    </div>
  </div>

  <!-- Add New State Variable -->
  <div class="flex items-center gap-3">
    <label for="new-state-key" class="sr-only">New State Variable Key</label>
    <input
      id="new-state-key"
      type="text"
      bind:value={newKey}
      placeholder="Variable name (e.g. mood, location, sanity)..."
      onkeydown={(e) => { if (e.key === 'Enter') addField(); }}
      class="flex-1 rounded-xl border border-neutral-800 bg-neutral-900 px-3.5 py-2 text-xs font-mono text-neutral-100 placeholder-neutral-500 focus:border-accent focus:outline-none"
    />
    <button
      type="button"
      onclick={addField}
      disabled={!newKey.trim()}
      class="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-contrast hover:bg-accent/90 disabled:opacity-50"
    >
      <Icon name="plus" size={13} />
      <span>Add Variable</span>
    </button>
  </div>

  <!-- Variable Schema List -->
  {#if !draft.card.stateSchema || Object.keys(draft.card.stateSchema).length === 0}
    <div class="flex h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-800 text-neutral-500 text-xs text-center p-4">
      <p>No state variables defined yet.</p>
      <p class="text-neutral-600 mt-1">Add variables like "mood" or "affiliation" to enable dynamic state bindings.</p>
    </div>
  {:else}
    <div class="space-y-4">
      {#each Object.entries(draft.card.stateSchema) as [key, field] (key)}
        <div class="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="font-mono text-sm font-semibold text-accent">{key}</span>
              <span class="text-neutral-700">|</span>
              <select
                value={field.type}
                onchange={(e) => updateFieldType(key, (e.target as HTMLSelectElement).value as any)}
                class="rounded-lg border border-neutral-800 bg-neutral-850 px-2 py-1 text-xs font-mono text-neutral-200"
              >
                <option value="enum">Enum (discrete choices)</option>
                <option value="int">Integer (number range)</option>
                <option value="string">String (arbitrary text)</option>
              </select>
            </div>

            <button
              type="button"
              onclick={() => removeField(key)}
              class="rounded p-1 text-neutral-500 hover:text-red-400"
              title="Delete variable"
            >
              <Icon name="trash" size={14} />
            </button>
          </div>

          <!-- Type-Specific Controls -->
          {#if field.type === 'enum'}
            <div class="space-y-2 text-xs">
              <label for="enum-values-{key}" class="block text-[11px] font-mono text-neutral-400">
                Allowed Values (comma separated)
              </label>
              <input
                id="enum-values-{key}"
                type="text"
                value={(field.values ?? []).join(', ')}
                oninput={(e) => {
                  const vals = (e.target as HTMLInputElement).value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  (field as any).values = vals;
                }}
                class="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs font-mono text-neutral-100 focus:outline-none"
              />

              <div class="flex items-center gap-2 pt-1">
                <span class="text-[11px] font-mono text-neutral-400">Initial State:</span>
                <select
                  value={draft.card.initialState?.[key] ?? ''}
                  onchange={(e) => {
                    if (!draft.card.initialState) draft.card.initialState = {};
                    draft.card.initialState[key] = (e.target as HTMLSelectElement).value;
                  }}
                  class="rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs font-mono text-neutral-200"
                >
                  {#each field.values ?? [] as opt (opt)}
                    <option value={opt}>{opt}</option>
                  {/each}
                </select>
              </div>
            </div>
          {:else if field.type === 'int'}
            <div class="grid grid-cols-3 gap-3 text-xs">
              <div>
                <label for="int-min-{key}" class="block text-[11px] font-mono text-neutral-400 mb-1">Min</label>
                <input
                  id="int-min-{key}"
                  type="number"
                  bind:value={field.min}
                  class="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs font-mono text-neutral-100"
                />
              </div>
              <div>
                <label for="int-max-{key}" class="block text-[11px] font-mono text-neutral-400 mb-1">Max</label>
                <input
                  id="int-max-{key}"
                  type="number"
                  bind:value={field.max}
                  class="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs font-mono text-neutral-100"
                />
              </div>
              <div>
                <label for="int-init-{key}" class="block text-[11px] font-mono text-neutral-400 mb-1">Initial Value</label>
                <input
                  id="int-init-{key}"
                  type="number"
                  value={draft.card.initialState?.[key] ?? field.default ?? 0}
                  oninput={(e) => {
                    if (!draft.card.initialState) draft.card.initialState = {};
                    draft.card.initialState[key] = Number((e.target as HTMLInputElement).value);
                  }}
                  class="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs font-mono text-neutral-100"
                />
              </div>
            </div>
          {:else}
            <div>
              <label for="str-init-{key}" class="block text-[11px] font-mono text-neutral-400 mb-1">Initial String Value</label>
              <input
                id="str-init-{key}"
                type="text"
                value={draft.card.initialState?.[key] ?? ''}
                oninput={(e) => {
                  if (!draft.card.initialState) draft.card.initialState = {};
                  draft.card.initialState[key] = (e.target as HTMLInputElement).value;
                }}
                class="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs font-mono text-neutral-100"
              />
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

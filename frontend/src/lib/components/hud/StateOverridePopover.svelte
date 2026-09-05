<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import { clickOutside } from '$lib/actions/clickOutside';
  import type { StateField, StateVector } from '@formatavern/shared';

  let {
    open = false,
    schema = {},
    currentState = {},
    onSubmit,
    onClose
  }: {
    open: boolean;
    schema?: Record<string, StateField>;
    currentState?: StateVector;
    onSubmit: (patch: StateVector) => void;
    onClose: () => void;
  } = $props();

  let draft = $state<Record<string, any>>({});

  $effect(() => {
    if (open) {
      draft = { ...currentState };
    }
  });

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    onSubmit(draft);
    onClose();
  }

  const hasSchema = $derived(schema && Object.keys(schema).length > 0);
</script>

{#if open}
  <div
    use:clickOutside={onClose}
    class="absolute right-4 top-14 z-50 w-80 rounded-xl border border-neutral-800 bg-neutral-900/95 p-4 text-xs text-neutral-200 shadow-2xl backdrop-blur-md"
    role="dialog"
    aria-label="Scene state override"
  >
    <div class="mb-3 flex items-center justify-between border-b border-neutral-800 pb-2">
      <div class="flex items-center gap-1.5 font-semibold text-neutral-100">
        <Icon name="sparkles" size={14} class="text-accent" />
        <span>Scene State Override</span>
      </div>
      <button
        type="button"
        onclick={onClose}
        class="rounded p-1 text-neutral-400 hover:text-neutral-200"
        aria-label="Close popover"
      >
        <Icon name="close" size={14} />
      </button>
    </div>

    <form onsubmit={handleSubmit} class="flex flex-col gap-3">
      {#if hasSchema}
        {#each Object.entries(schema) as [key, field]}
          <div class="flex flex-col gap-1">
            {#if field.type === 'enum'}
              <span class="font-medium text-neutral-300 capitalize">{key}</span>
              <div class="flex flex-wrap gap-1" role="group" aria-label={key}>
                {#each field.values as val}
                  <button
                    type="button"
                    onclick={() => (draft[key] = val)}
                    class="rounded px-2 py-1 text-[11px] font-medium transition-colors {draft[key] === val
                      ? 'bg-accent text-neutral-950 font-semibold'
                      : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}"
                  >
                    {val}
                  </button>
                {/each}
              </div>
            {:else if field.type === 'int'}
              <label for="field-{key}" class="font-medium text-neutral-300 capitalize">{key}</label>
              <div class="flex items-center gap-2">
                <input
                  id="field-{key}"
                  type="range"
                  min={field.min}
                  max={field.max}
                  value={draft[key] ?? field.default}
                  oninput={(e) => (draft[key] = parseInt((e.target as HTMLInputElement).value, 10))}
                  class="flex-1 accent-accent"
                />
                <span class="w-6 text-right font-mono font-semibold text-accent">
                  {draft[key] ?? field.default}
                </span>
              </div>
            {:else if field.type === 'string'}
              <label for="field-{key}" class="font-medium text-neutral-300 capitalize">{key}</label>
              <input
                id="field-{key}"
                type="text"
                maxlength="200"
                value={draft[key] ?? ''}
                oninput={(e) => (draft[key] = (e.target as HTMLInputElement).value)}
                class="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 focus:border-accent focus:outline-none"
              />
            {/if}
          </div>
        {/each}
      {:else}
        <!-- Schemaless Key/Value or Raw JSON editor -->
        <div class="flex flex-col gap-1">
          <label for="raw-json-patch" class="text-neutral-400">Raw JSON Patch</label>
          <textarea
            id="raw-json-patch"
            value={JSON.stringify(draft, null, 2)}
            oninput={(e) => {
              try {
                draft = JSON.parse((e.target as HTMLTextAreaElement).value);
              } catch {}
            }}
            rows="5"
            class="rounded border border-neutral-700 bg-neutral-800 p-2 font-mono text-[11px] text-neutral-200"
          ></textarea>
        </div>
      {/if}

      <div class="mt-2 flex justify-end gap-2 border-t border-neutral-800 pt-3">
        <button
          type="button"
          onclick={onClose}
          class="rounded px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          class="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-neutral-950 hover:opacity-90 active:scale-95"
        >
          Apply Override
        </button>
      </div>
    </form>
  </div>
{/if}

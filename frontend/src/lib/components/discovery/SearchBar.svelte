<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte';

  let {
    value = '',
    onSearch
  }: {
    value?: string;
    onSearch: (q: string) => void;
  } = $props();

  let inputEl = $state<HTMLInputElement>();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === '/' && document.activeElement !== inputEl) {
      const target = e.target as HTMLElement;
      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable) {
        e.preventDefault();
        inputEl?.focus();
      }
    } else if (e.key === 'Escape' && document.activeElement === inputEl) {
      if (value) {
        e.preventDefault();
        onSearch('');
      } else {
        inputEl?.blur();
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="relative w-full">
  <input
    bind:this={inputEl}
    type="text"
    value={value}
    oninput={(e) => onSearch((e.target as HTMLInputElement).value)}
    placeholder="Search companions by name, lore, or tags... (Press / to focus)"
    class="w-full rounded-2xl border border-(--chrome-line) bg-(--chrome-surface) pl-10 pr-10 py-3 text-sm text-(--chrome-text) placeholder-(--chrome-text)/40 shadow-md focus:border-accent focus:outline-none transition-colors"
  />

  <div class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-(--chrome-text)/40">
    <Icon name="sparkles" size={15} />
  </div>

  {#if value}
    <button
      type="button"
      onclick={() => {
        onSearch('');
        inputEl?.focus();
      }}
      class="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-(--chrome-text)/40 hover:text-(--chrome-text)"
      aria-label="Clear search"
    >
      <Icon name="close" size={14} />
    </button>
  {/if}
</div>

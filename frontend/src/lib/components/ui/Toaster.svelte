<script lang="ts">
  import { toasts } from '$lib/state/toasts.svelte';
  import Icon from './Icon.svelte';
</script>

<div
  class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full px-4 sm:px-0 max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))]"
  aria-live="polite"
  aria-atomic="false"
>
  {#each toasts.toasts as toast (toast.id)}
    <div
      class="pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-lg border shadow-lg transition-opacity duration-200 text-sm {
        toast.variant === 'error'
          ? 'bg-red-950 border-red-800 text-red-100'
          : toast.variant === 'success'
            ? 'bg-emerald-950 border-emerald-800 text-emerald-100'
            : 'bg-neutral-900 border-neutral-700 text-neutral-100'
      }"
      role="alert"
    >
      <span class="flex-1 leading-snug">{toast.message}</span>
      <button
        type="button"
        onclick={() => toasts.remove(toast.id)}
        class="opacity-70 hover:opacity-100 p-1 rounded transition-opacity"
        aria-label="Dismiss notification"
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  {/each}
</div>

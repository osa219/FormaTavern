<script lang="ts">
  import { authStore } from '$lib/auth/store.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';

  let pin = $state('');
  let submitting = $state(false);
  let errorMessage = $state<string | null>(null);
  let shake = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!pin || submitting) return;

    submitting = true;
    errorMessage = null;

    const result = await authStore.verifyPin(pin);
    submitting = false;

    if (!result.success) {
      pin = '';
      errorMessage = result.error ?? 'Invalid PIN';
      shake = true;
      setTimeout(() => {
        shake = false;
      }, 400);
    } else if (typeof window !== 'undefined') {
      // Routes mount and fail their loads behind this modal while locked;
      // a full reload reboots the app onto warm, authenticated state.
      window.location.reload();
    }
  }
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
  role="dialog"
  aria-modal="true"
  aria-labelledby="pin-modal-title"
>
  <div
    class="w-full max-w-sm rounded-2xl border border-(--chrome-line) bg-(--chrome-surface) p-6 text-(--chrome-text) shadow-2xl space-y-5 transition-transform duration-150 {shake ? '-translate-x-2' : 'translate-x-0'}"
    style="padding-bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));"
  >
    <div class="flex items-center gap-3">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
        <Icon name="lock" size={20} />
      </div>
      <div>
        <h2 id="pin-modal-title" class="text-base font-semibold leading-none">FormaTavern</h2>
        <p class="mt-1 text-xs text-(--chrome-text)/60">Access PIN Required</p>
      </div>
    </div>

    <p class="text-xs text-(--chrome-text)/70 leading-relaxed">
      This server requires an Access PIN to connect from the local network. Enter the PIN configured on the host machine to continue.
    </p>

    <form onsubmit={handleSubmit} class="space-y-4">
      <div>
        <label for="pin-input" class="sr-only">Access PIN</label>
        <input
          id="pin-input"
          type="password"
          inputmode="numeric"
          autocomplete="off"
          maxlength="64"
          placeholder="Enter PIN"
          bind:value={pin}
          class="w-full rounded-xl border border-(--chrome-line) bg-neutral-900/50 px-4 py-2.5 text-center text-lg tracking-widest text-(--chrome-text) placeholder:text-(--chrome-text)/40 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {#if errorMessage}
        <div class="text-xs text-rose-400 text-center font-medium" role="alert">
          {errorMessage}
        </div>
      {/if}

      <button
        type="submit"
        disabled={submitting || pin.length < 4}
        class="w-full flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-contrast transition-opacity disabled:opacity-50"
      >
        {#if submitting}
          <Spinner size={16} />
          <span>Verifying…</span>
        {:else}
          <span>Unlock Session</span>
        {/if}
      </button>
    </form>

    <div class="pt-1 text-center">
      <button
        type="button"
        onclick={() => authStore.forgetDevice()}
        class="text-xs text-(--chrome-text)/50 hover:text-(--chrome-text)/80 underline transition-colors"
      >
        Forget this device
      </button>
    </div>
  </div>
</div>

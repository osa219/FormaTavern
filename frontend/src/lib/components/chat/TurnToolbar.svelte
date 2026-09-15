<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import SwipeCarousel from './SwipeCarousel.svelte';
  import { toasts } from '$lib/state/toasts.svelte';
  import { stripOutOfBand, HOOKS } from '@formatavern/shared';

  let {
    messageId,
    role,
    isLeaf = false,
    siblingIndex = 0,
    siblingCount = 1,
    content = '',
    busy = false,
    onRegenerate,
    onContinue,
    onEdit,
    onDelete,
    onSelectSibling
  }: {
    messageId: string;
    role: 'user' | 'assistant' | 'system';
    isLeaf?: boolean;
    siblingIndex?: number;
    siblingCount?: number;
    content?: string;
    busy?: boolean;
    onRegenerate?: () => void;
    onContinue?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    onSelectSibling?: (id: string) => void;
  } = $props();

  async function handleCopy() {
    try {
      const cleanText = stripOutOfBand(content);
      await navigator.clipboard.writeText(cleanText);
      toasts.success('Turn copied to clipboard');
    } catch {
      toasts.error('Failed to copy to clipboard');
    }
  }

  const isAssistant = $derived(role === 'assistant');
</script>

<div class="flex items-center justify-between gap-2 text-xs text-neutral-400 {HOOKS.chat.turnToolbar}">
  <div class="flex items-center gap-1.5">
    {#if isAssistant && siblingCount > 1}
      <SwipeCarousel
        {messageId}
        {siblingIndex}
        {siblingCount}
        {busy}
        {onSelectSibling}
        {onRegenerate}
      />
    {/if}
  </div>

  <div class="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
    {#if isAssistant}
      {#if !isLeaf}
        <button
          type="button"
          onclick={onRegenerate}
          disabled={busy}
          class="flex h-7 w-7 items-center justify-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-40"
          title="Regenerate reply"
          aria-label="Regenerate reply"
        >
          <Icon name="regenerate" size={14} />
        </button>
      {/if}

      {#if isLeaf}
        <button
          type="button"
          onclick={onRegenerate}
          disabled={busy}
          class="flex h-7 w-7 items-center justify-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-40"
          title="Regenerate reply"
          aria-label="Regenerate reply"
        >
          <Icon name="regenerate" size={14} />
        </button>
        <button
          type="button"
          onclick={onContinue}
          disabled={busy}
          class="flex h-7 w-7 items-center justify-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-40"
          title="Continue reply"
          aria-label="Continue reply"
        >
          <Icon name="continue" size={13} />
        </button>
      {/if}
    {/if}

    <button
      type="button"
      onclick={onEdit}
      class="flex h-7 w-7 items-center justify-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
      title="Edit raw turn"
      aria-label="Edit raw turn"
    >
      <Icon name="edit" size={14} />
    </button>

    <button
      type="button"
      onclick={handleCopy}
      class="flex h-7 w-7 items-center justify-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
      title="Copy raw text"
      aria-label="Copy raw text"
    >
      <Icon name="copy" size={14} />
    </button>

    <button
      type="button"
      onclick={onDelete}
      class="flex h-7 w-7 items-center justify-center rounded text-neutral-400 hover:bg-red-950/60 hover:text-red-400"
      title="Delete turn"
      aria-label="Delete turn"
    >
      <Icon name="trash" size={14} />
    </button>
  </div>
</div>

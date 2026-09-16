<script lang="ts">
  import { HOOKS } from '@formatavern/shared';

  let {
    src,
    name,
    shape = 'circle',
    hue = null,
    kind = 'character'
  }: {
    src?: string | null;
    name?: string;
    shape?: 'circle' | 'rounded' | 'square';
    hue?: number | null;
    kind?: 'character' | 'persona' | 'npc' | 'narrator';
  } = $props();

  let imgError = $state(false);

  const initials = $derived.by(() => {
    const trimmed = name?.trim() ?? '';
    if (!trimmed) return '?';
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  });

  const shapeClass = $derived(
    shape === 'rounded' ? 'rounded-md' : shape === 'square' ? 'rounded-none' : 'rounded-full'
  );

  const ringStyle = $derived(
    kind === 'npc' && hue !== null
      ? `border: 2px solid hsl(${hue} 55% 50%);`
      : ''
  );
</script>

<div
  class="relative flex shrink-0 items-center justify-center overflow-hidden select-none {shapeClass} {HOOKS.chat.avatar}"
  style="width: var(--msg-avatar-size, 2rem); height: var(--msg-avatar-size, 2rem); {ringStyle}"
  aria-hidden="true"
>
  {#if src && !imgError}
    <img
      {src}
      alt=""
      loading="lazy"
      decoding="async"
      class="h-full w-full object-cover"
      onerror={() => {
        imgError = true;
      }}
    />
  {:else}
    <div
      class="flex h-full w-full items-center justify-center bg-neutral-800 text-[0.75rem] font-semibold text-neutral-300 font-chrome"
    >
      {initials}
    </div>
  {/if}
</div>

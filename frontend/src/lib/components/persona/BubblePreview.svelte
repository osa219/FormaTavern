<script lang="ts">
  import type { ThemeOverrides } from '@formatavern/shared';

  let {
    name = 'You',
    avatar = null,
    styleOverrides,
    message = "I'll examine the northern wing of the observatory."
  }: {
    name?: string;
    avatar?: string | null;
    styleOverrides?: ThemeOverrides | null;
    message?: string;
  } = $props();

  const bg = $derived(styleOverrides?.colors?.userBubbleBg ?? 'rgba(15, 23, 42, 0.8)');
  const text = $derived(styleOverrides?.colors?.userBubbleText ?? '#f8fafc');
  const border = $derived(styleOverrides?.colors?.userBubbleBorder ?? 'transparent');
  const radius = $derived(styleOverrides?.bubble?.radius ?? '1rem');
  const tail = $derived(styleOverrides?.bubble?.userTail ?? 'right');

  const bubbleStyle = $derived(
    `background-color: ${bg}; color: ${text}; border: 1px solid ${border}; border-radius: ${radius};`
  );
</script>

<div class="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
  <div class="flex items-end justify-end gap-2.5">
    <div
      class="bubble-tail relative max-w-[85%] px-4 py-3 shadow-md"
      data-tail={tail}
      style={bubbleStyle}
    >
      <div class="mb-1 text-[10px] font-mono font-semibold uppercase tracking-wider opacity-60">
        {name}
      </div>
      <p class="text-sm leading-relaxed">{message}</p>
    </div>

    {#if avatar}
      <img
        src={avatar}
        alt={name}
        class="h-8 w-8 rounded-full object-cover border border-neutral-700 select-none shrink-0"
        loading="lazy"
        decoding="async"
      />
    {:else}
      <div
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-neutral-300 border border-neutral-700 select-none"
      >
        {name.slice(0, 1).toUpperCase()}
      </div>
    {/if}
  </div>
</div>

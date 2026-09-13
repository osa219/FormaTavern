<script lang="ts">
  import type { Snippet } from 'svelte';
  import { shellTheme } from '$lib/state/shellTheme.svelte';
  import { prefs } from '$lib/state/prefs.svelte';
  import { isLightColor } from '$lib/theme/cssVars';
  import CustomStyleOutlet from './CustomStyleOutlet.svelte';

  interface Props {
    children?: Snippet;
    class?: string;
    withOutlet?: boolean;
  }

  let { children, class: className = '', withOutlet = true }: Props = $props();

  const DENSITY_MAP = {
    compact: { padding: '0.75rem', gap: '0.75rem' },
    regular: { padding: '1rem', gap: '1rem' },
    airy: { padding: '1.25rem', gap: '1.5rem' }
  } as const;

  const chromeVars = $derived.by(() => {
    const vars: string[] = [];
    const t = shellTheme.theme;
    const c = t.chrome;
    const card = t.card;

    const accent = t.colors?.accent ?? c?.accent;
    if (accent) {
      vars.push(`--theme-accent: ${accent}`);
      const isLight = isLightColor(accent);
      vars.push(`--theme-accent-contrast: ${isLight ? '#0a0a0c' : '#ffffff'}`);
    }
    if (c?.surface) vars.push(`--chrome-bg: ${c.surface}`);
    if (c?.surfaceRaised) vars.push(`--chrome-surface: ${c.surfaceRaised}`);
    if (c?.border) vars.push(`--chrome-line: ${c.border}`);
    if (c?.text) vars.push(`--chrome-text: ${c.text}`);
    if (c?.font) vars.push(`--chrome-font: ${c.font}`);
    if (t.font?.family) vars.push(`--theme-font-family: ${t.font.family}`);

    if (c?.surface || c?.text) {
      const isLightBg = c.surface ? isLightColor(c.surface) : !isLightColor(c.text!);
      vars.push(`color-scheme: ${isLightBg ? 'light' : 'dark'}`);
    }

    if (card?.radius) vars.push(`--chrome-card-radius: ${card.radius}`);
    if (card?.density && DENSITY_MAP[card.density]) {
      vars.push(`--chrome-card-padding: ${DENSITY_MAP[card.density].padding}`);
      vars.push(`--chrome-card-gap: ${DENSITY_MAP[card.density].gap}`);
    }

    if (prefs.forceSolidChrome) {
      vars.push(`--chrome-scrim: 1`);
      vars.push(`--chrome-backdrop-filter: none`);
    } else if (t.scrim) {
      vars.push(`--chrome-scrim: ${t.scrim}`);
    }

    if (t.tint !== undefined) {
      vars.push(`--chrome-tint-strength: ${t.tint}`);
    }

    if (t.background?.image) {
      vars.push(`--theme-bg-img: url('${t.background.image}')`);
    }
    if (t.background?.overlay) {
      vars.push(`--theme-bg-overlay: ${t.background.overlay}`);
    }
    if (t.background?.blur) {
      vars.push(`--theme-bg-blur: ${t.background.blur}`);
    }

    return vars.join('; ');
  });

  const hasBg = $derived(Boolean(shellTheme.theme.background?.image));
</script>

<div
  data-ft-surface="shell"
  style={chromeVars || undefined}
  class="relative flex flex-col {className.includes('min-h-') || className.includes('h-') ? '' : 'min-h-screen '}w-full {hasBg ? 'bg-transparent' : 'bg-(--chrome-bg)'} text-(--chrome-text) font-(--chrome-font) {className}"
>
  {#if hasBg}
    <div
      class="pointer-events-none fixed inset-0 -z-10 bg-cover bg-center overflow-hidden"
      style="background-image: var(--theme-bg-img); filter: blur(var(--theme-bg-blur, 0px)); transform: scale(1.05);"
      aria-hidden="true"
    ></div>
    <div
      class="pointer-events-none fixed inset-0 -z-10"
      style="background-color: var(--theme-bg-overlay, rgba(10, 10, 12, 0.75));"
      aria-hidden="true"
    ></div>
  {/if}
  {#if withOutlet}
    <CustomStyleOutlet scope="shell" css={shellTheme.theme.customCss} />
  {/if}
  {@render children?.()}
</div>

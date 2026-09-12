<script lang="ts">
  import { HOOKS, type ThemeDecorLayer } from '@formatavern/shared';

  interface Props {
    layers?: ThemeDecorLayer[];
    fixed?: boolean;
    variant?: 'character' | 'chat';
  }

  let { layers = [], fixed = true, variant = 'character' }: Props = $props();

  const containerHook = $derived(variant === 'chat' ? HOOKS.chat.decorLayers : HOOKS.character.decorLayers);
  const layerHook = $derived(variant === 'chat' ? HOOKS.chat.decorLayer : HOOKS.character.decorLayer);

  // Invariant C13: budget cap at ≤ 2 decor layers
  const activeLayers = $derived(layers ? layers.slice(0, 2) : []);

  function getPositionClass(position?: string): string {
    switch (position) {
      case 'top-left':
        return 'top-0 left-0';
      case 'top-right':
        return 'top-0 right-0';
      case 'bottom-left':
        return 'bottom-0 left-0';
      case 'bottom-right':
        return 'bottom-0 right-0';
      case 'center':
        return 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2';
      case 'top-center':
        return 'top-0 left-1/2 -translate-x-1/2';
      case 'bottom-center':
        return 'bottom-0 left-1/2 -translate-x-1/2';
      default:
        return 'bottom-0 right-0';
    }
  }

  function getLayerStyle(layer: ThemeDecorLayer): string {
    const opacity = layer.opacity ?? 1;
    const blur = layer.blur ? `blur(${layer.blur})` : 'none';
    let styles = `opacity: ${opacity}; filter: ${blur}; will-change: auto;`;

    if (layer.size && layer.size.trim()) {
      styles += ` width: ${layer.size}; max-width: ${layer.size}; max-height: 85vh;`;
    }
    if ((layer.offset?.x && layer.offset.x.trim()) || (layer.offset?.y && layer.offset.y.trim())) {
      const x = layer.offset?.x?.trim() || '0px';
      const y = layer.offset?.y?.trim() || '0px';
      styles += ` translate: ${x} ${y};`;
    }

    return styles;
  }
</script>

{#if activeLayers.length > 0}
  <div class="{containerHook} pointer-events-none {fixed ? 'fixed' : 'absolute'} inset-0 z-0 overflow-hidden" aria-hidden="true">
    {#each activeLayers as layer, idx (layer.image + '-' + idx)}
      {#if layer.image && layer.image.trim()}
        <div
          data-slot={idx + 1}
          class="{layerHook} absolute {getPositionClass(layer.position)} pointer-events-none select-none {layer.size && layer.size.trim() ? '' : 'max-h-[40%] max-w-[40%] sm:max-h-64 sm:max-w-64'}"
          style={getLayerStyle(layer)}
        >
          <img
            src={layer.image}
            alt=""
            class="{layer.size && layer.size.trim() ? 'w-full h-auto max-h-full' : 'max-h-full max-w-full'} object-contain select-none pointer-events-none drop-shadow-md"
            loading="eager"
            decoding="async"
          />
        </div>
      {/if}
    {/each}
  </div>
{/if}

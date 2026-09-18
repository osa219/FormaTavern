/**
 * Svelte action to automatically resize a textarea to fit its content.
 * Defaults to 1 minRow and 8 maxRows.
 */
export function autosize(
  node: HTMLTextAreaElement,
  options?: { maxRows?: number; minRows?: number }
) {
  let maxRows = options?.maxRows ?? 8;
  let minRows = options?.minRows ?? 1;

  function resize() {
    if (typeof window === 'undefined') return;
    node.style.height = 'auto';
    const computed = window.getComputedStyle(node);
    const lineHeight = parseFloat(computed.lineHeight) || 24;
    const paddingTop = parseFloat(computed.paddingTop) || 8;
    const paddingBottom = parseFloat(computed.paddingBottom) || 8;
    const padding = paddingTop + paddingBottom;
    const minHeight = lineHeight * minRows + padding;
    const maxHeight = maxRows ? lineHeight * maxRows + padding : Infinity;
    const target = Math.min(Math.max(node.scrollHeight, minHeight), maxHeight);
    node.style.height = `${target}px`;
  }

  node.addEventListener('input', resize);
  resize();
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(resize);
  }

  return {
    update(newOptions?: { maxRows?: number; minRows?: number }) {
      if (newOptions) {
        maxRows = newOptions.maxRows ?? 8;
        minRows = newOptions.minRows ?? 1;
      }
      resize();
    },
    destroy() {
      node.removeEventListener('input', resize);
    }
  };
}

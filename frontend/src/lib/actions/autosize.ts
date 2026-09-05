/**
 * Svelte action to automatically resize a textarea to fit its content (1 to 8 rows).
 */
export function autosize(node: HTMLTextAreaElement) {
  function resize() {
    node.style.height = 'auto';
    const maxHeight = parseFloat(getComputedStyle(node).lineHeight || '24') * 8 + 16;
    node.style.height = `${Math.min(node.scrollHeight, maxHeight)}px`;
  }

  node.addEventListener('input', resize);
  resize();

  return {
    update() {
      resize();
    },
    destroy() {
      node.removeEventListener('input', resize);
    }
  };
}

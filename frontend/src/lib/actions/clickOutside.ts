/**
 * Svelte action: calls callback when user clicks outside the node.
 */
export function clickOutside(node: HTMLElement, onOutside: () => void) {
  function handleClick(event: MouseEvent) {
    if (node && !node.contains(event.target as Node) && !event.defaultPrevented) {
      onOutside();
    }
  }

  document.addEventListener('pointerdown', handleClick, true);

  return {
    destroy() {
      document.removeEventListener('pointerdown', handleClick, true);
    }
  };
}

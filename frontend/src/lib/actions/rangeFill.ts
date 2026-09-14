/**
 * Svelte action painting an accent fill up to a range slider's thumb.
 *
 * WebKit has no `::-moz-range-progress` equivalent, so the track paints a
 * `linear-gradient` keyed off `--range-p` (see `app.css`). This action owns
 * that variable: it sets `--range-p` from `(value - min) / (max - min)` on
 * mount, on every `input` event, and whenever the passed value changes
 * (covers async settings loads and server-echoed patches).
 *
 * Usage: `<input type="range" use:rangeFill={sliderValue} />`
 */

export function rangeFillPercent(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return 50;
  }
  const percent = ((value - min) / (max - min)) * 100;
  return Math.min(100, Math.max(0, percent));
}

export function rangeFill(node: HTMLInputElement, value?: number) {
  const update = (next?: number) => {
    const min = parseFloat(node.min || '0');
    const max = parseFloat(node.max || '100');
    const current = next ?? parseFloat(node.value);
    node.style.setProperty('--range-p', `${rangeFillPercent(current, min, max)}%`);
  };

  update(value);

  const onInput = () => update();
  node.addEventListener('input', onInput);

  return {
    update(next?: number) {
      update(next);
    },
    destroy() {
      node.removeEventListener('input', onInput);
    }
  };
}

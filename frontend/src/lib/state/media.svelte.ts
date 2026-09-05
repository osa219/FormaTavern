import { prefs } from './prefs.svelte';

class MediaQueries {
  systemReducedMotion = $state<boolean>(false);
  reducedTransparency = $state<boolean>(false);
  coarsePointer = $state<boolean>(false);

  constructor() {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.systemReducedMotion = motionQuery.matches;
      motionQuery.addEventListener?.('change', (e) => {
        this.systemReducedMotion = e.matches;
      });

      const transQuery = window.matchMedia('(prefers-reduced-transparency: reduce)');
      this.reducedTransparency = transQuery.matches;
      transQuery.addEventListener?.('change', (e) => {
        this.reducedTransparency = e.matches;
      });

      const pointerQuery = window.matchMedia('(pointer: coarse)');
      this.coarsePointer = pointerQuery.matches;
      pointerQuery.addEventListener?.('change', (e) => {
        this.coarsePointer = e.matches;
      });
    }
  }

  get reducedMotion(): boolean {
    if (prefs.reducedMotion === 'on') return true;
    if (prefs.reducedMotion === 'off') return false;
    return this.systemReducedMotion;
  }
}

export const media = new MediaQueries();

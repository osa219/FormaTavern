import { GlobalWindow } from 'happy-dom';

const window = new GlobalWindow();

// Bind global DOM properties onto globalThis
for (const key of Object.getOwnPropertyNames(window)) {
  if (!(key in globalThis)) {
    try {
      (globalThis as any)[key] = (window as any)[key];
    } catch {}
  }
}

globalThis.window = window as any;
globalThis.document = window.document as any;
globalThis.navigator = window.navigator as any;
globalThis.alert = () => {};
globalThis.confirm = () => true;
globalThis.prompt = () => null;
(window as any).alert = () => {};
(window as any).confirm = () => true;
(window as any).prompt = () => null;

// Svelte 5 Runes Polyfill for standalone unit test environment
const statePolyfill: any = (initial: any) => initial;
statePolyfill.raw = (initial: any) => initial;
(globalThis as any).$state = statePolyfill;

const derivedPolyfill: any = (fn: any) => (typeof fn === 'function' ? fn() : fn);
derivedPolyfill.by = (fn: any) => fn();
(globalThis as any).$derived = derivedPolyfill;

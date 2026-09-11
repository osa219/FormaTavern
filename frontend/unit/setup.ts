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

// Happy-DOM compatibility: Ensure Node.prototype.nodeName delegates to subclass getters (Element, Text, etc.)
// Required for DOMPurify to correctly resolve tag names in headless test environments.
const origNodeNameDesc = Object.getOwnPropertyDescriptor(Node.prototype, 'nodeName');
Object.defineProperty(Node.prototype, 'nodeName', {
  get() {
    let curr = Object.getPrototypeOf(this);
    while (curr && curr !== Node.prototype && curr !== Object.prototype) {
      const desc = Object.getOwnPropertyDescriptor(curr, 'nodeName');
      if (desc?.get) {
        return desc.get.call(this);
      }
      curr = Object.getPrototypeOf(curr);
    }
    return origNodeNameDesc?.get ? origNodeNameDesc.get.call(this) : ((this as any)._nodeName || '');
  },
  configurable: true
});

// Svelte 5 Runes Polyfill for standalone unit test environment
const statePolyfill: any = (initial: any) => initial;
statePolyfill.raw = (initial: any) => initial;
(globalThis as any).$state = statePolyfill;

const derivedPolyfill: any = (fn: any) => (typeof fn === 'function' ? fn() : fn);
derivedPolyfill.by = (fn: any) => fn();
(globalThis as any).$derived = derivedPolyfill;

import { plugin } from 'bun';
import { compile } from 'svelte/compiler';
import { join } from 'node:path';

// SvelteKit virtual modules and Svelte file compilation in Bun test runner
plugin({
  name: 'svelte-test-loader',
  setup(build) {
    build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
      const source = await Bun.file(path).text();
      const { js } = compile(source, { filename: path, generate: 'server' });
      const mockDir = join(import.meta.dir, 'mocks/app').replace(/\\/g, '/');
      const rewritten = js.code.replace(/(['"])\$app\/([^'"]+)\1/g, `'${mockDir}/$2.ts'`);
      return { contents: rewritten, loader: 'js' };
    });
  }
});

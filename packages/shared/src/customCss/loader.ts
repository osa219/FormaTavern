import type { SurfaceScope } from '../hooks/manifest';

let cachedModulePromise: Promise<typeof import('./index')> | null = null;

export function loadCustomCss(): Promise<typeof import('./index')> {
  if (!cachedModulePromise) {
    cachedModulePromise = import('./index');
  }
  return cachedModulePromise;
}

export function motionGuard(scope: SurfaceScope): string {
  return (
    `\n@media (prefers-reduced-motion: reduce) {\n` +
    `  [data-ft-surface="${scope}"] *, [data-ft-surface="${scope}"] *::before, [data-ft-surface="${scope}"] *::after {\n` +
    `    animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;\n` +
    `    transition-duration: 0.01ms !important; scroll-behavior: auto !important;\n` +
    `  }\n` +
    `}\n` +
    `[data-ft-motion="reduced"] [data-ft-surface="${scope}"] *,\n` +
    `[data-ft-motion="reduced"] [data-ft-surface="${scope}"] *::before,\n` +
    `[data-ft-motion="reduced"] [data-ft-surface="${scope}"] *::after {\n` +
    `  animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;\n` +
    `  transition-duration: 0.01ms !important; scroll-behavior: auto !important;\n` +
    `}\n`
  );
}

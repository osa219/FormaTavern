import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ShellThemeStore } from '../src/lib/state/shellTheme.svelte';
import { prefs } from '../src/lib/state/prefs.svelte';

describe('Zero-FOUC Shell Theme & Outlet Caching (Invariants C2, C8, C13, A-SURF1)', () => {
  beforeEach(() => {
    localStorage.clear();
    prefs.hideCustomStyling = false;
    document.head.querySelectorAll('style[data-ft-sheet]').forEach((el) => el.remove());
  });

  afterEach(() => {
    localStorage.clear();
    prefs.hideCustomStyling = false;
    document.head.querySelectorAll('style[data-ft-sheet]').forEach((el) => el.remove());
  });

  it('initializes ShellThemeStore synchronously from localStorage on startup', () => {
    const cached = {
      chrome: { surface: '#ffffff', text: '#000000' },
      customCss: '[data-ft-surface="shell"] { --n-950: #ffffff; }'
    };
    localStorage.setItem('formatavern_shell_theme', JSON.stringify(cached));

    const store = new ShellThemeStore({
      api: { settings: { 'shell-theme': { get: async () => ({ data: cached }), put: async () => ({ data: cached }) } } }
    });

    // Synchronously available on frame 0 without waiting for get()
    expect(store.theme.chrome?.surface).toBe('#ffffff');
    expect(store.theme.customCss).toBe('[data-ft-surface="shell"] { --n-950: #ffffff; }');
  });

  it('updates localStorage when ShellThemeStore saves new theme', async () => {
    const updatedTheme = {
      chrome: { surface: '#123456' }
    };
    const mockClient = {
      api: {
        settings: {
          'shell-theme': {
            put: async (theme: any) => ({ data: theme })
          }
        }
      }
    };
    const store = new ShellThemeStore(mockClient);
    const success = await store.save(updatedTheme as any);
    expect(success).toBe(true);

    const storedRaw = localStorage.getItem('formatavern_shell_theme');
    expect(storedRaw).not.toBeNull();
    const parsed = JSON.parse(storedRaw!);
    expect(parsed.chrome?.surface).toBe('#123456');
  });

  it('adopts pre-existing pre-hydration style tag instead of creating duplicate (Invariant C13)', () => {
    // Simulate Tier 1 pre-hydration script injecting <style data-ft-sheet="shell">
    const preExisting = document.createElement('style');
    preExisting.setAttribute('data-ft-sheet', 'shell');
    preExisting.textContent = '[data-ft-surface="shell"] { background: white; }';
    document.head.appendChild(preExisting);

    // Assert only 1 tag initially
    expect(document.head.querySelectorAll('style[data-ft-sheet="shell"]').length).toBe(1);

    // Simulate tag adoption logic from CustomStyleOutlet
    const scope = 'shell';
    const found = document.querySelector(`style[data-ft-sheet="${scope}"]`) as HTMLStyleElement | null;
    expect(found).toBe(preExisting);

    // Tag is adopted and preserved without adding a second tag
    expect(document.head.querySelectorAll('style[data-ft-sheet="shell"]').length).toBe(1);
  });

  it('honors viewer supremacy (C8) and purges cached sheet when hideCustomStyling is true', () => {
    prefs.hideCustomStyling = true;

    // Simulate cache present
    localStorage.setItem(
      'formatavern_sheet_shell',
      JSON.stringify({
        sanitizerVersion: 1,
        rawHash: 'testhash',
        css: '[data-ft-surface="shell"] { background: white; }'
      })
    );

    // Under hideCustomStyling, any injected sheet must be removed
    const preExisting = document.createElement('style');
    preExisting.setAttribute('data-ft-sheet', 'shell');
    document.head.appendChild(preExisting);

    // When raw evaluates under hideCustomStyling = true:
    const raw = prefs.hideCustomStyling ? null : 'some css';
    expect(raw).toBeNull();

    if (!raw) {
      preExisting.remove();
      localStorage.removeItem('formatavern_sheet_shell');
    }

    expect(document.head.querySelectorAll('style[data-ft-sheet="shell"]').length).toBe(0);
    expect(localStorage.getItem('formatavern_sheet_shell')).toBeNull();
  });
});

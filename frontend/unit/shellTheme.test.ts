import { describe, it, expect } from 'bun:test';
import { DEFAULT_SHELL_THEME, type ShellTheme } from '@formatavern/shared';
import { ShellThemeStore } from '../src/lib/state/shellTheme.svelte';

describe('ShellThemeStore (Slice 4)', () => {
  it('initializes with default empty shell theme', () => {
    const store = new ShellThemeStore();
    expect(store.theme).toEqual(DEFAULT_SHELL_THEME);
    expect(store.loading).toBe(false);
    expect(store.saving).toBe(false);
    expect(store.error).toBeNull();
  });

  it('loads shell theme from settings API', async () => {
    const mockTheme: ShellTheme = {
      chrome: { accent: '#ec4899', surface: '#1e1b4b' },
      labels: { foyerTitle: 'Custom Sanctuary' },
      scrim: '0.9'
    };

    const mockClient = {
      api: {
        settings: {
          'shell-theme': {
            get: async () => ({ data: mockTheme, error: null })
          }
        }
      }
    };

    const store = new ShellThemeStore(mockClient);
    await store.load();

    expect(store.theme.chrome?.accent).toBe('#ec4899');
    expect(store.theme.chrome?.surface).toBe('#1e1b4b');
    expect(store.theme.labels?.foyerTitle).toBe('Custom Sanctuary');
    expect(store.theme.scrim).toBe('0.9');
    expect(store.error).toBeNull();
  });

  it('handles load error gracefully', async () => {
    const mockClient = {
      api: {
        settings: {
          'shell-theme': {
            get: async () => ({ data: null, error: { status: 500, value: { error: { message: 'Server error' } } } })
          }
        }
      }
    };

    const store = new ShellThemeStore(mockClient);
    await store.load();
    expect(store.error).toBe('Invalid request or invalid parameter provided.');
  });

  it('saves shell theme and updates local state', async () => {
    const themeToSave: ShellTheme = {
      chrome: { accent: '#10b981' },
      card: { density: 'compact', radius: '1rem' }
    };

    const mockClient = {
      api: {
        settings: {
          'shell-theme': {
            put: async (body: any) => ({ data: body, error: null })
          }
        }
      }
    };

    const store = new ShellThemeStore(mockClient);
    const success = await store.save(themeToSave);
    expect(success).toBe(true);
    expect(store.theme.chrome?.accent).toBe('#10b981');
    expect(store.theme.card?.density).toBe('compact');
    expect(store.saving).toBe(false);
  });

  it('prevents stale save responses from overwriting newer local state (seq guard)', async () => {
    const theme1: ShellTheme = { chrome: { accent: '#111111' } };
    const theme2: ShellTheme = { chrome: { accent: '#222222' } };

    let resolveFirst: (v: any) => void;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    let callCount = 0;
    const mockClient = {
      api: {
        settings: {
          'shell-theme': {
            put: async (body: any) => {
              callCount++;
              if (callCount === 1) {
                await firstPromise;
                return { data: body, error: null };
              }
              return { data: body, error: null };
            }
          }
        }
      }
    };

    const store = new ShellThemeStore(mockClient);
    const save1Promise = store.save(theme1);
    const save2Promise = store.save(theme2);

    await save2Promise;
    expect(store.theme.chrome?.accent).toBe('#222222');

    // Now complete the slower first save
    resolveFirst!({ data: theme1, error: null });
    await save1Promise;

    // theme2 should not be overwritten by delayed theme1
    expect(store.theme.chrome?.accent).toBe('#222222');
  });
});

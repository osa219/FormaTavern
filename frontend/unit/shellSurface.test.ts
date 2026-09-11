import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { render } from 'svelte/server';
import ShellSurface from '../src/lib/components/custom/ShellSurface.svelte';
import { shellTheme } from '../src/lib/state/shellTheme.svelte';
import { prefs } from '../src/lib/state/prefs.svelte';
import { DEFAULT_SHELL_THEME } from '@formatavern/shared';

describe('ShellSurface Component (Invariants U1, U2, C13, Slice 4)', () => {
  beforeEach(() => {
    shellTheme.theme = { ...DEFAULT_SHELL_THEME };
    prefs.forceSolidChrome = false;
  });

  afterEach(() => {
    shellTheme.theme = { ...DEFAULT_SHELL_THEME };
    prefs.forceSolidChrome = false;
  });

  it('renders with data-ft-surface="shell" attribute', () => {
    const rendered = render(ShellSurface);
    expect(rendered.body).toContain('data-ft-surface="shell"');
  });

  it('renders default clean shell without inline var overrides when theme is empty', () => {
    const rendered = render(ShellSurface);
    expect(rendered.body).toContain('data-ft-surface="shell"');
    expect(rendered.body).not.toContain('style=');
  });

  it('computes inline CSS variables for chrome tokens, font, and card density', () => {
    shellTheme.theme = {
      chrome: {
        accent: '#f43f5e',
        surface: '#0f172a',
        surfaceRaised: '#1e293b',
        border: '#334155',
        text: '#f8fafc',
        font: 'JetBrains Mono'
      },
      card: {
        radius: '1.25rem',
        density: 'compact'
      },
      scrim: '0.92'
    };

    const rendered = render(ShellSurface);
    const body = rendered.body;

    expect(body).toContain('--theme-accent: #f43f5e');
    expect(body).toContain('--chrome-bg: #0f172a');
    expect(body).toContain('--chrome-surface: #1e293b');
    expect(body).toContain('--chrome-line: #334155');
    expect(body).toContain('--chrome-text: #f8fafc');
    expect(body).toContain('--chrome-font: JetBrains Mono');
    expect(body).toContain('--chrome-card-radius: 1.25rem');
    expect(body).toContain('--chrome-card-padding: 0.75rem');
    expect(body).toContain('--chrome-card-gap: 0.75rem');
    expect(body).toContain('--chrome-scrim: 0.92');
  });

  it('overrides scrim to 1 and backdrop-filter to none when forceSolidChrome is active', () => {
    shellTheme.theme = {
      scrim: '0.8'
    };
    prefs.forceSolidChrome = true;

    const rendered = render(ShellSurface);
    const body = rendered.body;

    expect(body).toContain('--chrome-scrim: 1');
    expect(body).toContain('--chrome-backdrop-filter: none');
    expect(body).not.toContain('--chrome-scrim: 0.8');
  });

  it('renders background elements and emits theme background variables when set', () => {
    shellTheme.theme = {
      background: {
        image: '/assets/backgrounds/foyer.jpg',
        overlay: 'rgba(0, 0, 0, 0.75)',
        blur: '4px'
      }
    };

    const rendered = render(ShellSurface);
    const body = rendered.body;

    expect(body).toContain("--theme-bg-img: url('/assets/backgrounds/foyer.jpg')");
    expect(body).toContain('--theme-bg-overlay: rgba(0, 0, 0, 0.75)');
    expect(body).toContain('--theme-bg-blur: 4px');
    expect(body).toContain('bg-transparent');
  });

  it('preserves height classes without forced min-h-screen conflict', () => {
    const rendered = render(ShellSurface, {
      props: {
        class: 'h-[100dvh] overflow-hidden'
      }
    });
    const body = rendered.body;

    expect(body).toContain('h-[100dvh]');
    expect(body).toContain('overflow-hidden');
    expect(body).not.toContain('min-h-screen');
  });
});

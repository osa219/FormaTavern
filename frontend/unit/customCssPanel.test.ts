import { describe, it, expect, beforeEach } from 'bun:test';
import { render } from 'svelte/server';
import CustomCssPanel from '../src/lib/components/studio/CustomCssPanel.svelte';
import { CharacterDraft } from '../src/lib/studio/draft.svelte';
import { loadCustomCss } from '@formatavern/shared/customCss/loader';
import { HOOKS } from '@formatavern/shared';

describe('CustomCssPanel & Studio CSS Integration (Slice 3)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders CustomCssPanel with editor, size meter, and manifest hooks', () => {
    const draft = new CharacterDraft();
    draft.card.customCss = '.ft-hero { border: 1px solid red; }';

    const rendered = render(CustomCssPanel, {
      props: { draft }
    });

    expect(rendered.body).toContain('custom.css');
    expect(rendered.body).toContain('131,072');
    expect(rendered.body).toContain('.ft-hero');
    expect(rendered.body).toContain('.ft-showcase-body');
    expect(rendered.body).toContain('Hooks Reference');
  });

  it('blocks CharacterDraft.save() when CSS contains parse-fatal syntax error', async () => {
    let postCalled = false;
    const fakeClient = {
      api: {
        characters: {
          post: async () => {
            postCalled = true;
            return { data: {} };
          }
        }
      }
    };
    const draft = new CharacterDraft(null, fakeClient);
    draft.card.name = 'Test Character';
    draft.card.description = 'Test Description';
    draft.card.personality = 'Test Personality';
    draft.card.scenario = 'Test Scenario';
    draft.card.firstMessage = 'Hello';

    // Malformed CSS with fatal parse error
    draft.card.customCss = '{{{';

    const res = await draft.save();
    expect(res).toBe('invalid');
    expect(postCalled).toBe(false);
  });

  it('allows CharacterDraft.save() with valid custom CSS preserving comments', async () => {
    let capturedPayload: any = null;
    const fakeClient = {
      api: {
        characters: {
          post: async (payload: any) => {
            capturedPayload = payload;
            return { data: { id: 'test-char', name: payload.name, updatedAt: 12345 } };
          }
        }
      }
    };

    const draft = new CharacterDraft(null, fakeClient);
    draft.card.name = 'Test Character';
    draft.card.description = 'Test Description';
    draft.card.personality = 'Test Personality';
    draft.card.scenario = 'Test Scenario';
    draft.card.firstMessage = 'Hello';

    const authoredCss = '/* Header Banner */\n.ft-hero {\n  border: 2px solid gold;\n}\n';
    draft.card.customCss = authoredCss;

    const res = await draft.save();
    expect(res).toBe('saved');
    expect(capturedPayload).not.toBeNull();
    // Raw authored CSS preserved with comments intact
    expect(capturedPayload.customCss).toBe(authoredCss);
  });

  it('renders CustomCssPanel with shell scope and shell manifest hooks', () => {
    const rendered = render(CustomCssPanel, {
      props: {
        value: '.ft-foyer-header { border-bottom: 1px solid var(--theme-accent); }',
        scope: 'shell'
      }
    });

    expect(rendered.body).toContain('custom.css');
    expect(rendered.body).toContain('Pure CSS • Scoped to Shell Surface');
    expect(rendered.body).toContain('.ft-foyer-header');
    expect(rendered.body).toContain('.ft-foyer-grid');
    expect(rendered.body).toContain('.ft-char-card');
  });

  it('performs debounced analysis reporting parse-fatal, dropped rules, and lints', async () => {
    const { sanitizeCss, lintSheet } = await loadCustomCss();

    // 1. Parse fatal
    const fatalOut = sanitizeCss('{{{', 'character');
    expect(fatalOut.report.some((r) => r.kind === 'parse-fatal')).toBe(true);

    // 2. Dropped rule (cross-surface)
    const crossOut = sanitizeCss('[data-ft-surface="shell"] { color: red; }', 'character');
    expect(crossOut.report.some((r) => r.kind === 'dropped-rule')).toBe(true);

    // 3. Lint check
    const lintIssues = lintSheet('.ft-hero { !important; }');
    expect(Array.isArray(lintIssues)).toBe(true);
  });

  it('renders "Start from a preset" row with all curated starter presets', () => {
    const draft = new CharacterDraft();
    const rendered = render(CustomCssPanel, {
      props: { draft }
    });

    expect(rendered.body).toContain('Start from a preset:');
    expect(rendered.body).toContain('Terminal');
    expect(rendered.body).toContain('Manuscript');
    expect(rendered.body).toContain('Window');
    expect(rendered.body).toContain('Night Market');
  });
});

import { describe, it, expect } from 'bun:test';
import { render } from 'svelte/server';
import StudioPromptPanel from '../src/lib/components/studio/StudioPromptPanel.svelte';
import { CharacterDraft } from '../src/lib/studio/draft.svelte';

describe('§6 Studio prompt preview', () => {
  it('renders its hook with loading state (fetch runs client-side)', () => {
    const draft = new CharacterDraft(null);
    const { html } = render(StudioPromptPanel, { props: { draft } });
    expect(html).toContain('ft-studio-prompt');
    expect(html).toContain('Assembling prompt');
  });

  it('warns on a near-empty card before any fetch', () => {
    const draft = new CharacterDraft(null);
    const { html } = render(StudioPromptPanel, { props: { draft } });
    expect(html).toContain('nearly empty');
  });

  it('stays quiet on a filled card', () => {
    const draft = new CharacterDraft(null);
    draft.card.name = 'Test';
    draft.card.description = 'A seasoned roadwarden.';
    draft.card.personality = 'Gruff.';
    draft.card.scenario = 'A mountain pass.';
    draft.card.exampleDialogue = 'Test: …';
    const { html } = render(StudioPromptPanel, { props: { draft } });
    expect(html).not.toContain('nearly empty');
    expect(html).toContain('ft-studio-prompt');
  });
});

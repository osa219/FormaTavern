import { describe, it, expect } from 'bun:test';
import { render } from 'svelte/server';
import { blockLabel, isPreviewData } from '../src/lib/prompt/preview';
import PromptTab from '../src/lib/components/chat/PromptTab.svelte';
import LoreDrawer from '../src/lib/components/chat/LoreDrawer.svelte';
import Composer from '../src/lib/components/composer/Composer.svelte';

describe('§5 prompt preview UI', () => {
  it('labels every canonical block id with a fallback', () => {
    const ids = ['1', '1b', '1c', '2', '3', '4', '5', '6', '6b', '7', '7b', '8', '9a', '9b', '9c'];
    for (const id of ids) {
      expect(blockLabel(id)).not.toBe(`Block ${id}`);
    }
    expect(blockLabel('9b')).toContain('Director');
    expect(blockLabel('bogus')).toBe('Block bogus');
  });

  it('guards the Eden response boundary', () => {
    expect(isPreviewData(null)).toBe(false);
    expect(isPreviewData({})).toBe(false);
    expect(
      isPreviewData({ systemPrompt: 's', history: [], blocks: [] })
    ).toBe(true);
  });

  it('PromptTab renders the loading state with its hook (fetch runs client-side)', () => {
    const { html } = render(PromptTab, { props: { chatId: 'chat-1', draft: null } });
    expect(html).toContain('ft-prompt-preview');
    expect(html).toContain('Assembling prompt');
  });

  it('LoreDrawer gains a Prompt tab (entry sync runs client-side, not in SSR)', () => {
    const character: any = { id: 'c', name: 'Test', style: {} };
    const chat: any = { id: 'chat-1' };
    const { html } = render(LoreDrawer, {
      props: {
        open: true,
        character,
        chat,
        initialTab: 'prompt',
        onClose: () => {},
        onSwitchPersona: async () => {}
      }
    });
    expect(html).toContain('Prompt');
    // SSR never runs $effects, so the entry-tab sync is client-only by design:
    // server render always shows the default tab regardless of entry.
    expect(html).not.toContain('Assembling prompt');
  });

  it('Composer offers a draft Preview entry, disabled when empty', () => {
    const { html } = render(Composer, {
      props: { onSend: () => {}, onStop: () => {}, onStandingChange: () => {} }
    });
    expect(html).toContain('Preview prompt with this draft');
    expect(html).toContain('disabled');
  });
});

import { describe, it, expect } from 'bun:test';
import { render } from 'svelte/server';
import LoreDrawer from '../src/lib/components/chat/LoreDrawer.svelte';
import { settingsStore } from '../src/lib/state/settings.svelte';

const character: any = { id: 'c', name: 'Test', style: {} };
const base = {
  open: true,
  character,
  onClose: () => {},
  onSwitchPersona: async () => {}
};

function narrativeChat(dialect = 'directive'): any {
  return { id: 'chat-1', metadata: { narrativeMode: 'narrative', envelopeDialect: dialect } };
}

describe('chat dialect conversion entry', () => {
  it('shows the dialect line with a Convert action on narrative chats', () => {
    const { html } = render(LoreDrawer, {
      props: { ...base, chat: narrativeChat('xml'), onConvertChat: async () => ({ converted: 1, unchanged: 0 }) }
    });
    expect(html).toContain('This conversation speaks');
    expect(html).toContain('xml');
    expect(html).toContain('Convert…');
  });

  it('hides Convert on classic chats and metadata-less draws', () => {
    const classic = render(LoreDrawer, {
      props: { ...base, chat: { id: 'chat-2', metadata: { narrativeMode: 'classic' } } }
    });
    expect(classic.html).toContain('classic prose');
    expect(classic.html).not.toContain('Convert…');

    const bare = render(LoreDrawer, { props: { ...base, chat: { id: 'chat-3' } } });
    expect(bare.html).not.toContain('Convert…');
  });

  it('hides Convert when no handler is wired', () => {
    const { html } = render(LoreDrawer, { props: { ...base, chat: narrativeChat() } });
    expect(html).toContain('directive');
    expect(html).not.toContain('Convert…');
  });

  it('suggests the default dialect when misaligned, stays quiet when aligned', () => {
    const prev = settingsStore.settings;
    (settingsStore as any).settings = {
      narrative: { defaultMode: 'narrative', defaultDialect: 'xml' }
    };
    try {
      const misaligned = render(LoreDrawer, {
        props: {
          ...base,
          chat: narrativeChat('directive'),
          onConvertChat: async () => ({ converted: 1, unchanged: 0 })
        }
      });
      expect(misaligned.html).toContain('default is xml — convert?');

      const aligned = render(LoreDrawer, {
        props: {
          ...base,
          chat: narrativeChat('xml'),
          onConvertChat: async () => ({ converted: 1, unchanged: 0 })
        }
      });
      expect(aligned.html).toContain('Convert…');
      expect(aligned.html).not.toContain('convert?');
    } finally {
      (settingsStore as any).settings = prev;
    }
  });
});

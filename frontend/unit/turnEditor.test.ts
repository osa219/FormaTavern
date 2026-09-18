import { describe, it, expect } from 'bun:test';
import { render } from 'svelte/server';
import TurnEditor from '../src/lib/components/chat/TurnEditor.svelte';
import { HOOKS } from '@formatavern/shared';

describe('TurnEditor inline turn editing', () => {
  it('renders prose content with save and cancel buttons', () => {
    const message: any = {
      id: 'm1',
      content: 'The tavern door squeaks as you enter.'
    };
    const { html } = render(TurnEditor, { props: { message } });
    expect(html).toContain(HOOKS.chat.turnEditor);
    expect(html).toContain('The tavern door squeaks as you enter.');
    expect(html).toContain('aria-label="Edit turn content"');
    expect(html).toContain('aria-label="Save edit"');
    expect(html).toContain('aria-label="Cancel edit"');
    expect(html).toContain('Ctrl+Enter');
    // No thinking accordion when there is no reasoning
    expect(html).not.toContain('<details');
  });

  it('separates thinking block into collapsible accordion that starts closed', () => {
    const message: any = {
      id: 'm2',
      content: '<think>\nWe should describe the stormy evening.\n</think>\n\nRain hammers the roof.',
      metadata: {
        reasoningDurationMs: 2800
      }
    };
    const { html } = render(TurnEditor, { props: { message } });
    // Collapsible accordion present
    expect(html).toContain('<details');
    // Starts collapsed (no open attribute on <details>)
    expect(html).not.toContain('<details open');
    // Duration formatted
    expect(html).toContain('Thought for 2.8s');
    // Thinking text is present inside the details
    expect(html).toContain('We should describe the stormy evening.');
    // Main prose is separated
    expect(html).toContain('Rain hammers the roof.');
    // Main prose textarea does not contain <think> tags
    expect(html).not.toContain('&lt;think&gt;');
  });

  it('falls back to metadata.reasoning when content does not have raw think tags', () => {
    const message: any = {
      id: 'm3',
      content: 'Eldrin smiles warmly.',
      metadata: {
        reasoning: 'Plan the character greeting.'
      }
    };
    const { html } = render(TurnEditor, { props: { message } });
    expect(html).toContain('<details');
    expect(html).toContain('Plan the character greeting.');
    expect(html).toContain('Eldrin smiles warmly.');
  });
});

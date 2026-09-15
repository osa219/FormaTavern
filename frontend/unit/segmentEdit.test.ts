import { describe, it, expect } from 'bun:test';
import { render } from 'svelte/server';
import MessageTurn from '../src/lib/components/chat/MessageTurn.svelte';
import SegmentEditor from '../src/lib/components/chat/SegmentEditor.svelte';

const segments = [
  { kind: 'narrator', text: 'Rain hammers the shutters.' },
  { kind: 'character', name: 'Eldrin', text: 'Come in, traveler.' }
] as any;

describe('§7 inline per-segment editing', () => {
  it('shows one pencil per segment when editable', () => {
    const { html } = render(MessageTurn, { props: { segments, editable: true } });
    expect(html.match(/aria-label="Edit segment \d+"/g)?.length).toBe(2);
  });

  it('shows no pencils when not editable', () => {
    const { html } = render(MessageTurn, { props: { segments } });
    expect(html).not.toContain('Edit segment');
  });

  it('shows no pencils on streaming or error turns even when editable', () => {
    const streaming = render(MessageTurn, {
      props: { segments, editable: true, streaming: true, status: 'streaming' }
    });
    expect(streaming.html).not.toContain('Edit segment');
    const failed = render(MessageTurn, { props: { segments, editable: true, status: 'error' } });
    expect(failed.html).not.toContain('Edit segment');
  });

  it('swaps the targeted segment for the editor and hides pencils', () => {
    const { html } = render(MessageTurn, { props: { segments, editable: true, editingIndex: 1 } });
    expect(html).toContain('aria-label="Edit segment text"');
    // Untouched segment still renders; targeted bubble is replaced by a
    // textarea prefilled with its plain text (so the text appears exactly once).
    expect(html).toContain('Rain hammers the shutters.');
    expect(html).not.toContain('ft-bubble-char');
    expect(html.match(/Come in, traveler\./g)?.length).toBe(1);
    expect(html).not.toContain('Edit segment 1');
  });

  it('SegmentEditor renders plain-prose hint with save/cancel affordances', () => {
    const { html } = render(SegmentEditor, { props: { initial: 'Hello.' } });
    expect(html).toContain('aria-label="Edit segment text"');
    expect(html).toContain('aria-label="Save edit"');
    expect(html).toContain('aria-label="Cancel edit"');
    expect(html).toContain('Ctrl+Enter');
  });
});

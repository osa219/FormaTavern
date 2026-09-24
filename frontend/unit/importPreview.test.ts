import { describe, it, expect } from 'bun:test';
import { importPreviewStore } from '../src/lib/state/importPreview.svelte';
import type { ImportPreview } from '@formatavern/shared';

const characterPreview: Extract<ImportPreview, { kind: 'character' }> = {
  kind: 'character',
  format: 'tavern-v2',
  card: { name: 'Preview Hero' } as any,
  warnings: []
};

const chatPreview: Extract<ImportPreview, { kind: 'chat' }> = {
  kind: 'chat',
  format: 'sillytavern-jsonl',
  title: 'Trail Chat',
  messageCount: 2,
  warnings: []
};

describe('importPreview store (Foyer dialog → Studio handoff)', () => {
  it('starts empty and clears on consume (single-shot handoff)', () => {
    importPreviewStore.clear();
    expect(importPreviewStore.preview).toBeNull();

    importPreviewStore.set(characterPreview);
    expect(importPreviewStore.preview).toEqual(characterPreview);

    const consumed = importPreviewStore.consume();
    expect(consumed).toEqual(characterPreview);
    expect(importPreviewStore.preview).toBeNull();

    // Second consume yields nothing — no double-apply into drafts.
    expect(importPreviewStore.consume()).toBeNull();
  });

  it('overwrites stale previews and clears explicitly', () => {
    importPreviewStore.set(characterPreview);
    importPreviewStore.set(chatPreview);
    expect(importPreviewStore.preview).toEqual(chatPreview);

    importPreviewStore.clear();
    expect(importPreviewStore.preview).toBeNull();
  });
});

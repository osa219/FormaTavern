import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { CatalogStore } from '../src/lib/state/catalog.svelte';
import type { CharacterSummary } from '@formatavern/shared';

describe('CatalogStore Lifecycle & Pagination (Layer 8)', () => {
  let store: CatalogStore;
  let mockCharactersGet: any;
  let mockTagsGet: any;
  let mockClient: any;

  const sampleItems: CharacterSummary[] = [
    {
      id: 'character-1',
      name: 'Character One',
      tagline: 'A brave warrior',
      avatar: null,
      tags: ['fantasy', 'warrior'],
      storyCount: 5,
      updatedAt: 1000,
      style: { colors: { accent: '#38bdf8' } }
    },
    {
      id: 'character-2',
      name: 'Character Two',
      tagline: 'A clever rogue',
      avatar: null,
      tags: ['rogue', 'stealth'],
      storyCount: 2,
      updatedAt: 2000,
      style: { colors: { accent: '#10b981' } }
    }
  ];

  beforeEach(() => {
    mockCharactersGet = mock(async ({ query }: { query: any }) => {
      return {
        data: {
          items: sampleItems,
          nextCursor: 'next-cursor-token'
        },
        error: null
      };
    });

    mockTagsGet = mock(async () => {
      return {
        data: {
          tags: [
            { tag: 'fantasy', count: 12 },
            { tag: 'sci-fi', count: 8 }
          ]
        },
        error: null
      };
    });

    mockClient = {
      api: {
        characters: {
          get: mockCharactersGet
        },
        tags: {
          get: mockTagsGet
        }
      }
    };

    store = new CatalogStore(mockClient);
  });

  it('initializes search params from URL correctly', async () => {
    const url = new URL('https://example.com/?q=mage&tags=fantasy,magic&sort=name');
    store.initFromUrl(url);

    expect(store.q).toBe('mage');
    expect(store.tags).toEqual(['fantasy', 'magic']);
    expect(store.sort).toBe('name');

    // Wait for async fetch to finish
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(store.items.length).toBe(2);
    expect(store.cursor).toBe('next-cursor-token');
    expect(store.hasMore).toBe(true);
    expect(store.availableTags.length).toBe(2);
  });

  it('syncs state back to URL query parameters', () => {
    store.q = 'rogue';
    store.tags = ['stealth'];
    store.sort = 'stories';

    store.syncToUrl();

    const currentUrl = new URL(window.location.href);
    expect(currentUrl.searchParams.get('q')).toBe('rogue');
    expect(currentUrl.searchParams.get('tags')).toBe('stealth');
    expect(currentUrl.searchParams.get('sort')).toBe('stories');
  });

  it('toggles and clears tags properly', async () => {
    store.toggleTag('fantasy');
    expect(store.tags).toEqual(['fantasy']);

    store.toggleTag('cyberpunk');
    expect(store.tags).toEqual(['fantasy', 'cyberpunk']);

    // Toggling existing tag removes it
    store.toggleTag('fantasy');
    expect(store.tags).toEqual(['cyberpunk']);

    // Clearing tags empties the list
    store.clearTags();
    expect(store.tags).toEqual([]);
  });

  it('handles loadMore cursor pagination by appending items', async () => {
    // Initial fetch
    await store.fetchItems(true);
    expect(store.items.length).toBe(2);
    expect(store.cursor).toBe('next-cursor-token');

    // Second page mock response
    const secondPageItem: CharacterSummary = {
      id: 'character-3',
      name: 'Character Three',
      tagline: 'A silent monk',
      avatar: null,
      tags: ['monk'],
      storyCount: 0,
      updatedAt: 3000,
      style: { colors: { accent: '#f59e0b' } }
    };

    mockClient.api.characters.get = mock(async ({ query }: { query: any }) => {
      expect(query.cursor).toBe('next-cursor-token');
      return {
        data: {
          items: [secondPageItem],
          nextCursor: null
        },
        error: null
      };
    });

    store.loadMore();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(store.items.length).toBe(3);
    expect(store.items[2].id).toBe('character-3');
    expect(store.cursor).toBeNull();
    expect(store.hasMore).toBe(false);
  });

  it('discards out-of-order stale responses (Sequence Guard)', async () => {
    let resolveFirst: any;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    let callCount = 0;
    mockClient.api.characters.get = mock(async () => {
      callCount++;
      if (callCount === 1) {
        await firstPromise;
        return {
          data: { items: [sampleItems[0]], nextCursor: null },
          error: null
        };
      } else {
        return {
          data: { items: [sampleItems[1]], nextCursor: null },
          error: null
        };
      }
    });

    // Start request 1
    const p1 = store.fetchItems(true);
    // Start request 2 (increments seq and aborts prior)
    const p2 = store.fetchItems(true);

    await p2;
    expect(store.items.length).toBe(1);
    expect(store.items[0].id).toBe('character-2');

    // Now let request 1 finish
    resolveFirst();
    await p1;

    // Items should still be from request 2, request 1 was discarded!
    expect(store.items.length).toBe(1);
    expect(store.items[0].id).toBe('character-2');
  });

  it('debounces text search queries', async () => {
    store.setQuery('a');
    store.setQuery('ab');
    store.setQuery('abc');

    // Immediate state updated
    expect(store.q).toBe('abc');

    // Before 200ms debounce timer elapses, fetchItems should not have fired for 'abc'
    expect(mockCharactersGet).not.toHaveBeenCalled();

    // Advance past 200ms
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(mockCharactersGet).toHaveBeenCalled();
  });
});

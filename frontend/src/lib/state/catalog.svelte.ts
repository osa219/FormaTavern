import type { CharacterSummary } from '@formatavern/shared';
import { api, toUiError } from '$lib/api';
import { toasts } from '$lib/state/toasts.svelte';

export class CatalogStore {
  q = $state<string>('');
  tags = $state<string[]>([]);
  sort = $state<'recent' | 'name' | 'stories'>('recent');

  items = $state<CharacterSummary[]>([]);
  cursor = $state<string | null>(null);
  hasMore = $state<boolean>(false);
  loading = $state<boolean>(false);
  loadingMore = $state<boolean>(false);

  availableTags = $state<Array<{ tag: string; count: number }>>([]);

  private seq = 0;
  private debounceTimer: any = null;
  private abortController: AbortController | null = null;
  private client: any;

  constructor(client: any = api) {
    this.client = client;
  }

  initFromUrl(url: URL): void {
    const qParam = url.searchParams.get('q');
    const tagsParam = url.searchParams.get('tags');
    const sortParam = url.searchParams.get('sort');

    if (qParam !== null) this.q = qParam;
    if (tagsParam !== null) {
      this.tags = tagsParam.split(',').map((t) => t.trim()).filter(Boolean);
    }
    if (sortParam === 'recent' || sortParam === 'name' || sortParam === 'stories') {
      this.sort = sortParam;
    }

    this.fetchTags();
    this.fetchItems(true);
  }

  syncToUrl(): void {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);

    if (this.q) {
      url.searchParams.set('q', this.q);
    } else {
      url.searchParams.delete('q');
    }

    if (this.tags.length > 0) {
      url.searchParams.set('tags', this.tags.join(','));
    } else {
      url.searchParams.delete('tags');
    }

    if (this.sort !== 'recent') {
      url.searchParams.set('sort', this.sort);
    } else {
      url.searchParams.delete('sort');
    }

    window.history.replaceState({}, '', url.toString());
  }

  async fetchTags(): Promise<void> {
    try {
      const res = await (this.client.api.tags.get as any)();
      if (res.data?.tags) {
        this.availableTags = res.data.tags;
      }
    } catch {
      // Non-fatal
    }
  }

  async fetchItems(reset = false): Promise<void> {
    if (reset) {
      if (this.abortController) {
        this.abortController.abort();
      }
      this.abortController = new AbortController();
      this.seq++;
      this.loading = true;
      this.cursor = null;
    } else {
      if (this.loadingMore || !this.cursor) return;
      this.loadingMore = true;
    }

    const currentSeq = this.seq;

    try {
      const query: Record<string, string> = {
        sort: this.sort,
        limit: '24'
      };
      if (this.q.trim()) query.q = this.q.trim();
      if (this.tags.length > 0) query.tags = this.tags.join(',');
      if (!reset && this.cursor) query.cursor = this.cursor;

      const res = await (this.client.api.characters.get as any)({
        query
      });

      if (currentSeq !== this.seq) {
        return; // Discard stale out-of-order response
      }

      if (res.error) {
        toasts.error(toUiError(res.error).message);
        return;
      }

      const data = res.data as { items: CharacterSummary[]; nextCursor: string | null };
      if (reset) {
        this.items = data.items ?? [];
      } else {
        this.items = [...this.items, ...(data.items ?? [])];
      }

      this.cursor = data.nextCursor;
      this.hasMore = Boolean(data.nextCursor);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      if (currentSeq === this.seq) {
        toasts.error(toUiError(err).message);
      }
    } finally {
      if (currentSeq === this.seq) {
        this.loading = false;
        this.loadingMore = false;
      }
    }
  }

  setQuery(val: string): void {
    this.q = val;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.fetchItems(true);
      this.syncToUrl();
    }, 200);
  }

  toggleTag(tag: string): void {
    if (this.tags.includes(tag)) {
      this.tags = this.tags.filter((t) => t !== tag);
    } else {
      this.tags = [...this.tags, tag];
    }
    this.fetchItems(true);
    this.syncToUrl();
  }

  clearTags(): void {
    this.tags = [];
    this.fetchItems(true);
    this.syncToUrl();
  }

  setSort(sort: 'recent' | 'name' | 'stories'): void {
    if (this.sort === sort) return;
    this.sort = sort;
    this.fetchItems(true);
    this.syncToUrl();
  }

  loadMore(): void {
    this.fetchItems(false);
  }
}

export const catalogStore = new CatalogStore();

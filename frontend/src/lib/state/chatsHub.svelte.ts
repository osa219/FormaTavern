import type { ChatHubGroup, ChatHubSort, ChatView } from '@formatavern/shared';
import { api, toUiError } from '$lib/api';
import { toasts } from '$lib/state/toasts.svelte';

export class ChatsHubStore {
  items = $state<ChatHubGroup[]>([]);
  totalCharacters = $state(0);
  totalChats = $state(0);
  loading = $state(false);
  loadingMore = $state(false);
  hasMore = $state(true);
  cursor = $state<string | null>(null);
  sort = $state<ChatHubSort>('recent');
  query = $state('');

  expandedIds = $state<Set<string>>(new Set());
  overflowChats = $state<Map<string, ChatView[]>>(new Map());
  loadingOverflow = $state<Set<string>>(new Set());

  async load(reset = false): Promise<void> {
    if (reset) {
      this.cursor = null;
      this.hasMore = true;
      this.items = [];
      this.expandedIds = new Set();
      this.overflowChats = new Map();
    }

    this.loading = true;
    try {
      const q = this.query.trim() || undefined;
      const res = await (api.api.chats as any).hub.get({
        query: {
          limit: 20,
          sort: this.sort,
          q
        }
      });

      if (res.error) {
        toasts.error(toUiError(res.error).message);
        return;
      }

      if (res.data) {
        this.items = res.data.items ?? [];
        this.totalCharacters = res.data.totalCharacters ?? 0;
        this.totalChats = res.data.totalChats ?? 0;
        this.cursor = res.data.nextCursor ?? null;
        this.hasMore = Boolean(res.data.nextCursor);
      }
    } catch (err: any) {
      toasts.error(toUiError(err).message);
    } finally {
      this.loading = false;
    }
  }

  async loadMore(): Promise<void> {
    if (this.loading || this.loadingMore || !this.hasMore || !this.cursor) return;

    this.loadingMore = true;
    try {
      const q = this.query.trim() || undefined;
      const res = await (api.api.chats as any).hub.get({
        query: {
          limit: 20,
          sort: this.sort,
          cursor: this.cursor,
          q
        }
      });

      if (res.error) {
        toasts.error(toUiError(res.error).message);
        return;
      }

      if (res.data && Array.isArray(res.data.items)) {
        const existingIds = new Set(this.items.map((it) => it.character.id));
        for (const item of res.data.items) {
          if (!existingIds.has(item.character.id)) {
            this.items.push(item);
          }
        }
        this.totalCharacters = res.data.totalCharacters ?? this.totalCharacters;
        this.totalChats = res.data.totalChats ?? this.totalChats;
        this.cursor = res.data.nextCursor ?? null;
        this.hasMore = Boolean(res.data.nextCursor);
      }
    } catch (err: any) {
      toasts.error(toUiError(err).message);
    } finally {
      this.loadingMore = false;
    }
  }

  toggleExpand(characterId: string): void {
    const next = new Set(this.expandedIds);
    if (next.has(characterId)) {
      next.delete(characterId);
    } else {
      next.add(characterId);
    }
    this.expandedIds = next;
  }

  isExpanded(characterId: string): boolean {
    return this.expandedIds.has(characterId);
  }

  async loadAllChatsForCharacter(characterId: string): Promise<void> {
    if (this.overflowChats.has(characterId) || this.loadingOverflow.has(characterId)) {
      return;
    }

    const nextLoading = new Set(this.loadingOverflow);
    nextLoading.add(characterId);
    this.loadingOverflow = nextLoading;

    try {
      const res = await api.api.chats.get({
        query: { characterId }
      });

      if (res.error) {
        toasts.error(toUiError(res.error).message);
        return;
      }

      if (res.data && Array.isArray(res.data)) {
        const nextMap = new Map(this.overflowChats);
        nextMap.set(characterId, res.data as ChatView[]);
        this.overflowChats = nextMap;
      }
    } catch (err: any) {
      toasts.error(toUiError(err).message);
    } finally {
      const cleanup = new Set(this.loadingOverflow);
      cleanup.delete(characterId);
      this.loadingOverflow = cleanup;
    }
  }

  async deleteChat(chatId: string, characterId: string): Promise<boolean> {
    try {
      const res = await api.api.chats({ id: chatId }).delete();
      if (res.error) {
        toasts.error(toUiError(res.error).message);
        return false;
      }

      // Update group in items
      const groupIdx = this.items.findIndex((g) => g.character.id === characterId);
      if (groupIdx !== -1) {
        const group = this.items[groupIdx];
        group.recentChats = group.recentChats.filter((c) => c.id !== chatId);
        group.chatCount = Math.max(0, group.chatCount - 1);
        this.totalChats = Math.max(0, this.totalChats - 1);

        if (group.chatCount === 0) {
          this.items.splice(groupIdx, 1);
          this.totalCharacters = Math.max(0, this.totalCharacters - 1);
        }
      }

      // Update overflow cache if loaded
      if (this.overflowChats.has(characterId)) {
        const nextMap = new Map(this.overflowChats);
        const list = nextMap.get(characterId) ?? [];
        nextMap.set(characterId, list.filter((c) => c.id !== chatId));
        this.overflowChats = nextMap;
      }

      toasts.success('Chat deleted');
      return true;
    } catch (err: any) {
      toasts.error(toUiError(err).message);
      return false;
    }
  }

  async clearCharacterChats(characterId: string): Promise<boolean> {
    try {
      const res = await (api.api.chats as any)['by-character']({ characterId }).delete();
      if (res.error) {
        toasts.error(toUiError(res.error).message);
        return false;
      }

      const deletedCount = res.data?.count ?? 0;
      this.items = this.items.filter((g) => g.character.id !== characterId);
      this.totalCharacters = Math.max(0, this.totalCharacters - 1);
      this.totalChats = Math.max(0, this.totalChats - deletedCount);

      const nextExpanded = new Set(this.expandedIds);
      nextExpanded.delete(characterId);
      this.expandedIds = nextExpanded;

      const nextMap = new Map(this.overflowChats);
      nextMap.delete(characterId);
      this.overflowChats = nextMap;

      toasts.success(`Cleared ${deletedCount} conversation${deletedCount === 1 ? '' : 's'}`);
      return true;
    } catch (err: any) {
      toasts.error(toUiError(err).message);
      return false;
    }
  }

  setSort(newSort: ChatHubSort): void {
    if (this.sort === newSort) return;
    this.sort = newSort;
    this.load(true);
  }

  setSearch(newQuery: string): void {
    this.query = newQuery;
    this.load(true);
  }
}

export const chatsHubStore = new ChatsHubStore();

import type { PageLoad } from './$types';
import type { CharacterSummary, ChatView } from '@formatavern/shared';
import { api } from '$lib/api';

export const load: PageLoad = async () => {
  try {
    const [charsRes, chatsRes] = await Promise.all([
      api.api.characters.get(),
      api.api.chats.get({ query: { limit: 12 } })
    ]);

    const characters = Array.isArray(charsRes.data)
      ? (charsRes.data as CharacterSummary[])
      : ((charsRes.data as any)?.items as CharacterSummary[]) ?? [];

    const chats = Array.isArray(chatsRes.data) ? (chatsRes.data as ChatView[]) : [];

    return {
      characters,
      chats
    };
  } catch {
    return {
      characters: [] as CharacterSummary[],
      chats: [] as ChatView[]
    };
  }
};

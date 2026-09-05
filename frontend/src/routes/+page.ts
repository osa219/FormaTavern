import type { PageLoad } from './$types';
import type { CharacterSummary, ChatView } from '@formatavern/shared';

export const load: PageLoad = async ({ fetch }) => {
  try {
    const [charsRes, chatsRes] = await Promise.all([
      fetch('/api/characters').then((r) => (r.ok ? r.json() : { items: [] })),
      fetch('/api/chats').then((r) => (r.ok ? r.json() : []))
    ]);

    const characters = Array.isArray(charsRes) ? charsRes : charsRes?.items ?? [];

    return {
      characters: characters as CharacterSummary[],
      chats: (Array.isArray(chatsRes) ? chatsRes : []) as ChatView[]
    };
  } catch {
    return {
      characters: [] as CharacterSummary[],
      chats: [] as ChatView[]
    };
  }
};

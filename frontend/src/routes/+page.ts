import type { PageLoad } from './$types';
import type { CharacterCard, ChatView } from '@formatavern/shared';

export const load: PageLoad = async ({ fetch }) => {
  try {
    const [charsRes, chatsRes] = await Promise.all([
      fetch('/api/characters').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/chats').then((r) => (r.ok ? r.json() : []))
    ]);

    return {
      characters: (charsRes ?? []) as CharacterCard[],
      chats: (chatsRes ?? []) as ChatView[]
    };
  } catch {
    return {
      characters: [] as CharacterCard[],
      chats: [] as ChatView[]
    };
  }
};

import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { CharacterCard, ChatView, MessageWithTree, Persona } from '@formatavern/shared';

export const load: PageLoad = async ({ params, fetch }) => {
  const { chatId } = params;

  // Fetch chat and initial window of messages in parallel
  const [chatRes, messagesRes] = await Promise.all([
    fetch(`/api/chats/${chatId}`),
    fetch(`/api/chats/${chatId}/messages?limit=60`)
  ]);

  if (!chatRes.ok) {
    throw error(404, `Story ${chatId} not found`);
  }

  const chat = (await chatRes.json()) as ChatView;
  const messages = (messagesRes.ok ? await messagesRes.json() : []) as MessageWithTree[];

  // Fetch character and persona in parallel
  const [charRes, personaRes] = await Promise.all([
    fetch(`/api/characters/${chat.primaryCharacterId}`),
    chat.activePersonaId ? fetch(`/api/personas/${chat.activePersonaId}`) : Promise.resolve(null)
  ]);

  if (!charRes.ok) {
    throw error(404, `Character ${chat.primaryCharacterId} not found`);
  }

  const character = (await charRes.json()) as CharacterCard;
  let persona: Persona | null = null;
  if (personaRes && personaRes.ok) {
    persona = (await personaRes.json()) as Persona;
  }

  return {
    chatId,
    chat,
    character,
    persona,
    messages,
    hasOlder: messages.length === 60
  };
};

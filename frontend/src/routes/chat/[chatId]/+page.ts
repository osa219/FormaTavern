import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { CharacterCard, ChatView, MessageWithTree, Persona } from '@formatavern/shared';
import { api } from '$lib/api';

export const load: PageLoad = async ({ params }) => {
  const { chatId } = params;

  // Fetch chat and initial window of messages in parallel via Eden Treaty
  const [chatRes, messagesRes] = await Promise.all([
    api.api.chats({ id: chatId }).get(),
    api.api.chats({ id: chatId }).messages.get({ query: { limit: 60 } })
  ]);

  if (chatRes.error || !chatRes.data) {
    const status = chatRes.error ? (chatRes.error.status as number) : 404;
    if (status === 401) {
      throw error(401, 'Authentication required');
    }
    throw error(404, `Story ${chatId} not found`);
  }

  const chat = chatRes.data as ChatView;
  const messages = (messagesRes.data && Array.isArray(messagesRes.data) ? messagesRes.data : []) as MessageWithTree[];

  // Fetch character and persona in parallel
  const [charRes, personaRes] = await Promise.all([
    api.api.characters({ id: chat.primaryCharacterId }).get(),
    chat.activePersonaId ? api.api.personas({ id: chat.activePersonaId }).get() : Promise.resolve(null)
  ]);

  if (charRes.error || !charRes.data) {
    const status = charRes.error ? (charRes.error.status as number) : 404;
    if (status === 401) {
      throw error(401, 'Authentication required');
    }
    throw error(404, `Character ${chat.primaryCharacterId} not found`);
  }

  const character = charRes.data as CharacterCard;
  let persona: Persona | null = null;
  if (personaRes && personaRes.data) {
    persona = personaRes.data as Persona;
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

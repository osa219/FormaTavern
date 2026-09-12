import { error } from '@sveltejs/kit';
import { api } from '$lib/api';
import type { PageLoad } from './$types';
import type { CharacterCard, ChatView, Persona } from '@formatavern/shared';

export const load: PageLoad = async ({ params }) => {
  const [charRes, chatsRes, personasRes] = await Promise.all([
    api.api.characters({ id: params.id }).get(),
    api.api.chats.get({ query: { characterId: params.id, limit: 10 } }),
    api.api.personas.get()
  ]);

  if (charRes.error || !charRes.data) {
    throw error(404, `Character "${params.id}" not found`);
  }

  const character = charRes.data as CharacterCard;
  const chats = (Array.isArray(chatsRes.data) ? chatsRes.data : []) as ChatView[];
  const personas = (Array.isArray(personasRes.data) ? personasRes.data : []) as Persona[];

  return {
    character,
    chats,
    personas
  };
};

import { error } from '@sveltejs/kit';
import { api } from '$lib/api';
import type { PageLoad } from './$types';
import type { CharacterCard } from '@formatavern/shared';

export const load: PageLoad = async ({ params }) => {
  const { data: character, error: err } = await api.api.characters({ id: params.id }).get();
  if (err || !character) {
    throw error(404, `Character "${params.id}" not found`);
  }

  return {
    character: character as CharacterCard
  };
};

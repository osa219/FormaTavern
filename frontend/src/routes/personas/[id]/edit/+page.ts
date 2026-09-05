import { error } from '@sveltejs/kit';
import { api } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
  const { data: persona, error: err } = await api.api.personas({ id: params.id }).get();
  if (err || !persona) {
    throw error(404, `Persona ${params.id} not found`);
  }
  return {
    persona
  };
};

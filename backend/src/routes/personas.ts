import { Elysia } from 'elysia';
import {
  PersonaSchema,
  type Persona
} from '@formatavern/shared';
import type { Repositories } from '../db/contracts';
import { ApiError } from '../engine/errors';

export function createPersonasRouter(repos: Repositories) {
  return new Elysia({ prefix: '/personas' })
    .get('', (): Persona[] => {
      return repos.personas.list();
    })
    .get('/:id', ({ params }): Persona => {
      const persona = repos.personas.get(params.id);
      if (!persona) {
        throw new ApiError('not_found', 404, `Persona ${params.id} not found`);
      }
      return persona;
    })
    .put(
      '/:id',
      ({ params, body }): Persona => {
        const persona = body as Persona;
        if (params.id !== persona.id) {
          throw new ApiError('validation_failed', 400, 'Path id does not match body id');
        }
        repos.personas.upsert(persona);
        return persona;
      },
      {
        body: PersonaSchema
      }
    )
    .delete('/:id', ({ params }): { deleted: boolean } => {
      const persona = repos.personas.get(params.id);
      if (!persona) {
        throw new ApiError('not_found', 404, `Persona ${params.id} not found`);
      }

      repos.personas.remove(params.id);
      return { deleted: true };
    });
}

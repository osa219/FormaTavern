import { Elysia, t } from 'elysia';
import {
  PersonaSchema,
  PersonaCreateSchema,
  PersonaPatchSchema,
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
    .post(
      '',
      ({ body, set }): Persona => {
        const created = repos.personas.create(body as any);
        set.status = 201;
        return created;
      },
      {
        body: PersonaCreateSchema
      }
    )
    .patch(
      '/:id',
      ({ params, body }): Persona => {
        const result = repos.personas.patch(params.id, body as any);
        if (result === 'missing') {
          throw new ApiError('not_found', 404, `Persona ${params.id} not found`);
        }
        if (result === 'stale') {
          throw new ApiError('stale_write', 409, 'Conflict: Persona has been modified by another process');
        }
        return result;
      },
      {
        body: PersonaPatchSchema
      }
    )
    .post('/:id/default', ({ params }): Persona[] => {
      const persona = repos.personas.get(params.id);
      if (!persona) {
        throw new ApiError('not_found', 404, `Persona ${params.id} not found`);
      }
      return repos.personas.setDefault(params.id);
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
    .delete('/:id', ({ params, query }): { deleted: boolean; reassignedChats: number } => {
      const persona = repos.personas.get(params.id);
      if (!persona) {
        throw new ApiError('not_found', 404, `Persona ${params.id} not found`);
      }

      const reassignTo = (query as any)?.reassignTo as string | undefined;
      const result = repos.personas.remove(params.id, { reassignTo });

      if (result === 'is_default') {
        throw new ApiError('persona_is_default', 400, 'Cannot delete the default persona');
      }

      if (result === 'restricted') {
        const count = repos.personas.chatCounts(params.id).chats;
        throw new ApiError('persona_in_use', 400, `Persona is in use by ${count} chat(s). Pass ?reassignTo=<id> to delete.`, {
          chats: count
        });
      }

      return { deleted: true, reassignedChats: result.chats };
    });
}

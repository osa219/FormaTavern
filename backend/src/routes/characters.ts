import { Elysia } from 'elysia';
import {
  CharacterCardSchema,
  type CharacterCard
} from '@formatavern/shared';
import type { Repositories } from '../db/contracts';
import { ApiError } from '../engine/errors';

export function createCharactersRouter(repos: Repositories) {
  return new Elysia({ prefix: '/characters' })
    .get('', (): CharacterCard[] => {
      return repos.characters.list();
    })
    .get('/:id', ({ params }): CharacterCard => {
      const card = repos.characters.get(params.id);
      if (!card) {
        throw new ApiError('not_found', 404, `Character ${params.id} not found`);
      }
      return card;
    })
    .put(
      '/:id',
      ({ params, body }): CharacterCard => {
        const card = body as CharacterCard;
        if (params.id !== card.id) {
          throw new ApiError('validation_failed', 400, 'Path id does not match body id');
        }
        repos.characters.upsert(card);
        return card;
      },
      {
        body: CharacterCardSchema
      }
    )
    .delete('/:id', ({ params }): { deleted: boolean } => {
      const card = repos.characters.get(params.id);
      if (!card) {
        throw new ApiError('not_found', 404, `Character ${params.id} not found`);
      }

      const referencingChats = repos.chats.list().filter((c) => c.primaryCharacterId === params.id);
      if (referencingChats.length > 0) {
        throw new ApiError('chat_references', 409, `Cannot delete character referenced by ${referencingChats.length} chat(s)`);
      }

      repos.characters.remove(params.id);
      return { deleted: true };
    });
}

import { Elysia, t } from 'elysia';
import {
  CharacterCardSchema,
  CharacterCreateSchema,
  CharacterPatchSchema,
  CharacterListQuerySchema,
  type CharacterCard,
  type CharacterSummary
} from '@formatavern/shared';
import type { Repositories } from '../db/contracts';
import type { AssetStore } from '../assets/contracts';
import { ApiError } from '../engine/errors';

export interface CharactersRouterDeps {
  repos: Repositories;
  assets?: AssetStore;
}

export function createCharactersRouter({ repos, assets }: CharactersRouterDeps) {
  return new Elysia({ prefix: '/characters' })
    .get(
      '',
      ({ query }): { items: CharacterSummary[]; nextCursor: string | null } => {
        return repos.characters.list(query as any);
      },
      {
        query: CharacterListQuerySchema
      }
    )
    .get('/:id/usage', ({ params }): { chats: number } => {
      const card = repos.characters.get(params.id);
      if (!card) {
        throw new ApiError('not_found', 404, `Character ${params.id} not found`);
      }
      return repos.characters.chatCounts(params.id);
    })
    .get('/:id', ({ params }): CharacterCard => {
      const card = repos.characters.get(params.id);
      if (!card) {
        throw new ApiError('not_found', 404, `Character ${params.id} not found`);
      }
      return card;
    })
    .post(
      '',
      async ({ body, set }): Promise<CharacterCard> => {
        const { draftFolder, ...cardInput } = body as any;
        const created = repos.characters.create(cardInput);
        if (draftFolder && assets) {
          try {
            await assets.promoteDraft(draftFolder, created.id);
          } catch {}
        }
        set.status = 201;
        return created;
      },
      {
        body: t.Composite([
          CharacterCreateSchema,
          t.Object({
            draftFolder: t.Optional(t.String())
          })
        ])
      }
    )
    .patch(
      '/:id',
      ({ params, body }): CharacterCard => {
        const result = repos.characters.patch(params.id, body as any);
        if (result === 'missing') {
          throw new ApiError('not_found', 404, `Character ${params.id} not found`);
        }
        if (result === 'stale') {
          throw new ApiError('stale_write', 409, 'Conflict: Character has been modified by another process');
        }
        return result;
      },
      {
        body: CharacterPatchSchema
      }
    )
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
    .delete('/:id', async ({ params, query }): Promise<{ deleted: boolean; chats: number }> => {
      const card = repos.characters.get(params.id);
      if (!card) {
        throw new ApiError('not_found', 404, `Character ${params.id} not found`);
      }

      const cascade = (query as any)?.cascade === 'chats';
      const result = repos.characters.remove(params.id, { cascadeChats: cascade });

      if (result === 'restricted') {
        const count = repos.characters.chatCounts(params.id).chats;
        throw new ApiError('character_in_use', 400, `Cannot delete character referenced by ${count} chat(s)`, { chats: count });
      }

      if (assets) {
        try {
          await assets.deleteScope('character', params.id);
        } catch {}
      }

      return { deleted: true, chats: result.chats };
    })
    .post('/:id/duplicate', ({ params, set }): CharacterCard => {
      const existing = repos.characters.get(params.id);
      if (!existing) {
        throw new ApiError('not_found', 404, `Character ${params.id} not found`);
      }
      const duplicated = repos.characters.duplicate(params.id);
      set.status = 201;
      return duplicated;
    });
}

export function createTagsRouter(repos: Repositories) {
  return new Elysia({ prefix: '/tags' }).get(
    '',
    ({ query }): { tags: Array<{ tag: string; count: number }> } => {
      const limit = (query as any)?.limit ? Number((query as any).limit) : 100;
      return { tags: repos.characters.popularTags(limit) };
    },
    {
      query: t.Object({
        limit: t.Optional(t.Numeric())
      })
    }
  );
}

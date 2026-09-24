import { Elysia, t } from 'elysia';
import {
  CharacterCardSchema,
  CharacterCreateSchema,
  CharacterPatchSchema,
  CharacterListQuerySchema,
  CharacterPromptPreviewBodySchema,
  DEFAULT_CHARACTER_THEME,
  parseEnvelope,
  resolveCharacterName,
  type CharacterCard,
  type CharacterPromptPreviewBody,
  type CharacterSummary,
  type ChatMetadata,
  type Persona
} from '@formatavern/shared';
import type { Repositories } from '../db/contracts';
import type { AssetStore } from '../assets/contracts';
import type { ProviderRegistry } from '../engine/contracts';
import { assembleContext } from '../engine/context';
import { ApiError } from '../engine/errors';
import { buildPrompt } from '../prompt/builder';
import { PromptBudgetError, type BuiltPrompt, type CharacterPromptPreview } from '../prompt/types';
import { exportV2Card } from '../import/v2/service';
import { exportCharx } from '../import/charx/service';

export interface CharactersRouterDeps {
  repos: Repositories;
  assets?: AssetStore;
  providers: ProviderRegistry;
}

export function createCharactersRouter({ repos, assets, providers }: CharactersRouterDeps) {
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
    .get(
      '/:id/export.png',
      async ({ params, query, set }) => {
        const format = query?.format === 'json' ? 'json' : 'png';
        const res = await exportV2Card(params.id, repos, assets, format);
        set.headers['Content-Type'] = res.contentType;
        set.headers['Content-Disposition'] = `attachment; filename="${res.filename}"`;
        return new Response(res.data as any, {
          headers: {
            'Content-Type': res.contentType,
            'Content-Disposition': `attachment; filename="${res.filename}"`
          }
        });
      },
      {
        query: t.Optional(
          t.Object({
            format: t.Optional(t.Union([t.Literal('png'), t.Literal('json')]))
          })
        )
      }
    )
    .get('/:id/export.charx', async ({ params, set }) => {
      const res = await exportCharx(params.id, repos, assets);
      set.headers['Content-Type'] = res.contentType;
      set.headers['Content-Disposition'] = `attachment; filename="${res.filename}"`;
      return new Response(res.data as any, {
        headers: {
          'Content-Type': res.contentType,
          'Content-Disposition': `attachment; filename="${res.filename}"`
        }
      });
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
    .post(
      '/prompt-preview',
      ({ body }): CharacterPromptPreview => {
        // Dry run for an unsaved Studio draft card: static blocks only
        // (no history, no NPCs, no scene block), same builder as send.
        const input = body as CharacterPromptPreviewBody;
        const draft = input.card ?? {};

        const settings = repos.settings.getAll();
        const character: CharacterCard = {
          id: 'preview-draft',
          name: draft.name?.trim() || 'Character',
          characterName: draft.characterName?.trim() ? draft.characterName.trim() : undefined,
          description: draft.description ?? '',
          personality: draft.personality ?? '',
          scenario: draft.scenario ?? '',
          firstMessage: draft.firstMessage ?? '',
          exampleDialogue: draft.exampleDialogue,
          style: draft.style ?? DEFAULT_CHARACTER_THEME,
          stateSchema: draft.stateSchema,
          stateBindings: draft.stateBindings,
          initialState: draft.initialState,
          tags: draft.tags,
          creator: draft.creator,
          creatorUrl: draft.creatorUrl,
          characterUrl: draft.characterUrl,
          origin: draft.origin,
          version: draft.version,
          stateEnabled: draft.stateEnabled,
          showcase: draft.showcase,
          customCss: draft.customCss,
          tagline: draft.tagline
        };

        const persona: Persona =
          (input.personaId ? repos.personas.get(input.personaId) : repos.personas.getDefault()) ?? {
            id: 'preview-persona',
            name: 'Traveler',
            description: '',
            isDefault: true
          };

        const chatMeta: ChatMetadata = {
          narrativeMode: settings.narrative.defaultMode,
          envelopeDialect: settings.narrative.defaultDialect
        };

        const activeConfig = settings.provider.activeConfigId
          ? repos.providerConfigs.get(settings.provider.activeConfigId)
          : null;
        const resolution = providers.resolve(settings, activeConfig);

        const ctx = assembleContext({
          chat: { metadata: chatMeta },
          character,
          persona,
          settings,
          triggerId: 'preview-root',
          capabilities: resolution.provider.capabilities,
          configPrompt: resolution.configPrompt,
          pathRows: []
        });

        let prompt: BuiltPrompt;
        try {
          // No scene block at Studio level: scene state is per-chat runtime.
          prompt = buildPrompt({ ...ctx, sceneState: undefined });
        } catch (err) {
          if (err instanceof PromptBudgetError) {
            throw new ApiError('prompt_budget_exceeded', 413, err.message, err.report);
          }
          throw err;
        }

        const greetingText = character.firstMessage.trim();
        const greeting = greetingText
          ? (() => {
              const parsed = parseEnvelope(greetingText, {
                primaryCharacter: resolveCharacterName(character),
                dialect: chatMeta.envelopeDialect ?? 'directive',
                knownNames: [resolveCharacterName(character)],
                personaName: persona.name,
                streaming: false
              });
              return {
                text: greetingText,
                segments: parsed.segments,
                warnings: parsed.warnings.map((w) => w.code),
                adherent: parsed.adherent
              };
            })()
          : null;

        return { prompt, greeting };
      },
      {
        body: CharacterPromptPreviewBodySchema
      }
    )
    .post(
      '/greeting-rewrite',
      async ({ body }): Promise<{ text: string; adherent: boolean; warnings: string[] }> => {
        // One-shot Studio helper: restructures a classical greeting into
        // directive envelope blocks without paraphrasing. The creator reviews
        // the result; accepted text is stored as an override, the authentic
        // greeting is never rewritten.
        const { text, characterName } = body as { text: string; characterName?: string };
        if (!text || text.trim().length === 0) {
          throw new ApiError('validation_failed', 400, 'Greeting text must not be blank');
        }
        if (text.length > 8000) {
          throw new ApiError('validation_failed', 400, 'Greeting text exceeds 8000 characters');
        }

        const settings = repos.settings.getAll();
        const activeConfig = settings.provider.activeConfigId
          ? repos.providerConfigs.get(settings.provider.activeConfigId)
          : null;
        const resolution = providers.resolve(settings, activeConfig);
        const name = characterName?.trim() || 'Character';

        let buffer = '';
        try {
          for await (const ev of resolution.provider.generate(
            {
              model: resolution.model,
              systemPrompt:
                `You are a precise formatter for roleplay greetings. Rewrite the greeting below into three-track narrative envelope (directive) blocks. ` +
                `Rules: preserve every word, voice detail, and fact — only add structure. ` +
                `Scene-setting prose, actions, and stage directions go in :::narrator blocks. ` +
                `Dialogue spoken by ${name} goes in :::character[${name}] blocks, keeping the quotation marks. ` +
                `Dialogue spoken by anyone else goes in :::npc[Name] blocks. ` +
                `Output ONLY the blocks, no state block, no commentary.`,
              history: [{ role: 'user', content: text }],
              temperature: 0,
              maxTokens: 2000
            },
            undefined
          )) {
            if (ev.type === 'token') buffer += ev.text;
            else if (ev.type === 'error') {
              throw new ApiError('internal', 502, `Greeting rewrite failed: ${ev.message}`);
            }
          }
        } catch (err) {
          if (err instanceof ApiError) throw err;
          throw new ApiError('internal', 502, `Greeting rewrite failed: ${err instanceof Error ? err.message : String(err)}`);
        }

        const rewritten = buffer.trim();
        if (!rewritten) {
          throw new ApiError('internal', 502, 'Greeting rewrite returned no text');
        }
        const parsed = parseEnvelope(rewritten, {
          primaryCharacter: name,
          dialect: 'directive',
          streaming: false
        });
        return {
          text: rewritten,
          adherent: parsed.adherent,
          warnings: parsed.warnings.map((w) => w.code)
        };
      },
      {
        body: t.Object({
          text: t.String({ maxLength: 8000 }),
          characterName: t.Optional(t.String({ maxLength: 120 }))
        })
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

import { Elysia } from 'elysia';
import {
  ChatCreateSchema,
  ChatPatchSchema,
  SendMessageBodySchema,
  StatePatchBodySchema,
  defaultState,
  parseEnvelope,
  resolveState,
  type ChatCreate,
  type ChatMetadata,
  type ChatPatch,
  type ChatView,
  type MessageWithTree,
  type ParseOptions,
  type SendMessageBody,
  type StateOverride,
  type StatePatchBody
} from '@formatavern/shared';
import type { ChatRow, Repositories } from '../db/contracts';
import { newId } from '../db/ids';
import type { GenerationHub, GenerationJob, ProviderRegistry } from '../engine/contracts';
import { assembleContext } from '../engine/context';
import { ApiError } from '../engine/errors';
import { runGeneration } from '../engine/generation';
import { buildPrompt } from '../prompt/builder';
import { PromptBudgetError } from '../prompt/types';
import { sseResponse } from './sse';

export function toChatView(chat: ChatRow, hub: GenerationHub, messageCount?: number): ChatView {
  return {
    id: chat.id,
    title: chat.title,
    primaryCharacterId: chat.primaryCharacterId,
    activePersonaId: chat.activePersonaId,
    activeLeafId: chat.activeLeafId,
    activeGenerationMessageId: hub.activeForChat(chat.id)?.messageId ?? null,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    metadata: chat.metadata,
    messageCount: messageCount ?? 0
  };
}

export function createChatsRouter(deps: {
  repos: Repositories;
  hub: GenerationHub;
  providers: ProviderRegistry;
}) {
  const { repos, hub, providers } = deps;

  return new Elysia({ prefix: '/chats' })
    .post(
      '',
      ({ body, set }): ChatView => {
        const input = body as ChatCreate;
        const character = repos.characters.get(input.characterId);
        if (!character) {
          throw new ApiError('not_found', 404, `Character ${input.characterId} not found`);
        }

        let persona = input.personaId ? repos.personas.get(input.personaId) : repos.personas.getDefault();
        if (!persona) {
          const list = repos.personas.list();
          if (list.length > 0) {
            persona = list[0];
          } else {
            throw new ApiError('not_found', 404, 'No persona available to associate with chat');
          }
        }

        const settings = repos.settings.getAll();
        const narrativeMode = input.narrativeMode ?? settings.narrative.defaultMode;
        const envelopeDialect =
          input.envelopeDialect ?? settings.narrative.defaultDialect;

        const metadata: ChatMetadata = {
          envelopeDialect,
          narrativeMode,
          npcs: {},
          currentState: defaultState(character)
        };

        const chatId = newId();
        const title = input.title ?? character.name;

        return repos.transaction(() => {
          const chat = repos.chats.create({
            id: chatId,
            title,
            primaryCharacterId: character.id,
            activePersonaId: persona.id,
            metadata
          });

          let rootMsgId: string | null = null;
          if (character.firstMessage && character.firstMessage.trim().length > 0) {
            rootMsgId = newId();
            const parseRes = parseEnvelope(character.firstMessage, {
              primaryCharacter: character.name,
              dialect: envelopeDialect,
              streaming: false
            });

            repos.messages.insert({
              id: rootMsgId,
              chatId: chat.id,
              parentId: null,
              role: 'assistant',
              narrativeRole: 'character',
              senderId: character.id,
              senderName: character.name,
              content: character.firstMessage,
              segments: parseRes.segments,
              state: defaultState(character),
              status: 'complete',
              metrics: null,
              metadata: {
                stateSource: 'initial',
                parse: {
                  dialect: parseRes.dialect,
                  parserVersion: parseRes.parserVersion,
                  adherent: parseRes.adherent,
                  warnings: parseRes.warnings.map((w) => w.code),
                  truncatedAt: parseRes.truncatedAt
                }
              }
            });

            repos.chats.setActiveLeaf(chat.id, rootMsgId);
            chat.activeLeafId = rootMsgId;
          }

          set.status = 201;
          return toChatView(chat, hub, rootMsgId ? 1 : 0);
        });
      },
      {
        body: ChatCreateSchema
      }
    )
    .get('', (): ChatView[] => {
      const chats = repos.chats.list();
      return chats.map((c) => toChatView(c, hub, (c as any).messageCount));
    })
    .get('/:id', ({ params }): ChatView => {
      const chat = repos.chats.get(params.id);
      if (!chat) {
        throw new ApiError('not_found', 404, `Chat ${params.id} not found`);
      }
      const count = repos.messages.countInChat(params.id);
      return toChatView(chat, hub, count);
    })
    .patch(
      '/:id',
      ({ params, body }): ChatView => {
        const patch = body as ChatPatch;
        const chat = repos.chats.get(params.id);
        if (!chat) {
          throw new ApiError('not_found', 404, `Chat ${params.id} not found`);
        }

        if (patch.activePersonaId !== undefined) {
          const persona = repos.personas.get(patch.activePersonaId);
          if (!persona) {
            throw new ApiError('not_found', 404, `Persona ${patch.activePersonaId} not found`);
          }
          const active = hub.activeForChat(params.id);
          if (active) {
            throw new ApiError('chat_has_active_generation', 409, 'Cannot switch active persona while generation is active');
          }
        }

        const updated = repos.chats.update(params.id, {
          title: patch.title,
          activePersonaId: patch.activePersonaId,
          metadata: patch.metadata ? { ...chat.metadata, ...patch.metadata } : undefined,
          updatedAt: Date.now()
        });

        const count = repos.messages.countInChat(params.id);
        return toChatView(updated, hub, count);
      },
      {
        body: ChatPatchSchema
      }
    )
    .delete('/:id', ({ params }): { deleted: boolean } => {
      const active = hub.activeForChat(params.id);
      if (active) {
        throw new ApiError('chat_has_active_generation', 409, 'Cannot delete chat while generation is active');
      }

      const chat = repos.chats.get(params.id);
      if (!chat) {
        throw new ApiError('not_found', 404, `Chat ${params.id} not found`);
      }

      repos.chats.remove(params.id);
      return { deleted: true };
    })
    .patch(
      '/:id/state',
      ({ params, body }): { state: Record<string, unknown>; warnings: string[]; messageId: string | null } => {
        const patch = body as StatePatchBody;
        const chat = repos.chats.get(params.id);
        if (!chat) {
          throw new ApiError('not_found', 404, `Chat ${params.id} not found`);
        }

        const character = repos.characters.get(chat.primaryCharacterId);
        const currentState = chat.metadata.currentState ?? (character ? defaultState(character) : {});
        const res = resolveState(currentState, patch.state, character?.stateSchema);

        const overrideEntry: StateOverride = {
          appliedAt: Date.now(),
          patch: patch.state,
          resolved: res.state,
          source: 'user'
        };

        const updatedOverrides = [...(chat.metadata.stateOverrides ?? []), overrideEntry];
        chat.metadata.currentState = res.state;
        chat.metadata.stateOverrides = updatedOverrides;

        repos.chats.update(chat.id, {
          metadata: chat.metadata,
          updatedAt: Date.now()
        });

        return {
          state: res.state,
          warnings: res.warnings,
          messageId: chat.activeLeafId
        };
      },
      {
        body: StatePatchBodySchema
      }
    )
    .get('/:id/messages', ({ params, query }): MessageWithTree[] => {
      const chat = repos.chats.get(params.id);
      if (!chat) {
        throw new ApiError('not_found', 404, `Chat ${params.id} not found`);
      }

      if (!chat.activeLeafId) {
        return [];
      }

      const limit = query?.limit ? Number(query.limit) : 50;
      const before = (query?.before as string | undefined) || undefined;

      if (before) {
        const path = repos.messages.path(chat.activeLeafId);
        if (!path.some((m) => m.id === before)) {
          throw new ApiError('invalid_parent', 400, 'Cursor not on active branch');
        }
      }

      return repos.messages.pageActiveBranch(chat.id, chat.activeLeafId, { before, limit });
    })
    .post(
      '/:id/messages',
      ({ params, body, set }): Response | { message: unknown } => {
        const sendBody = body as SendMessageBody;
        const chat = repos.chats.get(params.id);
        if (!chat) {
          throw new ApiError('not_found', 404, `Chat ${params.id} not found`);
        }

        const character = repos.characters.get(chat.primaryCharacterId);
        if (!character) {
          throw new ApiError('not_found', 404, `Character ${chat.primaryCharacterId} not found`);
        }

        const persona = repos.personas.get(chat.activePersonaId);
        if (!persona) {
          throw new ApiError('not_found', 404, `Persona ${chat.activePersonaId} not found`);
        }

        const settings = repos.settings.getAll();

        if (hub.activeForChat(chat.id)) {
          throw new ApiError('generation_in_progress', 409, 'Generation already in progress for this chat');
        }

        if (sendBody.narrativeRole === 'npc' && (!sendBody.senderName || sendBody.senderName.trim() === '')) {
          throw new ApiError('validation_failed', 400, 'NPC message requires senderName');
        }

        const hasMessage = sendBody.message !== undefined && sendBody.message.trim().length > 0;
        const hasDirectorNote = sendBody.directorNote !== undefined && sendBody.directorNote.trim().length > 0;
        if (!hasMessage && !hasDirectorNote) {
          throw new ApiError('validation_failed', 400, 'Must provide either message or directorNote');
        }

        const parentId = sendBody.parentId !== undefined ? sendBody.parentId : chat.activeLeafId;
        if (parentId !== null) {
          const parentMsg = repos.messages.get(parentId);
          if (!parentMsg || parentMsg.chatId !== chat.id) {
            throw new ApiError('invalid_parent', 400, 'Parent message does not belong to this chat');
          }
        }

        const userRowId = newId();
        const userSenderName =
          sendBody.narrativeRole === 'npc' ? sendBody.senderName! : persona.name;
        const userNarrativeRole = sendBody.narrativeRole ?? 'persona';

        if (sendBody.generate === false) {
          return repos.transaction(() => {
            const userRow = repos.messages.insert({
              id: userRowId,
              chatId: chat.id,
              parentId,
              role: 'user',
              narrativeRole: userNarrativeRole,
              senderId: persona.id,
              senderName: userSenderName,
              content: sendBody.message ?? '',
              status: 'complete',
              metadata: sendBody.directorNote ? { directorNote: sendBody.directorNote } : {}
            });
            repos.chats.setActiveLeaf(chat.id, userRow.id);
            repos.chats.update(chat.id, { updatedAt: Date.now() });
            set.status = 201;
            return { message: userRow };
          });
        }

        // generate === true
        const resolution = providers.resolve(settings);

        // Insert user row
        const userRow = repos.messages.insert({
          id: userRowId,
          chatId: chat.id,
          parentId,
          role: 'user',
          narrativeRole: userNarrativeRole,
          senderId: persona.id,
          senderName: userSenderName,
          content: sendBody.message ?? '',
          status: 'complete',
          metadata: sendBody.directorNote ? { directorNote: sendBody.directorNote } : {}
        });

        // Assemble context & build prompt
        const ctx = assembleContext({
          chat,
          character,
          persona,
          settings,
          triggerId: userRow.id,
          capabilities: resolution.provider.capabilities,
          messages: repos.messages
        });

        let built;
        try {
          built = buildPrompt(ctx);
        } catch (err) {
          if (err instanceof PromptBudgetError) {
            repos.chats.setActiveLeaf(chat.id, userRow.id);
            throw new ApiError('prompt_budget_exceeded', 413, err.message, err.report);
          }
          throw err;
        }

        // Insert assistant row
        const assistantId = newId();
        repos.messages.insert({
          id: assistantId,
          chatId: chat.id,
          parentId: userRow.id,
          role: 'assistant',
          narrativeRole: 'character',
          senderId: character.id,
          senderName: character.name,
          content: '',
          segments: [],
          status: 'streaming'
        });
        repos.chats.setActiveLeaf(chat.id, assistantId);

        const knownNames = [
          character.name,
          ...Object.values(chat.metadata.npcs ?? {}).map((n) => n.displayName)
        ];
        const dialect =
          chat.metadata.envelopeDialect ?? (chat.metadata.narrativeMode === 'narrative' ? 'directive' : 'auto');

        const parseOptions: ParseOptions = {
          primaryCharacter: character.name,
          dialect,
          knownNames,
          personaName: persona.name
        };

        const job: GenerationJob = {
          chatId: chat.id,
          assistantId,
          parentId: userRow.id,
          userMessageId: userRow.id,
          provider: resolution.provider,
          model: resolution.model,
          request: {
            model: resolution.model,
            systemPrompt: built.systemPrompt,
            history: built.history,
            assistantPrefill: built.assistantPrefill,
            stop: built.stop,
            temperature: settings.generation.temperature,
            topP: settings.generation.topP,
            topK: settings.generation.topK,
            minP: settings.generation.minP,
            repetitionPenalty: settings.generation.repetitionPenalty,
            maxTokens: settings.generation.maxTokens
          },
          promptTokensEstimated: built.tokens.total,
          droppedTurns: built.tokens.droppedTurns,
          parseOptions,
          previousState: ctx.previousState,
          stateSchema: character.stateSchema
        };

        // Subscribe to SSE before running generation
        const response = sseResponse(hub, assistantId);
        void runGeneration(job, { repos, hub });

        return response;
      },
      {
        body: SendMessageBodySchema
      }
    );
}

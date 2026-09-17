import { Elysia } from 'elysia';
import {
  ChatConvertBodySchema,
  ChatCreateSchema,
  ChatListQuerySchema,
  ChatPatchSchema,
  PromptPreviewBodySchema,
  SendMessageBodySchema,
  StatePatchBodySchema,
  defaultState,
  parseEnvelope,
  resolveState,
  type ChatConvertBody,
  type ChatCreate,
  type ChatMetadata,
  type ChatPatch,
  type ChatView,
  type MessageWithTree,
  type ParseOptions,
  type PromptPreviewBody,
  type Segment,
  type SendMessageBody,
  type StateOverride,
  type StatePatchBody
} from '@formatavern/shared';
import type { ChatRow, MessageRow, Repositories } from '../db/contracts';
import { newId } from '../db/ids';
import type { GenerationHub, GenerationJob, ProviderRegistry } from '../engine/contracts';
import { assembleContext } from '../engine/context';
import { ConvertError, planDialectConversion } from '../engine/convert';
import { ApiError } from '../engine/errors';
import { runGeneration } from '../engine/generation';
import { buildPrompt } from '../prompt/builder';
import { PromptBudgetError, type BuiltPrompt } from '../prompt/types';
import { sseResponse } from './sse';

function buildUserSegments(
  narrativeRole: string,
  senderName: string | null,
  content: string
): Segment[] {
  const text = content ?? '';
  if (text.trim().length === 0) return [];
  if (narrativeRole === 'narrator') return [{ kind: 'narrator', text }];
  if (narrativeRole === 'npc') return [{ kind: 'npc', name: senderName ?? undefined, text }];
  if (narrativeRole === 'character')
    return [{ kind: 'character', name: senderName ?? undefined, text }];
  return [{ kind: 'persona', name: senderName ?? undefined, text }];
}

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
    .get(
      '',
      ({ query }): ChatView[] => {
        const limit = query?.limit !== undefined ? Number(query.limit) : undefined;
        const chats = repos.chats.list({
          characterId: query?.characterId,
          limit,
          cursor: query?.cursor
        });
        return chats.map((c) => toChatView(c, hub, (c as any).messageCount));
      },
      {
        query: ChatListQuerySchema
      }
    )
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

        let mergedMeta = patch.metadata ? { ...chat.metadata, ...patch.metadata } : undefined;
        if (mergedMeta && (patch.metadata as any)?.personaVoicing === null) {
          delete (mergedMeta as any).personaVoicing;
        }

        const updated = repos.chats.update(params.id, {
          title: patch.title,
          activePersonaId: patch.activePersonaId,
          metadata: mergedMeta,
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
      '/:id/prompt-preview',
      ({ params, body }): BuiltPrompt => {
        // Dry run: same assembleContext() + buildPrompt() path as send, no writes, no LLM call.
        const previewBody = body as PromptPreviewBody;
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
        const activeConfig = settings.provider.activeConfigId
          ? repos.providerConfigs.get(settings.provider.activeConfigId)
          : null;
        const resolution = providers.resolve(settings, activeConfig);

        let pathRows: MessageRow[] = chat.activeLeafId ? repos.messages.path(chat.activeLeafId) : [];
        let triggerId = chat.activeLeafId ?? 'preview-root';

        // Optional unsent draft (explicit Preview only): appended as a synthetic
        // row so history + director note reflect exactly what sending would do.
        const draft = previewBody.draft;
        const hasDraft =
          draft !== undefined &&
          ((draft.message !== undefined && draft.message.trim().length > 0) ||
            (draft.directorNote !== undefined && draft.directorNote.trim().length > 0));
        if (hasDraft) {
          const draftRole = draft.narrativeRole ?? 'persona';
          const synthetic: MessageRow = {
            id: newId(),
            chatId: chat.id,
            parentId: chat.activeLeafId,
            senderId: persona.id,
            senderName: draft.senderName?.trim() || (draftRole === 'persona' ? persona.name : null),
            role: draftRole === 'persona' ? 'user' : 'assistant',
            narrativeRole: draftRole,
            content: draft.message ?? '',
            segments: [],
            state: null,
            status: 'complete',
            createdAt: Date.now(),
            metrics: null,
            metadata: draft.directorNote ? { directorNote: draft.directorNote } : {}
          };
          pathRows = [...pathRows, synthetic];
          triggerId = synthetic.id;
        }

        const ctx = assembleContext({
          chat,
          character,
          persona,
          settings,
          triggerId,
          capabilities: resolution.provider.capabilities,
          configPrompt: resolution.configPrompt,
          pathRows
        });

        try {
          return buildPrompt(ctx);
        } catch (err) {
          if (err instanceof PromptBudgetError) {
            throw new ApiError('prompt_budget_exceeded', 413, err.message, err.report);
          }
          throw err;
        }
      },
      {
        body: PromptPreviewBodySchema
      }
    )
    .post(
      '/:id/convert',
      ({ params, body }): {
        converted: number;
        unchanged: number;
        targetDialect: string;
        warnings: Array<{ messageId: string; codes: string[] }>;
      } => {
        // Explicit per-chat dialect conversion: re-render every turn through
        // the canonical segment form, atomically. Never automatic.
        const convertBody = body as ChatConvertBody;
        const chat = repos.chats.get(params.id);
        if (!chat) {
          throw new ApiError('not_found', 404, `Chat ${params.id} not found`);
        }

        if (chat.metadata.narrativeMode !== 'narrative') {
          throw new ApiError('validation_failed', 422, 'Only narrative chats have a dialect to convert');
        }
        const sourceDialect = chat.metadata.envelopeDialect ?? 'directive';
        if (convertBody.targetDialect === sourceDialect) {
          throw new ApiError('validation_failed', 422, `Chat already speaks ${sourceDialect}`);
        }

        if (hub.activeForChat(chat.id)) {
          throw new ApiError('generation_in_progress', 409, 'Cannot convert while generation is active');
        }

        const character = repos.characters.get(chat.primaryCharacterId);
        if (!character) {
          throw new ApiError('not_found', 404, `Character ${chat.primaryCharacterId} not found`);
        }
        const persona = repos.personas.get(chat.activePersonaId);
        if (!persona) {
          throw new ApiError('not_found', 404, `Persona ${chat.activePersonaId} not found`);
        }

        const rows = repos.messages.listInChat(chat.id);
        let plan: ReturnType<typeof planDialectConversion>;
        try {
          const settings = repos.settings.getAll();
          const personaVoicing =
            chat.metadata.personaVoicing ?? settings.narrative?.personaVoicing ?? 'prohibited';
          plan = planDialectConversion(rows, {
            sourceDialect,
            targetDialect: convertBody.targetDialect,
            primaryCharacter: character.name,
            knownNames: [
              character.name,
              ...Object.values(chat.metadata.npcs ?? {}).map((n) => n.displayName)
            ],
            personaName: persona.name,
            allowPersona: personaVoicing === 'allowed'
          });
        } catch (err) {
          if (err instanceof ConvertError) {
            throw new ApiError('validation_failed', 422, err.message);
          }
          throw err;
        }

        repos.transaction(() => {
          for (const u of plan.updates) {
            repos.messages.updateContent(u.id, {
              content: u.content,
              segments: u.segments,
              metadata: u.metadata
            });
          }
          repos.chats.update(chat.id, {
            metadata: { ...chat.metadata, envelopeDialect: convertBody.targetDialect },
            updatedAt: Date.now()
          });
        });

        return {
          converted: plan.converted,
          unchanged: plan.unchanged,
          targetDialect: convertBody.targetDialect,
          warnings: plan.warnings
        };
      },
      {
        body: ChatConvertBodySchema
      }
    )
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
              segments: buildUserSegments(userNarrativeRole, userSenderName, sendBody.message ?? ''),
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
        const activeConfig = settings.provider.activeConfigId
          ? repos.providerConfigs.get(settings.provider.activeConfigId)
          : null;
        const resolution = providers.resolve(settings, activeConfig);

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
          segments: buildUserSegments(userNarrativeRole, userSenderName, sendBody.message ?? ''),
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
          configPrompt: resolution.configPrompt,
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

        const personaVoicing =
          chat.metadata.personaVoicing ?? settings.narrative?.personaVoicing ?? 'prohibited';
        const parseOptions: ParseOptions = {
          primaryCharacter: character.name,
          dialect,
          knownNames,
          personaName: persona.name,
          allowPersona: personaVoicing === 'allowed'
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
            frequencyPenalty: settings.generation.frequencyPenalty,
            reasoning: settings.generation.reasoning,
            reasoningEffort: settings.generation.reasoningEffort,
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

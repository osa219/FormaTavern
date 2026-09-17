import { Elysia } from 'elysia';
import {
  MessagePatchSchema,
  defaultState,
  parseEnvelope,
  resolveState,
  serializeEnvelope,
  stripOutOfBand,
  type MessagePatch,
  type MessageWithTree,
  type ParseOptions
} from '@formatavern/shared';
import type { Repositories } from '../db/contracts';
import { newId } from '../db/ids';
import type { GenerationHub, GenerationJob, ProviderRegistry } from '../engine/contracts';
import { assembleContext, nearestState } from '../engine/context';
import { ApiError } from '../engine/errors';
import { runGeneration } from '../engine/generation';
import { buildPrompt } from '../prompt/builder';
import { sseResponse } from './sse';

export function createMessagesRouter(deps: {
  repos: Repositories;
  hub: GenerationHub;
  providers: ProviderRegistry;
}) {
  const { repos, hub, providers } = deps;

  return new Elysia({ prefix: '/messages' })
    .get('/:id', ({ params }): MessageWithTree => {
      const msg = repos.messages.get(params.id);
      if (!msg) {
        throw new ApiError('not_found', 404, `Message ${params.id} not found`);
      }
      return msg;
    })
    .get('/:id/siblings', ({ params }): MessageWithTree[] => {
      const msg = repos.messages.get(params.id);
      if (!msg) {
        throw new ApiError('not_found', 404, `Message ${params.id} not found`);
      }
      const rawSiblings = repos.messages.siblings(params.id);
      return rawSiblings.map((s) => repos.messages.get(s.id)!);
    })
    .get('/:id/stream', ({ params }): Response => {
      return sseResponse(hub, params.id, {
        isReattach: true,
        messagesRepo: repos.messages
      });
    })
    .post('/:id/stop', ({ params }): { stopped: boolean; status: string } => {
      const msg = repos.messages.get(params.id);
      if (!msg) {
        throw new ApiError('not_found', 404, `Message ${params.id} not found`);
      }

      const active = hub.get(params.id);
      if (active) {
        hub.abort(params.id, 'user');
        return { stopped: true, status: 'aborted' };
      }

      return { stopped: false, status: msg.status };
    })
    .post('/:id/regenerate', ({ params }): Response => {
      const target = repos.messages.get(params.id);
      if (!target) {
        throw new ApiError('not_found', 404, `Message ${params.id} not found`);
      }

      if (target.role !== 'assistant') {
        throw new ApiError('not_assistant_message', 400, 'Can only regenerate assistant messages');
      }

      if (target.status === 'streaming') {
        throw new ApiError('generation_in_progress', 409, 'Target message is currently streaming');
      }

      if (target.parentId === null) {
        throw new ApiError('invalid_parent', 400, 'Cannot regenerate root message (no parent user message)');
      }

      const chat = repos.chats.get(target.chatId);
      if (!chat) {
        throw new ApiError('not_found', 404, `Chat ${target.chatId} not found`);
      }

      if (hub.activeForChat(chat.id)) {
        throw new ApiError('generation_in_progress', 409, 'Generation already in progress for this chat');
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

      // Assemble context with triggerId = target.parentId (user node)
      const ctx = assembleContext({
        chat,
        character,
        persona,
        settings,
        triggerId: target.parentId,
        capabilities: resolution.provider.capabilities,
        configPrompt: resolution.configPrompt,
        messages: repos.messages
      });

      const built = buildPrompt(ctx);

      const assistantId = newId();
      repos.messages.insert({
        id: assistantId,
        chatId: chat.id,
        parentId: target.parentId,
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
        parentId: target.parentId,
        userMessageId: target.parentId,
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

      const response = sseResponse(hub, assistantId);
      void runGeneration(job, { repos, hub });

      return response;
    })
    .post('/:id/continue', ({ params }): Response => {
      const target = repos.messages.get(params.id);
      if (!target) {
        throw new ApiError('not_found', 404, `Message ${params.id} not found`);
      }

      if (target.role !== 'assistant') {
        throw new ApiError('not_assistant_message', 400, 'Can only continue assistant messages');
      }

      const chat = repos.chats.get(target.chatId);
      if (!chat) {
        throw new ApiError('not_found', 404, `Chat ${target.chatId} not found`);
      }

      if (chat.activeLeafId !== target.id) {
        throw new ApiError('not_leaf', 409, 'Can only continue the active leaf message');
      }

      if (target.status === 'streaming') {
        throw new ApiError('generation_in_progress', 409, 'Message is already streaming');
      }

      if (hub.activeForChat(chat.id)) {
        throw new ApiError('generation_in_progress', 409, 'Generation already in progress for this chat');
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

      const stripped = stripOutOfBand(target.content);
      repos.messages.reopenForContinue(target.id, stripped);

      const updatedMeta = { ...target.metadata };
      updatedMeta.continuations = (updatedMeta.continuations ?? 0) + 1;
      repos.messages.updateContent(target.id, {
        content: stripped,
        segments: target.segments,
        state: target.state,
        metadata: updatedMeta
      });

      const ctx = assembleContext({
        chat,
        character,
        persona,
        settings,
        triggerId: target.id,
        capabilities: resolution.provider.capabilities,
        continuation: { partial: stripped },
        configPrompt: resolution.configPrompt,
        messages: repos.messages
      });

      const built = buildPrompt(ctx);

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
        assistantId: target.id,
        parentId: target.parentId,
        userMessageId: target.parentId ?? undefined,
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
        stateSchema: character.stateSchema,
        resume: { content: stripped }
      };

      const response = sseResponse(hub, target.id);
      void runGeneration(job, { repos, hub });

      return response;
    })
    .post('/:id/select', ({ params }): { activeLeafId: string } => {
      const target = repos.messages.get(params.id);
      if (!target) {
        throw new ApiError('not_found', 404, `Message ${params.id} not found`);
      }

      const chat = repos.chats.get(target.chatId);
      if (!chat) {
        throw new ApiError('not_found', 404, `Chat ${target.chatId} not found`);
      }

      const leafId = repos.messages.descendLatest(target.id);
      const character = repos.characters.get(chat.primaryCharacterId);
      const path = repos.messages.path(leafId);
      const sceneState = nearestState(path, character ?? { stateSchema: undefined, initialState: undefined });

      chat.metadata.currentState = sceneState;
      repos.chats.update(chat.id, {
        activeLeafId: leafId,
        metadata: chat.metadata,
        updatedAt: Date.now()
      });

      return { activeLeafId: leafId };
    })
    .patch(
      '/:id',
      ({ params, body }): MessageWithTree => {
        const patch = body as MessagePatch;
        const target = repos.messages.get(params.id);
        if (!target) {
          throw new ApiError('not_found', 404, `Message ${params.id} not found`);
        }

        if (target.status === 'streaming' || hub.get(target.id)) {
          throw new ApiError('generation_in_progress', 409, 'Cannot edit a streaming message');
        }

        const chat = repos.chats.get(target.chatId);
        if (!chat) {
          throw new ApiError('not_found', 404, `Chat ${target.chatId} not found`);
        }

        const character = repos.characters.get(chat.primaryCharacterId);
        const dialect =
          chat.metadata.envelopeDialect ?? (chat.metadata.narrativeMode === 'narrative' ? 'directive' : 'auto');

        const updatedMetadata = { ...target.metadata };
        updatedMetadata.edited = {
          count: (updatedMetadata.edited?.count ?? 0) + 1,
          at: Date.now()
        };

        if ('content' in patch && patch.content !== undefined) {
          const knownNames = [
            character?.name ?? 'Character',
            ...Object.values(chat.metadata.npcs ?? {}).map((n) => n.displayName)
          ];
          const parseRes = parseEnvelope(patch.content, {
            primaryCharacter: character?.name ?? 'Character',
            dialect,
            knownNames,
            streaming: false
          });

          let finalState = target.state;
          if (target.role === 'assistant') {
            const path = repos.messages.path(target.id);
            const pathBefore = path.filter((m) => m.id !== target.id);
            const prevState = nearestState(pathBefore, character ?? { stateSchema: undefined, initialState: undefined });
            const resolved = resolveState(prevState, parseRes.statePatch, character?.stateSchema);
            finalState = resolved.state;
          }

          repos.messages.updateContent(target.id, {
            content: patch.content,
            segments: parseRes.segments,
            state: finalState,
            metadata: updatedMetadata
          });
        } else if ('segments' in patch && patch.segments !== undefined) {
          let serialized: string;
          const serializeDialect = dialect === 'auto' ? 'directive' : dialect;
          try {
            serialized = serializeEnvelope(patch.segments, target.state, serializeDialect);
          } catch {
            throw new ApiError('serialize_failed', 400, 'Failed to serialize segments');
          }

          repos.messages.updateContent(target.id, {
            content: serialized,
            segments: patch.segments,
            state: target.state,
            metadata: updatedMetadata
          });
        }

        const updated = repos.messages.get(target.id);
        if (!updated) {
          throw new ApiError('not_found', 404, `Message ${target.id} not found after edit`);
        }
        return updated;
      },
      {
        body: MessagePatchSchema
      }
    )
    .delete('/:id', ({ params }): { deleted: number; activeLeafId: string | null } => {
      const target = repos.messages.get(params.id);
      if (!target) {
        throw new ApiError('not_found', 404, `Message ${params.id} not found`);
      }

      // Check if target or any descendant is streaming
      const checkDescendantsStreaming = (nodeId: string): boolean => {
        if (hub.get(nodeId)) return true;
        const children = repos.messages.children(nodeId);
        for (const child of children) {
          if (checkDescendantsStreaming(child.id)) return true;
        }
        return false;
      };

      if (checkDescendantsStreaming(target.id)) {
        throw new ApiError('generation_in_progress', 409, 'Cannot delete message with active streaming generation');
      }

      const chat = repos.chats.get(target.chatId);
      if (!chat) {
        throw new ApiError('not_found', 404, `Chat ${target.chatId} not found`);
      }

      // Count subtree nodes and check if active leaf is in subtree
      let subtreeCount = 0;
      let activeLeafInSubtree = false;

      const walkSubtree = (nodeId: string) => {
        subtreeCount++;
        if (nodeId === chat.activeLeafId) {
          activeLeafInSubtree = true;
        }
        const children = repos.messages.children(nodeId);
        for (const child of children) {
          walkSubtree(child.id);
        }
      };
      walkSubtree(target.id);

      let newActiveLeafId = chat.activeLeafId;
      if (activeLeafInSubtree) {
        newActiveLeafId = target.parentId;
        const character = repos.characters.get(chat.primaryCharacterId);
        if (newActiveLeafId) {
          const path = repos.messages.path(newActiveLeafId);
          chat.metadata.currentState = nearestState(
            path,
            character ?? { stateSchema: undefined, initialState: undefined }
          );
        } else {
          chat.metadata.currentState = character ? defaultState(character) : {};
        }
        repos.chats.update(chat.id, {
          activeLeafId: newActiveLeafId,
          metadata: chat.metadata,
          updatedAt: Date.now()
        });
      }

      repos.messages.remove(target.id);

      return {
        deleted: subtreeCount,
        activeLeafId: newActiveLeafId
      };
    });
}

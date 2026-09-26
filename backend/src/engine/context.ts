import {
  DEFAULT_SETTINGS,
  defaultState,
  resolveStateTracking,
  type AppSettings,
  type CharacterCard,
  type ChatMetadata,
  type Persona,
  type StateVector
} from '@formatavern/shared';
import type { MessageRepository, MessageRow } from '../db/contracts';
import type { HistoryTurn, PromptContext } from '../prompt/types';
import { effectiveContextLength } from '../prompt/budget';

export function normalizeNpcKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function nearestState(
  pathRows: Array<Pick<MessageRow, 'role' | 'status' | 'state'>>,
  character: Pick<CharacterCard, 'stateSchema' | 'initialState'>
): StateVector {
  for (let i = pathRows.length - 1; i >= 0; i--) {
    const row = pathRows[i];
    if (row.role !== 'user' && row.status !== 'error' && row.state !== null && row.state !== undefined) {
      return row.state;
    }
  }
  return defaultState(character);
}

export function rowToHistoryTurn(row: MessageRow): HistoryTurn {
  return {
    id: row.id,
    role: row.role,
    narrativeRole: row.narrativeRole,
    senderName: row.senderName ?? undefined,
    parentId: row.parentId,
    content: row.content,
    status: row.status,
    directorNote: row.metadata?.directorNote
  };
}

export interface AssembleContextInput {
  chat: { metadata: ChatMetadata };
  character: CharacterCard;
  persona: Persona;
  settings: AppSettings;
  triggerId: string;
  capabilities: { prefill: boolean };
  configPrompt?: string;
  continuation?: { partial: string };
  messages?: MessageRepository;
  pathRows?: MessageRow[];
  // Active model id for tokenizer selection (optional).
  model?: string;
  // Provider-reported model window (null/undefined when unknown).
  // Caps the manual setting; never raises it.
  modelContextLength?: number | null;
}

export interface AssembledContext extends PromptContext {
  previousState: StateVector;
  promptContext: PromptContext;
}

export function assembleContext(input: AssembleContextInput): AssembledContext {
  const pathRows = input.pathRows ?? (input.messages ? input.messages.path(input.triggerId) : []);
  const triggerRow = pathRows.find((r) => r.id === input.triggerId) ?? pathRows[pathRows.length - 1];

  let historyRows = pathRows;
  if (input.continuation) {
    historyRows = pathRows.filter((r) => r.id !== input.triggerId);
  }
  const history = historyRows.map(rowToHistoryTurn);

  const directorNote = triggerRow?.metadata?.directorNote;

  const previousState = nearestState(pathRows, input.character);
  const isNarrative = input.chat.metadata.narrativeMode === 'narrative';
  const stateEnabled = resolveStateTracking({
    chat: input.chat.metadata,
    card: input.character,
    settings: input.settings
  });
  const sceneState = isNarrative && stateEnabled ? previousState : undefined;

  const assistantRows = pathRows.filter((r) => r.role === 'assistant').slice(-6);
  const activeNpcsMap = new Map<string, { displayName: string; voice?: string }>();

  for (const row of assistantRows) {
    if (Array.isArray(row.segments)) {
      for (const seg of row.segments) {
        if (seg.kind === 'npc' && seg.name) {
          const key = normalizeNpcKey(seg.name);
          if (!activeNpcsMap.has(key)) {
            const registered = input.chat.metadata.npcs?.[key];
            activeNpcsMap.set(key, {
              displayName: registered?.displayName ?? seg.name,
              voice: registered?.voice
            });
          }
        }
      }
    }
  }

  const activeNpcs = activeNpcsMap.size > 0 ? Array.from(activeNpcsMap.values()) : undefined;

  const manualLength = input.settings.generation?.contextLength ?? DEFAULT_SETTINGS.generation.contextLength;
  const contextLength = effectiveContextLength(manualLength, input.modelContextLength ?? undefined);
  const reservedCompletion = input.settings.generation?.maxTokens ?? DEFAULT_SETTINGS.generation.maxTokens;

  const personaVoicing =
    input.chat.metadata.personaVoicing ?? input.settings.narrative?.personaVoicing ?? 'prohibited';

  const promptContext: PromptContext = {
    character: input.character,
    persona: input.persona,
    chat: input.chat.metadata,
    stateEnabled,
    narrativeExample: input.settings.narrative.example,
    history,
    directorNote,
    sceneState,
    activeNpcs,
    lorebookEntries: [],
    preamble: input.settings.preamble,
    configPrompt: input.configPrompt,
    personaVoicing,
    budget: {
      contextLength,
      reservedCompletion,
      pinExamples: input.settings.generation?.pinExamples ?? DEFAULT_SETTINGS.generation.pinExamples
    },
    provider: {
      prefill: input.capabilities.prefill,
      model: input.model
    },
    continuation: input.continuation ? { partial: input.continuation.partial } : undefined
  };

  return {
    ...promptContext,
    previousState,
    promptContext
  };
}

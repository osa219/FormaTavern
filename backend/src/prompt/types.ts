import type {
  CharacterCard,
  Persona,
  ChatMetadata,
  StateVector,
  MessagePayload,
  Segment,
  Dialect,
  PersonaVoicingPolicy
} from '@formatavern/shared';

export interface HistoryTurn {
  id: string;
  role: 'user' | 'assistant' | 'system';
  narrativeRole: 'character' | 'persona' | 'npc' | 'narrator';
  senderName?: string;
  content: string;
  status: 'streaming' | 'complete' | 'aborted' | 'error';
  directorNote?: string; // from messages.metadata; NEVER serialized into history
}

export interface PromptContext {
  character: CharacterCard;
  persona: Persona;
  chat: ChatMetadata;
  /** Single canonical narrative example (directive-authored), rendered per dialect. */
  narrativeExample?: string;
  history: HistoryTurn[];
  directorNote?: string;
  sceneState?: StateVector;
  activeNpcs?: Array<{ displayName: string; voice?: string }>;
  lorebookEntries?: string[];
  preamble?: string;
  configPrompt?: string;
  personaVoicing?: PersonaVoicingPolicy;
  budget: {
    contextLength: number;
    reservedCompletion: number;
    safetyFactor?: number; // default 0.9
  };
  provider: {
    prefill: boolean;
  };
  continuation?: {
    partial: string;
  };
}

export type BlockId =
  | '1'
  | '1b'
  | '1c'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '6b'
  | '7'
  | '7b'
  | '8'
  | '9a'
  | '9b'
  | '9c';

export const CANONICAL_BLOCK_IDS: readonly BlockId[] = [
  '1',
  '1b',
  '1c',
  '2',
  '3',
  '4',
  '5',
  '6',
  '6b',
  '7',
  '7b',
  '8',
  '9a',
  '9b',
  '9c'
] as const;

export interface BlockReport {
  id: BlockId;
  included: boolean;
  tokens: number;
  reason?: string;
  /** Full rendered text of the block (present when included). Powers read-only prompt previews. */
  text?: string;
}

export interface BuiltPrompt {
  systemPrompt: string;
  history: MessagePayload[];
  assistantPrefill?: string;
  stop: string[];
  dialect: Dialect | 'classic';
  blocks: BlockReport[];
  tokens: {
    static: number;
    history: number;
    bottom: number;
    total: number;
    available: number;
    droppedTurns: number;
  };
  warnings: string[];
}

export interface CharacterPromptPreview {
  prompt: BuiltPrompt;
  greeting: {
    text: string;
    segments: Segment[];
    warnings: string[];
    adherent: boolean;
  } | null;
}

export class PromptBudgetError extends Error {
  constructor(public report: BuiltPrompt['tokens']) {
    super(`Prompt context budget exceeded: total ${report.total} > available ${report.available}`);
    this.name = 'PromptBudgetError';
  }
}

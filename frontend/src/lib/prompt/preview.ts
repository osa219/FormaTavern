import type { NarrativeRole } from '@formatavern/shared';

/** Unsent composer text, folded into a preview only via an explicit Preview action. Never attached by default. */
export interface PromptDraft {
  message?: string;
  directorNote?: string;
  narrativeRole?: NarrativeRole;
  senderName?: string;
}

/** Structural view of the backend BuiltPrompt (inferred over Eden, cast at the boundary). */
export interface PreviewBlock {
  id: string;
  included: boolean;
  tokens: number;
  reason?: string;
  text?: string;
}

export interface PreviewData {
  systemPrompt: string;
  history: Array<{ role: string; content: string }>;
  assistantPrefill?: string;
  stop: string[];
  dialect: string;
  blocks: PreviewBlock[];
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

export function isPreviewData(value: unknown): value is PreviewData {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.systemPrompt === 'string' && Array.isArray(v.history) && Array.isArray(v.blocks);
}

/** Greeting parse section of the Studio draft preview. */
export interface GreetingPreview {
  text: string;
  segments: Array<{ kind: string; name?: string; text: string }>;
  warnings: string[];
  adherent: boolean;
}

/** Shape of the characters prompt-preview dry run (static prompt, no history). */
export interface StudioPreviewData {
  prompt: PreviewData;
  greeting: GreetingPreview | null;
}

export function isStudioPreviewData(value: unknown): value is StudioPreviewData {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return isPreviewData(v.prompt);
}

/** Display names for canonical block ids (fixed order comes from the backend). */
export const BLOCK_LABELS: Record<string, string> = {
  '1': 'Preamble (global)',
  '1b': 'Narrative format + agency',
  '1c': 'Provider prompt',
  '2': 'Description',
  '3': 'Personality',
  '4': 'Scenario',
  '5': 'Example dialogue',
  '6': 'World info (lorebook)',
  '6b': 'Side characters present',
  '7': 'Persona',
  '7b': 'Scene state',
  '8': 'Conversation history',
  '9a': 'Standing direction',
  '9b': "Director's note",
  '9c': 'Closing instruction'
};

export function blockLabel(id: string): string {
  return BLOCK_LABELS[id] ?? `Block ${id}`;
}

import type { Segment } from '../schemas/narrative';
import type { StateVector } from '../schemas/state';

export const PARSER_VERSION = 1;

export type Dialect = 'directive' | 'xml' | 'prefix';

export interface ParseOptions {
  primaryCharacter: string;          // name for unlabelled / default-character text
  dialect?: Dialect | 'auto';        // default 'auto' — see prefix gating
  knownNames?: string[];             // prefix dialect: names allowed to open speaker lines (case-insensitive)
  personaName?: string;              // enables the "<Persona>:" agency rule; regex-escaped internally
  allowPersona?: boolean;            // default false: persona/user headers TRUNCATE. true: yield persona segments (user-authored rows)
  streaming?: boolean;               // default false: apply hold-back and withhold open out-of-band blocks
}

export type ParseWarningCode =
  | 'mixed_dialects'
  | 'state_unclosed'
  | 'state_unparseable'
  | 'state_repaired'
  | 'state_not_object'
  | 'multiple_state_blocks'
  | 'state_not_terminal'
  | 'npc_unnamed'
  | 'reasoning_unclosed'
  | 'empty_after_truncation'
  | 'header_name_ignored';

export interface ParseWarning {
  code: ParseWarningCode;
  line?: number;
  detail?: string;
}

export interface ParseResult {
  segments: Segment[];               // normalized: trimmed, non-empty text, never adjacent-merged
  statePatch: StateVector | null;    // raw parsed object; NOT coerced against stateSchema (that is resolveState)
  reasoning: string | null;          // <think>...</think> content, stripped from segments
  truncatedAt: 'persona' | null;
  dialect: Dialect | 'none';         // detected, by first header seen
  adherent: boolean;                 // dialect !== 'none' && statePatch !== null && truncatedAt === null
  warnings: ParseWarning[];
  heldBack: string;                  // streaming only; '' otherwise. Suffix withheld from segments.
  parserVersion: number;             // PARSER_VERSION; Phase 3 stores it in messages.metadata.parse
}

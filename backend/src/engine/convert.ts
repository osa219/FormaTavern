import {
  parseEnvelope,
  serializeSegments,
  type MessageMetadata,
  type Segment
} from '@formatavern/shared';
import type { MessageRow } from '../db/contracts';

export type ConvertDialect = 'directive' | 'xml' | 'prefix';

export interface ConvertTurnWarning {
  messageId: string;
  codes: string[];
}

export interface ConvertUpdate {
  id: string;
  content: string;
  segments: Segment[];
  metadata: MessageMetadata;
}

export interface ConvertPlan {
  updates: ConvertUpdate[];
  converted: number;
  unchanged: number;
  warnings: ConvertTurnWarning[];
}

/** Thrown when a single turn cannot cross dialects without losing content. */
export class ConvertError extends Error {
  readonly messageId: string;
  readonly reason: string;

  constructor(messageId: string, reason: string) {
    super(`Message ${messageId} cannot be converted: ${reason}`);
    this.name = 'ConvertError';
    this.messageId = messageId;
    this.reason = reason;
  }
}

export interface ConvertOptions {
  sourceDialect: ConvertDialect;
  targetDialect: ConvertDialect;
  primaryCharacter: string;
  knownNames: string[];
  personaName: string;
}

/**
 * Plans a whole-chat dialect conversion without writing anything.
 * Plain persona turns are dialect-free prose and pass through untouched;
 * everything else is re-rendered from its stored canonical segments, with the
 * state patch and validation coming from a source-dialect parse. Rendering
 * from stored segments (not the fresh parse) keeps each turn's voices stable.
 * Reasoning blocks ride along re-wrapped in <think> (tag normalized).
 * Any content that would be lost (persona truncation, unserializable prose)
 * aborts the entire plan — never a silent mixed-dialect history.
 */
export function planDialectConversion(rows: MessageRow[], opts: ConvertOptions): ConvertPlan {
  const updates: ConvertUpdate[] = [];
  const warnings: ConvertTurnWarning[] = [];
  let unchanged = 0;

  for (const row of rows) {
    // Plain user prose has no envelope packaging in any dialect.
    if (row.role === 'user' && row.narrativeRole === 'persona') {
      unchanged++;
      continue;
    }
    if ((row.content ?? '').trim().length === 0) {
      unchanged++;
      continue;
    }

    let parsed;
    try {
      parsed = parseEnvelope(row.content, {
        primaryCharacter: opts.primaryCharacter,
        dialect: opts.sourceDialect,
        knownNames: opts.knownNames,
        personaName: opts.personaName,
        streaming: false
      });
    } catch (err: any) {
      throw new ConvertError(row.id, `does not parse as ${opts.sourceDialect}: ${err?.message ?? String(err)}`);
    }

    if (parsed.truncatedAt !== null) {
      throw new ConvertError(
        row.id,
        'contains persona-voiced lines that the agency rule would drop in translation'
      );
    }

    // Segments are the canonical display form: re-render content FROM them so
    // the turn keeps its voices (a plain-prose narrator row must stay narrator,
    // not become whatever the parser guesses). Only segment-less legacy rows
    // fall back to the fresh parse.
    const segments = row.segments.length > 0 ? row.segments : parsed.segments;
    let body: string;
    try {
      body = serializeSegments(segments, parsed.statePatch, opts.targetDialect);
    } catch (err: any) {
      throw new ConvertError(
        row.id,
        `prose collides with ${opts.targetDialect} markers: ${err?.message ?? String(err)}`
      );
    }

    const content = parsed.reasoning
      ? `<think>\n${parsed.reasoning}\n</think>\n\n${body}`
      : body;

    const codes = parsed.warnings.map((w) => w.code);
    if (codes.length > 0) {
      warnings.push({ messageId: row.id, codes });
    }

    if (content === row.content) {
      unchanged++;
      continue;
    }

    updates.push({
      id: row.id,
      content,
      segments,
      metadata: {
        ...row.metadata,
        parse: {
          dialect: opts.targetDialect,
          parserVersion: parsed.parserVersion,
          adherent: parsed.adherent,
          warnings: codes,
          truncatedAt: null
        }
      }
    });
  }

  return { updates, converted: updates.length, unchanged, warnings };
}

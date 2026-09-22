import {
  DIRECTIVE_CLOSER_RE,
  DIRECTIVE_HEADER_RE,
  STATE_FENCE_OPEN_RE,
  XML_CLOSER_LINE_RE,
  XML_HEADER_RE,
  parseEnvelope,
  stripOutOfBand,
  normalizeHtmlQuirks,
  serializeSegments,
  applyMacros,
  type Dialect,
  type GreetingMode,
  type MessagePayload,
  type Segment
} from '@formatavern/shared';
import type { PromptContext, HistoryTurn } from './types';
import { generateBlock, getDialect } from './blocks';
import {
  CONTINUATION_NO_PREFILL_NUDGE,
  SYNTHETIC_CONTINUE_SCENE,
  SYNTHETIC_SCENE_BEGINS
} from './templates';

export interface HistoryResult {
  messages: MessagePayload[];
  assistantPrefill?: string;
  bottomText: string;
  skippedTurns: number;
  warnings: string[];
}

/**
 * Matches a greeting-root turn against the card's reviewed envelope overrides.
 * Overrides are directive-canonical texts accepted in the Studio review flow.
 * Matching is exact: edited greetings fall through to the mode strategies.
 */
function matchGreetingOverride(turn: HistoryTurn, ctx: PromptContext): string | null {
  const envelope = ctx.character.greetingEnvelope;
  if (!envelope) return null;
  if (envelope.first !== undefined && turn.content === ctx.character.firstMessage) {
    return envelope.first;
  }
  const alternates = ctx.character.alternateGreetings ?? [];
  for (let i = 0; i < alternates.length; i++) {
    if (turn.content === alternates[i] && envelope.alternates?.[String(i)] !== undefined) {
      return envelope.alternates[String(i)];
    }
  }
  return null;
}

/** Quote-aware split of bare greeting prose: "quoted" -> character, rest -> narrator. */
function splitGreetingVoices(text: string, characterName: string): Segment[] {
  const segments: Segment[] = [];
  const quoteRe = /(?:"([^"\n]{1,600})"|“([^”\n]{1,600})”)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const pushNarrator = (slice: string) => {
    if (slice.trim().length > 0) segments.push({ kind: 'narrator', text: slice.trim() });
  };
  while ((match = quoteRe.exec(text)) !== null) {
    pushNarrator(text.slice(lastIndex, match.index));
    segments.push({ kind: 'character', name: characterName, text: match[0] });
    lastIndex = match.index + match[0].length;
  }
  pushNarrator(text.slice(lastIndex));
  if (segments.length === 0) segments.push({ kind: 'narrator', text });
  return segments;
}

/** True when text carries a delimiter line that would corrupt a greeting block. */
function hasDelimiterCollision(text: string, segDialect: Dialect): boolean {
  const lines = text.split('\n');
  if (segDialect === 'directive') {
    return lines.some(
      (line) => DIRECTIVE_HEADER_RE.test(line) || DIRECTIVE_CLOSER_RE.test(line) || STATE_FENCE_OPEN_RE.test(line)
    );
  }
  if (segDialect === 'xml') {
    return (
      lines.some((line) => XML_HEADER_RE.test(line) || XML_CLOSER_LINE_RE.test(line)) || /<state\b/i.test(text)
    );
  }
  return false;
}

function wrapPrologue(text: string, segDialect: Dialect): string | null {
  if (hasDelimiterCollision(text, segDialect)) return null;
  if (segDialect === 'directive') return `:::greeting\n${text}\n:::`;
  if (segDialect === 'xml') return `<greeting>\n${text}\n</greeting>`;
  return `Greeting: ${text}`;
}

/**
 * Formats a greeting-root assistant turn for the active envelope dialect.
 * Detection first: already-tagged greetings (any dialect) convert losslessly.
 * Bare prose follows the card's greetingMode (default prologue). Classic mode
 * never reaches here: it always sends the authentic raw greeting.
 * Throws nothing: every failure degrades to the raw text.
 */
export function formatGreetingTurn(turn: HistoryTurn, ctx: PromptContext, segDialect: Dialect): string {
  const raw = normalizeHtmlQuirks(stripOutOfBand(turn.content));
  if (raw.trim().length === 0) return raw;

  const knownNames = [
    ctx.character.name,
    ctx.persona.name,
    ...(ctx.activeNpcs ?? []).map((n) => n.displayName)
  ];
  const source = matchGreetingOverride(turn, ctx) ?? raw;
  const parsed = parseEnvelope(source, {
    primaryCharacter: ctx.character.name,
    dialect: 'auto',
    knownNames,
    personaName: ctx.persona.name
  });
  if (parsed.dialect !== 'none') {
    try {
      return serializeSegments(parsed.segments, null, segDialect);
    } catch {
      return raw;
    }
  }

  const mode: GreetingMode = ctx.character.greetingMode ?? 'prologue';
  if (mode === 'split') {
    try {
      return serializeSegments(splitGreetingVoices(source, ctx.character.name), null, segDialect);
    } catch {
      return raw;
    }
  }
  // Prologue (default), and the fallback for AI mode without a reviewed override.
  return wrapPrologue(source, segDialect) ?? raw;
}

/**
 * Serializes history turns, resolves continuation, and attaches bottom sandwich blocks (9a-9c)
 * to the last user turn.
 */
export function serializeHistory(ctx: PromptContext): HistoryResult {
  const warnings: string[] = [];
  const vars = { char: ctx.character.name, user: ctx.persona.name };
  const dialect = getDialect(ctx);

  const rawTurns = ctx.history;
  const filtered: MessagePayload[] = [];
  let skippedTurns = 0;

  for (const turn of rawTurns) {
    // 1. Skip error or streaming turns
    if (turn.status === 'error' || turn.status === 'streaming') {
      skippedTurns++;
      continue;
    }

    // Skip director-only turns
    if (turn.role === 'user' && turn.content.trim() === '' && turn.directorNote) {
      skippedTurns++;
      continue;
    }

    // Skip system rows defensively
    if (turn.role === 'system') {
      warnings.push(`Skipped unexpected system history turn: ${turn.id}`);
      skippedTurns++;
      continue;
    }

    // Greeting roots (parentId null) in envelope dialects go through the
    // greeting pipeline; classic mode always sends the authentic raw text.
    const segDialect = dialect === 'classic' ? 'directive' : dialect;

    if (turn.role === 'assistant') {
      // Strip out-of-band state & reasoning, then normalize HTML quirks
      // post-parse so narrative structure is never touched.
      const cleaned =
        turn.parentId === null && dialect !== 'classic'
          ? formatGreetingTurn(turn, ctx, segDialect)
          : normalizeHtmlQuirks(stripOutOfBand(turn.content));
      filtered.push({
        role: 'assistant',
        content: applyMacros(cleaned, vars)
      });
    } else if (turn.role === 'user') {
      // Every user turn wears its dialect tags (persona included), so speaker
      // identity travels in content while transport roles stay pure authorship.
      // serializeSegments throws on delimiter collisions; fall back to raw.
      const cleanText = normalizeHtmlQuirks(turn.content);
      if (turn.narrativeRole === 'persona') {
        let body: string;
        try {
          body = serializeSegments(
            [{ kind: 'persona', name: turn.senderName ?? ctx.persona.name, text: cleanText }],
            null,
            segDialect
          );
        } catch {
          body = cleanText;
        }
        filtered.push({
          role: 'user',
          content: applyMacros(body, vars)
        });
      } else {
        // Multi-track authoring: wrap in narrative header
        const serialized = serializeSegments(
          [{ kind: turn.narrativeRole, name: turn.senderName, text: cleanText }],
          null,
          segDialect
        );
        filtered.push({
          role: 'user',
          content: applyMacros(serialized, vars)
        });
      }
    }
  }

  // Generate bottom sandwich blocks (9a, 9b, 9c)
  const bottomParts: string[] = [];
  const b9a = generateBlock('9a', ctx);
  if (b9a) bottomParts.push(b9a);
  const b9b = generateBlock('9b', ctx);
  if (b9b) bottomParts.push(b9b);
  const b9c = generateBlock('9c', ctx);
  if (b9c) bottomParts.push(b9c);
  const bottomText = bottomParts.join('\n');

  let assistantPrefill: string | undefined;

  // Handle Continuation (bottom blocks are attached once by the builder after budget fitting)
  if (ctx.continuation) {
    const partial = normalizeHtmlQuirks(stripOutOfBand(ctx.continuation.partial));
    if (ctx.provider.prefill) {
      assistantPrefill = applyMacros(partial, vars);
    } else {
      // Without prefill: partial is pushed as last assistant turn
      filtered.push({
        role: 'assistant',
        content: applyMacros(partial, vars)
      });
      // Synthetic user nudge; the builder attaches bottom blocks to it
      filtered.push({
        role: 'user',
        content: applyMacros(CONTINUATION_NO_PREFILL_NUDGE, vars)
      });
    }
  } else {
    // Normal turn
    if (filtered.length === 0 || filtered[filtered.length - 1].role === 'assistant') {
      // Ending on assistant or empty: append synthetic continue scene.
      // Bottom blocks are attached once by the builder after budget fitting.
      filtered.push({
        role: 'user',
        content: applyMacros(SYNTHETIC_CONTINUE_SCENE, vars)
      });
    }
  }

  // Ensure user-first
  if (filtered.length > 0 && filtered[0].role === 'assistant') {
    filtered.unshift({
      role: 'user',
      content: SYNTHETIC_SCENE_BEGINS
    });
  }

  return {
    messages: filtered,
    assistantPrefill,
    bottomText,
    skippedTurns,
    warnings
  };
}

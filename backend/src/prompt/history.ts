import {
  stripOutOfBand,
  serializeSegments,
  applyMacros,
  type MessagePayload
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

    if (turn.role === 'assistant') {
      // Strip out-of-band state & reasoning
      const cleaned = stripOutOfBand(turn.content);
      filtered.push({
        role: 'assistant',
        content: applyMacros(cleaned, vars)
      });
    } else if (turn.role === 'user') {
      if (turn.narrativeRole === 'persona') {
        filtered.push({
          role: 'user',
          content: applyMacros(turn.content, vars)
        });
      } else {
        // Multi-track authoring: wrap in narrative header
        const segDialect = dialect === 'classic' ? 'directive' : dialect;
        const serialized = serializeSegments(
          [{ kind: turn.narrativeRole, name: turn.senderName, text: turn.content }],
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
    const partial = stripOutOfBand(ctx.continuation.partial);
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

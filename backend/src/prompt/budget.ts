import { encode as encodeCl100k } from 'gpt-tokenizer/encoding/cl100k_base';
import { encode as encodeO200k } from 'gpt-tokenizer/encoding/o200k_base';
import { encode as encodeR50k } from 'gpt-tokenizer/encoding/r50k_base';
import type { MessagePayload } from '@formatavern/shared';
import { PromptBudgetError } from './types';
import { SYNTHETIC_SCENE_BEGINS } from './templates';

export type TokenizerFamily = 'o200k' | 'cl100k' | 'r50k';

/**
 * Closest local encoding for a model id. OpenAI families map exactly;
 * everything else (Claude, Gemini, Llama, Mistral, Qwen, custom, unknown)
 * is counted with cl100k as a documented approximation — closer than
 * character math, but never exact. Full native tokenizers for those
 * families need model files and are tracked as future work.
 */
export function tokenizerFamilyForModel(model?: string | null): TokenizerFamily {
  const m = (model ?? '').toLowerCase();
  if (/(^|[^a-z0-9])(o1|o3|o4|gpt-4o|gpt-4\.1|gpt-5|codex)([^a-z0-9]|$)/.test(m)) {
    return 'o200k';
  }
  if (/(davinci|curie|babbage|ada)/.test(m)) {
    return 'r50k';
  }
  return 'cl100k';
}

function encodeWithFamily(text: string, family: TokenizerFamily): number[] {
  if (family === 'o200k') return encodeO200k(text, { disallowedSpecial: new Set() } as any);
  if (family === 'r50k') return encodeR50k(text, { disallowedSpecial: new Set() } as any);
  return encodeCl100k(text, { disallowedSpecial: new Set() } as any);
}

export function countTokens(text: string, model?: string | null): { tokens: number; warning?: string } {
  if (!text) return { tokens: 0 };

  try {
    const encoded = encodeWithFamily(text, tokenizerFamilyForModel(model));
    return { tokens: encoded.length };
  } catch {
    const estimate = Math.ceil(text.length / 3.5);
    return {
      tokens: estimate,
      warning: 'tokenizer encode failed; fell back to character length estimate'
    };
  }
}

export interface FitHistoryOptions {
  historyMessages: MessagePayload[]; // without bottom blocks attached yet
  staticTokens: number;
  bottomTokens: number;
  contextLength: number;
  reservedCompletion: number;
  safetyFactor?: number;
  model?: string | null;
}

export interface FitHistoryResult {
  fittedMessages: MessagePayload[];
  droppedTurns: number;
  historyTokens: number;
  totalTokens: number;
  availableTokens: number;
  warnings: string[];
}

/**
 * Effective context window for budgeting: the manual setting capped by the
 * model's own window when known. The model is a ceiling, never a floor —
 * a manual value below the model window stands unchanged, and an unknown
 * model window leaves the manual value alone.
 */
export function effectiveContextLength(manual: number, modelWindow?: number | null): number {
  if (typeof modelWindow === 'number' && Number.isFinite(modelWindow) && modelWindow > 0) {
    return Math.min(manual, Math.floor(modelWindow));
  }
  return manual;
}

export function fitHistory(opts: FitHistoryOptions): FitHistoryResult {
  const warnings: string[] = [];
  const safety = opts.safetyFactor ?? 0.9;
  const rawBudget = Math.floor((opts.contextLength - opts.reservedCompletion) * safety);
  const availableForHistory = rawBudget - opts.staticTokens - opts.bottomTokens;

  const msgs = opts.historyMessages;
  if (msgs.length === 0) {
    const total = opts.staticTokens + opts.bottomTokens;
    return {
      fittedMessages: [],
      droppedTurns: 0,
      historyTokens: 0,
      totalTokens: total,
      availableTokens: rawBudget,
      warnings
    };
  }

  // Precompute token counts for each message
  const msgCosts: number[] = [];
  for (const m of msgs) {
    const c = countTokens(m.content, opts.model);
    if (c.warning) warnings.push(c.warning);
    // +4 tokens per-message overhead
    msgCosts.push(c.tokens + 4);
  }

  // The last turn (trigger turn) is mandatory
  const lastIndex = msgs.length - 1;
  const triggerCost = msgCosts[lastIndex];

  if (triggerCost > availableForHistory) {
    const total = opts.staticTokens + triggerCost + opts.bottomTokens;
    throw new PromptBudgetError({
      static: opts.staticTokens,
      history: triggerCost,
      bottom: opts.bottomTokens,
      total,
      available: rawBudget,
      droppedTurns: msgs.length - 1
    });
  }

  // Walk newest to oldest accumulating
  const keptIndices: number[] = [lastIndex];
  let accumulatedHistoryTokens = triggerCost;
  let droppedTurns = 0;

  for (let i = lastIndex - 1; i >= 0; i--) {
    const cost = msgCosts[i];
    if (accumulatedHistoryTokens + cost <= availableForHistory) {
      keptIndices.unshift(i);
      accumulatedHistoryTokens += cost;
    } else {
      // Drop this turn and all older turns
      droppedTurns = i + 1;
      break;
    }
  }

  let fitted = keptIndices.map((idx) => ({ ...msgs[idx] }));

  // ensureUserFirst after truncation: if first turn is assistant, prepend [Scene begins.]
  if (fitted.length > 0 && fitted[0].role === 'assistant') {
    const sceneBeginsCost = countTokens(SYNTHETIC_SCENE_BEGINS, opts.model).tokens + 4;
    // If adding [Scene begins.] would exceed budget and we have older turns before trigger:
    while (
      accumulatedHistoryTokens + sceneBeginsCost > availableForHistory &&
      fitted.length > 1
    ) {
      const removed = fitted.shift()!;
      const removedCost = countTokens(removed.content, opts.model).tokens + 4;
      accumulatedHistoryTokens -= removedCost;
      droppedTurns++;
    }

    if (fitted[0].role === 'assistant') {
      fitted.unshift({ role: 'user', content: SYNTHETIC_SCENE_BEGINS });
      accumulatedHistoryTokens += sceneBeginsCost;
    }
  }

  const totalTokens = opts.staticTokens + accumulatedHistoryTokens + opts.bottomTokens;

  return {
    fittedMessages: fitted,
    droppedTurns,
    historyTokens: accumulatedHistoryTokens,
    totalTokens,
    availableTokens: rawBudget,
    warnings
  };
}

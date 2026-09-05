import { encode } from 'gpt-tokenizer/encoding/cl100k_base';
import type { MessagePayload } from '@formatavern/shared';
import { PromptBudgetError } from './types';
import { SYNTHETIC_SCENE_BEGINS } from './templates';

export function countTokens(text: string): { tokens: number; warning?: string } {
  if (!text) return { tokens: 0 };

  try {
    const encoded = encode(text, { disallowedSpecial: new Set() } as any);
    return { tokens: encoded.length };
  } catch {
    const estimate = Math.ceil(text.length / 3.5);
    return {
      tokens: estimate,
      warning: 'gpt-tokenizer encode failed; fell back to character length estimate'
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
}

export interface FitHistoryResult {
  fittedMessages: MessagePayload[];
  droppedTurns: number;
  historyTokens: number;
  totalTokens: number;
  availableTokens: number;
  warnings: string[];
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
    const c = countTokens(m.content);
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
    const sceneBeginsCost = countTokens(SYNTHETIC_SCENE_BEGINS).tokens + 4;
    // If adding [Scene begins.] would exceed budget and we have older turns before trigger:
    while (
      accumulatedHistoryTokens + sceneBeginsCost > availableForHistory &&
      fitted.length > 1
    ) {
      const removed = fitted.shift()!;
      const removedCost = countTokens(removed.content).tokens + 4;
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

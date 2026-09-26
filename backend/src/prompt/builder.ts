import { buildStopSequences, applyMacros, resolveCharacterName } from '@formatavern/shared';
import type { PromptContext, BuiltPrompt, BlockReport, BlockId } from './types';
import { CANONICAL_BLOCK_IDS } from './types';
import { generateBlock, getDialect } from './blocks';
import { serializeHistory } from './history';
import { countTokens, fitHistory } from './budget';

export function buildPrompt(ctx: PromptContext): BuiltPrompt {
  const warnings: string[] = [];
  const model = ctx.provider.model;
  const vars = { char: resolveCharacterName(ctx.character), user: ctx.persona.name };
  const dialect = getDialect(ctx);

  // 1. Generate Static System Blocks (1, 1b, 1c, 2, 3, 4, 5, 6, 6b, 7, 7b).
  // 1b always reports excluded (retired): the response-format spec rides the
  // closing block 9c at the end of the prompt (post-history, closest to generation).
  // Block 5 (example dialogue) is budgeted, not sacred: pinned examples join
  // the static pile (history shrinks first); unpinned examples take whatever
  // the fitted history leaves over.
  const blockReportsMap = new Map<BlockId, BlockReport>();
  const STATIC_ORDER: BlockId[] = ['1', '1b', '1c', '2', '3', '4', '5', '6', '6b', '7', '7b'];
  const staticContents = new Map<BlockId, string>();
  const staticTokenCounts = new Map<BlockId, number>();

  for (const id of STATIC_ORDER) {
    const content = generateBlock(id, ctx, warnings);
    if (content === null || content.trim().length === 0) {
      if (id !== '5') {
        blockReportsMap.set(id, {
          id,
          included: false,
          tokens: 0,
          reason: skipReason(id, ctx)
        });
      }
      continue;
    }
    const c = countTokens(content, model);
    if (c.warning) warnings.push(c.warning);
    staticContents.set(id, content);
    staticTokenCounts.set(id, c.tokens);
    if (id !== '5') {
      blockReportsMap.set(id, {
        id,
        included: true,
        tokens: c.tokens,
        text: content
      });
    }
  }

  const pinExamples = ctx.budget.pinExamples ?? false;
  const exampleContent = staticContents.get('5');
  const exampleTokens = exampleContent !== undefined ? (staticTokenCounts.get('5') ?? 0) : 0;
  let examplesIncluded = exampleContent !== undefined && pinExamples;

  const buildSystemPrompt = (): string =>
    STATIC_ORDER.filter((id) => id !== '5' || examplesIncluded)
      .map((id) => staticContents.get(id))
      .filter((t): t is string => typeof t === 'string')
      .join('\n\n');

  let systemPrompt = buildSystemPrompt();
  let staticTokens = countTokens(systemPrompt, model).tokens;

  // 2. Generate Bottom Blocks (9a, 9b, 9c)
  const bottomBlockIds: BlockId[] = ['9a', '9b', '9c'];
  const bottomParts: string[] = [];

  for (const id of bottomBlockIds) {
    const content = generateBlock(id, ctx, warnings);
    if (content !== null && content.trim().length > 0) {
    const c = countTokens(content, model);
    if (c.warning) warnings.push(c.warning);
    blockReportsMap.set(id, {
        id,
        included: true,
        tokens: c.tokens,
        text: content
      });
      bottomParts.push(content);
    } else {
      blockReportsMap.set(id, {
        id,
        included: false,
        tokens: 0,
        reason: skipReason(id, ctx)
      });
    }
  }

  const bottomText = bottomParts.join('\n');
  const bottomTokens = bottomText ? countTokens(bottomText, model).tokens : 0;

  // 3. Serialize History (Block 8). serializeHistory returns plain messages
  // with no bottom blocks attached; step 5 attaches them exactly once.
  const historyRes = serializeHistory(ctx);
  warnings.push(...historyRes.warnings);

  const rawHistoryMessages = historyRes.messages;
  let rawHistoryTokens = 0;
  for (const m of rawHistoryMessages) {
    rawHistoryTokens += countTokens(m.content, model).tokens + 4;
  }
  blockReportsMap.set('8', {
    id: '8',
    included: rawHistoryMessages.length > 0,
    tokens: rawHistoryTokens
  });

  // 4. Fit History under budget
  const fitRes = fitHistory({
    historyMessages: rawHistoryMessages,
    staticTokens,
    bottomTokens,
    contextLength: ctx.budget.contextLength,
    reservedCompletion: ctx.budget.reservedCompletion,
    safetyFactor: ctx.budget.safetyFactor,
    model: ctx.provider.model
  });
  warnings.push(...fitRes.warnings);

  // 4b. Unpinned examples take the fitted history's leftover (if any).
  if (exampleContent !== undefined && !pinExamples) {
    const leftover = fitRes.availableTokens - staticTokens - fitRes.historyTokens - bottomTokens;
    if (exampleTokens <= leftover) {
      examplesIncluded = true;
      systemPrompt = buildSystemPrompt();
      staticTokens = countTokens(systemPrompt, model).tokens;
    }
  }
  blockReportsMap.set('5', {
    id: '5',
    included: examplesIncluded,
    tokens: examplesIncluded ? exampleTokens : 0,
    reason: examplesIncluded
      ? undefined
      : exampleContent === undefined
        ? skipReason('5', ctx)
        : 'dropped over budget (examples unpinned)'
  });

  // 5. Attach bottom blocks (9a, 9b, 9c) to the last user message of the fitted history.
  // This is the single attach point: serializeHistory returns plain messages.
  const finalHistory = fitRes.fittedMessages;
  if (bottomText.length > 0) {
    attachBottomBlocks(finalHistory, bottomText, vars);
  }

  // 5b. Block 8 reports history exactly as sent: post-fit turns and tokens.
  blockReportsMap.set('8', {
    id: '8',
    included: finalHistory.length > 0,
    tokens: fitRes.historyTokens,
    reason:
      finalHistory.length > 0
        ? undefined
        : ctx.history.length === 0
          ? 'no history yet'
          : 'all history dropped over budget'
  });

  // 6. Stop sequences
  const stop = buildStopSequences(dialect, ctx.persona.name, ctx.personaVoicing ?? 'prohibited');

  // 7. Canonical block reports list
  const canonicalReports: BlockReport[] = CANONICAL_BLOCK_IDS.map((id) =>
    blockReportsMap.get(id) ?? { id, included: false, tokens: 0 }
  );

  return {
    systemPrompt,
    history: finalHistory,
    assistantPrefill: historyRes.assistantPrefill,
    stop,
    dialect,
    blocks: canonicalReports,
    tokens: {
      static: staticTokens,
      history: fitRes.historyTokens,
      bottom: bottomTokens,
      total: staticTokens + fitRes.historyTokens + bottomTokens,
      available: fitRes.availableTokens,
      droppedTurns: fitRes.droppedTurns + historyRes.skippedTurns
    },
    warnings
  };
}

const CLASSIC_MODE_REASON = 'classic mode (narrative blocks off)';

function skipReason(id: BlockId, ctx: PromptContext): string {
  const mode = ctx.chat.narrativeMode ?? 'classic';
  switch (id) {
    case '1':
      return 'empty preamble';
    case '1b':
      return 'retired: response-format spec moved to closing block 9c';
    case '1c':
      return 'no provider prompt configured';
    case '2':
      return 'character description blank';
    case '3':
      return 'character personality blank';
    case '4':
      return 'scenario blank';
    case '5':
      return 'no example dialogue';
    case '6':
      return 'no lorebook entries';
    case '6b':
      return mode !== 'narrative' ? CLASSIC_MODE_REASON : 'no side characters present';
    case '7':
      return 'no persona';
    case '7b':
      if (mode !== 'narrative') return CLASSIC_MODE_REASON;
      return ctx.stateEnabled === false ? 'state tracking disabled' : 'no scene state';
    case '9a':
      return 'no standing direction';
    case '9b':
      return 'no director note for this turn';
    case '9c':
      if (mode !== 'narrative') return CLASSIC_MODE_REASON;
      return ctx.stateEnabled === false ? 'state tracking disabled' : 'empty closing instruction';
    default:
      return 'empty';
  }
}

function attachBottomBlocks(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  bottomText: string,
  vars: { char: string; user: string }
) {
  const rendered = applyMacros(bottomText, vars);

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      messages[i].content += '\n\n' + rendered;
      return;
    }
  }

  messages.push({
    role: 'user',
    content: '[Continue the scene.]\n\n' + rendered
  });
}

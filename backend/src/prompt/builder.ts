import { buildStopSequences, applyMacros } from '@formatavern/shared';
import type { PromptContext, BuiltPrompt, BlockReport, BlockId } from './types';
import { CANONICAL_BLOCK_IDS } from './types';
import { generateBlock, getDialect } from './blocks';
import { serializeHistory } from './history';
import { countTokens, fitHistory } from './budget';

export function buildPrompt(ctx: PromptContext): BuiltPrompt {
  const warnings: string[] = [];
  const vars = { char: ctx.character.name, user: ctx.persona.name };
  const dialect = getDialect(ctx);

  // 1. Generate Static System Blocks (1, 1b, 1c, 2, 3, 4, 5, 6, 6b, 7, 7b)
  const blockReportsMap = new Map<BlockId, BlockReport>();
  const staticBlockIds: BlockId[] = ['1', '1b', '1c', '2', '3', '4', '5', '6', '6b', '7', '7b'];
  const includedSystemBlocks: string[] = [];

  for (const id of staticBlockIds) {
    const content = generateBlock(id, ctx, warnings);
    if (content !== null && content.trim().length > 0) {
      const c = countTokens(content);
      if (c.warning) warnings.push(c.warning);
      blockReportsMap.set(id, {
        id,
        included: true,
        tokens: c.tokens,
        text: content
      });
      includedSystemBlocks.push(content);
    } else {
      blockReportsMap.set(id, {
        id,
        included: false,
        tokens: 0,
        reason: skipReason(id, ctx)
      });
    }
  }

  const systemPrompt = includedSystemBlocks.join('\n\n');
  const staticTokens = countTokens(systemPrompt).tokens;

  // 2. Generate Bottom Blocks (9a, 9b, 9c)
  const bottomBlockIds: BlockId[] = ['9a', '9b', '9c'];
  const bottomParts: string[] = [];

  for (const id of bottomBlockIds) {
    const content = generateBlock(id, ctx, warnings);
    if (content !== null && content.trim().length > 0) {
      const c = countTokens(content);
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
  const bottomTokens = bottomText ? countTokens(bottomText).tokens : 0;

  // 3. Serialize History (Block 8). serializeHistory returns plain messages
  // with no bottom blocks attached; step 5 attaches them exactly once.
  const historyRes = serializeHistory(ctx);
  warnings.push(...historyRes.warnings);

  const rawHistoryMessages = historyRes.messages;
  let rawHistoryTokens = 0;
  for (const m of rawHistoryMessages) {
    rawHistoryTokens += countTokens(m.content).tokens + 4;
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
    safetyFactor: ctx.budget.safetyFactor
  });
  warnings.push(...fitRes.warnings);

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
      total: fitRes.totalTokens,
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
      return mode !== 'narrative' ? CLASSIC_MODE_REASON : 'empty narrative template';
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
      return mode !== 'narrative' ? CLASSIC_MODE_REASON : 'no scene state';
    case '9a':
      return 'no standing direction';
    case '9b':
      return 'no director note for this turn';
    case '9c':
      return mode !== 'narrative' ? CLASSIC_MODE_REASON : 'empty closing instruction';
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

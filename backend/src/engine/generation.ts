import {
  parseEnvelope,
  resolveState,
  type MessageMetadata,
  type MessageMetrics
} from '@formatavern/shared';
import type { Repositories } from '../db/contracts';
import type { GenerationHub, GenerationJob } from './contracts';
import { normalizeNpcKey } from './context';

type FinishReason = 'stop' | 'length' | 'aborted' | 'content_filter';

export async function runGeneration(
  job: GenerationJob,
  deps: { repos: Repositories; hub: GenerationHub; now?: () => number }
): Promise<void> {
  const nowFn = deps.now ?? Date.now;
  const startTime = nowFn();
  const flushIntervalMs = job.flushIntervalMs ?? 500;

  const handle = deps.hub.register({
    messageId: job.assistantId,
    chatId: job.chatId
  });

  let buffer = job.resume?.content ?? '';
  handle.updateSnapshot(buffer);

  let ttftMs: number | undefined;
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;
  let finishReason: FinishReason = 'stop';
  let streamError: { message: string; recoverable: boolean } | null = null;
  let truncatedUpstream = false;
  let agencyAborted = false;
  let dirty = false;
  let lastFlushAt = startTime;
  let flushTimer: any = null;
  let thinkStartTime: number | undefined;
  let thinkEndTime: number | undefined;
  let thinkOpen = false;

  const runAgencyCheck = (): boolean => {
    if (agencyAborted || truncatedUpstream) return false;
    const checkRes = parseEnvelope(buffer, { ...job.parseOptions, streaming: true });
    if (checkRes.truncatedAt === 'persona') {
      agencyAborted = true;
      truncatedUpstream = true;
      if (checkRes.truncatedIndex !== null && checkRes.truncatedIndex !== undefined) {
        buffer = buffer.slice(0, checkRes.truncatedIndex);
      }
      handle.updateSnapshot(buffer);
      deps.hub.abort(job.assistantId, 'agency');
      return true;
    }
    return false;
  };

  const flush = (): void => {
    if (!dirty) return;
    dirty = false;
    lastFlushAt = nowFn();

    runAgencyCheck();
    const parseRes = parseEnvelope(buffer, { ...job.parseOptions, streaming: true });

    try {
      deps.repos.messages.updateStreaming(job.assistantId, {
        content: buffer,
        segments: parseRes.segments
      });
    } catch (err) {
      console.error(`[generation] flush failed for ${job.assistantId}:`, err);
    }
  };

  const scheduleFlush = (): void => {
    dirty = true;
    if (flushTimer !== null) return;
    const elapsed = nowFn() - lastFlushAt;
    const delay = Math.max(0, flushIntervalMs - elapsed);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, delay);
  };

  // Synchronously emit start event
  handle.emit({
    type: 'start',
    messageId: job.assistantId,
    chatId: job.chatId,
    parentId: job.parentId,
    userMessageId: job.userMessageId,
    resumedFrom: job.resume ? job.resume.content.length : undefined
  });

  try {
    try {
      for await (const ev of job.provider.generate(job.request, handle.controller.signal)) {
        if (ev.type === 'token') {
          if (ttftMs === undefined) {
            ttftMs = nowFn() - startTime;
          }
          if (truncatedUpstream) {
            continue;
          }
          buffer += ev.text;
          handle.updateSnapshot(buffer);
          handle.emit({ type: 'token', text: ev.text });

          // Scan only the fresh token, not the whole buffer: provider-emitted
          // <think> markers arrive as their own tokens and model-owned tags
          // arrive inside content deltas. A tag split across two frames just
          // yields no duration; persistence comes from parseEnvelope anyway.
          if (!thinkOpen && (ev.text.includes('<think') || ev.text.includes('<thinking') || ev.text.includes('<reasoning'))) {
            thinkOpen = true;
            thinkStartTime = nowFn();
          }
          if (thinkOpen && thinkEndTime === undefined && (ev.text.includes('</think>') || ev.text.includes('</thinking>') || ev.text.includes('</reasoning>'))) {
            thinkEndTime = nowFn();
          }

          if (ev.text.includes('\n')) {
            runAgencyCheck();
          }
          scheduleFlush();
        } else if (ev.type === 'usage') {
          promptTokens = ev.promptTokens;
          completionTokens = ev.completionTokens;
          handle.emit({
            type: 'usage',
            promptTokens: ev.promptTokens,
            completionTokens: ev.completionTokens
          });
        } else if (ev.type === 'done') {
          finishReason = ev.finishReason;
        } else if (ev.type === 'error') {
          streamError = {
            message: ev.message,
            recoverable: ev.recoverable
          };
        }
      }
    } catch (err) {
      if (agencyAborted) {
        // Expected abort due to agency check
      } else if (handle.controller.signal.aborted) {
        finishReason = 'aborted';
      } else {
        streamError = {
          message: err instanceof Error ? err.message : String(err),
          recoverable: false
        };
      }
    }
  } finally {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    try {
      if (thinkOpen && thinkEndTime === undefined) {
        thinkEndTime = nowFn();
      }
      const reasoningDurationMs =
        thinkStartTime !== undefined && thinkEndTime !== undefined
          ? Math.max(0, thinkEndTime - thinkStartTime)
          : undefined;

      // 1. Final parse
      const result = parseEnvelope(buffer, { ...job.parseOptions, streaming: false });

      // 2. Status
      let status: 'complete' | 'aborted' | 'error';
      if (streamError !== null) {
        status = 'error';
      } else if (finishReason === 'aborted' && !agencyAborted) {
        status = 'aborted';
      } else {
        status = 'complete';
      }

      // 3. State
      const stateRes =
        status === 'error'
          ? { state: job.previousState, source: 'inherited' as const, warnings: [] }
          : resolveState(job.previousState, result.statePatch, job.stateSchema);

      // 4. Metrics
      const existingRow = deps.repos.messages.get(job.assistantId);
      let durationMs = Math.max(0, nowFn() - startTime);
      let finalCompletionTokens = completionTokens;
      let finalPromptTokens = promptTokens;
      let finalTtftMs = ttftMs;

      if (existingRow?.metrics) {
        durationMs += existingRow.metrics.durationMs ?? 0;
        if (existingRow.metrics.completionTokens !== undefined) {
          finalCompletionTokens = (existingRow.metrics.completionTokens ?? 0) + (completionTokens ?? 0);
        }
        if (finalPromptTokens === undefined) {
          finalPromptTokens = existingRow.metrics.promptTokens;
        }
        if (finalTtftMs === undefined) {
          finalTtftMs = existingRow.metrics.ttftMs;
        }
      }

      const metrics: MessageMetrics = {
        provider: job.provider.id,
        model: job.model,
        promptTokensEstimated: job.promptTokensEstimated,
        promptTokens: finalPromptTokens,
        completionTokens: finalCompletionTokens,
        durationMs,
        ttftMs: finalTtftMs,
        finishReason: agencyAborted ? 'stop' : finishReason,
        droppedTurns: job.droppedTurns
      };

      // 5. Metadata
      let finalReasoning: string | undefined;
      if (result.reasoning && result.reasoning.trim().length > 0) {
        const raw = result.reasoning.trim();
        finalReasoning = raw.length > 16_000 ? raw.slice(0, 16_000) + '\n\n[Reasoning truncated]' : raw;
      }

      const existingMeta = existingRow?.metadata ?? {};
      const metadata: MessageMetadata = {
        ...existingMeta,
        parse: {
          dialect: result.dialect,
          parserVersion: result.parserVersion,
          adherent: result.adherent,
          warnings: result.warnings.map((w) => w.code),
          truncatedAt: agencyAborted ? 'persona' : result.truncatedAt
        },
        stateSource: stateRes.source,
        stateWarnings: stateRes.warnings.length > 0 ? stateRes.warnings : undefined,
        reasoning: finalReasoning ?? existingMeta.reasoning,
        reasoningDurationMs: finalReasoning ? (reasoningDurationMs ?? existingMeta.reasoningDurationMs) : undefined,
        error: streamError ?? existingMeta.error
      };

      // 6. Single transaction
      try {
        deps.repos.transaction(() => {
          deps.repos.messages.finalize(job.assistantId, {
            content: buffer,
            segments: result.segments,
            state: stateRes.state,
            status,
            metrics,
            metadata
          });

          const chat = deps.repos.chats.get(job.chatId);
          if (chat) {
            const npcs = { ...(chat.metadata.npcs ?? {}) };
            let npcsChanged = false;
            for (const seg of result.segments) {
              if (seg.kind === 'npc' && seg.name) {
                const key = normalizeNpcKey(seg.name);
                if (!npcs[key]) {
                  npcs[key] = { displayName: seg.name };
                  npcsChanged = true;
                }
              }
            }
            if (npcsChanged) {
              chat.metadata.npcs = npcs;
            }
            chat.metadata.currentState = stateRes.state;
            deps.repos.chats.update(job.chatId, {
              metadata: chat.metadata,
              updatedAt: nowFn()
            });
          }
        });
      } catch (finalizeErr) {
        console.error(`[generation] finalize transaction failed for ${job.assistantId}:`, finalizeErr);
        try {
          deps.repos.messages.finalize(job.assistantId, {
            content: buffer,
            segments: [],
            state: job.previousState,
            status: 'error',
            metrics: null,
            metadata: {
              ...existingMeta,
              error: {
                message: `finalize failed: ${finalizeErr instanceof Error ? finalizeErr.message : String(finalizeErr)}`,
                recoverable: false
              }
            }
          });
        } catch (secondErr) {
          console.error(`[generation] fallback error finalize failed for ${job.assistantId}:`, secondErr);
        }
        streamError = {
          message: `finalize failed: ${finalizeErr instanceof Error ? finalizeErr.message : String(finalizeErr)}`,
          recoverable: false
        };
        status = 'error';
      }

      // 7. Emit terminal event
      const finalMessage = deps.repos.messages.get(job.assistantId);
      if (status === 'error' || streamError) {
        if (!finalMessage) {
          throw new Error(`Message ${job.assistantId} not found after error finalize`);
        }
        handle.emit({
          type: 'error',
          error: streamError ?? { message: 'Generation failed', recoverable: false },
          message: finalMessage
        });
      } else {
        if (!finalMessage) {
          throw new Error(`Message ${job.assistantId} not found after finalize`);
        }
        handle.emit({
          type: 'done',
          message: finalMessage
        });
      }
    } finally {
      handle.close();
    }
  }
}

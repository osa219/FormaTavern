import {
  type LLMProvider,
  type LLMRequest,
  type ModelInfo,
  type StreamEvent,
  type MessagePayload,
  type AbortSignalLike
} from '@formatavern/shared';
import { parseSseBytes } from './sse';
import { coalesceConsecutiveRoles, ensureUserFirst } from './utils';
import type { FetchFn } from './openai-compatible';

export const GEMINI_INTERACTIONS_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiInteractionsConfig {
  apiKey: string;
  defaultModel?: string;
  baseUrl?: string;
  fetch?: FetchFn;
  idleTimeoutMs?: number; // default 60_000
}

/**
 * Renders chat history as the plain-text transcript the Interactions
 * `input` field expects. FormaTavern manages history client-side, so the
 * provider stays stateless (no `previous_interaction_id` chaining).
 */
export function renderInteractionsTranscript(messages: MessagePayload[]): string {
  return messages
    .map((m) => {
      const role = m.role === 'assistant' ? 'Assistant' : m.role === 'system' ? 'System' : 'User';
      return `${role}: ${m.content}`;
    })
    .join('\n\n');
}

const THINK_OPEN = '<think>';
const THINK_CLOSE = '</think>';

export class GeminiInteractionsProvider implements LLMProvider {
  id = 'gemini-interactions';
  capabilities = {
    chatCompletion: true,
    textCompletion: false,
    listModels: true,
    prefill: false,
    nativeStateChannel: false
  };

  private baseUrl: string;
  private apiKey: string;
  private defaultModel: string;
  private fetchFn: FetchFn;
  private idleTimeoutMs: number;

  constructor(cfg: GeminiInteractionsConfig) {
    if (!cfg.apiKey || cfg.apiKey.trim() === '') {
      throw new Error('GeminiInteractionsProvider requires an apiKey');
    }
    this.baseUrl = (cfg.baseUrl ?? GEMINI_INTERACTIONS_BASE_URL).trim().replace(/\/+$/, '');
    this.apiKey = cfg.apiKey;
    this.defaultModel = cfg.defaultModel ?? 'gemini-3.5-flash';
    this.fetchFn = (cfg.fetch ?? globalThis.fetch) as FetchFn;
    this.idleTimeoutMs = cfg.idleTimeoutMs ?? 60_000;
  }

  private scrub(msg: string): string {
    if (!this.apiKey) return msg;
    return msg.replaceAll(this.apiKey, '[REDACTED]');
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await this.fetchFn(`${this.baseUrl}/models`, {
        headers: { 'x-goog-api-key': this.apiKey }
      });
      if (!res.ok) return [];
      const json = (await res.json()) as any;
      const models = Array.isArray(json?.models) ? json.models : [];
      return models
        .filter((m: any) => typeof m?.name === 'string')
        .map((m: any) => {
          const id = m.name.startsWith('models/') ? m.name.slice('models/'.length) : m.name;
          return {
            id,
            name: m.displayName ?? id,
            contextLength: m.inputTokenLimit ?? 8192
          };
        });
    } catch {
      return [];
    }
  }

  async *generate(req: LLMRequest, signal?: AbortSignalLike): AsyncIterable<StreamEvent> {
    if (signal?.aborted) {
      yield { type: 'done', finishReason: 'aborted' };
      return;
    }

    const rawMessages: MessagePayload[] = [...req.history];
    let messages = ensureUserFirst(rawMessages);
    if (req.assistantPrefill) {
      messages.push({ role: 'assistant', content: req.assistantPrefill });
    }
    messages = coalesceConsecutiveRoles(messages);

    const bodyPayload: Record<string, any> = {
      model: req.model ?? this.defaultModel,
      input: renderInteractionsTranscript(messages),
      stream: true
    };
    if (req.systemPrompt) {
      bodyPayload.system_instruction = req.systemPrompt;
    }
    // Only temperature is passed through: Gemini 3 guidance discourages
    // retuning top_p/top_k, and maxTokens has no verified Interactions
    // equivalent, so both are intentionally omitted.
    if (req.temperature !== undefined) {
      bodyPayload.generation_config = { temperature: req.temperature };
    }

    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/interactions?alt=sse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey
        },
        body: JSON.stringify(bodyPayload),
        signal: signal as any
      });
    } catch (err: any) {
      if (signal?.aborted || err?.name === 'AbortError') {
        yield { type: 'done', finishReason: 'aborted' };
        return;
      }
      yield {
        type: 'error',
        message: this.scrub(`Network error: ${err?.message ?? 'unknown'}`),
        recoverable: true
      };
      return;
    }

    if (signal?.aborted) {
      yield { type: 'done', finishReason: 'aborted' };
      return;
    }

    if (!res.ok) {
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch {}

      let errMsg = bodyText;
      try {
        const parsed = JSON.parse(bodyText);
        errMsg = parsed?.error?.message ?? errMsg;
      } catch {}

      const status = res.status;
      yield {
        type: 'error',
        message: this.scrub(`Gemini ${status}: ${errMsg}`),
        recoverable: status === 408 || status === 429 || status >= 500
      };
      return;
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream')) {
      yield {
        type: 'error',
        message: this.scrub(
          `Gemini 200: unexpected content-type "${contentType}" (expected text/event-stream)`
        ),
        recoverable: true
      };
      return;
    }

    if (!res.body) {
      yield {
        type: 'error',
        message: 'Gemini 200: response body is null',
        recoverable: true
      };
      return;
    }

    let terminalEmitted = false;
    let thinkOpen = false;

    const reader = res.body.getReader();

    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;

    const resetIdleTimer = () => {
      if (timeoutTimer !== undefined) clearTimeout(timeoutTimer);
      timeoutTimer = setTimeout(async () => {
        timedOut = true;
        try {
          await reader.cancel('idle timeout');
        } catch {}
      }, this.idleTimeoutMs);
    };

    const cleanupTimers = () => {
      if (timeoutTimer !== undefined) clearTimeout(timeoutTimer);
    };

    const onSignalAbort = async () => {
      try {
        await reader.cancel('aborted');
      } catch {}
    };
    signal?.addEventListener('abort', onSignalAbort, { once: true });

    try {
      resetIdleTimer();

      const sseFrames = parseSseBytes(reader);

      for await (const frame of sseFrames) {
        resetIdleTimer();

        if (signal?.aborted) {
          yield { type: 'done', finishReason: 'aborted' };
          terminalEmitted = true;
          return;
        }

        if (timedOut) {
          yield {
            type: 'error',
            message: `upstream idle timeout after ${this.idleTimeoutMs}ms`,
            recoverable: true
          };
          terminalEmitted = true;
          return;
        }

        const dataStr = frame.data.trim();
        if (dataStr === '[DONE]') {
          break;
        }

        let json: any;
        try {
          json = JSON.parse(dataStr);
        } catch {
          continue;
        }

        if (json?.error) {
          yield {
            type: 'error',
            message: this.scrub(json.error.message ?? 'Unknown streaming error'),
            recoverable: false
          };
          terminalEmitted = true;
          return;
        }

        const eventType: string = json.event_type ?? '';

        if (eventType === 'step.delta') {
          const delta = json.delta ?? {};
          const text = typeof delta.text === 'string' ? delta.text : '';
          const dtype: string = delta.type ?? 'text';
          if (!text) continue;

          const isThought = /thought|think|reasoning/i.test(dtype);
          if (isThought) {
            if (!thinkOpen) {
              thinkOpen = true;
              yield { type: 'token', text: THINK_OPEN };
            }
            yield { type: 'token', text };
          } else if (dtype === 'text') {
            if (thinkOpen) {
              thinkOpen = false;
              yield { type: 'token', text: `${THINK_CLOSE}\n\n` };
            }
            yield { type: 'token', text };
          }
          // Non-text deltas (image/audio/tool payloads) are ignored: chat only.
          continue;
        }

        if (eventType === 'interaction.completed') {
          break;
        }

        if (eventType === 'interaction.requires_action') {
          // FormaTavern has no tool loop; end cleanly instead of stalling
          // until the idle timeout.
          break;
        }

        if (eventType.endsWith('.failed') || eventType === 'interaction.failed') {
          yield {
            type: 'error',
            message: this.scrub(json.message ?? 'Interaction failed'),
            recoverable: false
          };
          terminalEmitted = true;
          return;
        }

        // interaction.created / interaction.in_progress / step.start /
        // step.stop carry no chat text; ignore.
      }

      if (signal?.aborted) {
        yield { type: 'done', finishReason: 'aborted' };
        terminalEmitted = true;
        return;
      }

      if (timedOut) {
        yield {
          type: 'error',
          message: `upstream idle timeout after ${this.idleTimeoutMs}ms`,
          recoverable: true
        };
        terminalEmitted = true;
        return;
      }

      if (!terminalEmitted) {
        if (thinkOpen) {
          thinkOpen = false;
          yield { type: 'token', text: THINK_CLOSE };
        }
        yield { type: 'done', finishReason: 'stop' };
        terminalEmitted = true;
      }
    } catch (streamErr: any) {
      if (signal?.aborted || streamErr?.name === 'AbortError') {
        if (!terminalEmitted) {
          yield { type: 'done', finishReason: 'aborted' };
          terminalEmitted = true;
        }
      } else if (timedOut) {
        if (!terminalEmitted) {
          yield {
            type: 'error',
            message: `upstream idle timeout after ${this.idleTimeoutMs}ms`,
            recoverable: true
          };
          terminalEmitted = true;
        }
      } else {
        if (!terminalEmitted) {
          yield {
            type: 'error',
            message: this.scrub(streamErr?.message ?? 'Stream read error'),
            recoverable: true
          };
          terminalEmitted = true;
        }
      }
    } finally {
      cleanupTimers();
      signal?.removeEventListener('abort', onSignalAbort);
      try {
        await reader.cancel();
      } catch {}
    }
  }
}

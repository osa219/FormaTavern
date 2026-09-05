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

export type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit | any
) => Promise<Response>;

export interface OpenRouterConfig {
  apiKey: string;
  defaultModel?: string;
  fetch?: FetchFn;
  idleTimeoutMs?: number; // default 60_000
  referer?: string;
  title?: string;
}

export class OpenRouterProvider implements LLMProvider {
  id = 'openrouter';
  capabilities = {
    chatCompletion: true,
    textCompletion: false,
    listModels: true,
    prefill: true,
    nativeStateChannel: false
  };

  private apiKey: string;
  private defaultModel: string;
  private fetchFn: FetchFn;
  private idleTimeoutMs: number;
  private referer: string;
  private title: string;

  constructor(cfg: OpenRouterConfig) {
    this.apiKey = cfg.apiKey;
    this.defaultModel = cfg.defaultModel ?? 'anthropic/claude-3.5-sonnet';
    this.fetchFn = (cfg.fetch ?? globalThis.fetch) as FetchFn;
    this.idleTimeoutMs = cfg.idleTimeoutMs ?? 60_000;
    this.referer = cfg.referer ?? 'http://127.0.0.1:3000';
    this.title = cfg.title ?? 'FormaTavern';
  }

  private scrub(msg: string): string {
    if (!this.apiKey) return msg;
    return msg.replaceAll(this.apiKey, '[REDACTED]');
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await this.fetchFn('https://openrouter.ai/api/v1/models', {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': this.referer,
          'X-Title': this.title
        }
      });
      if (!res.ok) return [];
      const json = (await res.json()) as any;
      if (!json.data || !Array.isArray(json.data)) return [];
      return json.data.map((m: any) => ({
        id: m.id,
        name: m.name ?? m.id,
        contextLength: m.context_length ?? 8192
      }));
    } catch {
      return [];
    }
  }

  async *generate(req: LLMRequest, signal?: AbortSignalLike): AsyncIterable<StreamEvent> {
    // P4: Abort check before fetch
    if (signal?.aborted) {
      yield { type: 'done', finishReason: 'aborted' };
      return;
    }

    // 1. Format messages: [systemPrompt?] + req.history
    const rawMessages: MessagePayload[] = [];
    if (req.systemPrompt) {
      rawMessages.push({ role: 'system', content: req.systemPrompt });
    }
    rawMessages.push(...req.history);

    // 2. ensureUserFirst
    let messages = ensureUserFirst(rawMessages);

    // 3. Trailing prefill
    if (req.assistantPrefill) {
      messages.push({ role: 'assistant', content: req.assistantPrefill });
    }

    // 4. Coalesce consecutive roles
    messages = coalesceConsecutiveRoles(messages);

    // 5. Cap stop sequences at 4
    let stop = req.stop;
    if (stop && stop.length > 4) {
      console.warn(`[OpenRouter] Truncating ${stop.length} stop sequences to 4`);
      stop = stop.slice(0, 4);
    }

    // 6. Build request payload
    const bodyPayload: Record<string, any> = {
      model: req.model ?? this.defaultModel,
      messages,
      stream: true,
      usage: { include: true }
    };

    if (req.temperature !== undefined) bodyPayload.temperature = req.temperature;
    if (req.topP !== undefined) bodyPayload.top_p = req.topP;
    if (req.topK !== undefined) bodyPayload.top_k = req.topK;
    if (req.minP !== undefined) bodyPayload.min_p = req.minP;
    if (req.repetitionPenalty !== undefined) bodyPayload.repetition_penalty = req.repetitionPenalty;
    if (stop !== undefined && stop.length > 0) bodyPayload.stop = stop;
    if (req.maxTokens !== undefined) bodyPayload.max_tokens = req.maxTokens;

    let res: Response;
    try {
      res = await this.fetchFn('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': this.referer,
          'X-Title': this.title
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

    // HTTP Error Handling
    if (!res.ok) {
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch {}

      let errMsg = bodyText;
      try {
        const parsed = JSON.parse(bodyText);
        if (parsed?.error?.message) {
          errMsg = parsed.error.message;
        }
      } catch {}

      const status = res.status;
      let recoverable = false;
      if (status === 408 || status === 429 || status >= 500) {
        recoverable = true;
      } else if (status === 401 || status === 402 || status === 403) {
        recoverable = false;
      } else {
        recoverable = false;
      }

      yield {
        type: 'error',
        message: this.scrub(`OpenRouter ${status}: ${errMsg}`),
        recoverable
      };
      return;
    }

    // Check Content-Type for SSE
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream')) {
      yield {
        type: 'error',
        message: this.scrub(
          `OpenRouter 200: unexpected content-type "${contentType}" (expected text/event-stream)`
        ),
        recoverable: true
      };
      return;
    }

    if (!res.body) {
      yield {
        type: 'error',
        message: 'OpenRouter 200: response body is null',
        recoverable: true
      };
      return;
    }

    // Stream consumption with idle timeout
    let recordedFinishReason: 'stop' | 'length' | undefined;
    let usageEmitted = false;
    let terminalEmitted = false;

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

        // Check error inside frame
        if (json?.error) {
          yield {
            type: 'error',
            message: this.scrub(json.error.message ?? 'Unknown streaming error'),
            recoverable: false
          };
          terminalEmitted = true;
          return;
        }

        // Token
        const delta = json.choices?.[0]?.delta;
        if (delta?.content && delta.content.length > 0) {
          yield { type: 'token', text: delta.content };
        }

        // Record finish reason
        const finishReason = json.choices?.[0]?.finish_reason;
        if (finishReason) {
          recordedFinishReason = finishReason === 'length' ? 'length' : 'stop';
        }

        // Usage
        if (json.usage && !usageEmitted) {
          usageEmitted = true;
          yield {
            type: 'usage',
            promptTokens: json.usage.prompt_tokens ?? 0,
            completionTokens: json.usage.completion_tokens ?? 0
          };
        }
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

      // Finish cleanly
      if (!terminalEmitted) {
        yield {
          type: 'done',
          finishReason: recordedFinishReason ?? 'stop'
        };
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

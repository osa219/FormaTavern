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

export type UsageAccounting = 'stream_options' | 'openrouter' | 'none';

export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey?: string;
  defaultModel?: string;
  extraHeaders?: Record<string, string>;
  extraBody?: Record<string, any>;
  excludeKeys?: string[];
  fetch?: FetchFn;
  idleTimeoutMs?: number;
  allowExtendedSampling?: boolean; // default false: top_k/min_p/repetition_penalty dropped
  usageAccounting?: UsageAccounting; // default 'stream_options'
  errorLabel?: string; // default 'Upstream'; used in error message prefixes
}

/**
 * Joins a base URL and a path with exactly one slash between them.
 */
export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * Normalizes user-supplied endpoint input into a clean base URL:
 * - trims whitespace and trailing slashes
 * - strips a pasted `/chat/completions` or `/models` operation suffix
 * - leaves any version prefix (e.g. `/v1`) intact
 */
export function normalizeBaseUrl(raw: string): string {
  let base = raw.trim().replace(/\/+$/, '');
  base = base.replace(/\/(chat\/completions|models)\/*$/i, '').replace(/\/+$/, '');
  return base;
}

const THINK_OPEN = '<think>';
const THINK_CLOSE = '</think>';

export class OpenAICompatibleProvider implements LLMProvider {
  id = 'openai-compatible';
  capabilities = {
    chatCompletion: true,
    textCompletion: false,
    listModels: true,
    prefill: false,
    nativeStateChannel: false
  };

  protected baseUrl: string;
  protected apiKey?: string;
  protected defaultModel: string;
  protected fetchFn: FetchFn;
  protected idleTimeoutMs: number;
  protected extraHeaders: Record<string, string>;
  protected extraBody: Record<string, any>;
  protected excludeKeys: string[];
  protected allowExtendedSampling: boolean;
  protected usageAccounting: UsageAccounting;
  protected errorLabel: string;

  constructor(cfg: OpenAICompatibleConfig) {
    if (!cfg.baseUrl || cfg.baseUrl.trim() === '') {
      throw new Error('OpenAICompatibleProvider requires a baseUrl');
    }
    this.baseUrl = normalizeBaseUrl(cfg.baseUrl);
    const key = cfg.apiKey?.trim();
    this.apiKey = key ? key : undefined;
    this.defaultModel = cfg.defaultModel ?? 'gpt-4o-mini';
    this.fetchFn = (cfg.fetch ?? globalThis.fetch) as FetchFn;
    this.idleTimeoutMs = cfg.idleTimeoutMs ?? 60_000;
    this.extraHeaders = { ...(cfg.extraHeaders ?? {}) };
    this.extraBody = { ...(cfg.extraBody ?? {}) };
    this.excludeKeys = [...(cfg.excludeKeys ?? [])];
    this.allowExtendedSampling = cfg.allowExtendedSampling ?? false;
    this.usageAccounting = cfg.usageAccounting ?? 'stream_options';
    this.errorLabel = cfg.errorLabel ?? 'Upstream';
  }

  protected scrub(msg: string): string {
    if (!this.apiKey) return msg;
    return msg.replaceAll(this.apiKey, '[REDACTED]');
  }

  protected buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.extraHeaders
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await this.fetchFn(joinUrl(this.baseUrl, '/models'), {
        headers: this.buildHeaders()
      });
      if (!res.ok) return [];
      const json = (await res.json()) as any;
      if (!json.data || !Array.isArray(json.data)) return [];
      return json.data
        .filter((m: any) => typeof m?.id === 'string')
        .map((m: any) => ({
          id: m.id,
          name: m.name ?? m.id,
          contextLength: m.context_length ?? m.contextLength ?? m.max_tokens ?? 8192
        }));
    } catch {
      return [];
    }
  }

  async *generate(req: LLMRequest, signal?: AbortSignalLike): AsyncIterable<StreamEvent> {
    if (signal?.aborted) {
      yield { type: 'done', finishReason: 'aborted' };
      return;
    }

    const rawMessages: MessagePayload[] = [];
    if (req.systemPrompt) {
      rawMessages.push({ role: 'system', content: req.systemPrompt });
    }
    rawMessages.push(...req.history);

    let messages = ensureUserFirst(rawMessages);

    if (req.assistantPrefill) {
      messages.push({ role: 'assistant', content: req.assistantPrefill });
    }

    messages = coalesceConsecutiveRoles(messages);

    let stop = req.stop;
    if (stop && stop.length > 4) {
      console.warn(`[OpenAICompatible] Truncating ${stop.length} stop sequences to 4`);
      stop = stop.slice(0, 4);
    }

    const bodyPayload: Record<string, any> = {
      model: req.model ?? this.defaultModel,
      messages,
      stream: true
    };

    if (req.temperature !== undefined) bodyPayload.temperature = req.temperature;
    if (req.topP !== undefined) bodyPayload.top_p = req.topP;
    if (this.allowExtendedSampling) {
      if (req.topK !== undefined) bodyPayload.top_k = req.topK;
      if (req.minP !== undefined) bodyPayload.min_p = req.minP;
      if (req.repetitionPenalty !== undefined) bodyPayload.repetition_penalty = req.repetitionPenalty;
    }
    if (stop !== undefined && stop.length > 0) bodyPayload.stop = stop;
    if (req.maxTokens !== undefined) bodyPayload.max_tokens = req.maxTokens;

    if (this.usageAccounting === 'openrouter') {
      bodyPayload.usage = { include: true };
    } else if (this.usageAccounting === 'stream_options') {
      bodyPayload.stream_options = { include_usage: true };
    }

    Object.assign(bodyPayload, this.extraBody);
    for (const key of this.excludeKeys) {
      delete bodyPayload[key];
    }

    let res: Response;
    try {
      res = await this.fetchFn(joinUrl(this.baseUrl, '/chat/completions'), {
        method: 'POST',
        headers: this.buildHeaders(),
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
        message: this.scrub(`${this.errorLabel} ${status}: ${errMsg}`),
        recoverable
      };
      return;
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream')) {
      yield {
        type: 'error',
        message: this.scrub(
          `${this.errorLabel} 200: unexpected content-type "${contentType}" (expected text/event-stream)`
        ),
        recoverable: true
      };
      return;
    }

    if (!res.body) {
      yield {
        type: 'error',
        message: `${this.errorLabel} 200: response body is null`,
        recoverable: true
      };
      return;
    }

    let recordedFinishReason: 'stop' | 'length' | undefined;
    let usageEmitted = false;
    let terminalEmitted = false;
    let thinkOpen = false;
    let seenOwnThinkTag = false;

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

        const delta = json.choices?.[0]?.delta;
        const content: string | undefined =
          typeof delta?.content === 'string' && delta.content.length > 0 ? delta.content : undefined;
        const reasoning: string | undefined =
          (typeof delta?.reasoning_content === 'string' && delta.reasoning_content.length > 0
            ? delta.reasoning_content
            : undefined) ??
          (typeof delta?.reasoning === 'string' && delta.reasoning.length > 0
            ? delta.reasoning
            : undefined);

        if (content && content.includes(THINK_OPEN)) {
          seenOwnThinkTag = true;
        }

        if (reasoning) {
          if (!thinkOpen && !seenOwnThinkTag && !reasoning.includes(THINK_OPEN)) {
            thinkOpen = true;
            yield { type: 'token', text: THINK_OPEN };
          }
          yield { type: 'token', text: reasoning };
        }

        if (content) {
          if (thinkOpen) {
            thinkOpen = false;
            yield { type: 'token', text: `${THINK_CLOSE}\n\n` };
          }
          yield { type: 'token', text: content };
        }

        const finishReason = json.choices?.[0]?.finish_reason;
        if (finishReason) {
          recordedFinishReason = finishReason === 'length' ? 'length' : 'stop';
        }

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

      if (!terminalEmitted) {
        if (thinkOpen) {
          thinkOpen = false;
          yield { type: 'token', text: THINK_CLOSE };
        }
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

import { OpenAICompatibleProvider, type FetchFn } from './openai-compatible';

export type { FetchFn };

export interface OpenRouterConfig {
  apiKey: string;
  defaultModel?: string;
  fetch?: FetchFn;
  idleTimeoutMs?: number; // default 60_000
  referer?: string;
  title?: string;
}

export class OpenRouterProvider extends OpenAICompatibleProvider {
  override id = 'openrouter';
  override capabilities = {
    chatCompletion: true,
    textCompletion: false,
    listModels: true,
    prefill: true,
    nativeStateChannel: false
  };

  constructor(cfg: OpenRouterConfig) {
    super({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: cfg.apiKey,
      defaultModel: cfg.defaultModel ?? 'anthropic/claude-3.5-sonnet',
      fetch: cfg.fetch,
      idleTimeoutMs: cfg.idleTimeoutMs,
      extraHeaders: {
        'HTTP-Referer': cfg.referer ?? 'http://127.0.0.1:3000',
        'X-Title': cfg.title ?? 'FormaTavern'
      },
      usageAccounting: 'openrouter',
      allowExtendedSampling: true,
      allowReasoningOff: true,
      reasoningOnEnabled: true,
      errorLabel: 'OpenRouter'
    });
  }
}

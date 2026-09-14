import { OpenAICompatibleProvider, type FetchFn } from './openai-compatible';

export const GEMINI_COMPAT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';

export interface CustomProviderConfig {
  baseUrl: string;
  apiKey?: string;
  defaultModel?: string;
  fetch?: FetchFn;
  idleTimeoutMs?: number;
}

export class CustomProvider extends OpenAICompatibleProvider {
  override id = 'custom';

  constructor(cfg: CustomProviderConfig) {
    super({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      defaultModel: cfg.defaultModel ?? 'default',
      fetch: cfg.fetch,
      idleTimeoutMs: cfg.idleTimeoutMs,
      allowReasoningOff: true,
      errorLabel: 'Custom provider'
    });
  }
}

export interface GeminiProviderConfig {
  apiKey: string;
  defaultModel?: string;
  fetch?: FetchFn;
  idleTimeoutMs?: number;
  baseUrl?: string;
}

export class GeminiProvider extends OpenAICompatibleProvider {
  override id = 'gemini';

  constructor(cfg: GeminiProviderConfig) {
    super({
      baseUrl: cfg.baseUrl ?? GEMINI_COMPAT_BASE_URL,
      apiKey: cfg.apiKey,
      defaultModel: cfg.defaultModel ?? 'gemini-3.5-flash',
      fetch: cfg.fetch,
      idleTimeoutMs: cfg.idleTimeoutMs,
      errorLabel: 'Gemini'
    });
  }
}

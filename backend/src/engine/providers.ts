import {
  DEFAULT_SETTINGS,
  type LLMProvider,
  type ProviderConfig
} from '@formatavern/shared';
import { MockLLMProvider } from '../providers/mock';
import { OpenRouterProvider, type FetchFn } from '../providers/openrouter';
import { CustomProvider, GeminiProvider } from '../providers/presets';
import { GeminiInteractionsProvider } from '../providers/gemini-interactions';
import type { ProviderRegistry, ProviderResolution } from './contracts';
import { ApiError } from './errors';

export interface ProviderRegistryOptions {
  customFetch?: FetchFn;
  mockProvider?: LLMProvider;
}

export interface ResolveSettings {
  provider?: {
    id?: 'mock' | 'openrouter' | 'custom' | 'gemini' | 'gemini-interactions';
    model?: string;
    activeConfigId?: string | null;
  };
  openrouter?: { apiKey?: string };
  custom?: { baseUrl?: string; apiKey?: string };
  gemini?: { apiKey?: string };
  generation?: { contextLength?: number };
}

function evictOldest<K, V>(cache: Map<K, V>, limit: number): void {
  if (cache.size >= limit) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) {
      cache.delete(firstKey);
    }
  }
}

export class ProviderRegistryImpl implements ProviderRegistry {
  private mockProvider: LLMProvider;
  private openRouterCache = new Map<string, OpenRouterProvider>();
  private customCache = new Map<string, CustomProvider>();
  private geminiCache = new Map<string, GeminiProvider>();
  private geminiInteractionsCache = new Map<string, GeminiInteractionsProvider>();
  private customFetch?: FetchFn;

  constructor(options: ProviderRegistryOptions = {}) {
    this.mockProvider = options.mockProvider ?? new MockLLMProvider({ intervalMs: 40 });
    this.customFetch = options.customFetch;
  }

  private openRouterProvider(apiKey: string): OpenRouterProvider {
    let provider = this.openRouterCache.get(apiKey);
    if (!provider) {
      evictOldest(this.openRouterCache, 2);
      provider = new OpenRouterProvider({ apiKey, fetch: this.customFetch });
      this.openRouterCache.set(apiKey, provider);
    }
    return provider;
  }

  private customProvider(baseUrl: string, apiKey?: string): CustomProvider {
    const cacheKey = `${baseUrl}::${apiKey ?? ''}`;
    let provider = this.customCache.get(cacheKey);
    if (!provider) {
      evictOldest(this.customCache, 4);
      provider = new CustomProvider({ baseUrl, apiKey, fetch: this.customFetch });
      this.customCache.set(cacheKey, provider);
    }
    return provider;
  }

  private geminiProvider(apiKey: string): GeminiProvider {
    let provider = this.geminiCache.get(apiKey);
    if (!provider) {
      evictOldest(this.geminiCache, 2);
      provider = new GeminiProvider({ apiKey, fetch: this.customFetch });
      this.geminiCache.set(apiKey, provider);
    }
    return provider;
  }

  private geminiInteractionsProvider(apiKey: string): GeminiInteractionsProvider {
    let provider = this.geminiInteractionsCache.get(apiKey);
    if (!provider) {
      evictOldest(this.geminiInteractionsCache, 2);
      provider = new GeminiInteractionsProvider({ apiKey, fetch: this.customFetch });
      this.geminiInteractionsCache.set(apiKey, provider);
    }
    return provider;
  }

  private static configPromptOf(config: ProviderConfig): string | undefined {
    const prompt = config.customPrompt?.trim();
    return prompt ? prompt : undefined;
  }

  resolve(settings: ResolveSettings, activeConfig: ProviderConfig | null = null): ProviderResolution {
    const contextLength = settings.generation?.contextLength ?? DEFAULT_SETTINGS.generation.contextLength;
    const wantedId = settings.provider?.activeConfigId;
    if (wantedId !== undefined && wantedId !== null && wantedId !== '') {
      if (!activeConfig || activeConfig.id !== wantedId) {
        throw new ApiError('provider_unconfigured', 409, 'Active provider configuration is missing');
      }
      const configPrompt = ProviderRegistryImpl.configPromptOf(activeConfig);
      switch (activeConfig.providerType) {
        case 'openrouter': {
          const apiKey = activeConfig.apiKey || process.env.OPENROUTER_API_KEY;
          if (!apiKey || apiKey.trim() === '') {
            throw new ApiError('provider_unconfigured', 409, 'OpenRouter API key is not configured');
          }
          return {
            provider: this.openRouterProvider(apiKey),
            model: activeConfig.model ?? 'anthropic/claude-3.5-haiku',
            contextLength,
            configPrompt
          };
        }
        case 'custom': {
          const baseUrl = activeConfig.baseUrl?.trim();
          if (!baseUrl) {
            throw new ApiError('provider_unconfigured', 409, 'Custom provider base URL is not configured');
          }
          const apiKey = activeConfig.apiKey || process.env.CUSTOM_API_KEY;
          return {
            provider: this.customProvider(baseUrl, apiKey),
            model: activeConfig.model ?? 'default',
            contextLength,
            configPrompt
          };
        }
        case 'gemini': {
          const apiKey = activeConfig.apiKey || process.env.GEMINI_API_KEY;
          if (!apiKey || apiKey.trim() === '') {
            throw new ApiError('provider_unconfigured', 409, 'Gemini API key is not configured');
          }
          return {
            provider: this.geminiProvider(apiKey),
            model: activeConfig.model ?? 'gemini-3.5-flash',
            contextLength,
            configPrompt
          };
        }
        case 'gemini-interactions': {
          // Native Interactions API; shares the Gemini key section (A12.8).
          const apiKey = activeConfig.apiKey || process.env.GEMINI_API_KEY;
          if (!apiKey || apiKey.trim() === '') {
            throw new ApiError('provider_unconfigured', 409, 'Gemini API key is not configured');
          }
          return {
            provider: this.geminiInteractionsProvider(apiKey),
            model: activeConfig.model ?? 'gemini-3.5-flash',
            contextLength,
            configPrompt
          };
        }
      }
    }

    // Legacy path: singleton settings (pre-configs databases).
    const providerId = settings.provider?.id ?? 'mock';

    if (providerId === 'mock') {
      const rawModel = settings.provider?.model?.trim() ? settings.provider.model : undefined;
      const model =
        rawModel && rawModel.startsWith('mock:') ? rawModel : 'mock:envelope-directive';
      return {
        provider: this.mockProvider,
        model,
        contextLength
      };
    }

    if (providerId === 'openrouter') {
      const apiKey = settings.openrouter?.apiKey || process.env.OPENROUTER_API_KEY;
      if (!apiKey || apiKey.trim() === '') {
        throw new ApiError('provider_unconfigured', 409, 'OpenRouter API key is not configured');
      }
      const model = settings.provider?.model?.trim()
        ? settings.provider.model
        : 'anthropic/claude-3.5-haiku';
      return {
        provider: this.openRouterProvider(apiKey),
        model,
        contextLength
      };
    }

    if (providerId === 'custom') {
      const baseUrl = settings.custom?.baseUrl?.trim();
      if (!baseUrl) {
        throw new ApiError('provider_unconfigured', 409, 'Custom provider base URL is not configured');
      }
      const apiKey = settings.custom?.apiKey || process.env.CUSTOM_API_KEY;
      const model = settings.provider?.model?.trim() ? settings.provider.model : 'default';
      return {
        provider: this.customProvider(baseUrl, apiKey),
        model,
        contextLength
      };
    }

    if (providerId === 'gemini') {
      const apiKey = settings.gemini?.apiKey || process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey.trim() === '') {
        throw new ApiError('provider_unconfigured', 409, 'Gemini API key is not configured');
      }
      const model = settings.provider?.model?.trim() ? settings.provider.model : 'gemini-3.5-flash';
      return {
        provider: this.geminiProvider(apiKey),
        model,
        contextLength
      };
    }

    if (providerId === 'gemini-interactions') {
      // Native Interactions API; shares the Gemini key section (A12.8).
      const apiKey = settings.gemini?.apiKey || process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey.trim() === '') {
        throw new ApiError('provider_unconfigured', 409, 'Gemini API key is not configured');
      }
      const model = settings.provider?.model?.trim() ? settings.provider.model : 'gemini-3.5-flash';
      return {
        provider: this.geminiInteractionsProvider(apiKey),
        model,
        contextLength
      };
    }

    // Default fallback to mock
    const fallbackRaw = settings.provider?.model?.trim() ? settings.provider.model : undefined;
    return {
      provider: this.mockProvider,
      model:
        fallbackRaw && fallbackRaw.startsWith('mock:')
          ? fallbackRaw
          : 'mock:envelope-directive',
      contextLength
    };
  }
}

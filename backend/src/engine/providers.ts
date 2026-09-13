import {
  DEFAULT_SETTINGS,
  type LLMProvider
} from '@formatavern/shared';
import { MockLLMProvider } from '../providers/mock';
import { OpenRouterProvider, type FetchFn } from '../providers/openrouter';
import { CustomProvider, GeminiProvider } from '../providers/presets';
import type { ProviderRegistry, ProviderResolution } from './contracts';
import { ApiError } from './errors';

export interface ProviderRegistryOptions {
  customFetch?: FetchFn;
  mockProvider?: LLMProvider;
}

export class ProviderRegistryImpl implements ProviderRegistry {
  private mockProvider: LLMProvider;
  private openRouterCache = new Map<string, OpenRouterProvider>();
  private customCache = new Map<string, CustomProvider>();
  private geminiCache = new Map<string, GeminiProvider>();
  private customFetch?: FetchFn;

  constructor(options: ProviderRegistryOptions = {}) {
    this.mockProvider = options.mockProvider ?? new MockLLMProvider({ intervalMs: 40 });
    this.customFetch = options.customFetch;
  }

  resolve(settings: {
    provider?: { id?: 'mock' | 'openrouter' | 'custom' | 'gemini'; model?: string };
    openrouter?: { apiKey?: string };
    custom?: { baseUrl?: string; apiKey?: string };
    gemini?: { apiKey?: string };
    generation?: { contextLength?: number };
  }): ProviderResolution {
    const providerId = settings.provider?.id ?? 'mock';
    const contextLength = settings.generation?.contextLength ?? DEFAULT_SETTINGS.generation.contextLength;

    if (providerId === 'mock') {
      const model = settings.provider?.model ?? 'mock:envelope-directive';
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

      let provider = this.openRouterCache.get(apiKey);
      if (!provider) {
        if (this.openRouterCache.size >= 2) {
          const firstKey = this.openRouterCache.keys().next().value;
          if (firstKey) {
            this.openRouterCache.delete(firstKey);
          }
        }

        provider = new OpenRouterProvider({
          apiKey,
          fetch: this.customFetch
        });
        this.openRouterCache.set(apiKey, provider);
      }

      const model = settings.provider?.model ?? 'anthropic/claude-3.5-haiku';
      return {
        provider,
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
      const cacheKey = `${baseUrl}::${apiKey ?? ''}`;
      let provider = this.customCache.get(cacheKey);
      if (!provider) {
        if (this.customCache.size >= 4) {
          const firstKey = this.customCache.keys().next().value;
          if (firstKey) {
            this.customCache.delete(firstKey);
          }
        }

        provider = new CustomProvider({
          baseUrl,
          apiKey,
          fetch: this.customFetch
        });
        this.customCache.set(cacheKey, provider);
      }

      const model = settings.provider?.model ?? 'default';
      return {
        provider,
        model,
        contextLength
      };
    }

    if (providerId === 'gemini') {
      const apiKey = settings.gemini?.apiKey || process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey.trim() === '') {
        throw new ApiError('provider_unconfigured', 409, 'Gemini API key is not configured');
      }

      let provider = this.geminiCache.get(apiKey);
      if (!provider) {
        if (this.geminiCache.size >= 2) {
          const firstKey = this.geminiCache.keys().next().value;
          if (firstKey) {
            this.geminiCache.delete(firstKey);
          }
        }

        provider = new GeminiProvider({
          apiKey,
          fetch: this.customFetch
        });
        this.geminiCache.set(apiKey, provider);
      }

      const model = settings.provider?.model ?? 'gemini-3.5-flash';
      return {
        provider,
        model,
        contextLength
      };
    }

    // Default fallback to mock
    return {
      provider: this.mockProvider,
      model: settings.provider?.model ?? 'mock:envelope-directive',
      contextLength
    };
  }
}

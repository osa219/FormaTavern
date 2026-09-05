import {
  DEFAULT_SETTINGS,
  type LLMProvider
} from '@formatavern/shared';
import { MockLLMProvider } from '../providers/mock';
import { OpenRouterProvider, type FetchFn } from '../providers/openrouter';
import type { ProviderRegistry, ProviderResolution } from './contracts';
import { ApiError } from './errors';

export interface ProviderRegistryOptions {
  customFetch?: FetchFn;
  mockProvider?: LLMProvider;
}

export class ProviderRegistryImpl implements ProviderRegistry {
  private mockProvider: LLMProvider;
  private openRouterCache = new Map<string, OpenRouterProvider>();
  private customFetch?: FetchFn;

  constructor(options: ProviderRegistryOptions = {}) {
    this.mockProvider = options.mockProvider ?? new MockLLMProvider({ intervalMs: 40 });
    this.customFetch = options.customFetch;
  }

  resolve(settings: {
    provider?: { id?: 'mock' | 'openrouter'; model?: string };
    openrouter?: { apiKey?: string };
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

    // Default fallback to mock
    return {
      provider: this.mockProvider,
      model: settings.provider?.model ?? 'mock:envelope-directive',
      contextLength
    };
  }
}

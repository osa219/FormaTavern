import type { LLMProvider } from '@formatavern/shared';
import { MockLLMProvider } from './mock';
import { OpenRouterProvider } from './openrouter';

export * from './mock';
export * from './openrouter';
export * from './utils';
export * from './sse';

export interface ProviderEnv {
  openRouterApiKey?: string;
}

export interface Providers {
  mock: LLMProvider;
  openrouter?: LLMProvider;
}

export function createProviders(env: ProviderEnv = {}): Providers {
  const mock = new MockLLMProvider();
  const openrouter = env.openRouterApiKey
    ? new OpenRouterProvider({ apiKey: env.openRouterApiKey })
    : undefined;

  return {
    mock,
    openrouter
  };
}

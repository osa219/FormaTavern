import { describe, it, expect } from 'bun:test';
import { ProviderRegistryImpl } from '../../src/engine/providers';
import type { FetchFn } from '../../src/providers/openrouter';
import type { ProviderConfig } from '@formatavern/shared';

const sseOk = () =>
  new Response('data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });

function row(over: Partial<ProviderConfig> & { id: string }): ProviderConfig {
  return {
    name: over.id,
    providerType: 'custom',
    createdAt: 1,
    updatedAt: 1,
    ...over
  };
}

describe('ProviderRegistryImpl (custom + gemini)', () => {
  it('resolves mock by default with envelope model', () => {
    const registry = new ProviderRegistryImpl();
    const res = registry.resolve({ provider: { id: 'mock' } });
    expect(res.provider.id).toBe('mock');
    expect(res.model).toBe('mock:envelope-directive');
  });

  it('throws provider_unconfigured for openrouter without a key', () => {
    const registry = new ProviderRegistryImpl();
    expect(() => registry.resolve({ provider: { id: 'openrouter' } })).toThrow(
      'OpenRouter API key is not configured'
    );
  });

  it('throws provider_unconfigured for custom without a base URL', () => {
    const registry = new ProviderRegistryImpl();
    expect(() => registry.resolve({ provider: { id: 'custom' } })).toThrow(
      'Custom provider base URL is not configured'
    );
  });

  it('resolves keyless custom endpoints and hits the configured base URL', async () => {
    let capturedUrl = '';
    const fakeFetch: FetchFn = async (url) => {
      capturedUrl = String(url);
      return sseOk();
    };
    const registry = new ProviderRegistryImpl({ customFetch: fakeFetch });
    const res = registry.resolve({
      provider: { id: 'custom', model: 'llama3.1' },
      custom: { baseUrl: 'http://localhost:11434/v1/' }
    });

    expect(res.provider.id).toBe('custom');
    expect(res.model).toBe('llama3.1');

    for await (const _ev of res.provider.generate({ history: [{ role: 'user', content: 'hi' }] })) {
      // drain
    }
    expect(capturedUrl).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('throws provider_unconfigured for gemini without a key', () => {
    const registry = new ProviderRegistryImpl();
    expect(() => registry.resolve({ provider: { id: 'gemini' } })).toThrow(
      'Gemini API key is not configured'
    );
  });

  it('resolves gemini with key, default model, and compat endpoint', async () => {    let capturedUrl = '';
    let capturedHeaders: any;
    const fakeFetch: FetchFn = async (url, init) => {
      capturedUrl = String(url);
      capturedHeaders = init?.headers;
      return sseOk();
    };
    const registry = new ProviderRegistryImpl({ customFetch: fakeFetch });
    const res = registry.resolve({ provider: { id: 'gemini' }, gemini: { apiKey: 'AI-test' } });

    expect(res.provider.id).toBe('gemini');
    expect(res.model).toBe('gemini-3.5-flash');

    for await (const _ev of res.provider.generate({ history: [{ role: 'user', content: 'hi' }] })) {
      // drain
    }
    expect(capturedUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
    );
    expect(capturedHeaders.Authorization).toBe('Bearer AI-test');
  });

  it('throws provider_unconfigured for gemini-interactions without a key', () => {
    const registry = new ProviderRegistryImpl();
    expect(() => registry.resolve({ provider: { id: 'gemini-interactions' } })).toThrow(
      'Gemini API key is not configured'
    );
  });

  it('resolves gemini-interactions against the native endpoint with x-goog-api-key', async () => {
    let capturedUrl = '';
    let capturedHeaders: any;
    const fakeFetch: FetchFn = async (url, init) => {
      capturedUrl = String(url);
      capturedHeaders = init?.headers;
      return sseOk();
    };
    const registry = new ProviderRegistryImpl({ customFetch: fakeFetch });
    const res = registry.resolve({
      provider: { id: 'gemini-interactions' },
      gemini: { apiKey: 'AI-test' }
    });

    expect(res.provider.id).toBe('gemini-interactions');
    expect(res.model).toBe('gemini-3.5-flash');

    for await (const _ev of res.provider.generate({ history: [{ role: 'user', content: 'hi' }] })) {
      // drain
    }
    expect(capturedUrl).toBe('https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse');
    expect(capturedHeaders['x-goog-api-key']).toBe('AI-test');
  });

  it('falls back to defaults for blank legacy models', () => {    const registry = new ProviderRegistryImpl();
    expect(registry.resolve({ provider: { id: 'mock', model: '  ' } }).model).toBe(
      'mock:envelope-directive'
    );
    expect(
      registry.resolve({
        provider: { id: 'openrouter', model: '' },
        openrouter: { apiKey: 'sk-or-x' }
      }).model
    ).toBe('anthropic/claude-3.5-haiku');
  });

  it('falls back to the default mock script for non-mock legacy models', () => {
    const registry = new ProviderRegistryImpl();
    expect(
      registry.resolve({ provider: { id: 'mock', model: 'anthropic/claude-3.5-sonnet' } }).model
    ).toBe('mock:envelope-directive');
    expect(registry.resolve({ provider: { id: 'mock', model: 'mock:sloppy' } }).model).toBe(
      'mock:sloppy'
    );
  });

  it('throws when activeConfigId points at a missing row', () => {    const registry = new ProviderRegistryImpl();
    expect(() =>
      registry.resolve({ provider: { id: 'mock', activeConfigId: 'gone' } }, null)
    ).toThrow('Active provider configuration is missing');
  });

  it('resolves the active custom config, ignoring legacy singletons', async () => {
    let capturedUrl = '';
    const fakeFetch: FetchFn = async (url) => {
      capturedUrl = String(url);
      return sseOk();
    };
    const registry = new ProviderRegistryImpl({ customFetch: fakeFetch });
    const res = registry.resolve(
      {
        provider: { id: 'openrouter', model: 'legacy-model', activeConfigId: 'cfg-1' },
        openrouter: { apiKey: 'sk-or-legacy-should-be-ignored' }
      },
      row({
        id: 'cfg-1',
        name: 'Local',
        providerType: 'custom',
        baseUrl: 'http://localhost:11434/v1',
        model: 'llama3.1',
        customPrompt: '  Keep it short.  '
      })
    );

    expect(res.provider.id).toBe('custom');
    expect(res.model).toBe('llama3.1');
    expect(res.configPrompt).toBe('Keep it short.');

    for await (const _ev of res.provider.generate({ history: [{ role: 'user', content: 'hi' }] })) {
      // drain
    }
    expect(capturedUrl).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('resolves the active openrouter config and surfaces no prompt when blank', () => {
    const registry = new ProviderRegistryImpl();
    const res = registry.resolve(
      { provider: { id: 'mock', activeConfigId: 'cfg-or' } },
      row({ id: 'cfg-or', name: 'OR', providerType: 'openrouter', apiKey: 'sk-or-x', customPrompt: '   ' })
    );
    expect(res.provider.id).toBe('openrouter');
    expect(res.model).toBe('anthropic/claude-3.5-haiku');
    expect(res.configPrompt).toBeUndefined();
  });

  it('409s an active custom config without base URL', () => {
    const registry = new ProviderRegistryImpl();
    expect(() =>
      registry.resolve(
        { provider: { id: 'mock', activeConfigId: 'cfg-bad' } },
        row({ id: 'cfg-bad', name: 'Bad', providerType: 'custom' })
      )
    ).toThrow('Custom provider base URL is not configured');
  });
});

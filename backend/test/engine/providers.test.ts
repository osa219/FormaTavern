import { describe, it, expect } from 'bun:test';
import { ProviderRegistryImpl } from '../../src/engine/providers';
import type { FetchFn } from '../../src/providers/openrouter';

const sseOk = () =>
  new Response('data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });

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

  it('resolves gemini with key, default model, and compat endpoint', async () => {
    let capturedUrl = '';
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
});

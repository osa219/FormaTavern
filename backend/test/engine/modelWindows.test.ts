import { describe, it, expect, beforeEach } from 'bun:test';
import { effectiveContextLength } from '../../src/prompt/budget';
import { lookupModelContextLength, clearModelWindowCache } from '../../src/engine/modelWindows';
import type { LLMProvider, ModelInfo } from '@formatavern/shared';

function fakeProvider(models: ModelInfo[] | Error, calls: { count: number }): LLMProvider {
  return {
    id: 'test-provider',
    capabilities: {
      chatCompletion: true,
      textCompletion: false,
      listModels: true,
      prefill: false,
      nativeStateChannel: false
    },
    async listModels(): Promise<ModelInfo[]> {
      calls.count++;
      if (models instanceof Error) throw models;
      return models;
    },
    async *generate() {}
  } as unknown as LLMProvider;
}

describe('effectiveContextLength (model ceiling)', () => {
  it('caps the manual setting at the model window', () => {
    expect(effectiveContextLength(300_000, 200_000)).toBe(200_000);
  });

  it('keeps a manual setting below the model window', () => {
    expect(effectiveContextLength(16_384, 128_000)).toBe(16_384);
  });

  it('leaves the manual setting alone when the model window is unknown', () => {
    expect(effectiveContextLength(16_384, null)).toBe(16_384);
    expect(effectiveContextLength(16_384, undefined)).toBe(16_384);
    expect(effectiveContextLength(16_384, 0)).toBe(16_384);
    expect(effectiveContextLength(16_384, -5)).toBe(16_384);
  });
});

describe('lookupModelContextLength (cached provider windows)', () => {
  beforeEach(() => {
    clearModelWindowCache();
  });

  it('returns the reported window for a known model', async () => {
    const calls = { count: 0 };
    const provider = fakeProvider(
      [{ id: 'big-model', name: 'Big', contextLength: 200_000 }],
      calls
    );
    expect(await lookupModelContextLength(provider, 'big-model')).toBe(200_000);
    expect(calls.count).toBe(1);
  });

  it('returns null for unknown models and providers without listModels', async () => {
    const calls = { count: 0 };
    const provider = fakeProvider([{ id: 'other', name: 'Other', contextLength: 8000 }], calls);
    expect(await lookupModelContextLength(provider, 'missing')).toBeNull();

    const bare = { id: 'bare' } as LLMProvider;
    expect(await lookupModelContextLength(bare, 'anything')).toBeNull();
  });

  it('treats unreported windows as unknown instead of clamping', async () => {
    const calls = { count: 0 };
    const provider = fakeProvider(
      [{ id: 'mystery', name: 'Mystery', contextLength: null }],
      calls
    );
    expect(await lookupModelContextLength(provider, 'mystery')).toBeNull();
  });

  it('returns null on listModels failure instead of throwing', async () => {
    const calls = { count: 0 };
    const provider = fakeProvider(new Error('offline'), calls);
    expect(await lookupModelContextLength(provider, 'any')).toBeNull();
  });

  it('times out a hanging provider instead of stalling sends', async () => {
    const hanging = {
      id: 'hanging',
      capabilities: {
        chatCompletion: true,
        textCompletion: false,
        listModels: true,
        prefill: false,
        nativeStateChannel: false
      },
      listModels(): Promise<ModelInfo[]> {
        return new Promise(() => {});
      },
      async *generate() {}
    } as unknown as LLMProvider;
    expect(await lookupModelContextLength(hanging, 'any', 25)).toBeNull();
  });

  it('caches windows so steady-state sends make no extra requests', async () => {
    const calls = { count: 0 };
    const provider = fakeProvider(
      [{ id: 'cached', name: 'Cached', contextLength: 32_768 }],
      calls
    );
    expect(await lookupModelContextLength(provider, 'cached')).toBe(32_768);
    expect(await lookupModelContextLength(provider, 'cached')).toBe(32_768);
    expect(calls.count).toBe(1);
  });
});

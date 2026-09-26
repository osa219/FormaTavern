import { describe, it, expect } from 'bun:test';
import { countTokens, tokenizerFamilyForModel } from '../../src/prompt/budget';

describe('tokenizerFamilyForModel (per-model counting)', () => {
  it('maps o-series and GPT-4o+ models to o200k', () => {
    expect(tokenizerFamilyForModel('gpt-4o')).toBe('o200k');
    expect(tokenizerFamilyForModel('openai/gpt-4o-mini')).toBe('o200k');
    expect(tokenizerFamilyForModel('gpt-4.1')).toBe('o200k');
    expect(tokenizerFamilyForModel('gpt-5')).toBe('o200k');
    expect(tokenizerFamilyForModel('o1')).toBe('o200k');
    expect(tokenizerFamilyForModel('o3-mini')).toBe('o200k');
  });

  it('maps legacy GPT-3 models to r50k', () => {
    expect(tokenizerFamilyForModel('text-davinci-003')).toBe('r50k');
    expect(tokenizerFamilyForModel('curie')).toBe('r50k');
  });

  it('falls back to cl100k for everything else, including unknown models', () => {
    expect(tokenizerFamilyForModel('anthropic/claude-3.5-haiku')).toBe('cl100k');
    expect(tokenizerFamilyForModel('gemini-2.0-flash')).toBe('cl100k');
    expect(tokenizerFamilyForModel('llama-3.3-70b')).toBe('cl100k');
    expect(tokenizerFamilyForModel('mock:envelope-directive')).toBe('cl100k');
    expect(tokenizerFamilyForModel(undefined)).toBe('cl100k');
    expect(tokenizerFamilyForModel(null)).toBe('cl100k');
    expect(tokenizerFamilyForModel('')).toBe('cl100k');
  });

  it('does not mistake model names containing o-series substrings', () => {
    // "gpt-4o" must match, but a hypothetical "proto1x" must not match "o1".
    expect(tokenizerFamilyForModel('proto1x')).toBe('cl100k');
  });

  it('counts with the selected family', () => {
    // 😀 is 2 tokens in cl100k, 1 in o200k.
    expect(countTokens('😀', 'gpt-4o').tokens).toBe(1);
    expect(countTokens('😀', 'anthropic/claude-3.5-haiku').tokens).toBe(2);
    expect(countTokens('😀').tokens).toBe(2);
    expect(countTokens('').tokens).toBe(0);
  });
});

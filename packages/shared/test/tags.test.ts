import { describe, it, expect } from 'bun:test';
import { normalizeTag, displayTag, SUGGESTED_TAGS } from '../src/index';

describe('tags.ts — Tag Normalization and Display', () => {
  it('normalizes standard strings into valid tag keys', () => {
    expect(normalizeTag('Fantasy')).toBe('fantasy');
    expect(normalizeTag('Sci-Fi')).toBe('sci-fi');
    expect(normalizeTag('Slice of Life')).toBe('slice-of-life');
    expect(normalizeTag('  cyber_punk  ')).toBe('cyber-punk');
  });

  it('applies NFKC normalization and strips non-alphanumeric characters', () => {
    expect(normalizeTag('Ｒｏｍａｎｃｅ!')).toBe('romance');
    expect(normalizeTag('Action & Adventure')).toBe('action-adventure');
    expect(normalizeTag('grim---dark')).toBe('grim-dark');
  });

  it('enforces length limit ≤ 24 characters', () => {
    const longInput = 'this-is-a-very-long-tag-name-exceeding-limit';
    const normalized = normalizeTag(longInput);
    expect(normalized).not.toBeNull();
    expect(normalized!.length).toBeLessThanOrEqual(24);
    expect(normalized!.endsWith('-')).toBe(false);
  });

  it('returns null for empty or non-surviving input', () => {
    expect(normalizeTag('')).toBeNull();
    expect(normalizeTag('   ')).toBeNull();
    expect(normalizeTag('!@#$%^&*()_+')).toBeNull();
    expect(normalizeTag('---')).toBeNull();
  });

  it('formats display tags properly', () => {
    expect(displayTag('sci-fi')).toBe('Sci-Fi');
    expect(displayTag('slice-of-life')).toBe('Slice of Life');
    expect(displayTag('steampunk')).toBe('Steampunk');
    expect(displayTag('dark-fantasy')).toBe('Dark Fantasy');
  });

  it('exports 12 suggested tags', () => {
    expect(SUGGESTED_TAGS.length).toBe(12);
    for (const tag of SUGGESTED_TAGS) {
      expect(normalizeTag(tag)).toBe(tag);
    }
  });
});

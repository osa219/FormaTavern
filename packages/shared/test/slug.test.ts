import { describe, it, expect } from 'bun:test';
import { slugify } from '../src/index';

describe('slug.ts — Slugify Generation', () => {
  it('converts plain names to clean kebab slugs', () => {
    expect(slugify('Eldrin the Mage')).toBe('eldrin-the-mage');
    expect(slugify('Alice')).toBe('alice');
    expect(slugify('Captain Jack Sparrow')).toBe('captain-jack-sparrow');
  });

  it('strips diacritics and accents', () => {
    expect(slugify('Élodie du Lac')).toBe('elodie-du-lac');
    expect(slugify('Hélène')).toBe('helene');
  });

  it('handles punctuation, underscores, and extra hyphens', () => {
    expect(slugify('Alice (V2.0)!')).toBe('alice-v2-0');
    expect(slugify('  dark__lord--2000  ')).toBe('dark-lord-2000');
  });

  it('caps output length at 63 characters without trailing hyphen', () => {
    const longName = 'A very long character name that goes on and on and on and eventually exceeds the sixty-three character limit';
    const slug = slugify(longName);
    expect(slug.length).toBeLessThanOrEqual(63);
    expect(slug.endsWith('-')).toBe(false);
    expect(/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)).toBe(true);
  });

  it('returns empty string when nothing valid survives or length < 2', () => {
    expect(slugify('')).toBe('');
    expect(slugify('A')).toBe('');
    expect(slugify('???')).toBe('');
    expect(slugify('エルドリン')).toBe('');
  });
});

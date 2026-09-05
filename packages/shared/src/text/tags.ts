/**
 * Pure tag normalization and formatting utilities.
 */

export const SUGGESTED_TAGS = [
  'fantasy',
  'sci-fi',
  'modern',
  'steampunk',
  'adventure',
  'romance',
  'mystery',
  'horror',
  'slice-of-life',
  'comedy',
  'historical',
  'drama'
] as const;

const SPECIAL_DISPLAY_TAGS: Record<string, string> = {
  'sci-fi': 'Sci-Fi',
  'slice-of-life': 'Slice of Life'
};

/**
 * Normalizes user input into a valid tag key:
 * NFKC → lowercase → trim → spaces/underscores → '-' → strip non [a-z0-9-] → collapse '-' → ≤24 chars
 * Returns null if input is empty or has no alphanumeric characters.
 */
export function normalizeTag(input: string): string | null {
  if (!input) return null;

  let tag = input
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (tag.length > 24) {
    tag = tag.slice(0, 24).replace(/-+$/, '');
  }

  if (!/^[a-z0-9][a-z0-9-]{0,23}$/.test(tag)) {
    return null;
  }

  return tag;
}

/**
 * Formats a normalized tag key into user-friendly title casing for display.
 * e.g., 'sci-fi' → 'Sci-Fi', 'steampunk' → 'Steampunk', 'slice-of-life' → 'Slice of Life'
 */
export function displayTag(key: string): string {
  if (SPECIAL_DISPLAY_TAGS[key]) {
    return SPECIAL_DISPLAY_TAGS[key];
  }

  return key
    .split('-')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
    .join(' ');
}

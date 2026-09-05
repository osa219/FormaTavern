/**
 * Pure slug generation utility.
 */

/**
 * Converts a display name into a clean URL/identifier slug:
 * - Strips diacritics
 * - Lowercases and trims
 * - Replaces non-alphanumeric characters with hyphens
 * - Collapses consecutive hyphens and trims leading/trailing hyphens
 * - Caps length at 63 characters
 * Returns a string matching ^[a-z0-9][a-z0-9-]{1,62}$ or '' if nothing valid survives.
 */
export function slugify(name: string): string {
  if (!name) return '';

  let slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length > 63) {
    slug = slug.slice(0, 63).replace(/-+$/, '');
  }

  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) {
    return '';
  }

  return slug;
}

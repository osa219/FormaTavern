/**
 * Pure, isomorphic media:// URI scheme resolver and parser.
 * Accepted only lowercase 64-character hexadecimal SHA-256 digests.
 * Uppercase, short, or long hashes are treated as literal text, never references.
 */

export const MEDIA_URL_RE = /media:\/\/([a-f0-9]{64})(?![a-zA-Z0-9])/g;

/**
 * Extracts all unique 64-character lowercase hexadecimal SHA-256 hashes
 * referenced by `media://{hash}` in the given text, in order of appearance.
 */
export function extractMediaHashes(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const hashes: string[] = [];
  const seen = new Set<string>();
  const re = new RegExp(MEDIA_URL_RE.source, MEDIA_URL_RE.flags);
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const hash = match[1];
    if (!seen.has(hash)) {
      seen.add(hash);
      hashes.push(hash);
    }
  }

  return hashes;
}

/**
 * Rewrites all valid `media://{hash}` occurrences using the provided resolver function.
 * Pure and idempotent when the resolver replaces `media://` with non-media schemes.
 */
export function rewriteMediaUrls(text: string, resolver: (hash: string) => string): string {
  if (!text || typeof text !== 'string') return '';
  const re = new RegExp(MEDIA_URL_RE.source, MEDIA_URL_RE.flags);
  return text.replace(re, (_match, hash: string) => resolver(hash));
}

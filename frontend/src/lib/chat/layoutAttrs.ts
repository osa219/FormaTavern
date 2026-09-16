import type { ResolvedLayout } from '@formatavern/shared';

/**
 * Pure mapping from ResolvedLayout to HTML data-* attributes for the chat log root.
 */
export function layoutRootAttrs(layout: ResolvedLayout): Record<string, string> {
  return {
    'data-align': layout.align,
    'data-container': layout.container,
    'data-headers': layout.headers,
    'data-narrator': layout.narrator,
    'data-name-format': layout.names.format,
    'data-tails': layout.tails ? 'on' : 'off',
    'data-avatar-shape': layout.avatars.shape
  };
}

/**
 * Pure mapping from ResolvedLayout to inline CSS style string for the chat log root.
 */
export function layoutRootStyle(layout: ResolvedLayout): string {
  const parts: string[] = [];
  if (layout.avatars.size) {
    parts.push(`--msg-avatar-size: ${layout.avatars.size}`);
  }
  return parts.join('; ');
}

/**
 * Attributes for the turn article (turn owner scope).
 */
export function turnAttrs(role: string, layout: ResolvedLayout): Record<string, string> {
  return {
    'data-role': role,
    'data-headers': layout.headers
  };
}

/**
 * Attributes for a segment row inside the turn article.
 */
export function rowAttrs(kind: string): Record<string, string> {
  return {
    'data-kind': kind
  };
}

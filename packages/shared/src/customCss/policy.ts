import type { SurfaceScope } from '../hooks/manifest';

export interface ScopePolicy {
  scope: SurfaceScope;
  blockedProperties?: Record<string, 'any' | string[]>;
  valueValidators?: Record<string, (val: string) => boolean>;
  selectorScopedBlocks?: {
    selectors: readonly string[];
    properties: readonly string[];
  };
}

export const GLOBAL_BLOCKED_VALUE_PATTERNS: readonly RegExp[] = [
  /expression\s*\(/i,
  /(?:^|[^-])\bbehavior\s*:/i,
  /-moz-binding/i,
  /javascript\s*:/i,
  /vbscript\s*:/i
];

export const ALLOWED_DECLARATION_URL_PATTERNS: readonly RegExp[] = [
  /^\/assets\//,
  /^data:image\//
];

export const ALLOWED_FONT_URL_PATTERNS: readonly RegExp[] = [
  /^\/assets\/fonts\//,
  /^data:font\//
];

export const ALLOWED_AT_RULES = new Set([
  'media',
  'supports',
  'container',
  'keyframes',
  'font-face'
]);

export const ALLOWED_FONT_FACE_DESCRIPTORS = new Set([
  'font-family',
  'src',
  'font-weight',
  'font-style',
  'font-display',
  'unicode-range'
]);

export const CHAT_SELECTOR_SCOPED_BLOCKS = {
  selectors: ['ft-message-log', 'ft-viewport'],
  properties: [
    'overflow',
    'overflow-x',
    'overflow-y',
    'overscroll-behavior',
    'overscroll-behavior-x',
    'overscroll-behavior-y',
    'scroll-snap-type',
    'scroll-snap-align',
    'scroll-snap-stop',
    'scroll-margin',
    'scroll-margin-top',
    'scroll-margin-right',
    'scroll-margin-bottom',
    'scroll-margin-left',
    'scroll-margin-inline',
    'scroll-margin-inline-start',
    'scroll-margin-inline-end',
    'scroll-margin-block',
    'scroll-margin-block-start',
    'scroll-margin-block-end',
    'scroll-padding',
    'scroll-padding-top',
    'scroll-padding-right',
    'scroll-padding-bottom',
    'scroll-padding-left',
    'scroll-padding-inline',
    'scroll-padding-inline-start',
    'scroll-padding-inline-end',
    'scroll-padding-block',
    'scroll-padding-block-start',
    'scroll-padding-block-end',
    'touch-action'
  ]
} as const;

export const CHAT_POLICY: ScopePolicy = {
  scope: 'chat',
  blockedProperties: {
    'scroll-behavior': 'any'
  },
  valueValidators: {
    position: (val: string) => {
      const normalized = val.trim().toLowerCase();
      return normalized !== 'fixed' && normalized !== 'sticky' && !/\b(fixed|sticky)\b/.test(normalized);
    },
    'z-index': (val: string) => {
      const normalized = val.trim().toLowerCase();
      if (normalized === 'auto') return true;
      if (/^-?\d+$/.test(normalized)) {
        const num = Number.parseInt(normalized, 10);
        return num <= 10;
      }
      return false;
    }
  },
  selectorScopedBlocks: CHAT_SELECTOR_SCOPED_BLOCKS
};

export const PERMISSIVE_POLICY: ScopePolicy = {
  scope: 'character'
};

export const SCOPE_POLICIES: Record<SurfaceScope, ScopePolicy> = {
  shell: { scope: 'shell' },
  character: { scope: 'character' },
  chat: CHAT_POLICY
};

export function isAllowedAtRule(name: string): boolean {
  return ALLOWED_AT_RULES.has(name.toLowerCase().replace(/^-(?:webkit|moz|ms|o)-/, ''));
}

export function isAllowedFontFaceDescriptor(property: string): boolean {
  return ALLOWED_FONT_FACE_DESCRIPTORS.has(property.toLowerCase());
}

export function isAllowedDeclarationUrl(url: string): boolean {
  return ALLOWED_DECLARATION_URL_PATTERNS.some((pattern) => pattern.test(url.trim()));
}

export function isAllowedFontUrl(url: string): boolean {
  return ALLOWED_FONT_URL_PATTERNS.some((pattern) => pattern.test(url.trim()));
}

export function hasBlockedValuePattern(value: string, property?: string): boolean {
  if (property) {
    const propLower = property.toLowerCase();
    if (propLower === 'behavior' || propLower === '-moz-binding') {
      return true;
    }
  }
  return (
    GLOBAL_BLOCKED_VALUE_PATTERNS.some((pattern) => pattern.test(value)) ||
    (property ? GLOBAL_BLOCKED_VALUE_PATTERNS.some((pattern) => pattern.test(`${property}:${value}`)) : false)
  );
}

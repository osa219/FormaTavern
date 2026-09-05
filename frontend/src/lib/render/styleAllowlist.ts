/**
 * Pure CSS inline style sanitizer for Character Showcase markdown.
 * Implements A-U2 allowing scoped author styling without runtime CSS injection.
 */

const ALLOWED_PROPERTIES = new Set([
  // Layout & Spacing
  'display',
  'flex-direction',
  'align-items',
  'justify-content',
  'gap',
  'margin',
  'margin-top',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'padding',
  'padding-top',
  'padding-bottom',
  'padding-left',
  'padding-right',

  // Sizing
  'width',
  'max-width',
  'min-width',
  'height',
  'max-height',
  'min-height',

  // Typography
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-transform',
  'text-decoration',

  // Colors & Backgrounds
  'color',
  'background',
  'background-color',
  'background-image',
  'background-size',
  'background-position',
  'background-repeat',
  'opacity',

  // Borders
  'border',
  'border-width',
  'border-style',
  'border-color',
  'border-radius',
  'border-top',
  'border-bottom',
  'border-left',
  'border-right',

  // Visual Effects
  'box-shadow',
  'text-shadow',
  'filter',
  'backdrop-filter'
]);

const FORBIDDEN_PATTERNS = [
  /\\/i, // CSS escapes
  /expression/i,
  /javascript:/i,
  /vbscript:/i,
  /-moz-binding/i,
  /behavior/i,
  /@import/i,
  /@keyframes/i,
  /var\(/i // Disallow reading arbitrary CSS variables outside theme custom properties
];

function isSafeUrl(val: string): boolean {
  const urlMatches = val.matchAll(/url\s*\(([^)]+)\)/gi);
  for (const match of urlMatches) {
    const rawTarget = match[1].trim().replace(/^['"]|['"]$/g, '');
    // Only internal /assets/ or data:image/ allowed (rejection of external http/https/protocol-relative)
    if (!rawTarget.startsWith('/assets/') && !rawTarget.startsWith('data:image/')) {
      return false;
    }
  }
  return true;
}

function splitDeclarations(style: string): string[] {
  const decls: string[] = [];
  let current = '';

  for (let i = 0; i < style.length; i++) {
    const char = style[i];

    if (char === ';') {
      const lastUrl = current.lastIndexOf('url(');
      const lastClose = current.lastIndexOf(')');
      const insideUrl = lastUrl !== -1 && lastUrl > lastClose;
      const insideDataUrl = insideUrl && /url\s*\(\s*['"]?data:/i.test(current.slice(lastUrl));

      if (insideDataUrl) {
        current += char;
        continue;
      }

      if (current.trim()) {
        decls.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    decls.push(current.trim());
  }

  return decls;
}

export function rebuildStyle(rawStyle: string): string {
  if (!rawStyle || typeof rawStyle !== 'string') {
    return '';
  }

  // Check for any forbidden tokens globally
  for (const pat of FORBIDDEN_PATTERNS) {
    if (pat.test(rawStyle)) {
      return '';
    }
  }

  const declarations = splitDeclarations(rawStyle);
  const safeDeclarations: string[] = [];

  for (const decl of declarations) {
    const colonIdx = decl.indexOf(':');
    if (colonIdx === -1) continue;

    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const val = decl.slice(colonIdx + 1).trim();

    if (!prop || !val) continue;

    // Check allowlist
    if (!ALLOWED_PROPERTIES.has(prop)) continue;

    // Check for balanced quotes and parentheses
    const openParen = (val.match(/\(/g) || []).length;
    const closeParen = (val.match(/\)/g) || []).length;
    if (openParen !== closeParen) continue;

    const singleQuotes = (val.match(/'/g) || []).length;
    if (singleQuotes % 2 !== 0) continue;

    const doubleQuotes = (val.match(/"/g) || []).length;
    if (doubleQuotes % 2 !== 0) continue;

    // Check url() containment if present
    if (/url\s*\(/i.test(val)) {
      if (!isSafeUrl(val)) continue;
    }

    safeDeclarations.push(`${prop}: ${val}`);
  }

  return safeDeclarations.join('; ');
}

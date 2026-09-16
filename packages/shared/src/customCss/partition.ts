export interface PartitionedCustomCss {
  showcase: string;
  chat: string;
}

export const SHOWCASE_SURFACE_MARKER = '/* === @formatavern/surface: showcase === */';
export const CHAT_SURFACE_MARKER = '/* === @formatavern/surface: chat === */';

const SHOWCASE_MARKER_REGEX = /\/\*\s*===?\s*@?(?:formatavern\/)?surface:\s*showcase\s*===?\s*\*\//i;
const CHAT_MARKER_REGEX = /\/\*\s*===?\s*@?(?:formatavern\/)?surface:\s*chat\s*===?\s*\*\//i;

const CHAT_INDICATOR_PATTERNS: readonly RegExp[] = [
  /\[\s*data-ft-surface\s*=\s*["']?chat["']?\s*\]/i,
  /\.ft-message-log\b/,
  /\.ft-topbar\b/,
  /\.ft-composer\b/,
  /\.ft-turn\b/,
  /\.ft-turn-body\b/,
  /\.ft-turn-name\b/,
  /\.ft-avatar\b/,
  /\.ft-row\b/,
  /\.ft-navdrawer\b/,
  /\.ft-lore-drawer\b/,
  /\.ft-bubble-char\b/,
  /\.ft-bubble-user\b/
];

const SHOWCASE_INDICATOR_PATTERNS: readonly RegExp[] = [
  /\[\s*data-ft-surface\s*=\s*["']?character["']?\s*\]/i,
  /\.ft-hero\b/,
  /\.ft-showcase-body\b/,
  /\.ft-action-hub\b/,
  /\.ft-decor-layer\b/
];

/**
 * Splits a unified custom CSS sheet into its showcase and chat partitions.
 * If section markers are present, extraction is exact and deterministic.
 * If legacy unsegmented CSS is supplied, applies a conservative heuristic based on surface hooks.
 */
export function splitCustomCss(raw: string | undefined | null): PartitionedCustomCss {
  if (!raw || !raw.trim()) {
    return { showcase: '', chat: '' };
  }

  const hasShowcaseMarker = SHOWCASE_MARKER_REGEX.test(raw);
  const hasChatMarker = CHAT_MARKER_REGEX.test(raw);

  if (hasShowcaseMarker || hasChatMarker) {
    let showcase = '';
    let chat = '';

    const showcaseMatch = SHOWCASE_MARKER_REGEX.exec(raw);
    const chatMatch = CHAT_MARKER_REGEX.exec(raw);

    if (showcaseMatch && chatMatch) {
      if (showcaseMatch.index < chatMatch.index) {
        // Showcase section first, then Chat section
        showcase = raw.slice(showcaseMatch.index + showcaseMatch[0].length, chatMatch.index).trim();
        chat = raw.slice(chatMatch.index + chatMatch[0].length).trim();
      } else {
        // Chat section first, then Showcase section
        chat = raw.slice(chatMatch.index + chatMatch[0].length, showcaseMatch.index).trim();
        showcase = raw.slice(showcaseMatch.index + showcaseMatch[0].length).trim();
      }
    } else if (showcaseMatch) {
      showcase = raw.slice(showcaseMatch.index + showcaseMatch[0].length).trim();
    } else if (chatMatch) {
      chat = raw.slice(chatMatch.index + chatMatch[0].length).trim();
    }

    return { showcase, chat };
  }

  // Legacy unsegmented sheet heuristic
  const hasChatHooks = CHAT_INDICATOR_PATTERNS.some((p) => p.test(raw));
  const hasShowcaseHooks = SHOWCASE_INDICATOR_PATTERNS.some((p) => p.test(raw));

  if (hasChatHooks && !hasShowcaseHooks) {
    return { showcase: '', chat: raw.trim() };
  }

  if (hasShowcaseHooks && !hasChatHooks) {
    return { showcase: raw.trim(), chat: '' };
  }

  if (hasChatHooks && hasShowcaseHooks) {
    // Contains mixed hooks without markers: classify as chat to protect in-chat styling
    return { showcase: '', chat: raw.trim() };
  }

  // Neutral or unknown rules (e.g. root variables or keyframes only): default to showcase
  return { showcase: raw.trim(), chat: '' };
}

/**
 * Combines showcase and chat partitions into a single unified custom CSS sheet
 * using standardized surface markers.
 */
export function joinCustomCss(parts: { showcase?: string | null; chat?: string | null }): string {
  const showcase = (parts.showcase ?? '').trim();
  const chat = (parts.chat ?? '').trim();

  if (!showcase && !chat) {
    return '';
  }

  if (showcase && !chat) {
    return `${SHOWCASE_SURFACE_MARKER}\n${showcase}\n`;
  }

  if (!showcase && chat) {
    return `${CHAT_SURFACE_MARKER}\n${chat}\n`;
  }

  return `${SHOWCASE_SURFACE_MARKER}\n${showcase}\n\n${CHAT_SURFACE_MARKER}\n${chat}\n`;
}

/**
 * Post-parse HTML quirk normalizer for model slop like <b>, <i>, <br>.
 *
 * Scope contract (must never break narrative structure):
 * - This runs ONLY on `segment.text` AFTER `parseEnvelope()` / `stripOutOfBand()`.
 *   Narrative structure (`:::`, `<narrator>`, `<character>`, `<npc>`,
 *   `<persona>`, `<state>`, `<think>`) is already consumed before this runs.
 * - Defensively, narrative tag names are never touched even if called pre-parse.
 * - Safe subset converts to markdown so the model learns markdown next turn:
 *   <b>/<strong> -> **, <i>/<em> -> *, <s>/<del>/<strike> -> ~~, <br> -> newline,
 *   <u> -> <u> (kept, allowlisted downstream).
 * - All other tags are dropped with inner text kept (no literals, no effect).
 * - Fenced code blocks and inline code spans are preserved verbatim.
 * - Pure, no DOM, deterministic, idempotent.
 */

const NARRATIVE_TAGS = new Set([
  'narrator',
  'character',
  'char',
  'npc',
  'persona',
  'user',
  'state',
  'think',
  'thinking',
  'reasoning'
]);

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9-]*)(\s+[^<>]*?)?\/?>/g;

function isNarrativeTag(name: string): boolean {
  return NARRATIVE_TAGS.has(name.toLowerCase());
}

function protectCode(input: string): { text: string; slots: string[] } {
  const slots: string[] = [];
  const placeholder = (i: number) => `\u0000HTMLQUIRK${i}\u0000`;
  let text = input;
  text = text.replace(/(`{3,}|~{3,})[\s\S]*?\1/g, (m) => {
    slots.push(m);
    return placeholder(slots.length - 1);
  });
  text = text.replace(/`[^`\n]+`/g, (m) => {
    slots.push(m);
    return placeholder(slots.length - 1);
  });
  return { text, slots };
}

function restoreCode(input: string, slots: string[]): string {
  return input.replace(/\u0000HTMLQUIRK(\d+)\u0000/g, (_, n) => slots[Number(n)] ?? '');
}

export function normalizeHtmlQuirks(input: string): string {
  if (!input || typeof input !== 'string') return input ?? '';
  if (!input.includes('<') && !input.includes('>')) return input;

  const { text: protectedText, slots } = protectCode(input);
  let text = protectedText;

  text = text.replace(/<br\s*\/?>/gi, '\n');

  text = text.replace(/<\/?(b|strong)(\s+[^<>]*?)?\/?>/gi, '**');
  text = text.replace(/<\/?(i|em)(\s+[^<>]*?)?\/?>/gi, '*');
  text = text.replace(/<\/?(s|del|strike)(\s+[^<>]*?)?\/?>/gi, '~~');
  text = text.replace(/<u(\s+[^<>]*?)?\/?>/gi, '<u>');
  text = text.replace(/<\/u\s*>/gi, '</u>');

  text = text.replace(TAG_RE, (match, name: string) => {
    const lower = String(name).toLowerCase();
    if (isNarrativeTag(lower)) return match;
    if (lower === 'u' || lower === 'br' || lower === 'hr') return match;
    return '';
  });

  text = restoreCode(text, slots);
  return text;
}

import type { SegmentKind } from '../schemas/narrative';
import type { Dialect } from './types';

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Prefix asterisk-narrator rule, shared by the parser and the serializer
 * guard: the whole line is exactly one single-asterisk pair (*paragraph*).
 * Inline spans, **bold**, and multiline spans return false.
 */
export function isAsteriskNarratorLine(line: string): boolean {
  const t = line.trim();
  return (
    t.length >= 3 &&
    t[0] === '*' &&
    t[1] !== '*' &&
    t[t.length - 1] === '*' &&
    t[t.length - 2] !== '*'
  );
}

export const DIRECTIVE_HEADER_RE =
  /^\s*:{3,}\s*(narrator|greeting|character|char|npc|persona|user)\b\s*(?:\[([^\]]*)\]\s*(.*)|[:\-–]?\s*(.*?))?\s*$/i;

export const DIRECTIVE_CLOSER_RE = /^\s*:{3,}\s*$/;

export const XML_HEADER_RE =
  /^\s*<(narrator|greeting|character|char|npc|persona|user)(?:\s+name\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?\s*>\s*(.*)$/i;

export const XML_CLOSER_RE = /<\/(narrator|greeting|character|char|npc|persona|user)\s*>\s*$/i;
export const XML_CLOSER_LINE_RE = /^\s*<\/(narrator|greeting|character|char|npc|persona|user)\s*>\s*$/i;

export const PREFIX_SPEAKER_RE =
  /^\s*([A-Za-z][A-Za-z0-9 .'’\-]{0,39}?)\s*:\s+(.*)$/;

export const PREFIX_STOPLIST = new Set([
  'note',
  'warning',
  'summary',
  'scene',
  'state',
  'ooc',
  'system',
  'hint',
  'tip'
]);

export const STATE_FENCE_OPEN_RE =
  /^\s*(`{3,}|~{3,})\s*(?:state|json\s*state|state\s*json)\s*$/i;

export type LineClassification =
  | { type: 'header'; dialect: Dialect; kind: SegmentKind; name?: string; inlineBody?: string; mergeAsterisk?: boolean }
  | { type: 'closer'; dialect: Dialect }
  | { type: 'body'; text: string };

export interface ClassifyOptions {
  dialect?: Dialect | 'auto';
  knownNames?: string[];
  primaryCharacter: string;
  personaName?: string;
}

/**
 * Normalizes kind string: 'char' -> 'character', 'user' -> 'persona',
 * 'greeting' -> 'narrator' (prologue alias: scene-setting with no speaker claim)
 */
export function normalizeKind(rawKind: string): SegmentKind {
  const k = rawKind.toLowerCase();
  if (k === 'char') return 'character';
  if (k === 'user') return 'persona';
  if (k === 'greeting') return 'narrator';
  return k as SegmentKind;
}

/**
 * Classifies a single line within the narrative envelope.
 */
export function classifyLine(line: string, opts: ClassifyOptions): LineClassification {
  // 1. Directive Header
  const dirMatch = line.match(DIRECTIVE_HEADER_RE);
  if (dirMatch) {
    const rawKind = dirMatch[1];
    const kind = normalizeKind(rawKind);
    const bracketName = dirMatch[2];
    const inlineAfterBracket = dirMatch[3];
    const bareTail = dirMatch[4];

    let name: string | undefined;
    let inlineBody: string | undefined;

    if (bracketName !== undefined) {
      const trimmed = bracketName.trim();
      name = trimmed.length > 0 ? trimmed : undefined;
      if (inlineAfterBracket) {
        const cleanedInline = inlineAfterBracket.replace(/^[:\-–]\s*/, '').trim();
        if (cleanedInline.length > 0) {
          inlineBody = cleanedInline;
        }
      }
    } else if (bareTail !== undefined && bareTail.trim().length > 0) {
      const trimmedTail = bareTail.trim();
      if (kind === 'narrator') {
        inlineBody = trimmedTail;
      } else {
        // L3: For character|npc|persona: name iff length <= 40 and contains none of . ! ? " *
        if (trimmedTail.length <= 40 && !/[.!?"]|\*/.test(trimmedTail)) {
          name = trimmedTail;
        } else {
          inlineBody = trimmedTail;
        }
      }
    }

    return {
      type: 'header',
      dialect: 'directive',
      kind,
      name,
      inlineBody
    };
  }

  // 2. Directive Closer (noise)
  if (DIRECTIVE_CLOSER_RE.test(line)) {
    return { type: 'closer', dialect: 'directive' };
  }

  // 3. XML Header
  const xmlMatch = line.match(XML_HEADER_RE);
  if (xmlMatch) {
    const rawKind = xmlMatch[1];
    const kind = normalizeKind(rawKind);
    const name = (xmlMatch[2] ?? xmlMatch[3] ?? xmlMatch[4])?.trim();
    let inline = xmlMatch[5] ?? '';

    // Check if inline contains closer at line end e.g. <character name="Alice">Run!</character>
    const closerMatch = inline.match(XML_CLOSER_RE);
    if (closerMatch) {
      inline = inline.slice(0, inline.length - closerMatch[0].length);
    }

    return {
      type: 'header',
      dialect: 'xml',
      kind,
      name: name && name.length > 0 ? name : undefined,
      inlineBody: inline.trim().length > 0 ? inline.trim() : undefined
    };
  }

  // 4. XML Closer (standalone line)
  if (XML_CLOSER_LINE_RE.test(line)) {
    return { type: 'closer', dialect: 'xml' };
  }

  // 4b. Prefix asterisk-narrator: a line that is exactly one single-asterisk
  // pair (*paragraph*) is a narrator block. Inline spans ("Hi" *she waves*
  // "bye"), **bold**, and multiline spans stay body text. Gated on explicit
  // prefix mode so directive/xml/auto/classic parsing is byte-identical.
  if (opts.dialect === 'prefix' && isAsteriskNarratorLine(line)) {
    const inner = line.trim().slice(1, -1);
    return {
      type: 'header',
      dialect: 'prefix',
      kind: 'narrator',
      inlineBody: inner.trim().length > 0 ? inner.trim() : undefined,
      mergeAsterisk: true
    };
  }

  // 5. Prefix Speaker Line
  const prefixMatch = line.match(PREFIX_SPEAKER_RE);
  if (prefixMatch) {
    const rawName = prefixMatch[1].trim();
    const body = prefixMatch[2];
    const pass = passesPrefixGate(rawName, opts);
    if (pass) {
      let kind: SegmentKind;
      let name: string | undefined;

      if (rawName.toLowerCase() === 'narrator' || rawName.toLowerCase() === 'greeting') {
        kind = 'narrator';
      } else if (rawName.toLowerCase() === opts.primaryCharacter.toLowerCase()) {
        kind = 'character';
        name = rawName;
      } else if (
        rawName.toLowerCase() === 'user' ||
        rawName.toLowerCase() === 'persona' ||
        (opts.personaName && rawName.toLowerCase() === opts.personaName.toLowerCase())
      ) {
        kind = 'persona';
        name = opts.personaName ?? rawName;
      } else {
        kind = 'npc';
        name = rawName;
      }

      return {
        type: 'header',
        dialect: 'prefix',
        kind,
        name,
        inlineBody: body.trim().length > 0 ? body.trim() : undefined
      };
    }
  }

  // If line ends with XML closer, strip closer and treat remainder as body
  const inlineCloserMatch = line.match(XML_CLOSER_RE);
  if (inlineCloserMatch) {
    const stripped = line.slice(0, line.length - inlineCloserMatch[0].length);
    return { type: 'body', text: stripped };
  }

  return { type: 'body', text: line };
}

function passesPrefixGate(name: string, opts: ClassifyOptions): boolean {
  const lower = name.toLowerCase();
  if (lower === 'narrator') return true;
  if (lower === 'user' || lower === 'persona') return true;
  if (opts.personaName && lower === opts.personaName.toLowerCase()) return true;

  if (opts.knownNames && opts.knownNames.length > 0) {
    if (opts.knownNames.some((kn) => kn.toLowerCase() === lower)) return true;
  }

  if (opts.dialect === 'prefix') {
    // Explicit prefix mode: also allow Capitalized name, <= 3 words, not in stoplist
    if (PREFIX_STOPLIST.has(lower)) return false;

    // Check capitalized: First character of first word is uppercase
    if (/^[A-Z]/.test(name)) {
      const words = name.split(/\s+/);
      if (words.length <= 3) return true;
    }
  }

  return false;
}

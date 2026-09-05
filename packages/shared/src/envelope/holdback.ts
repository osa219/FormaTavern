import type { ParseOptions } from './types';
import { STATE_FENCE_OPEN_RE } from './grammar';

const OPEN_REASONING_RE = /<(think|thinking|reasoning)\b[^>]*>/gi;
const OPEN_STATE_XML_RE = /<state\b[^>]*>/gi;
const OPEN_STATE_COMMENT_RE = /<!--\s*state\b/gi;

function getLineStart(text: string, index: number): number {
  const prevNewline = text.lastIndexOf('\n', index - 1);
  return prevNewline === -1 ? 0 : prevNewline + 1;
}

/**
 * Computes the suffix of `text` that must be withheld during streaming.
 * Normative rules:
 * 1. Open <think|thinking|reasoning> with no closer -> from tag's line start to EOF.
 * 2. Open state block (fence / <state> / <!--state) with no closer -> from opening line start to EOF.
 * 3. Otherwise consider L = text after last \n:
 *    - /^\s*[:<`~]/.test(L) -> hold L
 *    - Prefix dialect active: L is non-empty, contains no ':', <= 40 chars,
 *      and is a case-insensitive prefix of a knownName or of 'Narrator' -> hold L
 *    - Else hold nothing.
 */
export function computeHoldBack(text: string, opts: ParseOptions): string {
  if (!text) return '';

  // 1. Open reasoning tag with no closer
  let reasoningMatch: RegExpExecArray | null;
  OPEN_REASONING_RE.lastIndex = 0;
  while ((reasoningMatch = OPEN_REASONING_RE.exec(text)) !== null) {
    const tagName = reasoningMatch[1];
    const afterOpen = text.slice(reasoningMatch.index + reasoningMatch[0].length);
    const closeRe = new RegExp(`</${tagName}>`, 'i');
    if (!closeRe.test(afterOpen)) {
      const lineStart = getLineStart(text, reasoningMatch.index);
      return text.slice(lineStart);
    }
  }

  // 2. Open state block with no closer
  // 2a. Fenced state
  const lines = text.split('\n');
  let lineOffset = 0;
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;
  let fenceStartOffset = 0;

  let justClosedStateFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLenWithNewline = line.length + (i < lines.length - 1 ? 1 : 0);

    if (!inFence) {
      const openMatch = line.match(STATE_FENCE_OPEN_RE);
      if (openMatch) {
        inFence = true;
        fenceChar = openMatch[1][0];
        fenceLen = openMatch[1].length;
        fenceStartOffset = lineOffset;
      }
    } else {
      const closeRe = new RegExp(`^\\s*\\${fenceChar}{${fenceLen},}\\s*$`);
      if (closeRe.test(line)) {
        inFence = false;
        if (i === lines.length - 1) {
          justClosedStateFence = true;
        }
      }
    }

    lineOffset += lineLenWithNewline;
  }

  if (inFence) {
    return text.slice(fenceStartOffset);
  }

  if (justClosedStateFence) {
    return '';
  }

  // 2b. XML state: <state> ... </state>
  OPEN_STATE_XML_RE.lastIndex = 0;
  let xmlStateMatch: RegExpExecArray | null;
  while ((xmlStateMatch = OPEN_STATE_XML_RE.exec(text)) !== null) {
    const afterOpen = text.slice(xmlStateMatch.index + xmlStateMatch[0].length);
    if (!/<\/state>/i.test(afterOpen)) {
      const lineStart = getLineStart(text, xmlStateMatch.index);
      return text.slice(lineStart);
    }
  }

  // 2c. Comment state: <!--state ... -->
  OPEN_STATE_COMMENT_RE.lastIndex = 0;
  let commentStateMatch: RegExpExecArray | null;
  while ((commentStateMatch = OPEN_STATE_COMMENT_RE.exec(text)) !== null) {
    const afterOpen = text.slice(commentStateMatch.index + commentStateMatch[0].length);
    if (!/-->/.test(afterOpen)) {
      const lineStart = getLineStart(text, commentStateMatch.index);
      return text.slice(lineStart);
    }
  }

  if (text.trimEnd().endsWith('</state>') || text.trimEnd().endsWith('-->')) {
    return '';
  }

  // 3. Last line L consideration
  const lastNewline = text.lastIndexOf('\n');
  const L = lastNewline === -1 ? text : text.slice(lastNewline + 1);

  // Check potential delimiter start
  if (/^\s*[:<`~]/.test(L)) {
    return L;
  }

  // Check prefix dialect speaker line candidate
  const isPrefixActive =
    opts.dialect === 'prefix' || (opts.knownNames !== undefined && opts.knownNames.length > 0);

  if (isPrefixActive) {
    const trimmedL = L.trimStart();
    if (trimmedL.length > 0 && !trimmedL.includes(':') && trimmedL.length <= 40) {
      const lower = trimmedL.toLowerCase();
      const candidates: string[] = ['narrator'];
      if (opts.knownNames) {
        for (const kn of opts.knownNames) {
          candidates.push(kn.toLowerCase());
        }
      }
      if (candidates.some((c) => c.startsWith(lower))) {
        return L;
      }
    }
  }

  return '';
}

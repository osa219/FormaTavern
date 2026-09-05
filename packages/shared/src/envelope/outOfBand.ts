import { jsonrepair } from 'jsonrepair';
import type { StateVector } from '../schemas/state';
import type { ParseWarning } from './types';

export interface ReasoningResult {
  text: string;
  reasoning: string | null;
  warning?: ParseWarning;
}

const REASONING_TAG_RE = /<(think|thinking|reasoning)\b[^>]*>([\s\S]*?)<\/\1>/i;
const OPEN_REASONING_RE = /<(think|thinking|reasoning)\b[^>]*>/i;

/**
 * Extracts and removes the first reasoning block (<think>, <thinking>, <reasoning>).
 */
export function extractReasoning(input: string, streaming: boolean): ReasoningResult {
  const closedMatch = input.match(REASONING_TAG_RE);
  if (closedMatch && closedMatch.index !== undefined) {
    const fullTag = closedMatch[0];
    const content = closedMatch[2];
    const text = input.slice(0, closedMatch.index) + input.slice(closedMatch.index + fullTag.length);
    return {
      text,
      reasoning: content
    };
  }

  const openMatch = input.match(OPEN_REASONING_RE);
  if (openMatch && openMatch.index !== undefined) {
    if (!streaming) {
      // In non-streaming mode, unclosed reasoning takes everything to EOF
      const content = input.slice(openMatch.index + openMatch[0].length);
      const text = input.slice(0, openMatch.index);
      return {
        text,
        reasoning: content,
        warning: { code: 'reasoning_unclosed', detail: 'Unclosed reasoning tag at EOF' }
      };
    }
  }

  return { text: input, reasoning: null };
}

export interface StateExtractionResult {
  text: string;
  statePatch: StateVector | null;
  warnings: ParseWarning[];
  hasStateBlock: boolean;
}

interface RawStateMatch {
  type: 'fence' | 'xml' | 'comment';
  startIndex: number;
  endIndex: number;
  body: string;
  closed: boolean;
}

/**
 * Finds all state blocks (fenced, XML, or HTML comment).
 */
function findAllStateBlocks(text: string): RawStateMatch[] {
  const matches: RawStateMatch[] = [];

  // 1. XML: <state> ... </state>
  const xmlRe = /<state\b[^>]*>([\s\S]*?)(?:<\/state>|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = xmlRe.exec(text)) !== null) {
    const isClosed = m[0].toLowerCase().endsWith('</state>');
    matches.push({
      type: 'xml',
      startIndex: m.index,
      endIndex: m.index + m[0].length,
      body: m[1],
      closed: isClosed
    });
  }

  // 2. HTML comment: <!--state ... -->
  const commentRe = /<!--\s*state\b([\s\S]*?)(?:-->|$)/gi;
  while ((m = commentRe.exec(text)) !== null) {
    const isClosed = m[0].endsWith('-->');
    matches.push({
      type: 'comment',
      startIndex: m.index,
      endIndex: m.index + m[0].length,
      body: m[1],
      closed: isClosed
    });
  }

  // 3. Fences: ```state or ~~~state
  const lines = text.split('\n');
  let lineOffset = 0;
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;
  let fenceStartIndex = 0;
  let fenceBodyLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLenWithNewline = line.length + (i < lines.length - 1 ? 1 : 0);

    if (!inFence) {
      const openMatch = line.match(/^\s*(`{3,}|~{3,})\s*(?:state|json\s*state|state\s*json)\s*$/i);
      if (openMatch) {
        inFence = true;
        fenceChar = openMatch[1][0];
        fenceLen = openMatch[1].length;
        fenceStartIndex = lineOffset;
        fenceBodyLines = [];
      }
    } else {
      const closeRe = new RegExp(`^\\s*\\${fenceChar}{${fenceLen},}\\s*$`);
      if (closeRe.test(line)) {
        inFence = false;
        matches.push({
          type: 'fence',
          startIndex: fenceStartIndex,
          endIndex: lineOffset + lineLenWithNewline,
          body: fenceBodyLines.join('\n'),
          closed: true
        });
      } else {
        fenceBodyLines.push(line);
      }
    }

    lineOffset += lineLenWithNewline;
  }

  if (inFence) {
    matches.push({
      type: 'fence',
      startIndex: fenceStartIndex,
      endIndex: text.length,
      body: fenceBodyLines.join('\n'),
      closed: false
    });
  }

  // Sort matches by startIndex
  matches.sort((a, b) => a.startIndex - b.startIndex);
  return matches;
}

/**
 * Extracts the state block according to normative rules:
 * - Last closed one wins
 * - Warns if multiple state blocks
 * - Unclosed at EOF (in non-streaming mode) -> null + state_unclosed
 * - Warns if non-whitespace text exists after the winning block (state_not_terminal)
 */
export function extractStateBlock(text: string, streaming: boolean): StateExtractionResult {
  const blocks = findAllStateBlocks(text);
  const warnings: ParseWarning[] = [];

  if (blocks.length === 0) {
    return { text, statePatch: null, warnings, hasStateBlock: false };
  }

  const closedBlocks = blocks.filter((b) => b.closed);
  const unclosedBlocks = blocks.filter((b) => !b.closed);

  if (closedBlocks.length > 1) {
    warnings.push({
      code: 'multiple_state_blocks',
      detail: `Found ${closedBlocks.length} state blocks; last closed block wins`
    });
  }

  // If there are unclosed blocks after the last closed block, or no closed blocks:
  if (closedBlocks.length === 0) {
    // Only unclosed blocks exist
    const lastUnclosed = unclosedBlocks[unclosedBlocks.length - 1];
    if (!streaming) {
      warnings.push({
        code: 'state_unclosed',
        detail: 'State block opened but not closed at EOF'
      });
    }
    // Cut out the unclosed block from text
    const cleanText = text.slice(0, lastUnclosed.startIndex) + text.slice(lastUnclosed.endIndex);
    return {
      text: cleanText,
      statePatch: null,
      warnings,
      hasStateBlock: true
    };
  }

  // Winning block is the last closed block
  const winner = closedBlocks[closedBlocks.length - 1];

  // Check if non-whitespace text exists after winner
  const textAfter = text.slice(winner.endIndex);
  if (/\S/.test(textAfter)) {
    warnings.push({
      code: 'state_not_terminal',
      detail: 'Non-whitespace content exists after the state block'
    });
  }

  // Check if there was an unclosed block after the winning closed block
  if (unclosedBlocks.some((b) => b.startIndex > winner.endIndex) && !streaming) {
    warnings.push({
      code: 'state_unclosed',
      detail: 'An unclosed state block appeared after the winning state block'
    });
  }

  // Parse state block body
  let patch: StateVector | null = null;
  const rawBody = winner.body.trim();

  try {
    let repairedBody = rawBody;
    try {
      repairedBody = jsonrepair(rawBody);
    } catch {
      // If jsonrepair throws, keep rawBody to let JSON.parse attempt or throw
      repairedBody = rawBody;
    }

    if (repairedBody !== rawBody) {
      warnings.push({
        code: 'state_repaired',
        detail: 'State JSON repaired with jsonrepair'
      });
    }

    const parsed = JSON.parse(repairedBody);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      patch = parsed as StateVector;
    } else {
      warnings.push({
        code: 'state_not_object',
        detail: 'State block parsed to a non-object JSON value'
      });
      patch = null;
    }
  } catch (err: any) {
    warnings.push({
      code: 'state_unparseable',
      detail: `Failed to parse state JSON: ${err?.message ?? 'unknown error'}`
    });
    patch = null;
  }

  // Remove the winning state block from the text.
  // Also remove any other state blocks so they don't leak into segments!
  let remainingText = text;
  // Remove from end to beginning to keep indices stable
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    remainingText = remainingText.slice(0, b.startIndex) + remainingText.slice(b.endIndex);
  }

  return {
    text: remainingText,
    statePatch: patch,
    warnings,
    hasStateBlock: true
  };
}

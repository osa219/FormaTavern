import type { Segment, SegmentKind } from '../schemas/narrative';
import type { StateVector } from '../schemas/state';
import {
  classifyLine,
  escapeRegex,
  DIRECTIVE_HEADER_RE,
  XML_HEADER_RE,
  DIRECTIVE_CLOSER_RE,
  XML_CLOSER_LINE_RE,
  PREFIX_SPEAKER_RE,
  PREFIX_STOPLIST,
  STATE_FENCE_OPEN_RE
} from './grammar';
import { extractReasoning, extractStateBlock } from './outOfBand';
import { computeHoldBack } from './holdback';
import {
  PARSER_VERSION,
  type Dialect,
  type ParseOptions,
  type ParseResult,
  type ParseWarning
} from './types';

export * from './types';
export * from './grammar';
export * from './outOfBand';
export * from './holdback';

interface RawBlock {
  dialect?: Dialect;
  kind: SegmentKind;
  name?: string;
  lines: string[];
}

function trimBlockText(lines: string[]): string {
  const cleaned = lines.map((l) => l.trimEnd());
  let start = 0;
  while (start < cleaned.length && cleaned[start].trim().length === 0) {
    start++;
  }
  let end = cleaned.length - 1;
  while (end >= start && cleaned[end].trim().length === 0) {
    end--;
  }
  if (start > end) return '';
  return cleaned.slice(start, end + 1).join('\n');
}

/**
 * Parses a full text into normalized narrative segments, state patch, and reasoning.
 * Pure function of the input string and options.
 */
export function parseEnvelope(input: string, options: ParseOptions): ParseResult {
  const warnings: ParseWarning[] = [];
  const streaming = options.streaming ?? false;

  // 1. Normalize: \r\n|\r -> \n, strip leading BOM
  let text = input.replace(/\r\n|\r/g, '\n');
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  // 2. Hold-back cut (streaming only)
  let heldBack = '';
  if (streaming) {
    heldBack = computeHoldBack(text, options);
    if (heldBack.length > 0) {
      text = text.slice(0, text.length - heldBack.length);
    }
  }

  // 3. Reasoning out
  const reasoningRes = extractReasoning(text, streaming);
  text = reasoningRes.text;
  const reasoning = reasoningRes.reasoning;
  if (reasoningRes.warning) {
    warnings.push(reasoningRes.warning);
  }

  // 4. Agency truncation (unless allowPersona)
  let truncatedAt: 'persona' | null = null;
  if (!options.allowPersona) {
    const lines = text.split('\n');
    let cutIndex = -1;

    // Pattern for {{user}}: or <personaName>:
    const userMacroOrNamePattern = options.personaName
      ? new RegExp(`^\\s*(?:\\{\\{\\s*user\\s*\\}\\}|${escapeRegex(options.personaName)})\\s*:`, 'i')
      : /^\s*\{\{\s*user\s*\}\}\s*:/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check directive or xml header of kind persona|user
      const dirMatch = line.match(DIRECTIVE_HEADER_RE);
      if (dirMatch) {
        const k = dirMatch[1].toLowerCase();
        if (k === 'persona' || k === 'user') {
          cutIndex = i;
          break;
        }
      }

      const xmlMatch = line.match(XML_HEADER_RE);
      if (xmlMatch) {
        const k = xmlMatch[1].toLowerCase();
        if (k === 'persona' || k === 'user') {
          cutIndex = i;
          break;
        }
      }

      // Check prefix speaker line for {{user}} or personaName
      if (userMacroOrNamePattern.test(line)) {
        cutIndex = i;
        break;
      }
    }

    if (cutIndex !== -1) {
      truncatedAt = 'persona';
      lines.splice(cutIndex);
      text = lines.join('\n');
      if (text.trim().length === 0) {
        warnings.push({
          code: 'empty_after_truncation',
          detail: 'No content remains after agency truncation'
        });
      }
    }
  }

  // 5. State out
  const stateRes = extractStateBlock(text, streaming);
  text = stateRes.text;
  const statePatch = stateRes.statePatch;
  warnings.push(...stateRes.warnings);

  // 6. Line scan
  const rawLines = text.split('\n');
  const blocks: RawBlock[] = [];
  let currentBlock: RawBlock = {
    kind: 'character',
    name: options.primaryCharacter,
    lines: []
  };
  blocks.push(currentBlock);

  let detectedDialect: Dialect | 'none' = 'none';

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const classification = classifyLine(line, {
      dialect: options.dialect,
      knownNames: options.knownNames,
      primaryCharacter: options.primaryCharacter
    });

    if (classification.type === 'header') {
      if (detectedDialect === 'none') {
        detectedDialect = classification.dialect;
      } else if (detectedDialect !== classification.dialect) {
        if (!warnings.some((w) => w.code === 'mixed_dialects')) {
          warnings.push({
            code: 'mixed_dialects',
            detail: `Detected ${classification.dialect} header after ${detectedDialect}`
          });
        }
      }

      let blockName = classification.name;
      if (classification.kind === 'character' && !blockName) {
        blockName = options.primaryCharacter;
      } else if (classification.kind === 'narrator') {
        if (classification.name) {
          warnings.push({
            code: 'header_name_ignored',
            detail: `Name "${classification.name}" on narrator header ignored`
          });
        }
        blockName = undefined;
      } else if (classification.kind === 'persona') {
        if (!blockName && options.personaName) {
          blockName = options.personaName;
        }
      } else if (classification.kind === 'npc' && !blockName) {
        warnings.push({
          code: 'npc_unnamed',
          detail: `NPC block without a name on line ${i + 1}`
        });
      }

      currentBlock = {
        dialect: classification.dialect,
        kind: classification.kind,
        name: blockName,
        lines: classification.inlineBody ? [classification.inlineBody] : []
      };
      blocks.push(currentBlock);
    } else if (classification.type === 'closer') {
      // Noise / block closer: closes current block implicitly
      // Future lines before another header are treated as primary character or continuation
    } else {
      currentBlock.lines.push(classification.text);
    }
  }

  // 7. Segments normalization
  const segments: Segment[] = [];
  for (const block of blocks) {
    const blockText = trimBlockText(block.lines);
    if (blockText.length > 0) {
      segments.push({
        kind: block.kind,
        name: block.name,
        text: blockText
      });
    }
  }

  // 8. Result
  const adherent = detectedDialect !== 'none' && statePatch !== null && truncatedAt === null;

  return {
    segments,
    statePatch,
    reasoning,
    truncatedAt,
    dialect: detectedDialect,
    adherent,
    warnings,
    heldBack,
    parserVersion: PARSER_VERSION
  };
}

/**
 * Strips reasoning and state blocks from text, keeping markdown code fences intact.
 */
export function stripOutOfBand(text: string): string {
  let result = text.replace(/\r\n|\r/g, '\n');

  // Strip reasoning blocks
  result = result.replace(/<(think|thinking|reasoning)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  result = result.replace(/<(think|thinking|reasoning)\b[^>]*>[\s\S]*$/gi, '');

  // Strip XML state
  result = result.replace(/<state\b[^>]*>[\s\S]*?<\/state>/gi, '');
  result = result.replace(/<state\b[^>]*>[\s\S]*$/gi, '');

  // Strip Comment state
  result = result.replace(/<!--\s*state\b[\s\S]*?-->/gi, '');
  result = result.replace(/<!--\s*state\b[\s\S]*$/gi, '');

  // Strip fenced state (closed or open at EOF)
  result = result.replace(/(?:^|\n|\s*)(`{3,}|~{3,})\s*(?:state|json\s*state|state\s*json)\b[\s\S]*?\1\s*/gi, '');
  result = result.replace(/(?:^|\n|\s*)(`{3,}|~{3,})\s*(?:state|json\s*state|state\s*json)\b[\s\S]*$/gi, '');

  return result.trim();
}

/**
 * Serializes normalized segments and an optional state patch into a canonical envelope string.
 * Throws RangeError if any segment's text contains a line matching a header/closer/fence of the target dialect.
 */
export function serializeSegments(
  segments: Segment[],
  statePatch: StateVector | null,
  dialect: Dialect = 'directive'
): string {
  const parts: string[] = [];

  for (const seg of segments) {
    const lines = seg.text.split('\n');
    for (const line of lines) {
      if (dialect === 'directive') {
        if (DIRECTIVE_HEADER_RE.test(line) || DIRECTIVE_CLOSER_RE.test(line) || STATE_FENCE_OPEN_RE.test(line)) {
          throw new RangeError(`Segment text contains an unescaped directive delimiter: "${line}"`);
        }
      } else if (dialect === 'xml') {
        if (XML_HEADER_RE.test(line) || XML_CLOSER_LINE_RE.test(line) || /<state\b/i.test(line)) {
          throw new RangeError(`Segment text contains an unescaped XML delimiter: "${line}"`);
        }
      } else if (dialect === 'prefix') {
        const pm = line.match(PREFIX_SPEAKER_RE);
        const rawName = pm ? pm[1].trim() : '';
        const isPrefixHeader =
          pm !== null &&
          !PREFIX_STOPLIST.has(rawName.toLowerCase()) &&
          (rawName.toLowerCase() === 'narrator' ||
            (/^[A-Z]/.test(rawName) && rawName.split(/\s+/).length <= 3));

        if (isPrefixHeader || STATE_FENCE_OPEN_RE.test(line)) {
          throw new RangeError(`Segment text contains an unescaped prefix delimiter: "${line}"`);
        }
      }
    }

    if (dialect === 'directive') {
      let header: string;
      if (seg.kind === 'narrator') {
        header = ':::narrator';
      } else if (seg.kind === 'character') {
        const cleanName = (seg.name ?? '').replace(/\]/g, '');
        header = cleanName ? `:::character[${cleanName}]` : ':::character';
      } else if (seg.kind === 'npc') {
        const cleanName = (seg.name ?? '').replace(/\]/g, '');
        header = cleanName ? `:::npc[${cleanName}]` : ':::npc';
      } else {
        const cleanName = (seg.name ?? '').replace(/\]/g, '');
        header = cleanName ? `:::persona[${cleanName}]` : ':::persona';
      }
      parts.push(`${header}\n${seg.text}\n:::`);
    } else if (dialect === 'xml') {
      let openTag: string;
      let closeTag: string;
      if (seg.kind === 'narrator') {
        openTag = '<narrator>';
        closeTag = '</narrator>';
      } else if (seg.kind === 'character') {
        const cleanName = (seg.name ?? '').replace(/"/g, '');
        openTag = cleanName ? `<character name="${cleanName}">` : '<character>';
        closeTag = '</character>';
      } else if (seg.kind === 'npc') {
        const cleanName = (seg.name ?? '').replace(/"/g, '');
        openTag = cleanName ? `<npc name="${cleanName}">` : '<npc>';
        closeTag = '</npc>';
      } else {
        const cleanName = (seg.name ?? '').replace(/"/g, '');
        openTag = cleanName ? `<persona name="${cleanName}">` : '<persona>';
        closeTag = '</persona>';
      }
      parts.push(`${openTag}\n${seg.text}\n${closeTag}`);
    } else {
      // Prefix dialect
      let speaker: string;
      if (seg.kind === 'narrator') {
        speaker = 'Narrator';
      } else {
        speaker = seg.name ?? 'Character';
      }
      parts.push(`${speaker}: ${seg.text}`);
    }
  }

  if (statePatch !== null) {
    const json = JSON.stringify(statePatch);
    if (dialect === 'directive' || dialect === 'prefix') {
      parts.push(`\`\`\`state\n${json}\n\`\`\``);
    } else if (dialect === 'xml') {
      parts.push(`<state>\n${json}\n</state>`);
    }
  }

  return parts.join('\n\n');
}

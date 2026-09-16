import { parseEnvelope, serializeSegments, type ParseResult } from '@formatavern/shared';

export type NarrativeDialect = 'directive' | 'xml' | 'prefix';

export const PREAMBLE_DEFAULT =
  'You are an expert roleplay assistant. Stay in character, maintain fidelity to the world and established personalities, and craft vivid, engaging prose.';

export const AGENCY_CLAUSE =
  'Never write dialogue, thoughts, feelings, or actions for {{user}}. Stop and yield when {{user}} must react or decide.';

export const DIRECTIVE_SYNTAX_EXAMPLE = `:::narrator
The morning mist clears over the valley.
:::

:::character[{{char}}]
We should press on before the scouts spot us.
:::

:::npc[Side character]
The road ahead looks clear, for now.
:::

\`\`\`state
{"mood":"calm"}
\`\`\``;

export const XML_SYNTAX_EXAMPLE = `<narrator>
The morning mist clears over the valley.
</narrator>

<character name="{{char}}">
We should press on before the scouts spot us.
</character>

<npc name="Side character">
The road ahead looks clear, for now.
</npc>

<state>
{"mood":"calm"}
</state>`;

export const PREFIX_SYNTAX_EXAMPLE = `Narrator: The morning mist clears over the valley.

{{char}}: We should press on before the scouts spot us.

Side character: The road ahead looks clear, for now.

\`\`\`state
{"mood":"calm"}
\`\`\``;

export const CONTINUATION_PREFILL_REMINDER =
  'Continue the reply exactly where it stopped, then end with a state block.';

/**
 * Validates a user-supplied narrative example (§4 template editor). The example
 * is authored once, in directive syntax, and rendered into the active dialect
 * at build time — so validation is structural, using the parser itself:
 * - it must parse as directive (writing xml/prefix here teaches the wrong syntax);
 * - it must contain at least one segment and a state block (an example without
 *   one teaches the model to emit bare `[state]` prose);
 * - it must not speak for the persona (persona segments would bypass the
 *   agency rule the fixed clause enforces).
 * The agency clause and state instruction live in fixed code around the example.
 * Returns human-readable issues; empty means valid.
 */
export function validateNarrativeExample(text: string): string[] {
  if (!text || text.trim().length === 0) {
    return ['Example is empty — reset to the built-in example instead of saving a blank one.'];
  }
  let parsed: ParseResult;
  try {
    parsed = parseEnvelope(text, {
      primaryCharacter: 'Character',
      dialect: 'directive',
      streaming: false
    });
  } catch (err: any) {
    return [`Example does not parse as directive blocks: ${err?.message ?? String(err)}`];
  }
  const issues: string[] = [];
  if (parsed.dialect !== 'directive') {
    issues.push('Write the example in directive block syntax (:::kind[name] ... :::) — it is rendered into the other dialects automatically.');
  }
  // The parser truncates persona-voiced content by default, so a persona verse
  // shows up as truncation (not as a segment) — check the signal, not the kind.
  if (parsed.truncatedAt === 'persona' || parsed.segments.some((s) => s.kind === 'persona')) {
    issues.push('The example must not speak for the persona — the agency rule forbids the model from voicing them.');
  }
  if (parsed.segments.length === 0) {
    issues.push('The example contains no narrator/character turns to teach the format with.');
  }
  if (parsed.statePatch === null) {
    issues.push('The example must demonstrate the state block (a ```state fence) — otherwise the model emits bare [state] prose.');
  }
  for (const w of parsed.warnings) {
    issues.push(`Parser warning (${w.code}${w.line !== undefined ? `, line ${w.line}` : ''}): ${w.detail ?? 'check the example syntax'}.`);
  }
  return issues;
}

/**
 * Renders the narrative example into a target dialect. Without an override the
 * hand-tuned built-in for that dialect is used verbatim (never round-tripped:
 * prefix prose can collide with the prefix speaker detection on re-serialize).
 * A custom override is authored once in directive syntax: it is validated
 * first, then parsed and serialized into the target dialect. Any failure falls
 * back to the built-in with a warning (validated at save, but code can change
 * under a stored value — never emit a broken block).
 */
export function renderExampleForDialect(
  dialect: NarrativeDialect,
  override: string | undefined,
  warnings: string[]
): string {
  const fallback =
    dialect === 'xml' ? XML_SYNTAX_EXAMPLE : dialect === 'prefix' ? PREFIX_SYNTAX_EXAMPLE : DIRECTIVE_SYNTAX_EXAMPLE;
  if (!override?.trim()) return fallback;
  const issues = validateNarrativeExample(override);
  if (issues.length > 0) {
    warnings.push(`Custom narrative example failed validation (${issues[0]}); using the built-in example.`);
    return fallback;
  }
  try {
    const parsed = parseEnvelope(override, {
      primaryCharacter: 'Character',
      dialect: 'directive',
      streaming: false
    });
    return serializeSegments(parsed.segments, parsed.statePatch, dialect);
  } catch (err: any) {
    warnings.push(
      `Custom narrative example failed to render (${err?.message ?? String(err)}); using the built-in example.`
    );
    return fallback;
  }
}

export const CONTINUATION_NO_PREFILL_NUDGE =
  '[Continue your previous reply exactly where it stopped. Do not repeat.]';

export const SYNTHETIC_CONTINUE_SCENE = '[Continue the scene.]';
export const SYNTHETIC_SCENE_BEGINS = '[Scene begins.]';

/**
 * Client-side mirror of the backend narrative-example guardrails
 * (`validateNarrativeExample`). Deliberately string-based rather than
 * structural: the frontend may not import the envelope parser (invariant U3),
 * so the instant inline feedback checks the same rules by shape while the
 * server enforces them with the parser itself on save. Keep the messages
 * aligned when either side changes.
 *
 * The example is authored once, in directive syntax; the server renders it
 * into the xml/prefix dialects automatically.
 */

export function validateNarrativeExample(text: string): string[] {
  const issues: string[] = [];
  if (!text || text.trim().length === 0) {
    return ['Example is empty — reset to the built-in example instead of saving a blank one.'];
  }
  if (!text.includes(':::')) {
    issues.push(
      'Write the example in directive block syntax (:::kind[name] ... :::) — it is rendered into the other dialects automatically.'
    );
  }
  if (!text.includes('```state')) {
    issues.push(
      'The example must demonstrate the state block (a ```state fence) — otherwise the model emits bare [state] prose.'
    );
  }
  if (text.includes(':::persona') || text.includes(':::user')) {
    issues.push(
      'The example must not speak for the persona (:::persona / :::user markers) — the agency rule forbids the model from voicing them.'
    );
  }
  if (
    text.includes('<persona') ||
    text.includes('</persona>') ||
    text.includes('<user') ||
    text.includes('</user>')
  ) {
    issues.push(
      'The example must not speak for the persona (<persona> / <user> tags) — the agency rule forbids the model from voicing them.'
    );
  }
  return issues;
}

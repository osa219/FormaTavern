/**
 * Replaces macros in a single pass.
 * Handles {{char}} and {{user}} (case-insensitive, optional whitespace),
 * as well as legacy <BOT> and <USER> exact tokens.
 */
export function applyMacros(text: string, vars: { char: string; user: string }): string {
  return text.replace(/\{\{\s*(char|user)\s*\}\}|<BOT>|<USER>/gi, (match, p1) => {
    if (p1) {
      return p1.toLowerCase() === 'char' ? vars.char : vars.user;
    }
    if (match === '<BOT>') return vars.char;
    if (match === '<USER>') return vars.user;
    return match;
  });
}

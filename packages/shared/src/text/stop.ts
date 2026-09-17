import type { Dialect } from '../envelope/types';
import type { PersonaVoicingPolicy } from '../schemas/narrative';

/**
 * Builds stop sequences appropriate for the active dialect.
 * Guaranteed to produce <= 4 items (OpenAI family hard limit).
 * personaName is used verbatim.
 */
export function buildStopSequences(
  dialect: Dialect | 'classic',
  personaName: string,
  personaVoicing: PersonaVoicingPolicy = 'prohibited'
): string[] {
  if (personaVoicing === 'allowed') {
    return [];
  }
  if (dialect === 'directive') {
    return [':::persona', ':::user', `\n${personaName}:`];
  }
  if (dialect === 'xml') {
    return ['<persona', '<user', `\n${personaName}:`];
  }
  // prefix or classic
  return [`\n${personaName}:`];
}

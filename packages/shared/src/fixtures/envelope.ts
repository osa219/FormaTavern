import type { SegmentKind } from '../schemas/narrative';
import type { StateVector } from '../schemas/state';
import type { Dialect, ParseWarningCode } from '../envelope/types';

export type EnvelopeScriptId =
  | 'envelope-directive'
  | 'envelope-xml'
  | 'envelope-prefix'
  | 'classic'
  | 'sloppy'
  | 'persona-violation'
  | 'truncated'
  | 'reasoning'
  | 'error';

export interface EnvelopeScript {
  id: EnvelopeScriptId;
  primaryCharacter: string;
  knownNames?: string[];
  personaName?: string;
  dialect: Dialect | 'auto';
  text: string;
  chunks: readonly string[];
  terminal:
    | { type: 'done'; finishReason: 'stop' | 'length' }
    | { type: 'error'; message: string; recoverable: boolean };
  expect: {
    dialect: Dialect | 'none';
    segments: Array<{ kind: SegmentKind; name?: string; textStartsWith: string }>;
    statePatch: StateVector | null;
    truncatedAt: 'persona' | null;
    warningCodes: ParseWarningCode[];
  };
}

// 1. envelope-directive: Eldrin fixture with em dash and non-BMP character 🜁 (\uD83D\uDF01)
const directiveText =
  ':::narrator\n' +
  'The night wind howls across the high peaks—carrying the scent of ozone and ancient dust 🜁 as the observatory awakens.\n' +
  ':::\n\n' +
  ':::character[Eldrin the Mage]\n' +
  'The convergence is beginning. Keep your focus steady on the crystal lens.\n' +
  ':::\n\n' +
  ':::npc[Apprentice]\n' +
  'Master, the secondary rings are vibrating out of alignment!\n' +
  ':::\n\n' +
  '```state\n' +
  '{"mood":"calm","affinity":5,"danger":"low","scene":"spire_observatory"}\n' +
  '```';

const directiveChunks: readonly string[] = [
  ':::nar', // split inside header keyword
  'rator\n',
  'The night wind howls across the high peaks—carrying the scent of ozone and ancient dust \uD83D', // surrogate split 1
  '\uDF01 as the observatory awakens.\n', // surrogate split 2
  ':::\n',
  '\n:::', // split between \n and :::
  'character[Eld', // split inside [name]
  'rin the Mage]\nThe convergence is beginning. Keep your focus steady on the crystal lens.\n:::\n\n',
  ':::npc[Apprentice]\nMaster, the secondary rings are vibrating out of alignment!\n:::\n\n',
  '``', // split inside fence
  '`st', // split inside 'state' keyword
  'ate\n{"mo', // split inside JSON
  'od":"calm","affinity":5,"danger":"low","scene":"spire_observatory"}\n```'
];

// 2. envelope-xml: Alice tavern ambush with single-line NPC
const xmlText =
  '<narrator>\n' +
  'Shadows stretch across the tavern floorboards as iron boots halt outside.\n' +
  '</narrator>\n\n' +
  '<character name="Alice">\n' +
  'Stay behind the bar. Let me handle this.\n' +
  '</character>\n\n' +
  '<npc name="Guard">Hold it right there!</npc>\n\n' +
  '<state>\n' +
  '{"mood":"alert","tension":7}\n' +
  '</state>';

const xmlChunks: readonly string[] = [
  '<narrator>\nShadows stretch across the tavern floorboards as iron boots halt outside.\n</narrator>\n\n',
  '<character name="Alice">\nStay behind the bar. Let me handle this.\n</character>\n\n',
  '<npc name="Guard">Hold it right there!</npc>\n\n',
  '<state>\n{"mood":"alert","tension":7}\n</state>'
];

// 3. envelope-prefix: Prefix dialect with knownNames and Note: line inside speech
const prefixText =
  'Narrator: Shadows gather in the alleyway as cold rain begins to fall.\n\n' +
  'Alice: Keep your hand near your dagger.\n' +
  'Note: Keep your weapons sheathed.\n' +
  'We cannot afford to strike first.\n\n' +
  'Guard Captain: Drop your weapons and step forward!\n\n' +
  '```state\n' +
  '{"mood":"tense"}\n' +
  '```';

const prefixChunks: readonly string[] = [
  'Narrator: Shadows gather in the alleyway as cold rain begins to fall.\n\n',
  'Alice: Keep your hand near your dagger.\nNote: Keep your weapons sheathed.\nWe cannot afford to strike first.\n\n',
  'Guard Captain: Drop your weapons and step forward!\n\n',
  '```state\n{"mood":"tense"}\n```'
];

// 4. classic: Plain prose without markers
const classicText =
  'The spire observatory stands silent beneath the swirling auroras.\n\n' +
  'Eldrin turns a heavy brass dial, noting the steady resonance in the glass prism.\n\n' +
  'Note: the celestial alignment occurs only once each century.';

const classicChunks: readonly string[] = [
  'The spire observatory stands silent beneath the swirling auroras.\n\n',
  'Eldrin turns a heavy brass dial, noting the steady resonance in the glass prism.\n\n',
  'Note: the celestial alignment occurs only once each century.'
];

// 5. sloppy: Lenient directive syntax with unquoted/repaired state JSON
const sloppyText =
  '::: character Eldrin\n' +
  'I stand ready.\n\n' +
  '::::npc[Guard]:\n' +
  'Halt!\n\n' +
  ':::character[Eldrin] "I warned you."\n' +
  'And with that, he cast his spell.\n\n' +
  '```state\n' +
  "{ 'mood': calm, 'danger': 'high', }\n" +
  '```';

const sloppyChunks: readonly string[] = [
  '::: character Eldrin\nI stand ready.\n\n',
  '::::npc[Guard]:\nHalt!\n\n',
  ':::character[Eldrin] "I warned you."\nAnd with that, he cast his spell.\n\n',
  "```state\n{ 'mood': calm, 'danger': 'high', }\n```"
];

// 6. persona-violation: Agency violation line truncating output and state
const personaViolationText =
  ':::character[Eldrin the Mage]\n' +
  'I prepare the arcane circle.\n\n' +
  ':::persona\n' +
  '"I draw my sword."\n\n' +
  '```state\n' +
  '{"mood":"furious"}\n' +
  '```';

const personaViolationChunks: readonly string[] = [
  ':::character[Eldrin the Mage]\nI prepare the arcane circle.\n\n',
  ':::persona\n"I draw my sword."\n\n',
  '```state\n{"mood":"furious"}\n```'
];

// 7. truncated: Ends mid-state block with length finishReason
const truncatedText =
  ':::character[Eldrin the Mage]\n' +
  'The ritual is nearly complete.\n\n' +
  '```state\n' +
  '{"mood": "urg';

const truncatedChunks: readonly string[] = [
  ':::character[Eldrin the Mage]\nThe ritual is nearly complete.\n\n',
  '```state\n',
  '{"mood": "urg'
];

// 8. reasoning: Preceding <think> tag mentioning Traveler:
const reasoningText =
  '<think>The user (Traveler:) wants to proceed carefully through the ruins.</think>\n\n' +
  ':::character[Eldrin the Mage]\n' +
  'Watch your step among these ancient stones.\n\n' +
  '```state\n' +
  '{"mood":"cautious"}\n' +
  '```';

const reasoningChunks: readonly string[] = [
  '<think>The user (Traveler:) wants to proceed carefully through the ruins.</think>\n\n',
  ':::character[Eldrin the Mage]\nWatch your step among these ancient stones.\n\n',
  '```state\n{"mood":"cautious"}\n```'
];

// 9. error: Two tokens then terminal error
const errorText = 'I cannot';
const errorChunks: readonly string[] = ['I can', 'not'];

export const ENVELOPE_SCRIPTS: Record<EnvelopeScriptId, EnvelopeScript> = {
  'envelope-directive': {
    id: 'envelope-directive',
    primaryCharacter: 'Eldrin the Mage',
    dialect: 'auto',
    text: directiveText,
    chunks: directiveChunks,
    terminal: { type: 'done', finishReason: 'stop' },
    expect: {
      dialect: 'directive',
      segments: [
        { kind: 'narrator', textStartsWith: 'The night wind' },
        { kind: 'character', name: 'Eldrin the Mage', textStartsWith: 'The convergence' },
        { kind: 'npc', name: 'Apprentice', textStartsWith: 'Master' }
      ],
      statePatch: { mood: 'calm', affinity: 5, danger: 'low', scene: 'spire_observatory' },
      truncatedAt: null,
      warningCodes: []
    }
  },
  'envelope-xml': {
    id: 'envelope-xml',
    primaryCharacter: 'Alice',
    dialect: 'auto',
    text: xmlText,
    chunks: xmlChunks,
    terminal: { type: 'done', finishReason: 'stop' },
    expect: {
      dialect: 'xml',
      segments: [
        { kind: 'narrator', textStartsWith: 'Shadows stretch' },
        { kind: 'character', name: 'Alice', textStartsWith: 'Stay behind' },
        { kind: 'npc', name: 'Guard', textStartsWith: 'Hold it' }
      ],
      statePatch: { mood: 'alert', tension: 7 },
      truncatedAt: null,
      warningCodes: []
    }
  },
  'envelope-prefix': {
    id: 'envelope-prefix',
    primaryCharacter: 'Alice',
    knownNames: ['Alice', 'Guard Captain'],
    dialect: 'prefix',
    text: prefixText,
    chunks: prefixChunks,
    terminal: { type: 'done', finishReason: 'stop' },
    expect: {
      dialect: 'prefix',
      segments: [
        { kind: 'narrator', textStartsWith: 'Shadows gather' },
        { kind: 'character', name: 'Alice', textStartsWith: 'Keep your hand' },
        { kind: 'npc', name: 'Guard Captain', textStartsWith: 'Drop your' }
      ],
      statePatch: { mood: 'tense' },
      truncatedAt: null,
      warningCodes: []
    }
  },
  'classic': {
    id: 'classic',
    primaryCharacter: 'Eldrin the Mage',
    dialect: 'auto',
    text: classicText,
    chunks: classicChunks,
    terminal: { type: 'done', finishReason: 'stop' },
    expect: {
      dialect: 'none',
      segments: [{ kind: 'character', name: 'Eldrin the Mage', textStartsWith: 'The spire' }],
      statePatch: null,
      truncatedAt: null,
      warningCodes: []
    }
  },
  'sloppy': {
    id: 'sloppy',
    primaryCharacter: 'Eldrin',
    dialect: 'auto',
    text: sloppyText,
    chunks: sloppyChunks,
    terminal: { type: 'done', finishReason: 'stop' },
    expect: {
      dialect: 'directive',
      segments: [
        { kind: 'character', name: 'Eldrin', textStartsWith: 'I stand' },
        { kind: 'npc', name: 'Guard', textStartsWith: 'Halt!' },
        { kind: 'character', name: 'Eldrin', textStartsWith: '"I warned you."' }
      ],
      statePatch: { mood: 'calm', danger: 'high' },
      truncatedAt: null,
      warningCodes: ['state_repaired']
    }
  },
  'persona-violation': {
    id: 'persona-violation',
    primaryCharacter: 'Eldrin the Mage',
    dialect: 'auto',
    text: personaViolationText,
    chunks: personaViolationChunks,
    terminal: { type: 'done', finishReason: 'stop' },
    expect: {
      dialect: 'directive',
      segments: [{ kind: 'character', name: 'Eldrin the Mage', textStartsWith: 'I prepare' }],
      statePatch: null,
      truncatedAt: 'persona',
      warningCodes: []
    }
  },
  'truncated': {
    id: 'truncated',
    primaryCharacter: 'Eldrin the Mage',
    dialect: 'auto',
    text: truncatedText,
    chunks: truncatedChunks,
    terminal: { type: 'done', finishReason: 'length' },
    expect: {
      dialect: 'directive',
      segments: [{ kind: 'character', name: 'Eldrin the Mage', textStartsWith: 'The ritual' }],
      statePatch: null,
      truncatedAt: null,
      warningCodes: ['state_unclosed']
    }
  },
  'reasoning': {
    id: 'reasoning',
    primaryCharacter: 'Eldrin the Mage',
    personaName: 'Traveler',
    dialect: 'auto',
    text: reasoningText,
    chunks: reasoningChunks,
    terminal: { type: 'done', finishReason: 'stop' },
    expect: {
      dialect: 'directive',
      segments: [{ kind: 'character', name: 'Eldrin the Mage', textStartsWith: 'Watch your' }],
      statePatch: { mood: 'cautious' },
      truncatedAt: null,
      warningCodes: []
    }
  },
  'error': {
    id: 'error',
    primaryCharacter: 'Eldrin the Mage',
    dialect: 'auto',
    text: errorText,
    chunks: errorChunks,
    terminal: { type: 'error', message: 'mock upstream failure', recoverable: false },
    expect: {
      dialect: 'none',
      segments: [{ kind: 'character', name: 'Eldrin the Mage', textStartsWith: 'I cannot' }],
      statePatch: null,
      truncatedAt: null,
      warningCodes: []
    }
  }
};

export const ENVELOPE_SCRIPT_IDS = Object.keys(ENVELOPE_SCRIPTS) as EnvelopeScriptId[];

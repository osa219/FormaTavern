import { describe, it, expect } from 'bun:test';
import { serializeSegments, stripOutOfBand } from '../../src/envelope';
import type { Segment } from '../../src/schemas/narrative';

describe('Envelope Serialization & Out-of-band Stripping', () => {
  const sampleSegments: Segment[] = [
    { kind: 'narrator', text: 'Midnight strikes in the city.' },
    { kind: 'character', name: 'Alice', text: 'Hurry, we must leave.' },
    { kind: 'npc', name: 'Guard', text: 'Halt, who goes there?' }
  ];
  const samplePatch = { mood: 'tense', danger: 'high' };

  it('produces exact canonical string for directive dialect', () => {
    const expected =
      ':::narrator\n' +
      'Midnight strikes in the city.\n' +
      ':::\n\n' +
      ':::character[Alice]\n' +
      'Hurry, we must leave.\n' +
      ':::\n\n' +
      ':::npc[Guard]\n' +
      'Halt, who goes there?\n' +
      ':::\n\n' +
      '```state\n' +
      '{"mood":"tense","danger":"high"}\n' +
      '```';

    const actual = serializeSegments(sampleSegments, samplePatch, 'directive');
    expect(actual).toBe(expected);
  });

  it('produces exact canonical string for xml dialect', () => {
    const expected =
      '<narrator>\n' +
      'Midnight strikes in the city.\n' +
      '</narrator>\n\n' +
      '<character name="Alice">\n' +
      'Hurry, we must leave.\n' +
      '</character>\n\n' +
      '<npc name="Guard">\n' +
      'Halt, who goes there?\n' +
      '</npc>\n\n' +
      '<state>\n' +
      '{"mood":"tense","danger":"high"}\n' +
      '</state>';

    const actual = serializeSegments(sampleSegments, samplePatch, 'xml');
    expect(actual).toBe(expected);
  });

  it('produces exact canonical string for prefix dialect', () => {
    const expected =
      'Narrator: Midnight strikes in the city.\n\n' +
      'Alice: Hurry, we must leave.\n\n' +
      'Guard: Halt, who goes there?\n\n' +
      '```state\n' +
      '{"mood":"tense","danger":"high"}\n' +
      '```';

    const actual = serializeSegments(sampleSegments, samplePatch, 'prefix');
    expect(actual).toBe(expected);
  });

  it('omits state block when patch is null', () => {
    const actual = serializeSegments(sampleSegments, null, 'directive');
    expect(actual.includes('```state')).toBe(false);
  });

  it('throws RangeError on non-normalized input containing embedded headers', () => {
    const badSegments: Segment[] = [
      {
        kind: 'character',
        name: 'Alice',
        text: 'Look out!\n:::npc[Guard]\nSurprise!'
      }
    ];
    expect(() => serializeSegments(badSegments, null, 'directive')).toThrow(RangeError);
  });

  it('stripOutOfBand removes state and reasoning blocks while preserving regular markdown fences', () => {
    const input =
      '<think>Deep magical thoughts.</think>\n\n' +
      'Here is the spell code:\n' +
      '```python\n' +
      'def cast_spell():\n' +
      '    print("Lumos")\n' +
      '```\n\n' +
      '```state\n' +
      '{"mana": 20}\n' +
      '```';

    const stripped = stripOutOfBand(input);
    expect(stripped.includes('<think>')).toBe(false);
    expect(stripped.includes('Deep magical thoughts.')).toBe(false);
    expect(stripped.includes('```state')).toBe(false);
    expect(stripped.includes('{"mana": 20}')).toBe(false);
    expect(stripped.includes('```python')).toBe(true);
    expect(stripped.includes('def cast_spell():')).toBe(true);
  });
});

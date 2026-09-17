import { describe, it, expect } from 'bun:test';
import { parseEnvelope } from '../../src/envelope';
import { ENVELOPE_SCRIPTS, ENVELOPE_SCRIPT_IDS } from '../../src/fixtures/envelope';

describe('Envelope Parser (Normative Table & Edge Cases)', () => {
  // 1. Table-driven over ENVELOPE_SCRIPTS
  for (const id of ENVELOPE_SCRIPT_IDS) {
    const script = ENVELOPE_SCRIPTS[id];
    it(`parses script fixture "${id}" matching expected contract`, () => {
      const res = parseEnvelope(script.text, {
        primaryCharacter: script.primaryCharacter,
        knownNames: script.knownNames,
        dialect: script.dialect,
        personaName: script.personaName ?? 'Traveler'
      });

      expect(res.dialect).toBe(script.expect.dialect);
      expect(res.truncatedAt).toBe(script.expect.truncatedAt);
      expect(res.statePatch).toEqual(script.expect.statePatch);

      // Warning codes match (order-insensitive)
      const warningCodes = res.warnings.map((w) => w.code).sort();
      const expectedCodes = [...script.expect.warningCodes].sort();
      expect(warningCodes).toEqual(expectedCodes);

      // Segments check
      expect(res.segments.length).toBe(script.expect.segments.length);
      for (let i = 0; i < script.expect.segments.length; i++) {
        const expSeg = script.expect.segments[i];
        const actualSeg = res.segments[i];
        expect(actualSeg.kind).toBe(expSeg.kind);
        if (expSeg.name !== undefined) {
          expect(actualSeg.name).toBe(expSeg.name);
        }
        expect(actualSeg.text.startsWith(expSeg.textStartsWith)).toBe(true);
      }
    });
  }

  // 2. Superset Invariant E2
  it('enforces E2 superset: raw prose produces one character segment without errors', () => {
    const raw = 'The rain falls gently upon the stones.\n\nNo banners wave.';
    const res = parseEnvelope(raw, { primaryCharacter: 'Eldrin the Mage' });
    expect(res.dialect).toBe('none');
    expect(res.statePatch).toBeNull();
    expect(res.adherent).toBe(false);
    expect(res.segments.length).toBe(1);
    expect(res.segments[0]).toEqual({
      kind: 'character',
      name: 'Eldrin the Mage',
      text: raw
    });
  });

  // 3. Text before first header
  it('attributes text before the first header to the primary character', () => {
    const input = 'Introductory prose.\n\n:::narrator\nThree days pass.\n:::';
    const res = parseEnvelope(input, { primaryCharacter: 'Alice' });
    expect(res.segments.length).toBe(2);
    expect(res.segments[0]).toEqual({
      kind: 'character',
      name: 'Alice',
      text: 'Introductory prose.'
    });
    expect(res.segments[1]).toEqual({
      kind: 'narrator',
      name: undefined,
      text: 'Three days pass.'
    });
  });

  // 4. Lenience Table
  describe('Grammar Lenience (L1-L4)', () => {
    it('handles :::char[Alice] as character with name Alice', () => {
      const res = parseEnvelope(':::char[Alice]\nHello.', { primaryCharacter: 'Eldrin' });
      expect(res.segments[0]).toEqual({ kind: 'character', name: 'Alice', text: 'Hello.' });
    });

    it('handles ::: character Alice (bare spaced name)', () => {
      const res = parseEnvelope('::: character Alice\nHello.', { primaryCharacter: 'Eldrin' });
      expect(res.segments[0]).toEqual({ kind: 'character', name: 'Alice', text: 'Hello.' });
    });

    it('defaults name when bare tail contains punctuation (:::character Alice draws her sword.)', () => {
      const res = parseEnvelope(':::character Alice draws her sword.\nAnd strikes.', {
        primaryCharacter: 'Eldrin'
      });
      expect(res.segments[0]).toEqual({
        kind: 'character',
        name: 'Eldrin',
        text: 'Alice draws her sword.\nAnd strikes.'
      });
    });

    it('handles ::::npc[Guard]: with multiple colons and trailing colon', () => {
      const res = parseEnvelope('::::npc[Guard]:\nHalt!', { primaryCharacter: 'Eldrin' });
      expect(res.segments[0]).toEqual({ kind: 'npc', name: 'Guard', text: 'Halt!' });
    });

    it('handles :::Narrator without name', () => {
      const res = parseEnvelope(':::Narrator\nDawn breaks.', { primaryCharacter: 'Eldrin' });
      expect(res.segments[0]).toEqual({ kind: 'narrator', name: undefined, text: 'Dawn breaks.' });
    });

    it('handles inline body after bracket (:::character[Alice] "Now!")', () => {
      const res = parseEnvelope(':::character[Alice] "Now!"\nAttack!', { primaryCharacter: 'Eldrin' });
      expect(res.segments[0]).toEqual({
        kind: 'character',
        name: 'Alice',
        text: '"Now!"\nAttack!'
      });
    });

    it('does NOT treat :::characters or :::characterization as headers', () => {
      const res = parseEnvelope(':::characters are listed below.\n1. Alice', {
        primaryCharacter: 'Eldrin'
      });
      expect(res.dialect).toBe('none');
      expect(res.segments[0].text).toContain(':::characters are listed below.');
    });

    it('handles standalone closers ::: and line-end XML closers </character>', () => {
      const input =
        ':::character[Alice]\nLine 1\n:::\n\n<character name="Bob">Line 2</character>\n\n<npc name="Guard">\nLine 3\n</npc>';
      const res = parseEnvelope(input, { primaryCharacter: 'Eldrin' });
      expect(res.segments.length).toBe(3);
      expect(res.segments[0].text).toBe('Line 1');
      expect(res.segments[1].text).toBe('Line 2');
      expect(res.segments[2].text).toBe('Line 3');
    });

    it('handles unquoted XML attribute <character name=Alice>', () => {
      const res = parseEnvelope('<character name=Alice>\nGreetings.\n</character>', {
        primaryCharacter: 'Eldrin'
      });
      expect(res.segments[0]).toEqual({
        kind: 'character',
        name: 'Alice',
        text: 'Greetings.'
      });
    });
  });

  // 5. State parsing edge cases
  describe('State Extraction Edge Cases', () => {
    it('parses ~~~state fence and HTML comments <!--state ... -->', () => {
      const f1 = ':::character[Eldrin]\nHi.\n\n~~~state\n{"f":1}\n~~~';
      const r1 = parseEnvelope(f1, { primaryCharacter: 'Eldrin' });
      expect(r1.statePatch).toEqual({ f: 1 });

      const f2 = ':::character[Eldrin]\nHi.\n\n<!--state\n{"c":2}\n-->';
      const r2 = parseEnvelope(f2, { primaryCharacter: 'Eldrin' });
      expect(r2.statePatch).toEqual({ c: 2 });
    });

    it('warns on state_unparseable when JSON is completely invalid', () => {
      const input = ':::character[Eldrin]\nHi.\n\n```state\n{invalid json garbage}\n```';
      const res = parseEnvelope(input, { primaryCharacter: 'Eldrin' });
      expect(res.statePatch).toBeNull();
      expect(res.warnings.some((w) => w.code === 'state_unparseable')).toBe(true);
    });

    it('warns on state_not_object when body parses to an array or primitive', () => {
      const input = ':::character[Eldrin]\nHi.\n\n```state\n[1, 2, 3]\n```';
      const res = parseEnvelope(input, { primaryCharacter: 'Eldrin' });
      expect(res.statePatch).toBeNull();
      expect(res.warnings.some((w) => w.code === 'state_not_object')).toBe(true);
    });

    it('handles multiple state blocks where last closed one wins with warning', () => {
      const input =
        ':::character[Eldrin]\nHi.\n\n```state\n{"v":1}\n```\n\n```state\n{"v":2}\n```';
      const res = parseEnvelope(input, { primaryCharacter: 'Eldrin' });
      expect(res.statePatch).toEqual({ v: 2 });
      expect(res.warnings.some((w) => w.code === 'multiple_state_blocks')).toBe(true);
    });

    it('warns on state_not_terminal if non-whitespace text follows state block', () => {
      const input = ':::character[Eldrin]\nHi.\n\n```state\n{"v":1}\n```\n\nP.S. Note this.';
      const res = parseEnvelope(input, { primaryCharacter: 'Eldrin' });
      expect(res.statePatch).toEqual({ v: 1 });
      expect(res.warnings.some((w) => w.code === 'state_not_terminal')).toBe(true);
      expect(res.segments.some((s) => s.text.includes('P.S. Note this.'))).toBe(true);
    });

    it('warns on state_unclosed and yields statePatch: null when unclosed at EOF', () => {
      const input = ':::character[Eldrin]\nHi.\n\n```state\n{"mood":"calm"';
      const res = parseEnvelope(input, { primaryCharacter: 'Eldrin', streaming: false });
      expect(res.statePatch).toBeNull();
      expect(res.warnings.some((w) => w.code === 'state_unclosed')).toBe(true);
    });
  });

  // 6. Reasoning extraction
  describe('Reasoning Extraction', () => {
    it('extracts <think>...</think> and strips it from segments', () => {
      const input =
        '<think>Internal deliberation about magic.</think>\n\n:::character[Eldrin]\nI have decided.';
      const res = parseEnvelope(input, { primaryCharacter: 'Eldrin' });
      expect(res.reasoning).toBe('Internal deliberation about magic.');
      expect(res.segments[0].text).toBe('I have decided.');
    });

    it('warns on reasoning_unclosed in non-streaming mode', () => {
      const input = '<think>I am still thinking...';
      const res = parseEnvelope(input, { primaryCharacter: 'Eldrin', streaming: false });
      expect(res.reasoning).toBe('I am still thinking...');
      expect(res.warnings.some((w) => w.code === 'reasoning_unclosed')).toBe(true);
    });
  });

  // 7. Agency Truncation
  describe('Agency Truncation', () => {
    it('truncates at :::persona, :::user, <persona>, <user>, {{user}}:, personaName:, Persona:, and User:', () => {
      const cases = [
        ':::character[Eldrin]\nSpell.\n:::persona\nSword.',
        ':::character[Eldrin]\nSpell.\n:::user\nSword.',
        ':::character[Eldrin]\nSpell.\n<persona name="Traveler">Sword.</persona>',
        ':::character[Eldrin]\nSpell.\n<user name="Traveler">Sword.</user>',
        ':::character[Eldrin]\nSpell.\n{{user}}: Sword.',
        ':::character[Eldrin]\nSpell.\nTraveler: Sword.',
        ':::character[Eldrin]\nSpell.\nPersona: Sword.',
        ':::character[Eldrin]\nSpell.\nUser: Sword.'
      ];

      for (const c of cases) {
        const res = parseEnvelope(c, { primaryCharacter: 'Eldrin', personaName: 'Traveler' });
        expect(res.truncatedAt).toBe('persona');
        expect(res.segments.length).toBe(1);
        expect(res.segments[0].text).toBe('Spell.');
        expect(res.segments[0].text.includes('Sword.')).toBe(false);
      }
    });

    it('safely escapes persona names with regex metacharacters (e.g. Dr. X (v2))', () => {
      const input = ':::character[Eldrin]\nSpell.\nDr. X (v2): Action.';
      const res = parseEnvelope(input, { primaryCharacter: 'Eldrin', personaName: 'Dr. X (v2)' });
      expect(res.truncatedAt).toBe('persona');
      expect(res.segments[0].text).toBe('Spell.');
    });

    it('yields persona segment and does not truncate when allowPersona: true', () => {
      const input = ':::character[Eldrin]\nSpell.\n\n:::persona[Traveler]\nSword.';
      const res = parseEnvelope(input, {
        primaryCharacter: 'Eldrin',
        personaName: 'Traveler',
        allowPersona: true
      });
      expect(res.truncatedAt).toBeNull();
      expect(res.segments.length).toBe(2);
      expect(res.segments[1]).toEqual({
        kind: 'persona',
        name: 'Traveler',
        text: 'Sword.'
      });
      expect(res.adherent).toBe(false); // no state block in this snippet
    });

    it('yields persona segment in XML and prefix dialects when allowPersona: true', () => {
      const xmlInput = '<character name="Eldrin">\nSpell.\n</character>\n<persona name="Traveler">\nSword.\n</persona>\n<state>\n{"mood":"calm"}\n</state>';
      const xmlRes = parseEnvelope(xmlInput, {
        primaryCharacter: 'Eldrin',
        personaName: 'Traveler',
        allowPersona: true
      });
      expect(xmlRes.truncatedAt).toBeNull();
      expect(xmlRes.segments.length).toBe(2);
      expect(xmlRes.segments[1]).toEqual({ kind: 'persona', name: 'Traveler', text: 'Sword.' });
      expect(xmlRes.adherent).toBe(true);

      const prefixInput = 'Eldrin: Spell.\n\nTraveler: Sword.\n\n```state\n{"mood":"calm"}\n```';
      const prefixRes = parseEnvelope(prefixInput, {
        primaryCharacter: 'Eldrin',
        personaName: 'Traveler',
        dialect: 'prefix',
        allowPersona: true
      });
      expect(prefixRes.truncatedAt).toBeNull();
      expect(prefixRes.segments.length).toBe(2);
      expect(prefixRes.segments[1]).toEqual({ kind: 'persona', name: 'Traveler', text: 'Sword.' });
      expect(prefixRes.adherent).toBe(true);

      const genericPersonaInput = 'Persona: Hello there.\n\n```state\n{"mood":"calm"}\n```';
      const genericAllowedRes = parseEnvelope(genericPersonaInput, {
        primaryCharacter: 'Eldrin',
        personaName: 'Traveler',
        dialect: 'prefix',
        allowPersona: true
      });
      expect(genericAllowedRes.truncatedAt).toBeNull();
      expect(genericAllowedRes.segments[0]).toEqual({ kind: 'persona', name: 'Traveler', text: 'Hello there.' });

      const genericProhibitedRes = parseEnvelope(genericPersonaInput, {
        primaryCharacter: 'Eldrin',
        personaName: 'Traveler',
        dialect: 'prefix',
        allowPersona: false
      });
      expect(genericProhibitedRes.truncatedAt).toBe('persona');
      expect(genericProhibitedRes.segments.length).toBe(0);
    });
  });

  // 8. Prefix Gating
  describe('Prefix Gating', () => {
    it('treats unknown speaker as prose in dialect: auto', () => {
      const input = 'Unknown Guy: Hello there.\nHow are you?';
      const res = parseEnvelope(input, { primaryCharacter: 'Eldrin', dialect: 'auto' });
      expect(res.dialect).toBe('none');
      expect(res.segments[0].kind).toBe('character');
      expect(res.segments[0].text).toContain('Unknown Guy: Hello there.');
    });

    it('treats known speaker as npc in dialect: auto', () => {
      const input = 'Guard: Halt!';
      const res = parseEnvelope(input, {
        primaryCharacter: 'Eldrin',
        knownNames: ['Guard'],
        dialect: 'auto'
      });
      expect(res.dialect).toBe('prefix');
      expect(res.segments[0]).toEqual({
        kind: 'npc',
        name: 'Guard',
        text: 'Halt!'
      });
    });

    it('registers capitalized unknown name as npc in dialect: prefix unless on stoplist', () => {
      const input = 'Barkeep: What will it be?\n\nNote: Tavern is noisy.';
      const res = parseEnvelope(input, { primaryCharacter: 'Eldrin', dialect: 'prefix' });
      expect(res.dialect).toBe('prefix');
      expect(res.segments.length).toBe(1);
      expect(res.segments[0].kind).toBe('npc');
      expect(res.segments[0].name).toBe('Barkeep');
      expect(res.segments[0].text).toContain('Note: Tavern is noisy.');
    });

    it('maps Narrator: to narrator kind and primaryCharacter: to character kind', () => {
      const input = 'Narrator: Night falls.\n\nEldrin: Indeed it does.';
      const res = parseEnvelope(input, { primaryCharacter: 'Eldrin', dialect: 'prefix' });
      expect(res.segments.length).toBe(2);
      expect(res.segments[0]).toEqual({ kind: 'narrator', name: undefined, text: 'Night falls.' });
      expect(res.segments[1]).toEqual({ kind: 'character', name: 'Eldrin', text: 'Indeed it does.' });
    });
  });

  // 9. CRLF invariance
  it('produces identical results for CRLF and LF input', () => {
    const lf = ENVELOPE_SCRIPTS['envelope-directive'].text;
    const crlf = lf.replace(/\n/g, '\r\n');
    const resLF = parseEnvelope(lf, { primaryCharacter: 'Eldrin the Mage' });
    const resCRLF = parseEnvelope(crlf, { primaryCharacter: 'Eldrin the Mage' });
    expect(resCRLF).toEqual(resLF);
  });

  // 10. Performance benchmark: 50 KB envelope < 5 ms median
  it('parses a synthetic 50 KB envelope in under 5 ms median over 20 runs', () => {
    let block = ':::character[Eldrin the Mage]\nThis is a substantial paragraph of magical prose detailing ancient secrets.\n:::\n\n';
    while (block.length < 50_000) {
      block += block;
    }
    const synthetic = block.slice(0, 50_000) + '\n\n```state\n{"mood":"calm"}\n```';

    const timings: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      parseEnvelope(synthetic, { primaryCharacter: 'Eldrin the Mage' });
      timings.push(performance.now() - t0);
    }

    timings.sort((a, b) => a - b);
    const median = timings[Math.floor(timings.length / 2)];
    expect(median).toBeLessThan(5);
  });
});

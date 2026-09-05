import { describe, it, expect } from 'bun:test';
import { ENVELOPE_SCRIPTS, ENVELOPE_SCRIPT_IDS } from '../src/fixtures/envelope';

describe('Envelope Fixtures Integrity', () => {
  it('verifies chunks.join("") === text for all 9 scripts', () => {
    for (const id of ENVELOPE_SCRIPT_IDS) {
      const script = ENVELOPE_SCRIPTS[id];
      const joined = script.chunks.join('');
      expect(joined).toBe(script.text);
    }
  });

  it('pins the ES2019 well-formed JSON.stringify surrogate pair split in envelope-directive', () => {
    const directive = ENVELOPE_SCRIPTS['envelope-directive'];
    // Find the boundary between surrogate halves
    let splitIndex = -1;
    for (let i = 0; i < directive.chunks.length - 1; i++) {
      const c1 = directive.chunks[i];
      const c2 = directive.chunks[i + 1];
      const lastCode = c1.charCodeAt(c1.length - 1);
      const firstCode = c2.charCodeAt(0);
      // High surrogate is 0xD800..0xDBFF, Low surrogate is 0xDC00..0xDFFF
      if (lastCode >= 0xd800 && lastCode <= 0xdbff && firstCode >= 0xdc00 && firstCode <= 0xdfff) {
        splitIndex = i;
        break;
      }
    }

    expect(splitIndex).toBeGreaterThanOrEqual(0);
    const chunkA = directive.chunks[splitIndex];
    const chunkB = directive.chunks[splitIndex + 1];

    // Verify lone surrogates escape safely in JSON.stringify without throwing
    const jsonA = JSON.stringify(chunkA);
    const jsonB = JSON.stringify(chunkB);
    const restoredA = JSON.parse(jsonA);
    const restoredB = JSON.parse(jsonB);

    expect(restoredA + restoredB).toBe(chunkA + chunkB);
  });
});

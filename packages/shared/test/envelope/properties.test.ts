import { describe, it, expect } from 'bun:test';
import { parseEnvelope, serializeSegments } from '../../src/envelope';
import { ENVELOPE_SCRIPTS, ENVELOPE_SCRIPT_IDS } from '../../src/fixtures/envelope';
import {
  DIRECTIVE_HEADER_RE,
  DIRECTIVE_CLOSER_RE,
  XML_HEADER_RE,
  XML_CLOSER_LINE_RE,
  STATE_FENCE_OPEN_RE
} from '../../src/envelope/grammar';
import type { Segment } from '../../src/schemas/narrative';
import type { Dialect } from '../../src/envelope/types';

// Simple seeded Mulberry32 PRNG
function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Envelope Properties (E1, E3, E4)', () => {
  const SEED = 4298124;
  console.log(`[properties.test.ts] Mulberry32 PRNG seed: ${SEED}`);
  const rand = mulberry32(SEED);

  // 1. Invariant E1: parse(chunks.join('')) === parse(full), no state, random splits
  it('enforces Invariant E1 across 50 seeded random chunkings per fixture', () => {
    for (const id of ENVELOPE_SCRIPT_IDS) {
      const script = ENVELOPE_SCRIPTS[id];
      const opts = {
        primaryCharacter: script.primaryCharacter,
        knownNames: script.knownNames,
        dialect: script.dialect,
        personaName: script.personaName ?? 'Traveler'
      };

      const baseline = parseEnvelope(script.text, opts);

      // Verify the fixture's own authoring chunks
      const fixtureJoined = script.chunks.join('');
      expect(parseEnvelope(fixtureJoined, opts)).toEqual(baseline);

      // Run 50 random chunkings
      for (let i = 0; i < 50; i++) {
        const text = script.text;
        const numCuts = Math.floor(rand() * 8) + 1;
        const cutIndices = new Set<number>();
        for (let j = 0; j < numCuts; j++) {
          cutIndices.add(Math.floor(rand() * text.length));
        }
        const sortedCuts = Array.from(cutIndices).sort((a, b) => a - b);

        const chunks: string[] = [];
        let prev = 0;
        for (const cut of sortedCuts) {
          if (cut > prev) {
            chunks.push(text.slice(prev, cut));
            prev = cut;
          }
        }
        chunks.push(text.slice(prev));

        // Every prefix of chunks parses without throwing
        let accumulated = '';
        for (const chunk of chunks) {
          accumulated += chunk;
          expect(() => parseEnvelope(accumulated, { ...opts, streaming: true })).not.toThrow();
        }

        // Full reassembly deep-equals baseline
        expect(parseEnvelope(chunks.join(''), opts)).toEqual(baseline);
      }
    }
  });

  // 2. Invariant E3: parse(serialize(segments, patch)) === { segments, patch } across dialects
  it('enforces Invariant E3 round-trip for normalized segments across all 3 dialects', () => {
    const dialects: Dialect[] = ['directive', 'xml', 'prefix'];

    for (const id of ENVELOPE_SCRIPT_IDS) {
      const script = ENVELOPE_SCRIPTS[id];
      // Only test round-trip for scripts that don't violate persona or truncate
      if (id === 'persona-violation' || id === 'truncated' || id === 'error') continue;

      const opts = {
        primaryCharacter: script.primaryCharacter,
        knownNames: script.knownNames ?? [script.primaryCharacter],
        personaName: script.personaName ?? 'Traveler',
        allowPersona: true
      };

      const originalResult = parseEnvelope(script.text, opts);
      const allNames = Array.from(
        new Set([
          script.primaryCharacter,
          'Narrator',
          'Guard',
          'Guard Captain',
          'Apprentice',
          ...(script.knownNames ?? []),
          ...(originalResult.segments.map((s) => s.name).filter(Boolean) as string[])
        ])
      );

      for (const d of dialects) {
        // Skip prefix dialect round-trip if there is an unnamed NPC (prefix requires a speaker name)
        const hasUnnamedNpc = originalResult.segments.some((s) => s.kind === 'npc' && !s.name);
        if (d === 'prefix' && hasUnnamedNpc) continue;

        const serialized = serializeSegments(originalResult.segments, originalResult.statePatch, d);
        const reparsed = parseEnvelope(serialized, {
          ...opts,
          dialect: d,
          knownNames: allNames,
          allowPersona: true
        });

        expect(reparsed.segments).toEqual(originalResult.segments);
        expect(reparsed.statePatch).toEqual(originalResult.statePatch);
      }
    }

    // Plus a hand-made segment list with persona and unnamed npc in directive and xml
    const handmadeSegments: Segment[] = [
      { kind: 'narrator', text: 'The bell tolls at midnight.' },
      { kind: 'character', name: 'Eldrin', text: 'I cast an ancient ward.' },
      { kind: 'npc', name: undefined, text: 'A shadow flits past the window.' },
      { kind: 'persona', name: 'Traveler', text: 'I draw my steel.' }
    ];
    const handmadePatch = { hp: 100, mana: 50 };

    for (const d of ['directive', 'xml'] as Dialect[]) {
      const serialized = serializeSegments(handmadeSegments, handmadePatch, d);
      const reparsed = parseEnvelope(serialized, {
        primaryCharacter: 'Eldrin',
        personaName: 'Traveler',
        dialect: d,
        allowPersona: true
      });

      expect(reparsed.segments).toEqual(handmadeSegments);
      expect(reparsed.statePatch).toEqual(handmadePatch);
    }
  });

  // 3. Invariant E4: Streaming holdback guarantees no leaked markers for every prefix
  it('enforces Invariant E4: no leaked partial markers in rendered segment text for every prefix', () => {
    for (const id of ENVELOPE_SCRIPT_IDS) {
      const script = ENVELOPE_SCRIPTS[id];
      const opts = {
        primaryCharacter: script.primaryCharacter,
        knownNames: script.knownNames,
        dialect: script.dialect,
        personaName: script.personaName ?? 'Traveler',
        streaming: true
      };

      const text = script.text;

      for (let len = 0; len <= text.length; len++) {
        const prefix = text.slice(0, len);
        let res: ReturnType<typeof parseEnvelope>;
        expect(() => {
          res = parseEnvelope(prefix, opts);
        }).not.toThrow();

        // No segment text contains a line matching header/closer/fence regex
        for (const seg of res!.segments) {
          const lines = seg.text.split('\n');
          for (const line of lines) {
            expect(DIRECTIVE_HEADER_RE.test(line)).toBe(false);
            expect(DIRECTIVE_CLOSER_RE.test(line)).toBe(false);
            expect(XML_HEADER_RE.test(line)).toBe(false);
            expect(XML_CLOSER_LINE_RE.test(line)).toBe(false);
            expect(STATE_FENCE_OPEN_RE.test(line)).toBe(false);
          }
        }

        // Rendered text contains no raw delimiter tokens
        const rendered = res!.segments.map((s) => s.text).join('\n');
        expect(rendered.includes(':::')).toBe(false);
        expect(rendered.includes('<narrator')).toBe(false);
        expect(rendered.includes('<character')).toBe(false);
        expect(rendered.includes('<npc')).toBe(false);
        expect(rendered.includes('```state')).toBe(false);

        // HeldBack length check: heldBack.length <= lastLine.length unless an out-of-band block is open
        const hasOpenReasoning = /<(think|thinking|reasoning)\b[^>]*>(?![\s\S]*<\/\1>)/i.test(prefix);
        const hasOpenStateFence = /(?:^|\n)\s*(`{3,}|~{3,})\s*(?:state|json\s*state|state\s*json)\s*$(?![\s\S]*\1\s*$)/im.test(prefix);
        const hasOpenXmlState = /<state\b[^>]*>(?![\s\S]*<\/state>)/i.test(prefix);
        const hasOpenCommentState = /<!--\s*state\b(?![\s\S]*-->)/i.test(prefix);
        const hasOpenOutOfBand = hasOpenReasoning || hasOpenStateFence || hasOpenXmlState || hasOpenCommentState;

        if (!hasOpenOutOfBand) {
          const lastLine = prefix.split('\n').pop()!;
          expect(res!.heldBack.length).toBeLessThanOrEqual(lastLine.length);
        }
      }
    }
  });

  // 4. streaming:true vs streaming:false comparison at EOF
  it('matches streaming:true with streaming:false on full script text (except truncated script)', () => {
    for (const id of ENVELOPE_SCRIPT_IDS) {
      const script = ENVELOPE_SCRIPTS[id];
      const opts = {
        primaryCharacter: script.primaryCharacter,
        knownNames: script.knownNames,
        dialect: script.dialect,
        personaName: script.personaName ?? 'Traveler'
      };

      const nonStreaming = parseEnvelope(script.text, { ...opts, streaming: false });
      const streaming = parseEnvelope(script.text, { ...opts, streaming: true });

      if (id === 'truncated') {
        // Truncated script ends inside an open state block, so heldBack holds the open state block
        expect(streaming.heldBack).toBe('```state\n{"mood": "urg');
        expect(streaming.segments).toEqual(nonStreaming.segments);
      } else {
        expect(streaming.heldBack).toBe('');
        expect(streaming.segments).toEqual(nonStreaming.segments);
        expect(streaming.statePatch).toEqual(nonStreaming.statePatch);
        expect(streaming.truncatedAt).toEqual(nonStreaming.truncatedAt);
      }
    }
  });
});

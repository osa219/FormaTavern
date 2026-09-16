import { describe, it, expect } from 'bun:test';
import { validateNarrativeExample } from '../src/lib/settings/narrative';

// Client-side mirror of the backend structural guardrails. String-based by
// necessity (the frontend may not import the envelope parser); the server
// enforces with the parser itself on save. Messages kept aligned.

describe('narrative template editor validation', () => {
  it('accepts a valid custom example', () => {
    const custom = ':::narrator\nSnow falls.\n:::\n\n```state\n{"mood":"calm"}\n```';
    expect(validateNarrativeExample(custom)).toEqual([]);
  });

  it('rejects blanks with a reset pointer', () => {
    expect(validateNarrativeExample('  ').join(' ')).toContain('reset');
  });

  it('requires directive block syntax', () => {
    expect(validateNarrativeExample('<narrator>Snow.</narrator>').join(' ')).toContain('directive');
  });

  it('requires the state fence', () => {
    expect(validateNarrativeExample(':::narrator\nSnow.\n:::').join(' ')).toContain('```state');
  });

  it('rejects persona-voice markers', () => {
    const bad = ':::persona\nI wander.\n:::\n\n```state\n{}\n```';
    expect(validateNarrativeExample(bad).join(' ')).toContain('persona');
  });
});

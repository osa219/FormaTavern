import { describe, it, expect } from 'bun:test';
import {
  DIRECTIVE_SYNTAX_EXAMPLE,
  renderExampleForDialect,
  validateNarrativeExample
} from '../../src/prompt/templates';

describe('validateNarrativeExample (§4 structural guardrails)', () => {
  it('accepts the built-in example', () => {
    expect(validateNarrativeExample(DIRECTIVE_SYNTAX_EXAMPLE)).toEqual([]);
  });

  it('accepts a valid custom example', () => {
    const custom = ':::narrator\nSnow falls.\n:::\n\n:::character[Eldrin]\nHush.\n:::\n\n```state\n{"mood":"calm"}\n```';
    expect(validateNarrativeExample(custom)).toEqual([]);
  });

  it('rejects blank examples with a reset pointer', () => {
    expect(validateNarrativeExample('   ').join(' ')).toContain('reset');
  });

  it('rejects non-directive authoring', () => {
    const xml = '<narrator>Snow.</narrator>\n\n<state>\n{}\n</state>';
    expect(validateNarrativeExample(xml).join(' ')).toContain('directive');
  });

  it('requires a state block', () => {
    const noState = ':::narrator\nSnow falls.\n:::';
    expect(validateNarrativeExample(noState).join(' ')).toContain('state block');
  });

  it('rejects persona-voice segments that would bypass the agency rule', () => {
    const personaVoice =
      ':::narrator\nSnow falls.\n:::\n\n:::persona\nI wander on.\n:::\n\n```state\n{"mood":"calm"}\n```';
    expect(validateNarrativeExample(personaVoice).join(' ')).toContain('persona');
  });

  it('surfaces parser warnings as issues', () => {
    // Mixed dialects parse with a warning: the example would teach confusion.
    const mixed =
      ':::narrator\nSnow falls.\n:::\n\n<narrator>More snow.</narrator>\n\n```state\n{"mood":"calm"}\n```';
    expect(validateNarrativeExample(mixed).length).toBeGreaterThan(0);
  });
});

describe('renderExampleForDialect (single source, per-dialect render)', () => {
  const custom = ':::narrator\nSnow falls.\n:::\n\n:::npc[Warden]\nHalt.\n:::\n\n```state\n{"mood":"calm"}\n```';

  it('renders the built-in example per dialect without an override', () => {
    const warnings: string[] = [];
    expect(renderExampleForDialect('directive', undefined, warnings)).toContain(':::narrator');
    expect(renderExampleForDialect('xml', undefined, warnings)).toContain('<narrator>');
    expect(renderExampleForDialect('prefix', undefined, warnings)).toContain('Narrator:');
    expect(warnings).toEqual([]);
  });

  it('renders a custom example into every dialect', () => {
    const warnings: string[] = [];
    const xml = renderExampleForDialect('xml', custom, warnings);
    expect(xml).toContain('<narrator>');
    expect(xml).toContain('Snow falls.');
    expect(xml).toContain('<state>');
    const prefix = renderExampleForDialect('prefix', custom, warnings);
    expect(prefix).toContain('Snow falls.');
    expect(prefix).toContain('```state');
    expect(warnings).toEqual([]);
  });

  it('falls back to built-in with a warning on render failure', () => {
    const warnings: string[] = [];
    // Unparseable as blocks and unserializable: forces the fallback path.
    const out = renderExampleForDialect('directive', ':::\n', warnings);
    expect(out).toContain(':::narrator');
    expect(warnings.length).toBe(1);
  });

  it('falls back per-dialect when prose collides with prefix speaker detection', () => {
    // Valid directive (validates clean) whose narrator line mimics a prefix
    // speaker header: harmless in directive, unserializable to prefix.
    const colonHeavy =
      ':::narrator\nBe silent: they listen.\n:::\n\n```state\n{"mood":"calm"}\n```';
    expect(validateNarrativeExample(colonHeavy)).toEqual([]);

    const warnings: string[] = [];
    const prefix = renderExampleForDialect('prefix', colonHeavy, warnings);
    expect(prefix).toContain('Narrator:');
    expect(prefix).not.toContain('Be silent');
    expect(warnings.length).toBe(1);

    // Directive rendering of the same example is unaffected.
    const directive = renderExampleForDialect('directive', colonHeavy, []);
    expect(directive).toContain('Be silent');
  });
});

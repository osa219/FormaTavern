import { describe, it, expect } from 'bun:test';
import { sanitizeCss } from '../../src/customCss';

describe('customCss — Core Sanitizer Pipeline (sanitizeCss)', () => {
  it('handles empty or whitespace-only input safely', () => {
    expect(sanitizeCss('', 'character')).toEqual({ css: '', report: [] });
    expect(sanitizeCss('   \n\t  ', 'chat')).toEqual({ css: '', report: [] });
  });

  it('reports parse-fatal for garbage syntax (e.g. {{{)', () => {
    const res = sanitizeCss('{{{', 'chat');
    expect(res.css).toBe('');
    expect(res.report.length).toBeGreaterThanOrEqual(1);
    expect(res.report[0].kind).toBe('parse-fatal');
  });

  it('allows and normalizes standard valid rules and declarations', () => {
    const input = '.ft-hero { color: red; font-size: 16px; }';
    const res = sanitizeCss(input, 'character');
    expect(res.css).toContain('[data-ft-surface="character"] .ft-hero{color:red;font-size:16px}');
    expect(res.report).toEqual([]);
  });

  it('preserves !important flags on permitted declarations (D5)', () => {
    const input = '.ft-turn { color: #fff !important; }';
    const res = sanitizeCss(input, 'chat');
    expect(res.css).toContain('!important');
    expect(res.report).toEqual([]);
  });

  it('permits reading CSS custom properties like var(--theme-accent)', () => {
    const input = '.ft-turn { border-color: var(--theme-accent); }';
    const res = sanitizeCss(input, 'chat');
    expect(res.css).toContain('var(--theme-accent)');
    expect(res.report).toEqual([]);
  });

  it('permits writing author custom properties like --my-var: 1', () => {
    const input = '.ft-turn { --card-glow: #ffaa00; }';
    const res = sanitizeCss(input, 'chat');
    expect(res.css).toContain('--card-glow:');
    expect(res.css).toContain('#ffaa00');
    expect(res.report).toEqual([]);
  });

  it('drops blocked at-rules (@import, @layer, @property, @scope, @namespace, @page, @charset)', () => {
    const input = `
      @import url("/assets/test.css");
      @layer utilities { .foo { color: red; } }
      @property --theme-accent { syntax: "<color>"; inherits: false; initial-value: red; }
      @scope (.ft-card) { .title { color: blue; } }
      @namespace url(http://www.w3.org/1999/xhtml);
      @page { margin: 1cm; }
      @charset "UTF-8";
      .ft-turn { color: green; }
    `;
    const res = sanitizeCss(input, 'chat');
    expect(res.css).not.toContain('@import');
    expect(res.css).not.toContain('@layer');
    expect(res.css).not.toContain('@property');
    expect(res.css).not.toContain('@scope');
    expect(res.css).not.toContain('@namespace');
    expect(res.css).not.toContain('@page');
    expect(res.css).not.toContain('@charset');
    expect(res.css).toContain('[data-ft-surface="chat"] .ft-turn{color:green}');

    const droppedAtRules = res.report.filter((r) => r.kind === 'dropped-at-rule');
    expect(droppedAtRules.length).toBeGreaterThanOrEqual(6);
  });

  it('allows @media queries and recurses all inner policies', () => {
    const input = `
      @media (prefers-reduced-motion: reduce) {
        .ft-turn { opacity: 1; }
        body { margin: 0; }
      }
    `;
    const res = sanitizeCss(input, 'chat');
    expect(res.css).toContain('@media (prefers-reduced-motion:reduce){[data-ft-surface="chat"] .ft-turn{opacity:1}}');
    expect(res.css).not.toContain('body');
    const droppedBody = res.report.find((r) => r.kind === 'dropped-rule' && r.selector === 'body');
    expect(droppedBody).toBeDefined();
  });

  it('allows @supports and @container at-rules and scopes inner rules', () => {
    const input = `
      @supports (display: grid) {
        .ft-hero { display: grid; }
      }
      @container (min-width: 400px) {
        .ft-hero { padding: 20px; }
      }
    `;
    const res = sanitizeCss(input, 'character');
    expect(res.css).toContain('@supports (display:grid){[data-ft-surface="character"] .ft-hero{display:grid}}');
    expect(res.css).toContain('@container (min-width:400px){[data-ft-surface="character"] .ft-hero{padding:20px}}');
  });

  it('neutralizes HTML injection in content: strings while preserving text value without raw < characters', () => {
    const input = '.ft-turn::after { content: "</style><script>alert(1)</script>"; }';
    const res = sanitizeCss(input, 'chat');
    // Output must NOT contain literal '<'
    expect(res.css).not.toContain('<');
    // Value survives encoded as CSS unicode escape \3c
    expect(res.css).toContain('\\3c /style>\\3c script>alert(1)\\3c /script>');
    expect(res.report).toEqual([]);
  });

  it('drops author comments in the regenerated CSS output', () => {
    const input = `
      /* Header styling */
      .ft-hero {
        /* Primary color */
        color: red;
      }
    `;
    const res = sanitizeCss(input, 'character');
    expect(res.css).not.toContain('Header styling');
    expect(res.css).not.toContain('Primary color');
    expect(res.css).toBe('[data-ft-surface="character"] .ft-hero{color:red}');
  });

  it('handles an exact 131,072 character sheet without crashing or truncating', () => {
    const comment = '/* pad */ ';
    const rule = '.ft-turn { color: red; }\n';
    let raw = rule;
    while (raw.length + rule.length < 131_072) {
      raw += rule;
    }
    const remainder = 131_072 - raw.length;
    raw += '/* ' + 'a'.repeat(Math.max(0, remainder - 7)) + ' */\n';
    // Make exact length
    if (raw.length < 131_072) {
      raw += ' '.repeat(131_072 - raw.length);
    } else if (raw.length > 131_072) {
      raw = raw.slice(0, 131_072);
    }
    expect(raw.length).toBe(131_072);

    const res = sanitizeCss(raw, 'chat');
    expect(res.css.length).toBeGreaterThan(0);
    expect(res.report.filter((r) => r.kind === 'parse-fatal')).toHaveLength(0);
  });
});

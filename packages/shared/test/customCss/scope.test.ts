import { describe, it, expect } from 'bun:test';
import { sanitizeCss } from '../../src/customCss';

describe('customCss — Scope Policy & Selector Containment (Invariant C4)', () => {
  it('prefixes bare selectors with current scope attribute', () => {
    const input = '.ft-turn { color: red; }';
    const res = sanitizeCss(input, 'chat');
    expect(res.css).toBe('[data-ft-surface="chat"] .ft-turn{color:red}');
    expect(res.report).toEqual([]);
  });

  it('prefixes universal selector with current scope attribute', () => {
    const input = '* { box-sizing: border-box; }';
    const res = sanitizeCss(input, 'character');
    expect(res.css).toBe('[data-ft-surface="character"] *{box-sizing:border-box}');
    expect(res.report).toEqual([]);
  });

  it('passes through selectors that already contain the current scope', () => {
    const input1 = '[data-ft-surface="chat"] { background: black; }';
    const res1 = sanitizeCss(input1, 'chat');
    expect(res1.css).toBe('[data-ft-surface="chat"]{background:black}');
    expect(res1.report).toEqual([]);

    const input2 = '[data-ft-surface="chat"] .ft-bubble-char { font-weight: bold; }';
    const res2 = sanitizeCss(input2, 'chat');
    expect(res2.css).toBe('[data-ft-surface="chat"] .ft-bubble-char{font-weight:bold}');
    expect(res2.report).toEqual([]);
  });

  it('drops selectors targeting a different surface (cross-surface)', () => {
    const input = `
      [data-ft-surface="shell"] .ft-topbar { background: red; }
      [data-ft-surface="character"] .ft-hero { padding: 0; }
      .ft-turn { color: blue; }
    `;
    const res = sanitizeCss(input, 'chat');
    expect(res.css).not.toContain('ft-topbar');
    expect(res.css).not.toContain('ft-hero');
    expect(res.css).toBe('[data-ft-surface="chat"] .ft-turn{color:blue}');

    const crossSurfaceReports = res.report.filter(
      (r) => r.kind === 'dropped-rule' && r.reason === 'cross-surface'
    );
    expect(crossSurfaceReports).toHaveLength(2);
  });

  it('drops :root, html, and body selectors (escape-selector)', () => {
    const input = `
      :root { --font-size: 14px; }
      html { height: 100%; }
      body { margin: 0; }
      html.dark { background: #111; }
      body > div { display: flex; }
      .ft-turn { color: green; }
    `;
    const res = sanitizeCss(input, 'chat');
    expect(res.css).not.toContain(':root');
    expect(res.css).not.toContain('html');
    expect(res.css).not.toContain('body');
    expect(res.css).toBe('[data-ft-surface="chat"] .ft-turn{color:green}');

    const escapeReports = res.report.filter(
      (r) => r.kind === 'dropped-rule' && r.reason === 'escape-selector'
    );
    expect(escapeReports).toHaveLength(5);
  });

  it('retains valid selectors when only part of a selector list is dropped', () => {
    const input = '.ft-turn, body, [data-ft-surface="shell"] .ft-topbar { color: purple; }';
    const res = sanitizeCss(input, 'chat');
    expect(res.css).toBe('[data-ft-surface="chat"] .ft-turn{color:purple}');

    const droppedRules = res.report.filter((r) => r.kind === 'dropped-rule');
    expect(droppedRules.some((r) => r.reason === 'escape-selector')).toBe(true);
    expect(droppedRules.some((r) => r.reason === 'cross-surface')).toBe(true);
  });

  it('reports empty-after-policy when an entire rule has no valid selectors left', () => {
    const input = 'body, html { margin: 0; }';
    const res = sanitizeCss(input, 'character');
    expect(res.css).toBe('');
    const emptyReport = res.report.find(
      (r) => r.kind === 'dropped-rule' && r.reason === 'empty-after-policy'
    );
    expect(emptyReport).toBeDefined();
  });

  it('handles pseudo-classes, pseudo-elements, and combinators cleanly under scope', () => {
    const input = `
      .ft-turn:hover { opacity: 0.9; }
      .ft-bubble-char::before { content: "»"; }
      .ft-message-log > .ft-turn + .ft-turn { margin-top: 8px; }
      .ft-turn:has(.ft-narrator) { background: transparent; }
    `;
    const res = sanitizeCss(input, 'chat');
    expect(res.css).toContain('[data-ft-surface="chat"] .ft-turn:hover{opacity:0.9}');
    expect(res.css).toContain('[data-ft-surface="chat"] .ft-bubble-char::before{content:"»"}');
    expect(res.css).toContain('[data-ft-surface="chat"] .ft-message-log>.ft-turn+.ft-turn{margin-top:8px}');
    expect(res.css).toContain('[data-ft-surface="chat"] .ft-turn:has(.ft-narrator){background:transparent}');
    expect(res.report).toEqual([]);
  });
});

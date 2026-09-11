import { describe, it, expect } from 'bun:test';
import { sanitizeCss } from '../../src/customCss';

describe('customCss — Idempotency & Fixed Point Invariant (Invariant C3)', () => {
  const testSheets: Array<{ name: string; scope: 'shell' | 'character' | 'chat'; raw: string }> = [
    {
      name: 'Keyframes and animations',
      scope: 'chat',
      raw: `
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.02); }
          100% { transform: scale(1); }
        }
        .ft-turn {
          animation: 2s ease-in-out infinite pulse;
          color: var(--theme-accent);
        }
      `
    },
    {
      name: 'Media queries and pseudo-elements',
      scope: 'character',
      raw: `
        @media (max-width: 640px) {
          .ft-hero { padding: 10px; }
        }
        .ft-showcase-body::before {
          content: "» ";
          color: #ffaa00;
        }
      `
    },
    {
      name: 'HTML entities and escaped content',
      scope: 'chat',
      raw: `
        .ft-bubble-char::after {
          content: "</style><script>alert(1)</script>";
          font-weight: bold;
        }
      `
    },
    {
      name: 'Custom properties and CSS vars',
      scope: 'shell',
      raw: `
        .ft-foyer-grid {
          --custom-card-bg: #222;
          background-color: var(--custom-card-bg);
          border: 1px solid var(--theme-line, #444);
        }
      `
    },
    {
      name: 'Complex multi-selector and combined rules',
      scope: 'chat',
      raw: `
        .ft-turn:hover, .ft-bubble-char > p {
          opacity: 0.95;
        }
        @supports (display: flex) {
          .ft-message-log .ft-turn { display: flex; }
        }
      `
    }
  ];

  for (const { name, scope, raw } of testSheets) {
    it(`is an exact fixed point for: ${name} (scope: ${scope})`, () => {
      const firstPass = sanitizeCss(raw, scope);
      expect(firstPass.css.length).toBeGreaterThan(0);

      const secondPass = sanitizeCss(firstPass.css, scope);
      expect(secondPass.css).toBe(firstPass.css);

      const thirdPass = sanitizeCss(secondPass.css, scope);
      expect(thirdPass.css).toBe(secondPass.css);
    });
  }

  it('produces identical output for identical raw inputs (determinism)', () => {
    const raw = `
      @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
      .ft-turn { animation: 1s linear infinite spin; }
    `;
    const res1 = sanitizeCss(raw, 'chat');
    const res2 = sanitizeCss(raw, 'chat');
    expect(res1.css).toBe(res2.css);
    expect(res1.report).toEqual(res2.report);
  });
});

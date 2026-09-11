import { describe, it, expect } from 'bun:test';
import { lintSheet } from '../../src/customCss';

describe('customCss — Lint Suite v1 (lintSheet)', () => {
  it('L1: warns when @keyframes animates layout or paint properties', () => {
    const input = `
      @keyframes badAnimation {
        0% { width: 100px; margin-top: 10px; }
        100% { width: 200px; box-shadow: 0 0 10px red; }
      }
      @keyframes goodAnimation {
        0% { transform: scale(1); opacity: 0; }
        100% { transform: scale(1.1); opacity: 1; }
      }
    `;
    const issues = lintSheet(input);
    const l1Issues = issues.filter((i) => i.code === 'L1');
    expect(l1Issues.length).toBeGreaterThanOrEqual(2);
    expect(l1Issues[0].message).toContain('compositor-only animation');
  });

  it('L2: warns when transition targets layout properties', () => {
    const input = `
      .ft-hero { transition: width 0.3s ease, margin 0.2s; }
      .ft-turn { transition: all 0.5s; }
      .ft-bubble-char { transition: transform 0.2s, opacity 0.2s; }
    `;
    const issues = lintSheet(input);
    const l2Issues = issues.filter((i) => i.code === 'L2');
    expect(l2Issues.length).toBeGreaterThanOrEqual(2);
    expect(l2Issues[0].message).toContain('compositor-only transition');
  });

  it('L3: warns when outline is removed without a :focus-visible replacement', () => {
    const inputWithReplacement = `
      .ft-button { outline: none; }
      .ft-button:focus-visible { outline: 2px solid blue; }
    `;
    const issues1 = lintSheet(inputWithReplacement);
    expect(issues1.filter((i) => i.code === 'L3')).toHaveLength(0);

    const inputWithoutReplacement = `
      .ft-card { outline: 0; }
    `;
    const issues2 = lintSheet(inputWithoutReplacement);
    const l3Issues = issues2.filter((i) => i.code === 'L3');
    expect(l3Issues).toHaveLength(1);
    expect(l3Issues[0].message).toContain('focus visibility');
  });

  it('L4: warns on viewport-covering fixed elements without pointer-events: none in shell/character', () => {
    const safeInput = `
      .scenery-layer {
        position: fixed;
        inset: 0;
        pointer-events: none;
      }
    `;
    const issuesSafe = lintSheet(safeInput, 'character');
    expect(issuesSafe.filter((i) => i.code === 'L4')).toHaveLength(0);

    const trapInput = `
      .overlay-trap {
        position: fixed;
        inset: 0;
      }
    `;
    const issuesTrap = lintSheet(trapInput, 'character');
    const l4Issues = issuesTrap.filter((i) => i.code === 'L4');
    expect(l4Issues).toHaveLength(1);
    expect(l4Issues[0].message).toContain('decor layers should not intercept clicks');
  });

  it('L5: warns on rapid flashing animations (photosensitivity hazard)', () => {
    const input = `
      @keyframes flash {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .strobe {
        animation: flash 0.1s infinite;
      }
    `;
    const issues = lintSheet(input);
    const l5Issues = issues.filter((i) => i.code === 'L5');
    expect(l5Issues).toHaveLength(1);
    expect(l5Issues[0].message).toContain('photosensitivity');
  });

  it('L6: warns when !important count exceeds 20', () => {
    let input = '';
    for (let i = 0; i < 22; i++) {
      input += `.ft-hook-${i} { color: red !important; }\n`;
    }
    const issues = lintSheet(input);
    const l6Issues = issues.filter((i) => i.code === 'L6');
    expect(l6Issues).toHaveLength(1);
    expect(l6Issues[0].message).toContain('hooks should make !important rare');
  });

  it('L7: warns when colors are transitioned or animated on bubbles/turns', () => {
    const input = `
      .ft-bubble-char {
        transition: background-color 0.3s;
      }
      .ft-turn {
        transition: color 0.2s;
      }
    `;
    const issues = lintSheet(input);
    const l7Issues = issues.filter((i) => i.code === 'L7');
    expect(l7Issues).toHaveLength(2);
    expect(l7Issues[0].message).toContain('strobe risk with reactive bindings');
  });

  it('L8: warns on backdrop-filter or heavy blur without pointer: coarse check', () => {
    const inputUnguarded = `
      .ft-hero {
        backdrop-filter: blur(12px);
      }
    `;
    const issues1 = lintSheet(inputUnguarded);
    const l8Issues = issues1.filter((i) => i.code === 'L8');
    expect(l8Issues).toHaveLength(1);
    expect(l8Issues[0].message).toContain('mobile GPU cost');

    const inputGuarded = `
      @media (pointer: coarse) {
        .ft-hero {
          backdrop-filter: blur(12px);
        }
      }
    `;
    const issues2 = lintSheet(inputGuarded);
    expect(issues2.filter((i) => i.code === 'L8')).toHaveLength(0);
  });

  it('L9: notes duplicate @font-face family names within the sheet', () => {
    const input = `
      @font-face {
        font-family: "CustomSerif";
        src: url("/assets/fonts/regular.woff2");
      }
      @font-face {
        font-family: "CustomSerif";
        src: url("/assets/fonts/bold.woff2");
      }
    `;
    const issues = lintSheet(input);
    const l9Issues = issues.filter((i) => i.code === 'L9');
    expect(l9Issues).toHaveLength(1);
    expect(l9Issues[0].message).toContain('duplicate @font-face family name');
  });
});

import { describe, it, expect } from 'bun:test';
import { sanitizeCss } from '../../src/customCss';

describe('customCss — Keyframes Namespacing & Reference Rewriting (Invariant C5)', () => {
  it('renames @keyframes to ftkf-<scope>-<n>-<name>', () => {
    const input = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes slideUp {
        from { transform: translateY(10px); }
        to { transform: translateY(0); }
      }
    `;
    const res = sanitizeCss(input, 'chat');
    expect(res.css).toContain('@keyframes ftkf-chat-1-fadeIn');
    expect(res.css).toContain('@keyframes ftkf-chat-2-slideUp');

    const renames = res.report.filter((r) => r.kind === 'renamed-keyframes');
    expect(renames).toEqual([
      { kind: 'renamed-keyframes', from: 'fadeIn', to: 'ftkf-chat-1-fadeIn' },
      { kind: 'renamed-keyframes', from: 'slideUp', to: 'ftkf-chat-2-slideUp' }
    ]);
  });

  it('rewrites animation-name declarations to match the renamed keyframe', () => {
    const input = `
      @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
      }
      .ft-turn {
        animation-name: pulse;
        animation-duration: 2s;
      }
    `;
    const res = sanitizeCss(input, 'character');
    expect(res.css).toContain('@keyframes ftkf-character-1-pulse');
    expect(res.css).toContain('animation-name:ftkf-character-1-pulse');
  });

  it('rewrites animation shorthand declarations with complex timing and count', () => {
    const input = `
      @keyframes glow {
        from { box-shadow: 0 0 5px gold; }
        to { box-shadow: 0 0 20px gold; }
      }
      .ft-hero {
        animation: 3s ease-in-out infinite alternate glow;
      }
    `;
    const res = sanitizeCss(input, 'character');
    expect(res.css).toContain('@keyframes ftkf-character-1-glow');
    expect(res.css).toContain('animation:3s ease-in-out infinite alternate ftkf-character-1-glow');
  });

  it('handles multiple animations in shorthand and longhand lists', () => {
    const input = `
      @keyframes kf1 { from { opacity: 0; } to { opacity: 1; } }
      @keyframes kf2 { from { transform: rotate(0); } to { transform: rotate(360deg); } }
      .ft-turn {
        animation: 1s ease kf1, 2s linear infinite kf2;
        animation-name: kf1, kf2;
      }
    `;
    const res = sanitizeCss(input, 'chat');
    expect(res.css).toContain('animation:1s ease ftkf-chat-1-kf1,2s linear infinite ftkf-chat-2-kf2');
    expect(res.css).toContain('animation-name:ftkf-chat-1-kf1,ftkf-chat-2-kf2');
  });

  it('renames duplicate keyframe definitions distinctly and emits a note report', () => {
    const input = `
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 0.5; } }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      .ft-turn { animation: 1s fadeIn; }
    `;
    const res = sanitizeCss(input, 'chat');
    expect(res.css).toContain('@keyframes ftkf-chat-1-fadeIn');
    expect(res.css).toContain('@keyframes ftkf-chat-2-fadeIn');
    // First occurrence wins for reference lookup
    expect(res.css).toContain('animation:1s ftkf-chat-1-fadeIn');

    const duplicateNotes = res.report.filter(
      (r) => r.kind === 'note' && r.detail.includes('Duplicate @keyframes')
    );
    expect(duplicateNotes).toHaveLength(1);
    expect(duplicateNotes[0].detail).toContain('Duplicate @keyframes "fadeIn" renamed distinctly to "ftkf-chat-2-fadeIn"');
  });

  it('passes unresolvable animation names through with a note report', () => {
    const input = `
      .ft-turn {
        animation-name: undefinedAnimation;
        animation: 2s ease unresolvableShorthand;
      }
    `;
    const res = sanitizeCss(input, 'chat');
    expect(res.css).toContain('animation-name:undefinedAnimation');
    expect(res.css).toContain('animation:2s ease unresolvableShorthand');

    const notes = res.report.filter((r) => r.kind === 'note' && r.detail.includes('Unresolvable'));
    expect(notes).toHaveLength(2);
  });

  it('ignores standard animation keywords like none, initial, inherit', () => {
    const input = '.ft-turn { animation: none; animation-name: initial; }';
    const res = sanitizeCss(input, 'chat');
    expect(res.css).toContain('animation:none');
    expect(res.css).toContain('animation-name:initial');
    expect(res.report.filter((r) => r.kind === 'note')).toHaveLength(0);
  });
});

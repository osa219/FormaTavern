import { describe, it, expect } from 'bun:test';
import {
  sanitizeCss,
  explainChatDrop,
  CHAT_POLICY_EXPLANATIONS,
  lintChatRestrictions,
  lintSheet
} from '../../src/customCss';

describe('customCss — Chat Conservative Profile vs Permissive Profiles (Invariant C7)', () => {
  describe('position: fixed & sticky', () => {
    it('blocks position: fixed and sticky on any selector in chat scope', () => {
      const input = `
        .ft-turn { position: fixed; }
        .ft-bubble-char { position: sticky; top: 0; }
        .ft-hero { position: relative; }
      `;
      const res = sanitizeCss(input, 'chat');
      expect(res.css).not.toContain('position:fixed');
      expect(res.css).not.toContain('position:sticky');
      expect(res.css).toContain('position:relative');

      const dropped = res.report.filter(
        (r) => r.kind === 'dropped-declaration' && r.property === 'position'
      );
      expect(dropped).toHaveLength(2);
    });

    it('permits position: fixed and sticky in shell and character scopes', () => {
      const input = `
        .ft-hero { position: fixed; top: 0; }
        .ft-foyer-grid { position: sticky; top: 10px; }
      `;
      const resChar = sanitizeCss(input, 'character');
      expect(resChar.css).toContain('position:fixed');
      expect(resChar.css).toContain('position:sticky');

      const resShell = sanitizeCss(input, 'shell');
      expect(resShell.css).toContain('position:fixed');
      expect(resShell.css).toContain('position:sticky');
    });
  });

  describe('z-index policy', () => {
    it('allows z-index: auto and integers <= 10 in chat scope', () => {
      const input = `
        .ft-turn { z-index: 10; }
        .ft-bubble-char { z-index: 0; }
        .ft-backdrop { z-index: -1; }
        .ft-narrator { z-index: auto; }
      `;
      const res = sanitizeCss(input, 'chat');
      expect(res.css).toContain('z-index:10');
      expect(res.css).toContain('z-index:0');
      expect(res.css).toContain('z-index:-1');
      expect(res.css).toContain('z-index:auto');
      expect(res.report).toEqual([]);
    });

    it('blocks z-index > 10, fractional values, and calc() in chat scope', () => {
      const input = `
        .ft-turn { z-index: 11; }
        .ft-bubble-char { z-index: 99999; }
        .ft-narrator { z-index: calc(1 + 10); }
        .ft-composer { z-index: 5.5; }
      `;
      const res = sanitizeCss(input, 'chat');
      expect(res.css).not.toContain('z-index');
      const dropped = res.report.filter(
        (r) => r.kind === 'dropped-declaration' && r.property === 'z-index'
      );
      expect(dropped).toHaveLength(4);
    });

    it('permits unrestricted z-index in character and shell scopes', () => {
      const input = '.ft-hero { z-index: 99999; }';
      const res = sanitizeCss(input, 'character');
      expect(res.css).toContain('z-index:99999');
      expect(res.report).toEqual([]);
    });
  });

  describe('scroll-behavior', () => {
    it('blocks scroll-behavior on any selector in chat scope', () => {
      const input = `
        .ft-message-log { scroll-behavior: smooth; }
        .ft-viewport { scroll-behavior: auto; }
      `;
      const res = sanitizeCss(input, 'chat');
      expect(res.css).not.toContain('scroll-behavior');
      const dropped = res.report.filter(
        (r) => r.kind === 'dropped-declaration' && r.property === 'scroll-behavior'
      );
      expect(dropped).toHaveLength(2);
    });

    it('permits scroll-behavior in shell and character scopes', () => {
      const input = '.ft-foyer-grid { scroll-behavior: smooth; }';
      const res = sanitizeCss(input, 'shell');
      expect(res.css).toContain('scroll-behavior:smooth');
      expect(res.report).toEqual([]);
    });
  });

  describe('Selector-scoped scroll and mechanics blocks', () => {
    it('blocks overflow and scroll manipulation only on ft-message-log and ft-viewport in chat', () => {
      const input = `
        .ft-message-log {
          overflow: hidden;
          overflow-y: scroll;
          overscroll-behavior: contain;
          touch-action: pan-x;
          scroll-snap-type: y mandatory;
          scroll-margin-top: 10px;
          scroll-padding-top: 20px;
        }
        .ft-viewport {
          overflow: hidden;
        }
      `;
      const res = sanitizeCss(input, 'chat');
      expect(res.css).toBe('');
      const dropped = res.report.filter(
        (r) => r.kind === 'dropped-declaration' && r.reason === 'blocked-property-scope'
      );
      expect(dropped.length).toBeGreaterThanOrEqual(8);
    });

    it('permits overflow on other chat selectors such as ft-turn or ft-bubble-char', () => {
      const input = `
        .ft-turn { overflow: hidden; }
        .ft-bubble-char { overflow-x: auto; touch-action: none; }
      `;
      const res = sanitizeCss(input, 'chat');
      expect(res.css).toContain('[data-ft-surface="chat"] .ft-turn{overflow:hidden}');
      expect(res.css).toContain('[data-ft-surface="chat"] .ft-bubble-char{overflow-x:auto;touch-action:none}');
      expect(res.report).toEqual([]);
    });

    it('permits overflow on ft-message-log in character or shell scopes', () => {
      const input = '.ft-message-log { overflow: hidden; }';
      const res = sanitizeCss(input, 'character');
      expect(res.css).toContain('overflow:hidden');
      expect(res.report).toEqual([]);
    });
  });

  describe('Policy Explanations & Studio Linting (Invariant C7)', () => {
    it('provides clear explanation strings for all chat drops', () => {
      expect(explainChatDrop('position', '.ft-turn', 'fixed')).toBe(
        CHAT_POLICY_EXPLANATIONS.positionFixedSticky.explanation
      );
      expect(explainChatDrop('position', '.ft-turn', 'sticky')).toBe(
        CHAT_POLICY_EXPLANATIONS.positionFixedSticky.explanation
      );
      expect(explainChatDrop('z-index', '.ft-bubble-char', '99999')).toBe(
        CHAT_POLICY_EXPLANATIONS.zIndex.explanation
      );
      expect(explainChatDrop('scroll-behavior', '.ft-message-log', 'smooth')).toBe(
        CHAT_POLICY_EXPLANATIONS.scrollBehavior.explanation
      );
      expect(explainChatDrop('overflow', '.ft-message-log', 'hidden')).toBe(
        CHAT_POLICY_EXPLANATIONS.scrollMechanics.explanation
      );
      expect(explainChatDrop('touch-action', '.ft-viewport', 'none')).toBe(
        CHAT_POLICY_EXPLANATIONS.scrollMechanics.explanation
      );
    });

    it('lintChatRestrictions detects properties stripped in chat and provides explanations', () => {
      const sheet = `
        .ft-hero { border: 1px solid red; }
        .ft-turn { position: fixed; z-index: 100; }
        .ft-message-log { scroll-behavior: smooth; overflow: hidden; }
      `;
      const restrictions = lintChatRestrictions(sheet);
      expect(restrictions.length).toBe(4);

      const posIssue = restrictions.find((r) => r.property === 'position');
      expect(posIssue).toBeDefined();
      expect(posIssue?.message).toContain('position: fixed and sticky are stripped in chat');

      const zIssue = restrictions.find((r) => r.property === 'z-index');
      expect(zIssue).toBeDefined();
      expect(zIssue?.message).toContain('z-index > 10 is stripped in chat');

      const scrollIssue = restrictions.find((r) => r.property === 'scroll-behavior');
      expect(scrollIssue).toBeDefined();
      expect(scrollIssue?.message).toContain('scroll-behavior is stripped in chat');

      const overflowIssue = restrictions.find((r) => r.property === 'overflow');
      expect(overflowIssue).toBeDefined();
      expect(overflowIssue?.message).toContain('overflow and scroll mechanics properties');
    });

    it('lintSheet includes CHAT_NOTE entries when scope is chat', () => {
      const sheet = '.ft-turn { position: fixed; }';
      const issues = lintSheet(sheet, 'chat');
      const chatNotes = issues.filter((i) => i.code === 'CHAT_NOTE');
      expect(chatNotes.length).toBe(1);
      expect(chatNotes[0].message).toContain('position: fixed and sticky are stripped in chat');
    });
  });
});


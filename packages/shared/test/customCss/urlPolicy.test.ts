import { describe, it, expect } from 'bun:test';
import { sanitizeCss } from '../../src/customCss';

describe('customCss — URL Policy & Asset Isolation (Invariant C6)', () => {
  describe('Declaration URLs', () => {
    it('permits local /assets/ image URLs', () => {
      const input = '.ft-hero { background-image: url("/assets/characters/hero.webp"); }';
      const res = sanitizeCss(input, 'character');
      expect(res.css).toContain('/assets/characters/hero.webp');
      expect(res.report).toEqual([]);
    });

    it('permits data:image/ URLs regardless of quote style', () => {
      const input = `
        .ft-turn {
          background-image: url('data:image/png;base64,iVBORw0KGgo=');
          border-image: url("data:image/svg+xml;utf8,<svg></svg>");
        }
      `;
      const res = sanitizeCss(input, 'chat');
      expect(res.css).toContain('data:image/png');
      expect(res.css).toContain('data:image/svg+xml');
      expect(res.report).toEqual([]);
    });

    it('drops declarations with remote https:// or http:// URLs', () => {
      const input = `
        .ft-hero {
          background: url("https://evil.com/tracker.png");
          color: white;
        }
        .ft-turn {
          background: url( 'http://insecure.org/bg.jpg' );
        }
      `;
      const res = sanitizeCss(input, 'character');
      expect(res.css).not.toContain('evil.com');
      expect(res.css).not.toContain('insecure.org');
      expect(res.css).toContain('color:white');

      const urlReports = res.report.filter(
        (r) => r.kind === 'dropped-declaration' && r.reason === 'url-policy'
      );
      expect(urlReports).toHaveLength(2);
    });

    it('drops declarations with protocol-relative // URLs', () => {
      const input = '.ft-turn { background-image: URL("//cdn.evil.com/x.png"); }';
      const res = sanitizeCss(input, 'chat');
      expect(res.css).not.toContain('cdn.evil.com');
      const urlReport = res.report.find(
        (r) => r.kind === 'dropped-declaration' && r.reason === 'url-policy'
      );
      expect(urlReport).toBeDefined();
    });

    it('drops declarations with non-image data URLs (e.g. data:text/html)', () => {
      const input = '.ft-turn { background: url("data:text/html,<script>alert(1)</script>"); }';
      const res = sanitizeCss(input, 'chat');
      expect(res.css).not.toContain('data:text/html');
      const urlReport = res.report.find(
        (r) => r.kind === 'dropped-declaration' && r.reason === 'url-policy'
      );
      expect(urlReport).toBeDefined();
    });

    it('drops declarations containing global dangerous patterns (expression, javascript:, behavior)', () => {
      const input = `
        .ft-turn {
          color: expression(alert(1));
          cursor: url("javascript:alert(2)");
          behavior: url("/assets/script.htc");
        }
      `;
      const res = sanitizeCss(input, 'chat');
      expect(res.css).toBe('');
      const dropped = res.report.filter((r) => r.kind === 'dropped-declaration');
      expect(dropped.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('@font-face URL & Descriptor Policy', () => {
    it('permits @font-face with /assets/fonts/, data:font/, and local() sources', () => {
      const input = `
        @font-face {
          font-family: "MyFont";
          src: local("MyFont"),
               url("/assets/fonts/author/custom.woff2") format("woff2"),
               url("data:font/woff2;base64,d09GRg==") format("woff2");
          font-weight: normal;
          font-style: normal;
          font-display: swap;
        }
      `;
      const res = sanitizeCss(input, 'character');
      expect(res.css).toContain('@font-face');
      expect(res.css).toContain('/assets/fonts/author/custom.woff2');
      expect(res.css).toContain('data:font/woff2');
      expect(res.report).toEqual([]);
    });

    it('drops the entire @font-face rule if src contains remote URLs', () => {
      const input = `
        @font-face {
          font-family: "GoogleFont";
          src: url("https://fonts.gstatic.com/s/roboto.woff2");
        }
        .ft-turn { font-family: "GoogleFont"; }
      `;
      const res = sanitizeCss(input, 'chat');
      expect(res.css).not.toContain('@font-face');
      expect(res.css).not.toContain('fonts.gstatic.com');
      expect(res.css).toContain('font-family:"GoogleFont"');

      const fontFaceReport = res.report.find(
        (r) => r.kind === 'dropped-at-rule' && r.atRule === '@font-face' && r.reason === 'url-policy'
      );
      expect(fontFaceReport).toBeDefined();
    });

    it('drops @font-face if src points to non-font assets (e.g. /assets/characters/)', () => {
      const input = `
        @font-face {
          font-family: "Sneaky";
          src: url("/assets/characters/avatar.png");
        }
      `;
      const res = sanitizeCss(input, 'chat');
      expect(res.css).not.toContain('@font-face');
      const fontFaceReport = res.report.find(
        (r) => r.kind === 'dropped-at-rule' && r.atRule === '@font-face'
      );
      expect(fontFaceReport).toBeDefined();
    });

    it('drops invalid descriptors inside @font-face while keeping permitted ones', () => {
      const input = `
        @font-face {
          font-family: "SafeFont";
          src: url("/assets/fonts/safe.woff2");
          color: red;
          margin: 10px;
        }
      `;
      const res = sanitizeCss(input, 'chat');
      expect(res.css).toContain('@font-face');
      expect(res.css).not.toContain('color:red');
      expect(res.css).not.toContain('margin:10px');

      const droppedProps = res.report.filter(
        (r) => r.kind === 'dropped-declaration' && r.selector === '@font-face'
      );
      expect(droppedProps).toHaveLength(2);
    });
  });
});

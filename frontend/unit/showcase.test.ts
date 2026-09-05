import { describe, it, expect } from 'bun:test';
import { renderShowcaseMarkdown } from '../src/lib/render/showcase';

describe('Showcase Renderer & Security Guard (renderShowcaseMarkdown)', () => {
  it('renders standard Markdown elements including headings, tables, lists, and quotes', () => {
    const md = `
# Chapter 1: The Observatory
## Celestial Mechanics

Here is a paragraph with **bold** and *italic* text.

> Ancient secrets lie dormant.

| Star | Alignment |
| --- | --- |
| Polaris | Zenith |
| Vega | Nadir |

- Telescope
- Astral map
`;
    const html = renderShowcaseMarkdown(md);
    expect(html).toContain('<h1>Chapter 1: The Observatory</h1>');
    expect(html).toContain('<h2>Celestial Mechanics</h2>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>Star</th>');
    expect(html).toContain('<td>Polaris</td>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>Telescope</li>');
  });

  it('permits local /assets/ and data:image/ images with lazy loading', () => {
    const md = '![Observatory](/assets/eldrin/observatory.png "Spire View")';
    const html = renderShowcaseMarkdown(md);
    expect(html).toContain('<img src="/assets/eldrin/observatory.png"');
    expect(html).toContain('alt="Observatory"');
    expect(html).toContain('title="Spire View"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
  });

  it('permits safe inline styles via rebuildStyle on elements', () => {
    const htmlSnippet = '<div style="color: #6366f1; margin: 12px; font-weight: bold; position: fixed;">Styled content</div>';
    const rendered = renderShowcaseMarkdown(htmlSnippet);
    expect(rendered).toContain('style="color: #6366f1; margin: 12px; font-weight: bold"');
    expect(rendered).not.toContain('position: fixed');
  });

  describe('20 OWASP XSS & Isolation Attack Vectors', () => {
    const attackVectors = [
      // 1. Script tag
      { input: '<script>alert(1)</script>', forbidden: 'script' },
      // 2. Img onerror
      { input: '<img src="x" onerror="alert(1)">', forbidden: 'onerror' },
      // 3. SVG onload
      { input: '<svg onload="alert(1)"><circle r="10"/></svg>', forbidden: 'svg' },
      // 4. Iframe javascript
      { input: '<iframe src="javascript:alert(1)"></iframe>', forbidden: 'iframe' },
      // 5. Anchor javascript href
      { input: '<a href="javascript:alert(1)">Click Me</a>', forbidden: 'javascript:alert' },
      // 6. Inline style with javascript: url
      { input: '<div style="background-image: url(javascript:alert(1))">Test</div>', forbidden: 'javascript:' },
      // 7. Inline style CSS expression
      { input: '<div style="width: expression(alert(1))">Test</div>', forbidden: 'expression' },
      // 8. Form tag injection
      { input: '<form action="http://evil.com"><input type="submit"></form>', forbidden: 'form' },
      // 9. Input tag autofocus onfocus
      { input: '<input type="text" autofocus onfocus="alert(1)">', forbidden: 'input' },
      // 10. Object data javascript
      { input: '<object data="javascript:alert(1)"></object>', forbidden: 'object' },
      // 11. Embed tag
      { input: '<embed src="javascript:alert(1)"></embed>', forbidden: 'embed' },
      // 12. Link stylesheet exfiltration
      { input: '<link rel="stylesheet" href="http://evil.com/leak.css">', forbidden: 'link' },
      // 13. Base tag hijacking
      { input: '<base href="http://evil.com/">', forbidden: 'base' },
      // 14. Body onload
      { input: '<body onload="alert(1)">', forbidden: 'body' },
      // 15. Details ontoggle
      { input: '<details open ontoggle="alert(1)"><summary>S</summary></details>', forbidden: 'ontoggle' },
      // 16. Remote image fetch via HTTP (P3)
      { input: '<img src="http://evil.com/tracker.png">', forbidden: 'http://evil.com' },
      // 17. Remote image fetch via HTTPS (P3)
      { input: '<img src="https://tracker.com/t.png">', forbidden: 'https://tracker.com' },
      // 18. Protocol-relative remote image (P3)
      { input: '<img src="//evil.com/t.png">', forbidden: '//evil.com' },
      // 19. Markdown link with javascript URL
      { input: '[Exploit](javascript:alert(1))', forbidden: 'javascript:alert' },
      // 20. Markdown remote image (P3)
      { input: '![Remote Tracker](https://evil.com/track.png)', forbidden: 'https://evil.com/track.png' }
    ];

    attackVectors.forEach(({ input, forbidden }, idx) => {
      it(`neutralizes vector #${idx + 1}: ${forbidden}`, () => {
        const sanitized = renderShowcaseMarkdown(input);
        expect(sanitized.toLowerCase()).not.toContain(forbidden.toLowerCase());
      });
    });
  });
});

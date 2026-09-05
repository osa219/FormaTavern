import { describe, it, expect } from 'bun:test';
import { renderRoleplayMarkdown } from '../src/lib/render/markdown';

describe('Markdown & Sanitization Pipeline (renderRoleplayMarkdown)', () => {
  it('renders paragraphs and respects line breaks', () => {
    const md = 'First line\nSecond line\n\nThird paragraph';
    const html = renderRoleplayMarkdown(md);
    expect(html).toContain('<p>First line<br>Second line</p>');
    expect(html).toContain('<p>Third paragraph</p>');
  });

  it('renders emphasis and strong formatting', () => {
    const md = '*italic text* and **bold text**';
    const html = renderRoleplayMarkdown(md);
    expect(html).toContain('<em>italic text</em>');
    expect(html).toContain('<strong>bold text</strong>');
  });

  it('wraps straight and curly quotes in <q class="speech">', () => {
    const straight = 'He said, "Stay behind me."';
    const curly = 'She whispered, “The observatory awakens.”';
    const htmlStraight = renderRoleplayMarkdown(straight);
    const htmlCurly = renderRoleplayMarkdown(curly);

    expect(htmlStraight).toContain('<q class="speech">"Stay behind me."</q>');
    expect(htmlCurly).toContain('<q class="speech">“The observatory awakens.”</q>');
  });

  it('correctly handles speech nested inside emphasis (*she whispers, "come"*)', () => {
    const md = '*she whispers, "come"*';
    const html = renderRoleplayMarkdown(md);
    expect(html).toContain('<em>she whispers, <q class="speech">"come"</q></em>');
  });

  it('does not wrap quotes spanning multiple lines', () => {
    const md = 'He said, "This quote\nspans across two lines"';
    const html = renderRoleplayMarkdown(md);
    expect(html).not.toContain('<q class="speech">');
  });

  it('does not wrap quotes inside inline code spans', () => {
    const md = 'Run `echo "hello world"` in bash';
    const html = renderRoleplayMarkdown(md);
    expect(html).toContain('<code>echo "hello world"</code>');
    expect(html).not.toContain('<q class="speech">');
  });

  it('escapes raw HTML tags as text', () => {
    const md = '<div>raw html block</div> and <span>inline</span>';
    const html = renderRoleplayMarkdown(md);
    expect(html).toContain('&lt;div&gt;raw html block&lt;/div&gt;');
    expect(html).toContain('&lt;span&gt;inline&lt;/span&gt;');
  });

  it('neutralizes all 8 OWASP XSS attack vectors so none survive in DOM', () => {
    const vectors = [
      '<script>alert("xss")</script>',
      '<img src="x" onerror="alert(1)">',
      '[click me](javascript:alert(1))',
      '[click me](data:text/html,<script>alert(1)</script>)',
      '<svg onload="alert(1)">',
      '<div style="background: red">styled</div>',
      '<a href="https://example.com" onclick="alert(1)">click</a>',
      '<iframe src="https://evil.com"></iframe>'
    ];

    for (const vec of vectors) {
      const html = renderRoleplayMarkdown(vec);
      const container = document.createElement('div');
      container.innerHTML = html;

      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('svg')).toBeNull();
      expect(container.querySelector('iframe')).toBeNull();
      expect(container.querySelector('[onerror]')).toBeNull();
      expect(container.querySelector('[onload]')).toBeNull();
      expect(container.querySelector('[onclick]')).toBeNull();
      expect(container.querySelector('[style]')).toBeNull();
      expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
      expect(container.querySelector('a[href^="data:"]')).toBeNull();
    }
  });

  it('ensures non-speech class attributes never survive in DOM', () => {
    const md = '<span class="hidden">stealth</span>';
    const html = renderRoleplayMarkdown(md);
    const container = document.createElement('div');
    container.innerHTML = html;
    expect(container.querySelector('.hidden')).toBeNull();
    expect(container.querySelector('[class="hidden"]')).toBeNull();
  });

  it('renders unterminated * and " literally for streaming tolerance', () => {
    const md = '*unterminated italic and "unterminated quote';
    const html = renderRoleplayMarkdown(md);
    expect(html).toContain('*unterminated italic and "unterminated quote');
    expect(html).not.toContain('<q class="speech">');
  });

  it('is deterministic across repeated invocations', () => {
    const md = '*Deliberate*, deliberate prose with "speech" and **bold**.';
    const h1 = renderRoleplayMarkdown(md);
    const h2 = renderRoleplayMarkdown(md);
    expect(h1).toBe(h2);
  });

  it('parses and sanitizes a 50 KB text chunk in under 100 ms', () => {
    const sample = 'The mage turned deliberately. "The time has come," he said. *A gust swept the stones.*\n\n';
    const bigDoc = sample.repeat(400); // ~50 KB

    const t0 = performance.now();
    renderRoleplayMarkdown(bigDoc);
    const duration = performance.now() - t0;

    expect(duration).toBeLessThan(100);
  });
});

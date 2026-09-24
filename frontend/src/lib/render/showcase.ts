import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import { rebuildStyle } from './styleAllowlist';

const markedShowcase = new Marked({
  gfm: true,
  breaks: true
});

markedShowcase.use({
  renderer: {
    image(token: any) {
      const src = token.href ?? '';
      // P3 Invariant: Never allow remote images (http/https/protocol-relative)
      if (!src.startsWith('/assets/') && !src.startsWith('data:image/') && !src.startsWith('media://')) {
        return '';
      }
      const alt = token.text ? ` alt="${token.text}"` : '';
      const title = token.title ? ` title="${token.title}"` : '';
      return `<img src="${src}"${alt}${title} loading="lazy" decoding="async" />`;
    },
    link(token: any) {
      const href = token.href ?? '';
      const text = this.parser.parseInline(token.tokens);
      if (/^https?:\/\//i.test(href)) {
        return `<a href="${href}" rel="noopener noreferrer" target="_blank">${text}</a>`;
      }
      if (href.startsWith('/') || href.startsWith('#')) {
        return `<a href="${href}">${text}</a>`;
      }
      return text;
    }
  }
});

const SHOWCASE_ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr', 'blockquote',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'pre', 'code', 'em', 'strong', 'del', 'sub', 'sup',
  'span', 'div', 'details', 'summary',
  'img', 'a', 'q', 'cite', 'abbr', 'kbd', 'mark'
];

const SHOWCASE_ALLOWED_ATTR = [
  'style', 'class', 'id', 'src', 'alt', 'title', 'width', 'height',
  'href', 'target', 'rel', 'open', 'loading', 'decoding'
];

const SHOWCASE_FORBID_TAGS = [
  'script', 'style', 'iframe', 'object', 'embed',
  'form', 'input', 'button', 'select', 'textarea',
  'svg', 'math', 'link', 'meta', 'base'
];

let showcasePurifierInstance: any = null;

function getShowcasePurifier(): any {
  if (showcasePurifierInstance) return showcasePurifierInstance;
  const purifyFactory = (DOMPurify as any).default ?? DOMPurify;
  const p = typeof window !== 'undefined'
    ? (typeof purifyFactory === 'function' ? purifyFactory(window) : purifyFactory)
    : purifyFactory;

  if (p && typeof p.addHook === 'function') {
    p.addHook('uponSanitizeAttribute', (node: any, data: any) => {
      // 1. Sanitize style attribute with rebuildStyle
      if (data.attrName === 'style') {
        const cleaned = rebuildStyle(data.attrValue);
        if (cleaned) {
          data.attrValue = cleaned;
        } else {
          data.keepAttr = false;
        }
      }

      // 2. Strict image src check (P3 + A-P3). Only exact 64-hex media://
      // references survive; anything else must be same-origin /assets/ or
      // data:image/. Non-conforming media URIs lose src (never the element).
      if (data.attrName === 'src' && node.nodeName?.toLowerCase() === 'img') {
        const src = data.attrValue ?? '';
        const isLocal = src.startsWith('/assets/') || src.startsWith('data:image/');
        const isMediaRef = /^media:\/\/[a-f0-9]{64}$/.test(src);
        if (!isLocal && !isMediaRef) {
          data.keepAttr = false;
        }
      }

      // 3. Link href sanitization
      if (data.attrName === 'href' && node.nodeName?.toLowerCase() === 'a') {
        const href = data.attrValue ?? '';
        if (/^(javascript|vbscript|data):/i.test(href)) {
          data.keepAttr = false;
        }
      }
    });
  }
  showcasePurifierInstance = p;
  return showcasePurifierInstance;
}

export function renderShowcaseMarkdown(text: string): string {
  if (!text) return '';
  const rawHtml = markedShowcase.parse(text, { async: false }) as string;
  const purifier = getShowcasePurifier();
  if (!purifier || typeof purifier.sanitize !== 'function') {
    return rawHtml;
  }
  return purifier.sanitize(rawHtml, {
    ALLOWED_TAGS: SHOWCASE_ALLOWED_TAGS,
    ALLOWED_ATTR: SHOWCASE_ALLOWED_ATTR,
    FORBID_TAGS: SHOWCASE_FORBID_TAGS,
    ALLOW_DATA_ATTR: false,
    // DOMPurify natively validates URI attributes (src/href) against
    // ALLOWED_URI_REGEXP *in addition* to our hook. The default regexp does
    // not know the media: scheme and would strip src="media://..." before
    // the render boundary can resolve it. Admit media: here; the hook above
    // still constrains values to exact 64-hex references.
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|media):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
  });
}

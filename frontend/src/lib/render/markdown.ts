import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import { speechExtension } from './speech';

// Configure marked with speech extension, GFM, breaks, and disabled HTML/images/headings/tables
const markedInstance = new Marked(speechExtension, {
  gfm: true,
  breaks: true
});

// Disable headings, tables, and images; escape raw HTML; constrain links to https?
markedInstance.use({
  renderer: {
    heading(token: any) {
      const text = this.parser.parseInline(token.tokens);
      return `<p>${text}</p>\n`;
    },
    table(token: any) {
      return token.raw;
    },
    image() {
      return '';
    },
    html(token: any) {
      return token.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },
    link(token: any) {
      if (/^https?:\/\//i.test(token.href)) {
        const text = this.parser.parseInline(token.tokens);
        return `<a href="${token.href}" rel="noopener noreferrer" target="_blank">${text}</a>`;
      }
      return token.text;
    }
  }
});

const ALLOWED_TAGS = [
  'p', 'br', 'em', 'strong', 'q', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li', 'hr', 'a', 'span', 'del', 's'
];
const ALLOWED_ATTR = ['class', 'href', 'rel', 'target'];
const FORBID_TAGS = ['style', 'script', 'img', 'svg', 'math'];

let purifyInstance: any = null;

function getPurifier(): any {
  if (purifyInstance) return purifyInstance;
  const purifyFactory = (DOMPurify as any).default ?? DOMPurify;
  const p = typeof window !== 'undefined'
    ? (typeof purifyFactory.sanitize === 'function' ? purifyFactory : purifyFactory(window))
    : purifyFactory;

  if (p && typeof p.addHook === 'function') {
    p.addHook('uponSanitizeAttribute', (_node: any, data: any) => {
      if (data.attrName === 'class') {
        if (data.attrValue !== 'speech') {
          data.keepAttr = false;
        }
      }
      if (data.attrName === 'href') {
        if (!/^https?:\/\//i.test(data.attrValue)) {
          data.keepAttr = false;
        }
      }
    });
  }
  purifyInstance = p;
  return purifyInstance;
}

/**
 * Pure, hardened roleplay markdown renderer:
 * 1. Marked parse with speech extension, GFM, breaks
 * 2. DOMPurify sanitize with strict allowlist and custom attribute hook
 */
export function renderRoleplayMarkdown(text: string): string {
  if (!text) return '';
  const rawHtml = markedInstance.parse(text, { async: false }) as string;
  const purifier = getPurifier();
  if (!purifier || typeof purifier.sanitize !== 'function') {
    return rawHtml;
  }
  const sanitized = purifier.sanitize(`<div>${rawHtml}</div>`, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS,
    ALLOW_DATA_ATTR: false
  });
  if (sanitized.startsWith('<div>') && sanitized.endsWith('</div>')) {
    return sanitized.slice(5, -6);
  }
  return sanitized;
}

import type { MarkedExtension, TokenizerExtension } from 'marked';

/**
 * Speech extension for marked:
 * Matches single-line straight quotes "…" or curly quotes “…” (≤ 600 chars)
 * and wraps them in <q class="speech">…</q> keeping the quotes as text inside.
 */
export const speechExtension: MarkedExtension = {
  extensions: [
    {
      name: 'speech',
      level: 'inline',
      start(src: string) {
        const match = src.match(/["“]/);
        return match ? match.index : undefined;
      },
      tokenizer(src: string) {
        // Matches "..." or “...” without newline, up to 600 chars
        const rule = /^(?:\"([^"\n]{1,600})\"|“([^”\n]{1,600})”)/;
        const match = rule.exec(src);
        if (match) {
          const raw = match[0];
          const inner = match[1] ?? match[2];
          return {
            type: 'speech',
            raw,
            tokens: this.lexer.inlineTokens(inner)
          };
        }
        return undefined;
      },
      renderer(this: any, token: any) {
        const firstChar = token.raw[0];
        const lastChar = token.raw[token.raw.length - 1];
        const innerHtml = this.parser.parseInline(token.tokens);
        return `<q class="speech">${firstChar}${innerHtml}${lastChar}</q>`;
      }
    } as any
  ]
};

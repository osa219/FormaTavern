import { describe, it, expect } from 'bun:test';
import {
  splitCustomCss,
  joinCustomCss,
  SHOWCASE_SURFACE_MARKER,
  CHAT_SURFACE_MARKER
} from '../../src/customCss/partition';

describe('Custom CSS Surface Partitioning', () => {
  it('handles empty, null, undefined, or whitespace-only CSS', () => {
    expect(splitCustomCss(null)).toEqual({ showcase: '', chat: '' });
    expect(splitCustomCss(undefined)).toEqual({ showcase: '', chat: '' });
    expect(splitCustomCss('')).toEqual({ showcase: '', chat: '' });
    expect(splitCustomCss('   \n\t  ')).toEqual({ showcase: '', chat: '' });
    expect(joinCustomCss({ showcase: '', chat: '' })).toBe('');
  });

  it('correctly splits partitioned CSS with standard markers', () => {
    const raw = `${SHOWCASE_SURFACE_MARKER}
.ft-hero { border: 1px solid var(--theme-accent); }

${CHAT_SURFACE_MARKER}
.ft-message-log { background: #120e09; }
.ft-topbar { border-bottom: 1px solid gold; }
`;

    const split = splitCustomCss(raw);
    expect(split.showcase).toBe('.ft-hero { border: 1px solid var(--theme-accent); }');
    expect(split.chat).toBe('.ft-message-log { background: #120e09; }\n.ft-topbar { border-bottom: 1px solid gold; }');
  });

  it('correctly splits partitioned CSS when chat appears before showcase', () => {
    const raw = `${CHAT_SURFACE_MARKER}
.ft-topbar { background: black; }

${SHOWCASE_SURFACE_MARKER}
.ft-showcase-body { color: gold; }
`;

    const split = splitCustomCss(raw);
    expect(split.chat).toBe('.ft-topbar { background: black; }');
    expect(split.showcase).toBe('.ft-showcase-body { color: gold; }');
  });

  it('handles single-surface partitioned CSS', () => {
    const chatOnly = `${CHAT_SURFACE_MARKER}\n.ft-composer { background: #111; }\n`;
    expect(splitCustomCss(chatOnly)).toEqual({
      showcase: '',
      chat: '.ft-composer { background: #111; }'
    });

    const showcaseOnly = `${SHOWCASE_SURFACE_MARKER}\n.ft-hero { opacity: 0.9; }\n`;
    expect(splitCustomCss(showcaseOnly)).toEqual({
      showcase: '.ft-hero { opacity: 0.9; }',
      chat: ''
    });
  });

  it('performs clean deterministic round-trips via joinCustomCss and splitCustomCss', () => {
    const showcase = '.ft-hero {\n  border: 1px solid red;\n}';
    const chat = '.ft-turn-body {\n  padding: 1rem;\n}';

    const joined = joinCustomCss({ showcase, chat });
    expect(joined).toContain(SHOWCASE_SURFACE_MARKER);
    expect(joined).toContain(CHAT_SURFACE_MARKER);

    const resplit = splitCustomCss(joined);
    expect(resplit.showcase).toBe(showcase);
    expect(resplit.chat).toBe(chat);
  });

  it('classifies legacy unsegmented sheets using surface hook heuristics', () => {
    // Chat-specific sheet with Grimoire theme
    const legacyChatCss = `/* Grimoire Theme */
[data-ft-surface="chat"] {
  --theme-accent: #d4af37;
}
.ft-message-log {
  background: #120e09;
}
.ft-topbar {
  background: rgba(20, 15, 10, 0.95);
}
.ft-composer {
  border-top: 1px solid gold;
}
.ft-turn-body {
  border-left: 3px solid #d4af37;
}`;

    const chatResult = splitCustomCss(legacyChatCss);
    expect(chatResult.showcase).toBe('');
    expect(chatResult.chat).toBe(legacyChatCss.trim());

    // Showcase-specific sheet
    const legacyShowcaseCss = `/* Showcase Hero */
.ft-hero {
  border-radius: 12px;
}
.ft-showcase-body {
  font-family: serif;
}
.ft-action-hub button {
  letter-spacing: 0.1em;
}`;

    const showcaseResult = splitCustomCss(legacyShowcaseCss);
    expect(showcaseResult.chat).toBe('');
    expect(showcaseResult.showcase).toBe(legacyShowcaseCss.trim());
  });
});

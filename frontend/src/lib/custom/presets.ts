export interface CustomCssPreset {
  id: string;
  name: string;
  description: string;
  css: string;
  surface?: 'character' | 'chat';
}

export const TERMINAL_PRESET: CustomCssPreset = {
  id: 'terminal',
  name: 'Terminal',
  description: 'Retro CRT monochrome with phosphor green accents and monospace framing',
  surface: 'character',
  css: `/* Terminal — Retro CRT monospace starter */
.ft-hero {
  border: 1px solid rgba(34, 197, 94, 0.4);
  background: radial-gradient(ellipse at center, rgba(34, 197, 94, 0.05) 0%, rgba(5, 15, 8, 0.8) 100%);
  border-radius: 4px;
}

.ft-showcase-body {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: #86efac;
}

.ft-bubble-char {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  border: 1px solid rgba(34, 197, 94, 0.35);
  background-color: rgba(6, 20, 10, 0.85);
  border-radius: 2px;
  box-shadow: 0 0 12px rgba(34, 197, 94, 0.1);
}

.ft-bubble-user {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  border: 1px solid rgba(74, 222, 128, 0.25);
  background-color: rgba(10, 30, 15, 0.75);
  border-radius: 2px;
}

.ft-action-hub button {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  border-radius: 2px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
`
};

export const MANUSCRIPT_PRESET: CustomCssPreset = {
  id: 'manuscript',
  name: 'Manuscript',
  description: 'Warm antique parchment aesthetic with elegant serif typography and ornate borders',
  surface: 'character',
  css: `/* Manuscript — Antique parchment & classic serif starter */
.ft-hero {
  border: 1px solid rgba(217, 119, 6, 0.35);
  background: linear-gradient(180deg, rgba(45, 26, 12, 0.4) 0%, rgba(20, 10, 5, 0.7) 100%);
  border-radius: 8px;
}

.ft-showcase-body {
  font-family: 'Cinzel', 'Playfair Display', Georgia, serif;
  color: #fef3c7;
  line-height: 1.8;
}

.ft-bubble-char {
  font-family: 'Playfair Display', Georgia, serif;
  border: 1px solid rgba(180, 83, 9, 0.4);
  background-color: rgba(35, 18, 10, 0.85);
  border-radius: 6px;
  box-shadow: inset 0 0 15px rgba(180, 83, 9, 0.08);
}

.ft-bubble-user {
  font-family: 'Playfair Display', Georgia, serif;
  border: 1px solid rgba(146, 64, 14, 0.3);
  background-color: rgba(25, 15, 10, 0.75);
  border-radius: 6px;
}

.ft-action-hub button {
  font-family: 'Cinzel', Georgia, serif;
  border: 1px solid rgba(217, 119, 6, 0.5);
  border-radius: 4px;
}
`
};

export const WINDOW_PRESET: CustomCssPreset = {
  id: 'window',
  name: 'Window',
  description: 'Retro 90s desktop operating system frame with beveled borders and title accents',
  surface: 'character',
  css: `/* Window — Classic desktop OS window frame starter */
.ft-hero {
  border-top: 2px solid #e5e7eb;
  border-left: 2px solid #e5e7eb;
  border-right: 2px solid #374151;
  border-bottom: 2px solid #374151;
  background-color: rgba(17, 24, 39, 0.9);
  border-radius: 0;
}

.ft-showcase-body {
  font-family: system-ui, -apple-system, sans-serif;
  color: #f3f4f6;
}

.ft-bubble-char {
  border-top: 2px solid #d1d5db;
  border-left: 2px solid #d1d5db;
  border-right: 2px solid #1f2937;
  border-bottom: 2px solid #1f2937;
  border-radius: 0;
  background-color: rgba(31, 41, 55, 0.9);
}

.ft-bubble-user {
  border-top: 2px solid #9ca3af;
  border-left: 2px solid #9ca3af;
  border-right: 2px solid #111827;
  border-bottom: 2px solid #111827;
  border-radius: 0;
  background-color: rgba(17, 24, 39, 0.85);
}

.ft-action-hub button {
  border-top: 2px solid #f3f4f6;
  border-left: 2px solid #f3f4f6;
  border-right: 2px solid #1f2937;
  border-bottom: 2px solid #1f2937;
  border-radius: 0;
  font-weight: 600;
}
`
};

export const NIGHT_MARKET_PRESET: CustomCssPreset = {
  id: 'night-market',
  name: 'Night Market',
  description: 'Cyberpunk neon noir with luminous cyan and magenta glassmorphic glow',
  surface: 'character',
  css: `/* Night Market — Cyberpunk neon noir starter */
.ft-hero {
  border: 1px solid rgba(6, 182, 212, 0.4);
  background: radial-gradient(circle at top right, rgba(236, 72, 153, 0.1) 0%, rgba(10, 10, 20, 0.85) 100%);
  border-radius: 12px;
  box-shadow: 0 0 20px rgba(6, 182, 212, 0.15);
}

.ft-showcase-body {
  font-family: system-ui, -apple-system, sans-serif;
  color: #e0f2fe;
}

.ft-bubble-char {
  border: 1px solid rgba(236, 72, 153, 0.45);
  background-color: rgba(20, 10, 30, 0.85);
  border-radius: 10px;
  box-shadow: 0 0 15px rgba(236, 72, 153, 0.15);
}

.ft-bubble-user {
  border: 1px solid rgba(6, 182, 212, 0.35);
  background-color: rgba(10, 20, 35, 0.8);
  border-radius: 10px;
  box-shadow: 0 0 15px rgba(6, 182, 212, 0.12);
}

.ft-action-hub button {
  border: 1px solid rgba(6, 182, 212, 0.6);
  border-radius: 8px;
  box-shadow: 0 0 10px rgba(6, 182, 212, 0.25);
  transition: opacity 0.2s ease, transform 0.2s ease;
}
`
};

export const UNIFORM_ROWS_PRESET: CustomCssPreset = {
  id: 'uniform-rows',
  name: 'Uniform Rows',
  description: 'Clean reading layout with uniform left alignment, subtle borders, and distinct voice tags',
  surface: 'chat',
  css: `/* Uniform Rows — Clean flat reading layout starter */
.ft-row {
  max-width: var(--msg-measure, 72ch);
  margin-bottom: 0.75rem;
}

.ft-turn-name {
  font-weight: 600;
  letter-spacing: 0.025em;
  color: var(--theme-accent, #60a5fa);
  margin-bottom: 0.25rem;
}

.ft-turn-body {
  border-left: 2px solid color-mix(in srgb, var(--chrome-line) 60%, transparent);
  padding-left: 0.75rem;
  line-height: 1.65;
}

.ft-row[data-kind="narrator"] .ft-turn-body {
  border-left-color: transparent;
  color: color-mix(in oklab, var(--chrome-text, #e5e5e5) 75%, transparent);
  font-style: italic;
}
`
};

export const SPLIT_BUBBLES_PRESET: CustomCssPreset = {
  id: 'split-bubbles',
  name: 'Split Bubbles',
  description: 'Classic messenger style with right-aligned user bubbles, left-aligned companion speech, and rounded cards',
  surface: 'chat',
  css: `/* Split Bubbles — Classic messenger dialogue starter */
.ft-turn[data-role="persona"] .ft-row {
  justify-content: flex-end;
}

.ft-bubble-char {
  background-color: var(--theme-char-bg, rgba(30, 41, 59, 0.8));
  border: 1px solid var(--theme-char-border, rgba(51, 65, 85, 0.6));
  border-radius: 1rem;
  padding: 0.75rem 1rem;
}

.ft-bubble-user {
  background-color: var(--theme-user-bg, rgba(15, 23, 42, 0.9));
  border: 1px solid var(--theme-user-border, rgba(30, 41, 59, 0.8));
  border-radius: 1rem;
  padding: 0.75rem 1rem;
}

.ft-turn-name {
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  opacity: 0.8;
}
`
};

export const CENTERED_NARRATOR_PRESET: CustomCssPreset = {
  id: 'centered-narrator',
  name: 'Centered Narrator',
  description: 'Atmospheric storybook style with centered narrator passages and stylized quotation framing',
  surface: 'chat',
  css: `/* Centered Narrator — Book style with centered scene descriptions */
.ft-row[data-kind="narrator"] {
  justify-content: center;
  text-align: center;
  margin: 1.5rem auto;
  max-width: 60ch;
}

.ft-row[data-kind="narrator"] .ft-turn-body {
  font-style: italic;
  color: color-mix(in srgb, var(--chrome-text, #e5e5e5) 80%, var(--theme-accent, #60a5fa) 20%);
  padding: 0.5rem 1rem;
  border-top: 1px dashed color-mix(in srgb, var(--chrome-line) 40%, transparent);
  border-bottom: 1px dashed color-mix(in srgb, var(--chrome-line) 40%, transparent);
}

.ft-row:not([data-kind="narrator"]) .ft-turn-name {
  font-weight: 700;
  color: var(--theme-accent, #60a5fa);
}
`
};

export const ILLUMINATED_CODEX_PRESET: CustomCssPreset = {
  id: 'illuminated-codex',
  name: 'Illuminated Codex',
  description: 'Ancient grimoire aesthetic with golden borders, ambient parchment glow, and serif typography',
  surface: 'chat',
  css: `/* Illuminated Codex — Ancient grimoire reading starter */
[data-ft-surface="chat"] {
  --theme-accent: #d4af37;
  --theme-accent-contrast: #1a120b;
  --chrome-bg: #140f0a;
  --chrome-surface: #1e1710;
  --chrome-line: rgba(212, 175, 55, 0.25);
  --chrome-text: #f3ebd7;
}

.ft-message-log {
  background: 
    radial-gradient(ellipse at 50% 0%, rgba(212, 175, 55, 0.09) 0%, transparent 60%),
    radial-gradient(ellipse at 50% 100%, rgba(180, 120, 40, 0.07) 0%, transparent 55%),
    linear-gradient(180deg, #130e09 0%, #17110c 50%, #120e09 100%);
}

.ft-topbar {
  background: rgba(20, 15, 10, 0.95);
  border-bottom: 1px solid rgba(212, 175, 55, 0.3);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
}

.ft-composer {
  background: rgba(18, 14, 9, 0.96);
  border-top: 1px solid rgba(212, 175, 55, 0.28);
}

.ft-turn-body {
  background: linear-gradient(135deg, rgba(38, 30, 22, 0.9) 0%, rgba(26, 20, 15, 0.96) 100%);
  border: 1px solid rgba(212, 175, 55, 0.35);
  border-radius: 6px;
  color: #f3ebd7;
  padding: 0.85rem 1.25rem;
}

.ft-turn[data-role="assistant"] .ft-turn-body,
.ft-turn[data-role="character"] .ft-turn-body {
  border-left: 3px solid #d4af37;
}

.ft-turn[data-role="user"] .ft-turn-body,
.ft-turn[data-role="persona"] .ft-turn-body {
  background: linear-gradient(135deg, rgba(30, 22, 18, 0.9) 0%, rgba(20, 15, 12, 0.96) 100%);
  border: 1px solid rgba(180, 140, 90, 0.25);
  border-right: 3px solid #c89658;
}

.ft-turn-name {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #e8ca77;
}

.ft-avatar {
  border: 2px solid rgba(212, 175, 55, 0.6);
  box-shadow: 0 0 10px rgba(212, 175, 55, 0.25);
}
`
};

export const SHOWCASE_PRESETS: readonly CustomCssPreset[] = [
  TERMINAL_PRESET,
  MANUSCRIPT_PRESET,
  WINDOW_PRESET,
  NIGHT_MARKET_PRESET
];

export const CHAT_PRESETS: readonly CustomCssPreset[] = [
  ILLUMINATED_CODEX_PRESET,
  UNIFORM_ROWS_PRESET,
  SPLIT_BUBBLES_PRESET,
  CENTERED_NARRATOR_PRESET
];

export const CUSTOM_CSS_PRESETS: readonly CustomCssPreset[] = [
  ...SHOWCASE_PRESETS,
  ...CHAT_PRESETS
];

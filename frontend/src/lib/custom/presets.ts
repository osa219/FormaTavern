export interface CustomCssPreset {
  id: string;
  name: string;
  description: string;
  css: string;
}

export const TERMINAL_PRESET: CustomCssPreset = {
  id: 'terminal',
  name: 'Terminal',
  description: 'Retro CRT monochrome with phosphor green accents and monospace framing',
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

export const CUSTOM_CSS_PRESETS: readonly CustomCssPreset[] = [
  TERMINAL_PRESET,
  MANUSCRIPT_PRESET,
  WINDOW_PRESET,
  NIGHT_MARKET_PRESET
];

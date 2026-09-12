import type { CharacterTheme } from '@formatavern/shared';

export const CSS_VAR_NAMES = [
  '--theme-font-family',
  '--theme-font-size',
  '--theme-line-height',
  '--theme-char-bg',
  '--theme-char-text',
  '--theme-char-border',
  '--theme-user-bg',
  '--theme-user-text',
  '--theme-user-border',
  '--theme-accent',
  '--theme-accent-contrast',
  '--theme-quote-color',
  '--theme-action-color',
  '--theme-narrator-color',
  '--theme-bubble-radius',
  '--theme-bubble-padding',
  '--theme-char-tail',
  '--theme-user-tail',
  '--theme-bg-img',
  '--theme-bg-blur',
  '--theme-bg-overlay',
  '--theme-scheme'
] as const;

export type CssVarName = (typeof CSS_VAR_NAMES)[number];

export function isLightColor(colorStr: string): boolean {
  const hexMatch = colorStr.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.45;
  }
  const rgbMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.45;
  }
  return true;
}

export function themeToCssVars(theme: CharacterTheme): Record<CssVarName, string> {
  let family = theme.font.family || 'system-ui, sans-serif';
  if (!family.includes('system-ui') && !family.includes('sans-serif')) {
    family = `${family}, system-ui, sans-serif`;
  }

  const bgImg = theme.background.image
    ? `url("${theme.background.image.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`
    : 'none';

  const charText = theme.colors.charBubbleText;
  const scheme = isLightColor(charText) ? 'dark' : 'light';

  return {
    '--theme-font-family': family,
    '--theme-font-size': theme.font.size || '1rem',
    '--theme-line-height': theme.font.lineHeight || '1.7',
    '--theme-char-bg': theme.colors.charBubbleBg,
    '--theme-char-text': theme.colors.charBubbleText,
    '--theme-char-border': theme.colors.charBubbleBorder || 'transparent',
    '--theme-user-bg': theme.colors.userBubbleBg,
    '--theme-user-text': theme.colors.userBubbleText,
    '--theme-user-border': theme.colors.userBubbleBorder || 'transparent',
    '--theme-accent': theme.colors.accent,
    '--theme-accent-contrast': isLightColor(theme.colors.accent) ? '#0a0a0c' : '#ffffff',
    '--theme-quote-color': theme.colors.quote || 'inherit',
    '--theme-action-color': theme.colors.action || 'rgb(148, 163, 184)',
    '--theme-narrator-color': theme.colors.narratorText || 'rgb(203, 213, 225)',
    '--theme-bubble-radius': theme.bubble.radius || '1rem',
    '--theme-bubble-padding': theme.bubble.padding || '1rem 1.25rem',
    '--theme-char-tail': theme.bubble.charTail || 'left',
    '--theme-user-tail': theme.bubble.userTail || 'right',
    '--theme-bg-img': bgImg,
    '--theme-bg-blur': theme.background.blur || '0px',
    '--theme-bg-overlay': theme.background.overlay || 'rgba(0, 0, 0, 0.5)',
    '--theme-scheme': scheme
  };
}

export function serializeVars(vars: Record<CssVarName, string>): string {
  return CSS_VAR_NAMES.map((name) => `${name}: ${vars[name]};`).join(' ');
}

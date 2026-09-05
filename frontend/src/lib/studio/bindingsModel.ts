import { THEME_PATHS, type ThemePath } from '@formatavern/shared';

export interface ThemePathCategory {
  label: string;
  paths: { path: ThemePath; label: string; placeholder: string }[];
}

export const THEME_PATH_CATEGORIES: ThemePathCategory[] = [
  {
    label: 'Typography',
    paths: [
      { path: 'font.family', label: 'Font Family', placeholder: 'Cinzel Variable, serif' },
      { path: 'font.size', label: 'Font Size', placeholder: '1rem' },
      { path: 'font.lineHeight', label: 'Line Height', placeholder: '1.7' }
    ]
  },
  {
    label: 'Colors',
    paths: [
      { path: 'colors.accent', label: 'Accent Color', placeholder: '#6366f1' },
      { path: 'colors.charBubbleBg', label: 'Character Bubble Background', placeholder: '#1e293b' },
      { path: 'colors.charBubbleText', label: 'Character Bubble Text', placeholder: '#f1f5f9' },
      { path: 'colors.charBubbleBorder', label: 'Character Bubble Border', placeholder: '#334155' },
      { path: 'colors.userBubbleBg', label: 'User Bubble Background', placeholder: '#0f172a' },
      { path: 'colors.userBubbleText', label: 'User Bubble Text', placeholder: '#f8fafc' },
      { path: 'colors.userBubbleBorder', label: 'User Bubble Border', placeholder: 'transparent' },
      { path: 'colors.quote', label: 'Speech Quote Color', placeholder: '#fde047' },
      { path: 'colors.action', label: 'Action Asterisk Color', placeholder: '#94a3b8' },
      { path: 'colors.narratorText', label: 'Narrator Block Text', placeholder: '#cbd5e1' }
    ]
  },
  {
    label: 'Bubble Geometry',
    paths: [
      { path: 'bubble.radius', label: 'Corner Radius', placeholder: '1rem' },
      { path: 'bubble.padding', label: 'Internal Padding', placeholder: '1rem 1.25rem' },
      { path: 'bubble.charTail', label: 'Character Tail (left/none)', placeholder: 'left' },
      { path: 'bubble.userTail', label: 'User Tail (right/none)', placeholder: 'right' }
    ]
  },
  {
    label: 'Atmospheric Background',
    paths: [
      { path: 'background.image', label: 'Background Image URL', placeholder: '/assets/bg.jpg' },
      { path: 'background.overlay', label: 'Overlay Color / Alpha', placeholder: 'rgba(0,0,0,0.5)' },
      { path: 'background.blur', label: 'Background Blur', placeholder: '4px' }
    ]
  }
];

export function isValidThemePath(path: string): path is ThemePath {
  return (THEME_PATHS as readonly string[]).includes(path);
}

export function getThemePathLabel(path: string): string {
  for (const cat of THEME_PATH_CATEGORIES) {
    const item = cat.paths.find((p) => p.path === path);
    if (item) return item.label;
  }
  return path;
}

import { Type, type Static } from '@sinclair/typebox';
import { AssetPath, CssToken } from './primitives';

export const ThemeFontSchema = Type.Object({
  family: CssToken,
  size: Type.Optional(CssToken),
  lineHeight: Type.Optional(CssToken)
});

export const ThemeColorsSchema = Type.Object({
  charBubbleBg: CssToken,
  charBubbleText: CssToken,
  charBubbleBorder: Type.Optional(CssToken),
  userBubbleBg: CssToken,
  userBubbleText: CssToken,
  userBubbleBorder: Type.Optional(CssToken),
  accent: CssToken,
  quote: Type.Optional(CssToken),
  action: Type.Optional(CssToken),
  narratorText: Type.Optional(CssToken)
});

export const ThemeBubbleSchema = Type.Object({
  radius: CssToken,
  charTail: Type.Optional(Type.Union([Type.Literal('left'), Type.Literal('none')])),
  userTail: Type.Optional(Type.Union([Type.Literal('right'), Type.Literal('none')])),
  padding: Type.Optional(CssToken)
});

export const ThemeBackgroundSchema = Type.Object({
  image: Type.Optional(AssetPath),
  overlay: Type.Optional(CssToken),
  blur: Type.Optional(CssToken)
});

export const CharacterThemeSchema = Type.Object({
  font: ThemeFontSchema,
  colors: ThemeColorsSchema,
  bubble: ThemeBubbleSchema,
  background: ThemeBackgroundSchema
});
export type CharacterTheme = Static<typeof CharacterThemeSchema>;

/** Deep-partial for persona.style_overrides (Type.Partial is shallow — build it explicitly). */
export const ThemeOverridesSchema = Type.Object({
  font: Type.Optional(Type.Partial(ThemeFontSchema)),
  colors: Type.Optional(Type.Partial(ThemeColorsSchema)),
  bubble: Type.Optional(Type.Partial(ThemeBubbleSchema)),
  background: Type.Optional(Type.Partial(ThemeBackgroundSchema))
});
export type ThemeOverrides = Static<typeof ThemeOverridesSchema>;

/** Neutral fallback used when a card arrives without a style (Phase 4 cascade layer 1). */
export const DEFAULT_CHARACTER_THEME: CharacterTheme = {
  font: {
    family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    size: '1rem',
    lineHeight: '1.7'
  },
  colors: {
    charBubbleBg: 'rgb(30, 41, 59)',
    charBubbleText: 'rgb(241, 245, 249)',
    userBubbleBg: 'rgba(15, 23, 42, 0.8)',
    userBubbleText: '#f8fafc',
    accent: '#38bdf8',
    quote: '#fde047',
    action: '#94a3b8',
    narratorText: 'rgb(203, 213, 225)'
  },
  bubble: {
    radius: '1rem',
    padding: '1rem 1.25rem'
  },
  background: {}
};

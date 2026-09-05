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

export { DEFAULT_CHARACTER_THEME, NEUTRAL_A11Y_THEME } from '../theme/defaults';

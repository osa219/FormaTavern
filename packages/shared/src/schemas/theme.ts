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

export const ThemeDecorPositionSchema = Type.Union([
  Type.Literal('top-left'),
  Type.Literal('top-right'),
  Type.Literal('bottom-left'),
  Type.Literal('bottom-right'),
  Type.Literal('center'),
  Type.Literal('top-center'),
  Type.Literal('bottom-center')
]);
export type ThemeDecorPosition = Static<typeof ThemeDecorPositionSchema>;

export const ThemeDecorOffsetSchema = Type.Object({
  x: Type.Optional(Type.Union([CssToken, Type.Literal('')])),
  y: Type.Optional(Type.Union([CssToken, Type.Literal('')]))
});
export type ThemeDecorOffset = Static<typeof ThemeDecorOffsetSchema>;

export const ThemeDecorLayerSchema = Type.Object({
  image: Type.Union([AssetPath, Type.Literal('')]),
  position: Type.Optional(ThemeDecorPositionSchema),
  size: Type.Optional(Type.Union([CssToken, Type.Literal('')])),
  offset: Type.Optional(ThemeDecorOffsetSchema),
  opacity: Type.Optional(Type.Number({ minimum: 0, maximum: 1, default: 1 })),
  blur: Type.Optional(CssToken)
});
export type ThemeDecorLayer = Static<typeof ThemeDecorLayerSchema>;

export const ThemeFxBubbleSchema = Type.Union([
  Type.Literal('none'),
  Type.Literal('breathe'),
  Type.Literal('float'),
  Type.Literal('glow')
], { default: 'none' });
export type ThemeFxBubble = Static<typeof ThemeFxBubbleSchema>;

export const ThemeFxSchema = Type.Object({
  bubble: Type.Optional(ThemeFxBubbleSchema)
});
export type ThemeFx = Static<typeof ThemeFxSchema>;

export const CharacterThemeSchema = Type.Object({
  font: ThemeFontSchema,
  colors: ThemeColorsSchema,
  bubble: ThemeBubbleSchema,
  background: ThemeBackgroundSchema,
  decor: Type.Optional(Type.Array(ThemeDecorLayerSchema, { maxItems: 2 })), // C13
  fx: Type.Optional(ThemeFxSchema)
});
export type CharacterTheme = Static<typeof CharacterThemeSchema>;

/** Deep-partial for persona.style_overrides (Type.Partial is shallow — build it explicitly). */
export const ThemeOverridesSchema = Type.Object({
  font: Type.Optional(Type.Partial(ThemeFontSchema)),
  colors: Type.Optional(Type.Partial(ThemeColorsSchema)),
  bubble: Type.Optional(Type.Partial(ThemeBubbleSchema)),
  background: Type.Optional(Type.Partial(ThemeBackgroundSchema)),
  decor: Type.Optional(Type.Array(ThemeDecorLayerSchema, { maxItems: 2 })),
  fx: Type.Optional(Type.Partial(ThemeFxSchema))
});
export type ThemeOverrides = Static<typeof ThemeOverridesSchema>;

export { DEFAULT_CHARACTER_THEME, NEUTRAL_A11Y_THEME } from '../theme/defaults';

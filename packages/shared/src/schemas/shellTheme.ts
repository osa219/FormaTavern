import { Type, type Static } from '@sinclair/typebox';
import { CssToken } from './primitives';
import { ThemeFontSchema, ThemeBackgroundSchema, type ThemeOverrides } from './theme';

export const ShellThemeSchema = Type.Object({
  font: Type.Optional(Type.Partial(ThemeFontSchema)),
  background: Type.Optional(ThemeBackgroundSchema),
  chrome: Type.Optional(
    Type.Object({
      accent: Type.Optional(CssToken),
      surface: Type.Optional(CssToken),
      surfaceRaised: Type.Optional(CssToken),
      border: Type.Optional(CssToken),
      text: Type.Optional(CssToken),
      font: Type.Optional(CssToken)
    })
  ),
  card: Type.Optional(
    Type.Object({
      radius: Type.Optional(CssToken),
      density: Type.Optional(
        Type.Union([Type.Literal('compact'), Type.Literal('regular'), Type.Literal('airy')])
      )
    })
  ),
  scrim: Type.Optional(CssToken),
  labels: Type.Optional(
    Type.Object({
      foyerTitle: Type.Optional(Type.String({ maxLength: 40 }))
    })
  ),
  customCss: Type.Optional(Type.String({ maxLength: 131_072 }))
});

export type ShellTheme = Static<typeof ShellThemeSchema>;
export const DEFAULT_SHELL_THEME: ShellTheme = {};

/**
 * Adapter converting a ShellTheme document into ThemeOverrides for the unified cascade.
 * Only 'font' and 'background' pass into the character cascade; chrome colors drive --chrome-*.
 */
export function shellToThemeOverrides(shell?: ShellTheme | null): ThemeOverrides {
  if (!shell) return {};
  const overrides: ThemeOverrides = {};
  if (shell.font) {
    overrides.font = shell.font;
  }
  if (shell.background) {
    overrides.background = shell.background;
  }
  return overrides;
}

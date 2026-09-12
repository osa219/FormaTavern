import { resolveTheme, shellToThemeOverrides, type CharacterCard, type Persona, type StateVector } from '@formatavern/shared';
import { themeToCssVars, serializeVars } from './cssVars';
import { prefs } from '../state/prefs.svelte';
import { shellTheme } from '../state/shellTheme.svelte';

export class ThemeEngine {
  constructor(private inputs: () => { character?: CharacterCard; persona?: Persona; state: StateVector }) {}

  readonly resolved = $derived.by(() =>
    resolveTheme({
      global: shellToThemeOverrides(shellTheme.theme),
      character: this.inputs().character?.style,
      bindings: this.inputs().character?.stateBindings,
      state: this.inputs().state,
      persona: this.inputs().persona?.styleOverrides,
      a11y: {
        disableCharacterThemes: prefs.disableCharacterThemes,
        disableReactiveTheming: prefs.disableReactiveTheming
      }
    })
  );

  readonly styleAttr = $derived.by(() => serializeVars(themeToCssVars(this.resolved.theme)));
  readonly backgroundImage = $derived.by(() => this.resolved.theme.background.image ?? null);
  readonly themeScheme = $derived.by(() => themeToCssVars(this.resolved.theme)['--theme-scheme'] as 'light' | 'dark');
  readonly decor = $derived.by(() => this.resolved.theme.decor ?? []);
  readonly fx = $derived.by(() => this.resolved.theme.fx);
}

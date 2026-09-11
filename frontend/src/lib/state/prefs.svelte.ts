class PrefsStore {
  disableCharacterThemes = $state<boolean>(false);
  disableReactiveTheming = $state<boolean>(false);
  enterToSend = $state<boolean>(true);
  devMode = $state<boolean>(false);
  reducedMotion = $state<'system' | 'on' | 'off'>('system');
  hideCustomStyling = $state<boolean>(false);
  forceSolidChrome = $state<boolean>(false);

  constructor() {
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem('formatavern_prefs');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (typeof parsed.disableCharacterThemes === 'boolean') {
            this.disableCharacterThemes = parsed.disableCharacterThemes;
          }
          if (typeof parsed.disableReactiveTheming === 'boolean') {
            this.disableReactiveTheming = parsed.disableReactiveTheming;
          }
          if (typeof parsed.enterToSend === 'boolean') {
            this.enterToSend = parsed.enterToSend;
          }
          if (typeof parsed.devMode === 'boolean') {
            this.devMode = parsed.devMode;
          }
          if (['system', 'on', 'off'].includes(parsed.reducedMotion)) {
            this.reducedMotion = parsed.reducedMotion;
          }
          if (typeof parsed.hideCustomStyling === 'boolean') {
            this.hideCustomStyling = parsed.hideCustomStyling;
          }
          if (typeof parsed.forceSolidChrome === 'boolean') {
            this.forceSolidChrome = parsed.forceSolidChrome;
          }
        }
      } catch {
        // ignore localStorage failure
      }
    }
  }

  save() {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(
          'formatavern_prefs',
          JSON.stringify({
            disableCharacterThemes: this.disableCharacterThemes,
            disableReactiveTheming: this.disableReactiveTheming,
            enterToSend: this.enterToSend,
            devMode: this.devMode,
            reducedMotion: this.reducedMotion,
            hideCustomStyling: this.hideCustomStyling,
            forceSolidChrome: this.forceSolidChrome
          })
        );
      } catch {
        // ignore
      }
    }
  }
}

export const prefs = new PrefsStore();

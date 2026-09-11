import type { SettingsView, SettingsPatch } from '@formatavern/shared';
import { api, toUiError } from '../api';
import { toasts } from './toasts.svelte';

const TAB_ID = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

class SettingsStore {
  settings = $state<SettingsView | null>(null);
  loading = $state<boolean>(false);
  saving = $state<boolean>(false);
  error = $state<string | null>(null);
  private seq = 0;
  private channel: BroadcastChannel | null = null;

  constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('formatavern_sync');
      this.channel.onmessage = (e) => {
        if (e.data && e.data.tabId !== TAB_ID && e.data.type === 'settings_updated') {
          this.settings = e.data.settings;
        }
      };
    }
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const { data, error } = await api.api.settings.get();
      if (!error && data && 'provider' in data) {
        this.settings = data as SettingsView;
        this.error = null;
      } else if (error) {
        const uiErr = toUiError(error);
        this.error = uiErr.message;
        toasts.error(uiErr.message);
      } else {
        this.error = 'Failed to load settings';
      }
    } catch (err: any) {
      const uiErr = toUiError(err);
      this.error = uiErr.message;
      toasts.error(uiErr.message);
    } finally {
      this.loading = false;
    }
  }

  async patch(patchPayload: SettingsPatch): Promise<void> {
    const currentSeq = ++this.seq;
    this.saving = true;
    try {
      const { data, error } = await api.api.settings.patch(patchPayload);
      if (!error && data && 'provider' in data) {
        if (currentSeq === this.seq) {
          this.settings = data as SettingsView;
          try {
            this.channel?.postMessage({
              type: 'settings_updated',
              tabId: TAB_ID,
              settings: JSON.parse(JSON.stringify(data))
            });
          } catch (postErr) {
            console.warn('[Settings] BroadcastChannel sync failed:', postErr);
          }
        }
      } else if (error) {
        toasts.error(toUiError(error).message);
      }
    } catch (err: any) {
      toasts.error(toUiError(err).message);
    } finally {
      if (currentSeq === this.seq) {
        this.saving = false;
      }
    }
  }
}

export const settingsStore = new SettingsStore();

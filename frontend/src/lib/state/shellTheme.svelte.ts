import { DEFAULT_SHELL_THEME, type ShellTheme } from '@formatavern/shared';
import { api, toUiError } from '../api';
import { toasts } from './toasts.svelte';

const TAB_ID = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export class ShellThemeStore {
  theme = $state<ShellTheme>(DEFAULT_SHELL_THEME);
  loading = $state<boolean>(false);
  saving = $state<boolean>(false);
  error = $state<string | null>(null);
  private seq = 0;
  private channel: BroadcastChannel | null = null;
  private client: any;

  constructor(client: any = api) {
    this.client = client;
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('formatavern_sync');
      this.channel.onmessage = (e) => {
        if (e.data && e.data.tabId !== TAB_ID && e.data.type === 'shell_theme_updated') {
          this.theme = e.data.theme ?? DEFAULT_SHELL_THEME;
        }
      };
    }
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const res = await (this.client.api.settings['shell-theme'] as any).get();
      if (!res.error && res.data) {
        this.theme = res.data as ShellTheme;
        this.error = null;
      } else if (res.error) {
        const uiErr = toUiError(res.error);
        this.error = uiErr.message;
      }
    } catch (err: any) {
      const uiErr = toUiError(err);
      this.error = uiErr.message;
    } finally {
      this.loading = false;
    }
  }

  async save(newTheme: ShellTheme): Promise<boolean> {
    const currentSeq = ++this.seq;
    this.saving = true;
    try {
      const res = await (this.client.api.settings['shell-theme'] as any).put(newTheme);
      if (!res.error && res.data) {
        if (currentSeq === this.seq) {
          this.theme = res.data as ShellTheme;
          this.channel?.postMessage({
            type: 'shell_theme_updated',
            tabId: TAB_ID,
            theme: this.theme
          });
        }
        return true;
      } else if (res.error) {
        toasts.error(toUiError(res.error).message);
        return false;
      }
      return false;
    } catch (err: any) {
      toasts.error(toUiError(err).message);
      return false;
    } finally {
      if (currentSeq === this.seq) {
        this.saving = false;
      }
    }
  }
}

export const shellTheme = new ShellThemeStore();

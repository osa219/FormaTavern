import type { ProviderConfigView } from '@formatavern/shared';
import { api, toUiError } from '../api';
import { toasts } from './toasts.svelte';

export interface ConfigTestResult {
  ok: boolean;
  latencyMs?: number;
  code?: string;
  message?: string;
}

const TAB_ID = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

class ProviderConfigsStore {
  configs = $state<ProviderConfigView[]>([]);
  loading = $state<boolean>(false);
  saving = $state<boolean>(false);
  error = $state<string | null>(null);
  testingId = $state<string | null>(null);
  lastTest = $state<{ id: string; result: ConfigTestResult } | null>(null);
  private channel: BroadcastChannel | null = null;

  constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('formatavern_sync');
      this.channel.onmessage = (e) => {
        if (e.data && e.data.tabId !== TAB_ID && e.data.type === 'provider_configs_updated') {
          this.configs = e.data.configs;
        }
      };
    }
  }

  private broadcast() {
    try {
      this.channel?.postMessage({
        type: 'provider_configs_updated',
        tabId: TAB_ID,
        configs: JSON.parse(JSON.stringify(this.configs))
      });
    } catch (err) {
      console.warn('[ProviderConfigs] BroadcastChannel sync failed:', err);
    }
  }

  async load(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    this.error = null;
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Provider configurations request timed out')), 15_000)
    );
    try {
      const { data, error } = await Promise.race([api.api['provider-configs'].get(), timeout]);
      if (!error && Array.isArray(data)) {
        this.configs = data as ProviderConfigView[];
        this.error = null;
      } else if (error) {
        const uiErr = toUiError(error);
        this.error = uiErr.message;
        toasts.error(uiErr.message);
      } else {
        this.error = 'Failed to load provider configurations';
      }
    } catch (err: any) {
      const uiErr = toUiError(err);
      this.error = uiErr.message;
      toasts.error(uiErr.message);
    } finally {
      this.loading = false;
    }
  }

  async create(input: {
    name: string;
    providerType: ProviderConfigView['providerType'];
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    customPrompt?: string;
  }): Promise<ProviderConfigView | null> {
    this.saving = true;
    try {
      const { data, error } = await api.api['provider-configs'].post(input as any);
      if (!error && data && 'id' in (data as object)) {
        const created = data as ProviderConfigView;
        this.configs = [...this.configs, created];
        this.broadcast();
        // Auto-activate when nothing is active yet (first-run friction).
        const { settingsStore } = await import('./settings.svelte');
        if (!settingsStore.settings?.provider.activeConfigId) {
          await this.activate(created.id, true);
        } else {
          await settingsStore.load();
        }
        toasts.success(`Configuration "${created.name}" saved.`);
        return created;
      }
      toasts.error(toUiError(error).message);
      return null;
    } catch (err: any) {
      toasts.error(toUiError(err).message);
      return null;
    } finally {
      this.saving = false;
    }
  }

  async patch(
    id: string,
    input: { name?: string; baseUrl?: string | null; apiKey?: string | null; model?: string | null; customPrompt?: string | null }
  ): Promise<boolean> {
    this.saving = true;
    try {
      const { data, error } = await (api.api['provider-configs']({ id }) as any).patch(input);
      if (!error && data && 'id' in (data as object)) {
        const updated = data as ProviderConfigView;
        this.configs = this.configs.map((c) => (c.id === id ? updated : c));
        this.broadcast();
        return true;
      }
      toasts.error(toUiError(error).message);
      return false;
    } catch (err: any) {
      toasts.error(toUiError(err).message);
      return false;
    } finally {
      this.saving = false;
    }
  }

  async remove(id: string): Promise<boolean> {
    this.saving = true;
    try {
      const { error } = await (api.api['provider-configs']({ id }) as any).delete();
      if (!error) {
        this.configs = this.configs.filter((c) => c.id !== id);
        this.broadcast();
        const { settingsStore } = await import('./settings.svelte');
        await settingsStore.load();
        return true;
      }
      toasts.error(toUiError(error).message);
      return false;
    } catch (err: any) {
      toasts.error(toUiError(err).message);
      return false;
    } finally {
      this.saving = false;
    }
  }

  async activate(id: string, quiet = false): Promise<boolean> {
    try {
      const { error } = await (api.api['provider-configs']({ id }) as any).activate.post();
      if (!error) {
        const { settingsStore } = await import('./settings.svelte');
        await settingsStore.load();
        if (!quiet) toasts.success('Provider configuration activated.');
        return true;
      }
      toasts.error(toUiError(error).message);
      return false;
    } catch (err: any) {
      toasts.error(toUiError(err).message);
      return false;
    }
  }

  async useMock(): Promise<boolean> {
    const { settingsStore } = await import('./settings.svelte');
    await settingsStore.patch({ provider: { id: 'mock', activeConfigId: null } });
    return true;
  }

  async duplicate(source: ProviderConfigView): Promise<ProviderConfigView | null> {
    this.saving = true;
    try {
      const { data, error } = await (api.api['provider-configs']({ id: source.id }) as any).duplicate.post();
      if (!error && data && 'id' in (data as object)) {
        const created = data as ProviderConfigView;
        this.configs = [...this.configs, created];
        this.broadcast();
        toasts.success(`Duplicated as "${created.name}".`);
        return created;
      }
      toasts.error(toUiError(error).message);
      return null;
    } catch (err: any) {
      toasts.error(toUiError(err).message);
      return null;
    } finally {
      this.saving = false;
    }
  }

  async test(id: string): Promise<ConfigTestResult | null> {
    this.testingId = id;
    this.lastTest = null;
    try {
      const { data, error } = await (api.api['provider-configs']({ id }) as any).test.post();
      if (!error && data && typeof (data as any).ok === 'boolean') {
        const result = data as ConfigTestResult;
        this.lastTest = { id, result };
        return result;
      }
      const uiErr = toUiError(error);
      this.lastTest = { id, result: { ok: false, message: uiErr.message } };
      return this.lastTest.result;
    } catch (err: any) {
      const uiErr = toUiError(err);
      this.lastTest = { id, result: { ok: false, message: uiErr.message } };
      return this.lastTest.result;
    } finally {
      this.testingId = null;
    }
  }
}

export const providerConfigsStore = new ProviderConfigsStore();

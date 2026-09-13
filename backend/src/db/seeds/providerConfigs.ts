import type { Repositories } from '../contracts';
import type { ProviderConfigType } from '@formatavern/shared';

export interface ProviderConfigSeedResult {
  seeded: boolean;
  configs: number;
  activeConfigId: string | null;
}

interface LegacyMaterial {
  type: ProviderConfigType;
  name: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

/**
 * One-shot migration from singleton provider settings to named configs.
 *
 * Runs only when `provider_configs` is empty. Mints one row per provider
 * type that has anything stored (a key or a custom base URL) or an env
 * key available — env-backed rows store no key and keep resolving via
 * env fallback. Legacy settings rows are left untouched (ignored, and
 * downgrade-safe). Idempotent: a second run is a no-op.
 */
export function seedProviderConfigs(repos: Repositories): ProviderConfigSeedResult {
  const existing = repos.providerConfigs.count();
  if (existing > 0) {
    const active = repos.settings.getAll().provider.activeConfigId ?? null;
    return { seeded: false, configs: existing, activeConfigId: active };
  }

  const settings = repos.settings.getAll();
  const env = (v: string | undefined): string | undefined =>
    v && v.trim().length > 0 ? v : undefined;
  const openRouterEnv = env(process.env.OPENROUTER_API_KEY);
  const customEnv = env(process.env.CUSTOM_API_KEY);
  const geminiEnv = env(process.env.GEMINI_API_KEY);

  const candidates: LegacyMaterial[] = [];
  if (settings.openrouter?.apiKey || openRouterEnv) {
    candidates.push({
      type: 'openrouter',
      name: 'OpenRouter',
      apiKey: settings.openrouter?.apiKey
    });
  }
  if (settings.custom?.baseUrl || settings.custom?.apiKey || customEnv) {
    candidates.push({
      type: 'custom',
      name: 'Custom',
      baseUrl: settings.custom?.baseUrl,
      apiKey: settings.custom?.apiKey
    });
  }
  if (settings.gemini?.apiKey || geminiEnv) {
    candidates.push({
      type: settings.provider?.id === 'gemini-interactions' ? 'gemini-interactions' : 'gemini',
      name: settings.provider?.id === 'gemini-interactions' ? 'Gemini Native' : 'Gemini',
      apiKey: settings.gemini?.apiKey
    });
  }

  if (candidates.length === 0) {
    return { seeded: false, configs: 0, activeConfigId: null };
  }

  const legacyId = settings.provider?.id ?? 'mock';
  const legacyModel = settings.provider?.model;
  const createdIds: string[] = [];
  let activeConfigId: string | null = null;

  for (const c of candidates) {
    const created = repos.providerConfigs.create({
      name: c.name,
      providerType: c.type,
      ...(c.baseUrl !== undefined ? { baseUrl: c.baseUrl } : {}),
      ...(c.apiKey !== undefined ? { apiKey: c.apiKey } : {}),
      ...(legacyId === c.type && legacyModel ? { model: legacyModel } : {})
    });
    if (created === 'name_taken') continue;
    createdIds.push(created.id);
    if (activeConfigId === null && legacyId === c.type) {
      activeConfigId = created.id;
    }
  }

  if (activeConfigId === null && createdIds.length > 0) {
    activeConfigId = createdIds[0];
  }

  if (activeConfigId !== null) {
    repos.settings.patch({ provider: { activeConfigId } });
  }

  return { seeded: true, configs: createdIds.length, activeConfigId };
}

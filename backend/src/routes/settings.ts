import { Elysia } from 'elysia';
import {
  SettingsPatchSchema,
  type AppSettings,
  type SettingsPatch,
  type SettingsView
} from '@formatavern/shared';
import type { Repositories } from '../db/contracts';
import { ApiError } from '../engine/errors';

export function toSettingsView(stored: AppSettings): SettingsView {
  const storedKey = stored.openrouter?.apiKey;
  const envKey = process.env.OPENROUTER_API_KEY;

  let apiKeySet = false;
  let apiKeyHint: string | null = null;
  let source: 'env' | 'settings' | 'none' = 'none';

  if (storedKey && storedKey.trim().length > 0) {
    apiKeySet = true;
    apiKeyHint = storedKey.slice(-4);
    source = 'settings';
  } else if (envKey && envKey.trim().length > 0) {
    apiKeySet = true;
    apiKeyHint = envKey.slice(-4);
    source = 'env';
  }

  return {
    provider: stored.provider,
    openrouter: {
      apiKeySet,
      apiKeyHint,
      source
    },
    generation: stored.generation,
    narrative: stored.narrative,
    preamble: stored.preamble
  };
}

export function createSettingsRouter(repos: Repositories) {
  return new Elysia({ prefix: '/settings' })
    .get('', (): SettingsView => {
      const stored = repos.settings.getAll();
      return toSettingsView(stored);
    })
    .patch(
      '',
      ({ body }): SettingsView => {
        const patch = body as SettingsPatch;
        if (patch.openrouter && patch.openrouter.apiKey === '') {
          throw new ApiError('validation_failed', 422, 'API key cannot be an empty string');
        }

        const updated = repos.settings.patch(patch);
        return toSettingsView(updated);
      },
      {
        body: SettingsPatchSchema
      }
    );
}

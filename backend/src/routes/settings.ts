import { Elysia } from 'elysia';
import {
  SettingsPatchSchema,
  ShellThemeSchema,
  type AppSettings,
  type SettingsPatch,
  type SettingsView,
  type ShellTheme
} from '@formatavern/shared';
import type { Repositories } from '../db/contracts';
import { ApiError } from '../engine/errors';
import {
  renderExampleForDialect,
  validateNarrativeExample,
  type NarrativeDialect
} from '../prompt/templates';

type KeySource = 'env' | 'settings' | 'none';

export function keyStatus(
  storedKey: string | undefined,
  envKey: string | undefined
): { apiKeySet: boolean; apiKeyHint: string | null; source: KeySource } {
  if (storedKey && storedKey.trim().length > 0) {
    return { apiKeySet: true, apiKeyHint: storedKey.slice(-4), source: 'settings' };
  }
  if (envKey && envKey.trim().length > 0) {
    return { apiKeySet: true, apiKeyHint: envKey.slice(-4), source: 'env' };
  }
  return { apiKeySet: false, apiKeyHint: null, source: 'none' };
}

export function isValidBaseUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Canonical example rendered into every dialect (override or built-in). */
function exampleRenderings(stored: AppSettings): Record<NarrativeDialect, string> {
  const override = stored.narrative.example;
  const sink: string[] = [];
  return {
    directive: renderExampleForDialect('directive', override, sink),
    xml: renderExampleForDialect('xml', override, sink),
    prefix: renderExampleForDialect('prefix', override, sink)
  };
}

export function toSettingsView(stored: AppSettings): SettingsView {
  const customBaseUrl = stored.custom?.baseUrl?.trim() || null;

  return {
    provider: stored.provider,
    openrouter: keyStatus(stored.openrouter?.apiKey, process.env.OPENROUTER_API_KEY),
    custom: {
      baseUrl: customBaseUrl,
      ...keyStatus(stored.custom?.apiKey, process.env.CUSTOM_API_KEY)
    },
    gemini: keyStatus(stored.gemini?.apiKey, process.env.GEMINI_API_KEY),
    generation: stored.generation,
    narrative: stored.narrative,
    exampleRenderings: exampleRenderings(stored),
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
        for (const section of [patch.openrouter, patch.custom, patch.gemini] as const) {
          if (section && (section as { apiKey?: unknown }).apiKey === '') {
            throw new ApiError('validation_failed', 422, 'API key cannot be an empty string');
          }
        }
        if (
          patch.custom?.baseUrl !== undefined &&
          patch.custom.baseUrl !== null &&
          !isValidBaseUrl(patch.custom.baseUrl)
        ) {
          throw new ApiError('validation_failed', 422, 'Custom base URL must be a valid http(s) URL');
        }

        // Narrative example override: authored once in directive syntax, rendered
        // per dialect. Structural validation via the parser itself; null clears
        // back to the built-in example.
        const example = patch.narrative?.example;
        if (example !== undefined && example !== null) {
          const issues = validateNarrativeExample(example);
          if (issues.length > 0) {
            throw new ApiError('validation_failed', 422, `Narrative example rejected: ${issues.join(' ')}`);
          }
        }

        const updated = repos.settings.patch(patch);
        return toSettingsView(updated);
      },
      {
        body: SettingsPatchSchema
      }
    )
    .get('/shell-theme', (): ShellTheme => {
      return repos.settings.getShellTheme();
    })
    .put(
      '/shell-theme',
      ({ body }): ShellTheme => {
        return repos.settings.putShellTheme(body as ShellTheme);
      },
      {
        body: ShellThemeSchema
      }
    );
}

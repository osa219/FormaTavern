import { Elysia } from 'elysia';
import {
  ProviderConfigCreateSchema,
  ProviderConfigPatchSchema,
  type ProviderConfig,
  type ProviderConfigCreate,
  type ProviderConfigPatch,
  type ProviderConfigView
} from '@formatavern/shared';
import type { Repositories } from '../db/contracts';
import type { ProviderRegistry } from '../engine/contracts';
import { ApiError } from '../engine/errors';
import { isValidBaseUrl, keyStatus } from './settings';

const TEST_TIMEOUT_MS = 25_000;
const TEST_PROMPT = 'Test. Reply with the single word OK.';

function envKeyFor(providerType: ProviderConfig['providerType']): string | undefined {
  switch (providerType) {
    case 'openrouter':
      return process.env.OPENROUTER_API_KEY;
    case 'custom':
      return process.env.CUSTOM_API_KEY;
    case 'gemini':
    case 'gemini-interactions':
      return process.env.GEMINI_API_KEY;
  }
}

export function toConfigView(row: ProviderConfig): ProviderConfigView {
  const status = keyStatus(row.apiKey, envKeyFor(row.providerType));
  return {
    id: row.id,
    name: row.name,
    providerType: row.providerType,
    baseUrl: row.baseUrl?.trim() || null,
    model: row.model ?? null,
    customPrompt: row.customPrompt ?? null,
    ...status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function requireBaseUrlForCustom(body: ProviderConfigCreate | ProviderConfigPatch): void {
  if (body.baseUrl !== undefined && body.baseUrl !== null && !isValidBaseUrl(body.baseUrl)) {
    throw new ApiError('validation_failed', 422, 'Custom base URL must be a valid http(s) URL');
  }
}

export function createProviderConfigsRouter(deps: { repos: Repositories; providers: ProviderRegistry }) {
  const { repos, providers } = deps;

  return new Elysia({ prefix: '/provider-configs' })
    .get('', (): ProviderConfigView[] => {
      return repos.providerConfigs.list().map(toConfigView);
    })
    .post(
      '',
      ({ body, set }): ProviderConfigView => {
        const input = body as ProviderConfigCreate;
        if (input.providerType === 'custom' && !input.baseUrl) {
          throw new ApiError('validation_failed', 422, 'Custom configs require a base URL');
        }
        if (input.providerType !== 'custom' && input.baseUrl !== undefined && input.baseUrl !== null) {
          throw new ApiError('validation_failed', 422, 'baseUrl only applies to custom configs');
        }
        requireBaseUrlForCustom(input);
        const created = repos.providerConfigs.create(input);
        if (created === 'name_taken') {
          throw new ApiError('slug_taken', 409, `A provider configuration named "${input.name}" already exists`);
        }
        set.status = 201;
        return toConfigView(created);
      },
      { body: ProviderConfigCreateSchema }
    )
    .get('/:id', ({ params }): ProviderConfigView => {
      const row = repos.providerConfigs.get(params.id);
      if (!row) {
        throw new ApiError('not_found', 404, `Provider configuration ${params.id} not found`);
      }
      return toConfigView(row);
    })
    .patch(
      '/:id',
      ({ params, body }): ProviderConfigView => {
        const input = body as ProviderConfigPatch;
        requireBaseUrlForCustom(input);
        const existing = repos.providerConfigs.get(params.id);
        if (!existing) {
          throw new ApiError('not_found', 404, `Provider configuration ${params.id} not found`);
        }
        if (existing.providerType !== 'custom' && input.baseUrl !== undefined && input.baseUrl !== null) {
          throw new ApiError('validation_failed', 422, 'baseUrl only applies to custom configs');
        }
        const patched = repos.providerConfigs.patch(params.id, input);
        if (patched === 'missing') {
          throw new ApiError('not_found', 404, `Provider configuration ${params.id} not found`);
        }
        if (patched === 'name_taken') {
          throw new ApiError('slug_taken', 409, `A provider configuration named "${input.name}" already exists`);
        }
        return toConfigView(patched);
      },
      { body: ProviderConfigPatchSchema }
    )
    .delete('/:id', ({ params }): { deleted: boolean } => {
      const row = repos.providerConfigs.get(params.id);
      if (!row) {
        throw new ApiError('not_found', 404, `Provider configuration ${params.id} not found`);
      }
      repos.transaction(() => {
        repos.providerConfigs.remove(params.id);
        if (repos.settings.getAll().provider.activeConfigId === params.id) {
          repos.settings.patch({ provider: { activeConfigId: null } });
        }
      });
      return { deleted: true };
    })
    .post('/:id/activate', ({ params }): ProviderConfigView => {
      const row = repos.providerConfigs.get(params.id);
      if (!row) {
        throw new ApiError('not_found', 404, `Provider configuration ${params.id} not found`);
      }
      repos.settings.patch({ provider: { activeConfigId: params.id } });
      return toConfigView(row);
    })
    .post('/:id/duplicate', ({ params, set }): ProviderConfigView => {
      const row = repos.providerConfigs.get(params.id);
      if (!row) {
        throw new ApiError('not_found', 404, `Provider configuration ${params.id} not found`);
      }
      let name = `${row.name} (Copy)`;
      let attempt = row.name;
      for (let n = 2; n <= 99; n++) {
        const probe = repos.providerConfigs.create({
          name,
          providerType: row.providerType,
          ...(row.baseUrl !== undefined ? { baseUrl: row.baseUrl } : {}),
          ...(row.apiKey !== undefined ? { apiKey: row.apiKey } : {}),
          ...(row.model !== undefined ? { model: row.model } : {}),
          ...(row.customPrompt !== undefined ? { customPrompt: row.customPrompt } : {})
        });
        if (probe !== 'name_taken') {
          set.status = 201;
          return toConfigView(probe);
        }
        attempt = `${row.name} (Copy ${n})`;
        name = attempt;
      }
      throw new ApiError('slug_taken', 409, 'Could not find a free name for the duplicate');
    })
    .post('/:id/test', async ({ params }): Promise<{ ok: boolean; latencyMs?: number; code?: string; message?: string }> => {
      const row = repos.providerConfigs.get(params.id);
      if (!row) {
        throw new ApiError('not_found', 404, `Provider configuration ${params.id} not found`);
      }
      const resolution = providers.resolve(
        { provider: { id: 'mock', activeConfigId: row.id } },
        row
      );
      const startedAt = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
      try {
        for await (const ev of resolution.provider.generate(
          { model: resolution.model, history: [{ role: 'user', content: TEST_PROMPT }] },
          controller.signal
        )) {
          if (ev.type === 'error') {
            return { ok: false, code: 'upstream_error', message: ev.message };
          }
          if (ev.type === 'done' && ev.finishReason === 'aborted' && controller.signal.aborted) {
            return { ok: false, code: 'timeout', message: `No response within ${TEST_TIMEOUT_MS}ms` };
          }
          // Terminal 'done' ends the stream; tokens/usage need no handling.
        }
        return { ok: true, latencyMs: Date.now() - startedAt };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const scrubbed = row.apiKey ? message.replaceAll(row.apiKey, '[REDACTED]') : message;
        return { ok: false, code: 'request_failed', message: scrubbed };
      } finally {
        clearTimeout(timeout);
      }
    });
}

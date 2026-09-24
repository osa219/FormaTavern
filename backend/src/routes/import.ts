import { Elysia, t } from 'elysia';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';
import { newId } from '../db/ids';
import type { Repositories } from '../db/contracts';
import type { AssetStore } from '../assets/contracts';
import type { ImportService } from '../import/contracts';
import { ImportRunManager } from '../import/runs';
import { validateImportPath, DEFAULT_KNOWN_IMPORT_ROOT } from '../import/pathAllowlist';
import { isSyncLocked } from '../import/customEngine/guard';
import { importV2Card } from '../import/v2/service';
import { importJsonlChat } from '../import/jsonl/service';
import { previewImportFile } from '../import/preview';
import { exportRelationalPack } from '../import/charx/service';
import { ApiError } from '../engine/errors';

export interface ImportRouterDeps {
  repos: Repositories;
  assets?: AssetStore;
  importService?: ImportService;
  runManager?: ImportRunManager;
  allowedRoots?: string[];
}

export function createImportRouter({
  repos,
  assets,
  importService,
  runManager = new ImportRunManager(),
  allowedRoots
}: ImportRouterDeps) {
  return new Elysia({ prefix: '/import' })
    .post(
      '/custom-engine/sync',
      async ({ body, query, set }) => {
        if (!importService) {
          throw new ApiError('internal', 500, 'Import service is not configured');
        }

        if (isSyncLocked()) {
          throw new ApiError('sync_in_progress', 409, 'Another import/sync operation is currently in progress');
        }

        const rawRoot = (body as any)?.root || DEFAULT_KNOWN_IMPORT_ROOT;
        const validPath = validateImportPath(rawRoot, allowedRoots);

        const wait = query?.wait === 'true' || query?.wait === true;

        if (wait) {
          const report = await importService.sync(validPath);
          set.status = 200;
          return report;
        }

        // Background run
        const runId = runManager.startRun(async () => {
          return await importService.sync(validPath);
        });

        set.status = 202;
        return { runId };
      },
      {
        body: t.Optional(
          t.Object({
            root: t.Optional(t.String())
          })
        ),
        query: t.Optional(
          t.Object({
            wait: t.Optional(t.Union([t.String(), t.Boolean()]))
          })
        )
      }
    )
    .get('/runs/:runId', ({ params }) => {
      const run = runManager.getRun(params.runId);
      if (!run) {
        throw new ApiError('not_found', 404, `Import run ${params.runId} not found`);
      }
      return run;
    })
    .post(
      '/custom-engine/single',
      async ({ body, set }) => {
        if (!importService) {
          throw new ApiError('internal', 500, 'Import service is not configured');
        }

        const file = (body as any)?.file;
        if (!file) {
          throw new ApiError('validation_failed', 422, 'Missing required "file" in multipart body');
        }

        const filename = typeof file.name === 'string' ? file.name : 'upload.json';
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        const tmpFile = join(tmpdir(), `ft_single_${newId()}_${filename}`);
        await writeFile(tmpFile, bytes);

        try {
          const report = await importService.sync(tmpFile, { file: tmpFile, batchSize: 1 });
          set.status = 200;
          return report;
        } finally {
          try {
            await unlink(tmpFile);
          } catch {}
        }
      }
    )
    .post(
      '/v2',
      async ({ body, set }) => {
        const file = (body as any)?.file;
        if (!file) {
          throw new ApiError('validation_failed', 422, 'Missing required "file" in multipart body');
        }

        const filename = typeof file.name === 'string' ? file.name : 'card.png';
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        const createdCard = await importV2Card(bytes, filename, repos, assets);
        set.status = 201;
        return createdCard;
      }
    )
    .post('/preview', async ({ body }) => {
      // Parse-only: no database writes. The client reviews the payload
      // (Studio draft for characters, confirm dialog for chats) before
      // committing through the real import endpoints.
      const file = (body as any)?.file;
      if (!file) {
        throw new ApiError('validation_failed', 422, 'Missing required "file" in multipart body');
      }

      const filename = typeof file.name === 'string' ? file.name : 'upload';
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      return previewImportFile(bytes, filename);
    })
    .post(
      '/jsonl',
      async ({ body, query, set }) => {
        const file = (body as any)?.file;
        if (!file) {
          throw new ApiError('validation_failed', 422, 'Missing required "file" in multipart body');
        }

        const characterId = (body as any)?.characterId || (query as any)?.characterId;
        if (!characterId || typeof characterId !== 'string') {
          throw new ApiError('validation_failed', 422, 'Missing required "characterId" parameter');
        }

        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        const chatView = await importJsonlChat(bytes, characterId, repos);
        set.status = 201;
        return chatView;
      }
    );
}

export function createExportRouter({ repos, assets }: { repos: Repositories; assets?: AssetStore }) {
  return new Elysia({ prefix: '/export' })
    .get(
      '/relational-pack',
      async ({ query, set }) => {
        const characterId = query?.characterId;
        if (!characterId) {
          throw new ApiError('validation_failed', 422, 'characterId parameter is required for relational pack export');
        }
        const result = await exportRelationalPack(characterId, repos, assets);

        set.headers['Content-Type'] = result.contentType;
        set.headers['Content-Disposition'] = `attachment; filename="${result.filename}"`;
        return new Response(result.data as any, {
          headers: {
            'Content-Type': result.contentType,
            'Content-Disposition': `attachment; filename="${result.filename}"`
          }
        });
      },
      {
        query: t.Object({
          characterId: t.String({ minLength: 1 })
        })
      }
    );
}

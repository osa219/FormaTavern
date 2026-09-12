import { Elysia, t } from 'elysia';
import type { AssetStore, AssetScope } from '../assets/contracts';
import { ApiError } from '../engine/errors';

export function createAssetsRouter(assets?: AssetStore) {
  return new Elysia({ prefix: '/assets' })
    .post(
      '/upload',
      async ({ body, set }) => {
        if (!assets) {
          throw new ApiError('internal', 500, 'AssetStore is not configured on this server');
        }

        const file = (body as any).file as File | undefined;
        if (!file || typeof file.arrayBuffer !== 'function') {
          throw new ApiError('validation_failed', 400, 'Missing or invalid "file" in multipart body');
        }

        const scope = (body as any).scope as AssetScope;
        const targetId = (body as any).targetId as string | undefined;

        const buffer = new Uint8Array(await file.arrayBuffer());
        const meta = await assets.save({
          file: buffer,
          filename: file.name || 'upload',
          scope,
          targetId
        });

        set.status = 201;
        return meta;
      },
      {
        body: t.Object({
          file: t.File(),
          scope: t.Union([t.Literal('persona'), t.Literal('draft'), t.Literal('character'), t.Literal('fonts')]),
          targetId: t.Optional(t.String())
        })
      }
    )
    .delete(
      '',
      async ({ body }) => {
        if (!assets) {
          throw new ApiError('internal', 500, 'AssetStore is not configured on this server');
        }
        const { path } = body as { path: string };
        const deleted = await assets.delete(path);
        return { deleted };
      },
      {
        body: t.Object({
          path: t.String()
        })
      }
    );
}

import { describe, it, expect, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsAssetStore } from '../../src/assets/store';

// Helper: construct 10x20 PNG
function makePng(width = 10, height = 20): Uint8Array {
  const buf = new Uint8Array(33);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  buf.set([0x00, 0x00, 0x00, 0x0d], 8);
  buf.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(buf.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  buf.set([0x08, 0x06, 0x00, 0x00, 0x00], 24);
  return buf;
}

// Helper: construct 10x20 WebP
function makeWebp(width = 10, height = 20): Uint8Array {
  const buf = new Uint8Array(30);
  buf.set([0x52, 0x49, 0x46, 0x46], 0);
  buf.set([0x16, 0x00, 0x00, 0x00], 4);
  buf.set([0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58], 8);
  buf.set([0x0a, 0x00, 0x00, 0x00], 16);
  buf.set([0x00, 0x00, 0x00, 0x00], 20);
  const w = width - 1;
  buf[24] = w & 0xff;
  buf[25] = (w >> 8) & 0xff;
  buf[26] = (w >> 16) & 0xff;
  const h = height - 1;
  buf[27] = h & 0xff;
  buf[28] = (h >> 8) & 0xff;
  buf[29] = (h >> 16) & 0xff;
  return buf;
}

describe('Asset Pool (FsAssetStore putPool / resolvePool)', () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('stores image with 64-hex SHA-256 filename and correctly sniffs extension', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ft-pool-test-'));
    const store = new FsAssetStore(tmpDir);

    const pngBytes = makePng(100, 200);
    const record = await store.putPool(pngBytes);

    expect(record.id).toMatch(/^[0-9a-f]{64}$/);
    expect(record.ext).toBe('.png');
    expect(record.mime).toBe('image/png');
    expect(record.width).toBe(100);
    expect(record.height).toBe(200);
    expect(record.size).toBe(pngBytes.length);
    expect(record.path).toBe(`/assets/pool/${record.id}.png`);

    // Verify resolvePool finds it
    const resolved = await store.resolvePool(record.id);
    expect(resolved).toBe(record.path);
  });

  it('resolves WebP image correctly by content hash', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ft-pool-test-'));
    const store = new FsAssetStore(tmpDir);

    const webpBytes = makeWebp(300, 400);
    const record = await store.putPool(webpBytes);

    expect(record.ext).toBe('.webp');
    expect(record.mime).toBe('image/webp');
    expect(record.width).toBe(300);
    expect(record.height).toBe(400);

    const resolved = await store.resolvePool(record.id);
    expect(resolved).toBe(`/assets/pool/${record.id}.webp`);
  });

  it('rejects SVG and executable/tampered files', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ft-pool-test-'));
    const store = new FsAssetStore(tmpDir);

    const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>');
    let svgErr: any;
    try {
      await store.putPool(svgBytes);
    } catch (e) {
      svgErr = e;
    }
    expect(svgErr).toBeDefined();
    expect(svgErr.code).toBe('asset_type_rejected');

    const exeBytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
    let exeErr: any;
    try {
      await store.putPool(exeBytes);
    } catch (e) {
      exeErr = e;
    }
    expect(exeErr).toBeDefined();
    expect(exeErr.code).toBe('asset_type_rejected');
  });

  it('is idempotent on duplicate putPool calls', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ft-pool-test-'));
    const store = new FsAssetStore(tmpDir);

    const pngBytes = makePng(50, 50);
    const record1 = await store.putPool(pngBytes);
    const record2 = await store.putPool(pngBytes);

    expect(record1.id).toBe(record2.id);
    expect(record1.path).toBe(record2.path);
  });

  it('returns null on resolvePool for unknown or invalid hash format', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ft-pool-test-'));
    const store = new FsAssetStore(tmpDir);

    expect(await store.resolvePool('nonexistent'.repeat(6))).toBeNull();
    expect(await store.resolvePool('invalid-short')).toBeNull();
    expect(await store.resolvePool('')).toBeNull();
  });

  it('serves /assets/pool/* with nosniff and rejects traversal with 404 JSON', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ft-pool-static-'));
    const store = new FsAssetStore(tmpDir);

    const pngBytes = makePng(40, 40);
    const record = await store.putPool(pngBytes);

    const { Elysia } = await import('elysia');
    const { staticPlugin } = await import('@elysiajs/static');

    const plugin = await staticPlugin({
      assets: tmpDir,
      prefix: '/assets',
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff'
      }
    });

    const server = new Elysia()
      .onError(({ code, set }) => {
        if (code === 'NOT_FOUND') {
          set.status = 404;
          return { error: 'Not Found' };
        }
      })
      .use(plugin)
      .all('*', ({ request, set }) => {
        const url = new URL(request.url);
        if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/assets/')) {
          set.status = 404;
          return { error: 'Not Found' };
        }
        set.status = 404;
        return { error: 'Not Found' };
      });

    // 1. Fetch valid pool asset
    const res = await server.handle(new Request(`http://localhost${record.path}`));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const servedBytes = new Uint8Array(await res.arrayBuffer());
    expect(servedBytes.length).toBe(pngBytes.length);

    // 2. Fetch missing pool asset
    const notFoundRes = await server.handle(new Request('http://localhost/assets/pool/missing.png'));
    expect(notFoundRes.status).toBe(404);
    const notFoundJson = (await notFoundRes.json()) as any;
    expect(notFoundJson.error).toBe('Not Found');

    // 3. Traversal guard
    const traversalRes = await server.handle(new Request('http://localhost/assets/pool/../../secret.txt'));
    expect(traversalRes.status).toBe(404);
  });
});

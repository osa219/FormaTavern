import { describe, it, expect, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsAssetStore, MAX_FILE_SIZE } from '../../src/assets/store';

// Helper: construct PNG with arbitrary dimensions
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

describe('Import & Pool Guards (Invariant X10 & A-AS1)', () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('enforces dimension bounds (<= 4096 px per side) in bulk pool path', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ft-guards-test-'));
    const store = new FsAssetStore(tmpDir);

    // Within bounds: 4096 x 4096
    const okPng = makePng(4096, 4096);
    const record = await store.putPool(okPng);
    expect(record.width).toBe(4096);
    expect(record.height).toBe(4096);

    // Over bounds: 4097 x 100
    const overWidth = makePng(4097, 100);
    let widthErr: any;
    try {
      await store.putPool(overWidth);
    } catch (e) {
      widthErr = e;
    }
    expect(widthErr).toBeDefined();
    expect(widthErr.code).toBe('asset_dimensions');

    // Over bounds: 100 x 5000
    const overHeight = makePng(100, 5000);
    let heightErr: any;
    try {
      await store.putPool(overHeight);
    } catch (e) {
      heightErr = e;
    }
    expect(heightErr).toBeDefined();
    expect(heightErr.code).toBe('asset_dimensions');
  });

  it('rejects forbidden file types in bulk pool path (no SVG, no executables, no scripts)', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ft-guards-test-'));
    const store = new FsAssetStore(tmpDir);

    const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>');
    let svgErr: any;
    try {
      await store.putPool(svgBytes);
    } catch (e) {
      svgErr = e;
    }
    expect(svgErr).toBeDefined();
    expect(svgErr.code).toBe('asset_type_rejected');

    const htmlBytes = new TextEncoder().encode('<html><body><script>alert(1)</script></body></html>');
    let htmlErr: any;
    try {
      await store.putPool(htmlBytes);
    } catch (e) {
      htmlErr = e;
    }
    expect(htmlErr).toBeDefined();
    expect(htmlErr.code).toBe('asset_type_rejected');

    const jsBytes = new TextEncoder().encode('console.log("hello");');
    let jsErr: any;
    try {
      await store.putPool(jsBytes);
    } catch (e) {
      jsErr = e;
    }
    expect(jsErr).toBeDefined();
    expect(jsErr.code).toBe('asset_type_rejected');
  });

  it('interactive save retains directory quota and file size caps while pool is exempt (A-AS1)', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ft-guards-test-'));
    const store = new FsAssetStore(tmpDir);

    // Oversized interactive file > 10 MiB fails
    const hugeInteractive = new Uint8Array(MAX_FILE_SIZE + 10);
    hugeInteractive.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // Fake PNG header
    let sizeErr: any;
    try {
      await store.save({
        file: hugeInteractive,
        filename: 'huge.png',
        scope: 'character',
        targetId: 'char-test'
      });
    } catch (e) {
      sizeErr = e;
    }
    expect(sizeErr).toBeDefined();
    expect(sizeErr.code).toBe('asset_too_large');

    // Pool does not enforce 64 MiB directory quota check
    const poolPng = makePng(100, 100);
    const poolRec = await store.putPool(poolPng);
    expect(poolRec.id).toBeDefined();
  });
});

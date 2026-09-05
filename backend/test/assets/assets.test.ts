import { describe, it, expect, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sniffMimeType } from '../../src/assets/sniff';
import { getImageDimensions } from '../../src/assets/dimensions';
import { FsAssetStore, MAX_FILE_SIZE } from '../../src/assets/store';

// Helper: construct 10x20 PNG
function makePng(width = 10, height = 20): Uint8Array {
  const buf = new Uint8Array(33);
  // PNG signature
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  // IHDR length: 13
  buf.set([0x00, 0x00, 0x00, 0x0d], 8);
  // IHDR
  buf.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(buf.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  buf.set([0x08, 0x06, 0x00, 0x00, 0x00], 24);
  return buf;
}

// Helper: construct 10x20 GIF
function makeGif(width = 10, height = 20): Uint8Array {
  const buf = new Uint8Array(16);
  // GIF89a
  buf.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0);
  const view = new DataView(buf.buffer);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  return buf;
}

// Helper: construct 10x20 JPEG
function makeJpeg(width = 10, height = 20): Uint8Array {
  const buf = new Uint8Array(35);
  // SOI
  buf.set([0xff, 0xd8], 0);
  // APP0 marker
  buf.set([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00], 2);
  // SOF0 marker
  const view = new DataView(buf.buffer);
  buf.set([0xff, 0xc0, 0x00, 0x0b, 0x08], 20);
  view.setUint16(25, height, false);
  view.setUint16(27, width, false);
  buf.set([0x01, 0x01, 0x11, 0x00], 29);
  // EOI
  buf.set([0xff, 0xd9], 33);
  return buf;
}

// Helper: construct WebP (VP8X)
function makeWebp(width = 10, height = 20): Uint8Array {
  const buf = new Uint8Array(30);
  // RIFF
  buf.set([0x52, 0x49, 0x46, 0x46], 0);
  // length 22
  buf.set([0x16, 0x00, 0x00, 0x00], 4);
  // WEBPVP8X
  buf.set([0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58], 8);
  // VP8X chunk length 10
  buf.set([0x0a, 0x00, 0x00, 0x00], 16);
  // Flags
  buf.set([0x00, 0x00, 0x00, 0x00], 20);
  // Width (24-bit 0-based)
  const w = width - 1;
  buf[24] = w & 0xff;
  buf[25] = (w >> 8) & 0xff;
  buf[26] = (w >> 16) & 0xff;
  // Height (24-bit 0-based)
  const h = height - 1;
  buf[27] = h & 0xff;
  buf[28] = (h >> 8) & 0xff;
  buf[29] = (h >> 16) & 0xff;
  return buf;
}

describe('Asset Sniffer & Dimensions', () => {
  it('identifies valid PNG, GIF, JPEG, and WebP', () => {
    expect(sniffMimeType(makePng())).toBe('image/png');
    expect(sniffMimeType(makeGif())).toBe('image/gif');
    expect(sniffMimeType(makeJpeg())).toBe('image/jpeg');
    expect(sniffMimeType(makeWebp())).toBe('image/webp');
  });

  it('rejects SVG and malicious/plain files', () => {
    const svg1 = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const svg2 = new TextEncoder().encode('<?xml version="1.0"?><svg></svg>');
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
    const text = new TextEncoder().encode('hello world');

    expect(sniffMimeType(svg1)).toBeNull();
    expect(sniffMimeType(svg2)).toBeNull();
    expect(sniffMimeType(exe)).toBeNull();
    expect(sniffMimeType(text)).toBeNull();
  });

  it('extracts correct dimensions from image headers', () => {
    const png = makePng(100, 250);
    expect(getImageDimensions(png, 'image/png')).toEqual({ width: 100, height: 250 });

    const gif = makeGif(64, 64);
    expect(getImageDimensions(gif, 'image/gif')).toEqual({ width: 64, height: 64 });

    const jpeg = makeJpeg(800, 600);
    expect(getImageDimensions(jpeg, 'image/jpeg')).toEqual({ width: 800, height: 600 });

    const webp = makeWebp(320, 480);
    expect(getImageDimensions(webp, 'image/webp')).toEqual({ width: 320, height: 480 });
  });
});

describe('FsAssetStore', () => {
  let tmpDir: string;
  let store: FsAssetStore;

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('saves persona asset in avatars/ and draft asset in draft-<id>/', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ft-assets-'));
    store = new FsAssetStore(tmpDir);

    const png = makePng(50, 50);

    // Save persona
    const personaMeta = await store.save({
      file: png,
      filename: 'avatar.png',
      scope: 'persona'
    });
    expect(personaMeta.path.startsWith('/assets/avatars/')).toBe(true);
    expect(personaMeta.path.endsWith('.png')).toBe(true);
    expect(personaMeta.width).toBe(50);
    expect(personaMeta.height).toBe(50);
    expect(personaMeta.mime).toBe('image/png');

    // Save draft
    const draftMeta = await store.save({
      file: png,
      filename: 'hero.png',
      scope: 'draft',
      targetId: 'draft-test-123'
    });
    expect(draftMeta.path.startsWith('/assets/draft-test-123/')).toBe(true);

    // Promote draft to character slug
    await store.promoteDraft('draft-test-123', 'hero-slug');

    // Verify deleted after promote
    const deleted = await store.delete(draftMeta.path);
    // Draft file was moved to /assets/hero-slug/
    expect(deleted).toBe(false);

    // Deleting character scope
    await store.deleteScope('character', 'hero-slug');
  });

  it('rejects files exceeding MAX_FILE_SIZE or dimensions > 4096', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ft-assets-'));
    store = new FsAssetStore(tmpDir);

    // Exceed dimensions
    const hugePng = makePng(5000, 100);
    await expect(
      store.save({ file: hugePng, filename: 'huge.png', scope: 'persona' })
    ).rejects.toThrow('Image dimensions 5000x100 exceed maximum allowed 4096x4096');

    // Exceed file size
    const bigFile = new Uint8Array(MAX_FILE_SIZE + 1);
    bigFile.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    await expect(
      store.save({ file: bigFile, filename: 'big.png', scope: 'persona' })
    ).rejects.toThrow('Asset exceeds maximum size of 10 MiB');
  });

  it('rejects path traversal attacks', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ft-assets-'));
    store = new FsAssetStore(tmpDir);

    const png = makePng(10, 10);
    await expect(
      store.save({ file: png, filename: 'hacked.png', scope: 'character', targetId: '../../etc' })
    ).rejects.toThrow('Path traversal detected');

    await expect(
      store.delete('../../../etc/passwd')
    ).rejects.toThrow('Path traversal detected');
  });
});

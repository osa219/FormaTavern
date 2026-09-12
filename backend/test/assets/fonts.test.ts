import { describe, it, expect, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sniffFontMimeType } from '../../src/assets/sniff';
import { FsAssetStore, MAX_FONT_FILE_SIZE } from '../../src/assets/store';

// Helper: construct synthetic WOFF2 header
function makeWoff2(size = 32): Uint8Array {
  const buf = new Uint8Array(Math.max(size, 8));
  // 'wOF2' signature
  buf.set([0x77, 0x4f, 0x46, 0x32], 0);
  // flavor / padding
  buf.set([0x00, 0x01, 0x00, 0x00], 4);
  return buf;
}

// Helper: construct synthetic WOFF header
function makeWoff(size = 32): Uint8Array {
  const buf = new Uint8Array(Math.max(size, 8));
  // 'wOFF' signature
  buf.set([0x77, 0x4f, 0x46, 0x46], 0);
  buf.set([0x00, 0x01, 0x00, 0x00], 4);
  return buf;
}

// Helper: construct synthetic TTF header
function makeTtf(size = 32): Uint8Array {
  const buf = new Uint8Array(Math.max(size, 8));
  // 0x00010000 TrueType scalar
  buf.set([0x00, 0x01, 0x00, 0x00], 0);
  return buf;
}

// Helper: construct synthetic OTF header
function makeOtf(size = 32): Uint8Array {
  const buf = new Uint8Array(Math.max(size, 8));
  // 'OTTO' signature
  buf.set([0x4f, 0x54, 0x54, 0x4f], 0);
  return buf;
}

describe('Font Asset Sniffing & Store (Slice 5 / Invariant C6 & C13)', () => {
  describe('sniffFontMimeType', () => {
    it('identifies valid WOFF2, WOFF, TTF, and OTF magic bytes', () => {
      expect(sniffFontMimeType(makeWoff2())).toBe('font/woff2');
      expect(sniffFontMimeType(makeWoff())).toBe('font/woff');
      expect(sniffFontMimeType(makeTtf())).toBe('font/ttf');
      expect(sniffFontMimeType(makeOtf())).toBe('font/otf');
    });

    it('identifies Apple TrueType ("true") magic bytes', () => {
      const appleTtf = new Uint8Array([0x74, 0x72, 0x75, 0x65, 0x00, 0x01, 0x00, 0x00]);
      expect(sniffFontMimeType(appleTtf)).toBe('font/ttf');
    });

    it('rejects images, SVG, HTML, and arbitrary binaries', () => {
      // PNG header
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      // JPEG header
      const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      // SVG / XML
      const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
      // HTML
      const html = new TextEncoder().encode('<!DOCTYPE html><html></html>');
      // Plain text
      const text = new TextEncoder().encode('font file content');

      expect(sniffFontMimeType(png)).toBeNull();
      expect(sniffFontMimeType(jpeg)).toBeNull();
      expect(sniffFontMimeType(svg)).toBeNull();
      expect(sniffFontMimeType(html)).toBeNull();
      expect(sniffFontMimeType(text)).toBeNull();
    });

    it('returns null on buffers smaller than 4 bytes', () => {
      expect(sniffFontMimeType(new Uint8Array([0x77, 0x4f, 0x46]))).toBeNull();
      expect(sniffFontMimeType(new Uint8Array([]))).toBeNull();
    });
  });

  describe('FsAssetStore font handling', () => {
    let tempDir: string | null = null;

    afterEach(async () => {
      if (tempDir) {
        await rm(tempDir, { recursive: true, force: true });
        tempDir = null;
      }
    });

    it('saves a WOFF2 font under /assets/fonts/<targetId>/<ulid>.woff2 with width=0, height=0', async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'format-font-test-'));
      const store = new FsAssetStore(tempDir);

      const meta = await store.save({
        file: makeWoff2(128),
        filename: 'CustomDisplay.woff2',
        scope: 'fonts',
        targetId: 'eldrin-the-mage'
      });

      expect(meta.mime).toBe('font/woff2');
      expect(meta.size).toBe(128);
      expect(meta.width).toBe(0);
      expect(meta.height).toBe(0);
      expect(meta.path).toMatch(/^\/assets\/fonts\/eldrin-the-mage\/[0-9A-Z]{26}\.woff2$/);
    });

    it('defaults targetId to "global" when omitted for fonts', async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'format-font-test-'));
      const store = new FsAssetStore(tempDir);

      const meta = await store.save({
        file: makeTtf(64),
        filename: 'SharedFont.ttf',
        scope: 'fonts'
      });

      expect(meta.mime).toBe('font/ttf');
      expect(meta.path).toMatch(/^\/assets\/fonts\/global\/[0-9A-Z]{26}\.ttf$/);
    });

    it('rejects font upload exceeding 4 MiB cap (MAX_FONT_FILE_SIZE)', async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'format-font-test-'));
      const store = new FsAssetStore(tempDir);

      const bigFont = new Uint8Array(MAX_FONT_FILE_SIZE + 10);
      bigFont.set([0x77, 0x4f, 0x46, 0x32], 0); // valid WOFF2 header but oversized

      await expect(
        store.save({
          file: bigFont,
          filename: 'Huge.woff2',
          scope: 'fonts',
          targetId: 'alice'
        })
      ).rejects.toThrow('Font asset exceeds maximum size of 4 MiB');
    });

    it('rejects invalid or unsupported font formats with asset_type_rejected (415)', async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'format-font-test-'));
      const store = new FsAssetStore(tempDir);

      const fakeFont = new TextEncoder().encode('not a real font binary');

      await expect(
        store.save({
          file: fakeFont,
          filename: 'corrupt.ttf',
          scope: 'fonts',
          targetId: 'alice'
        })
      ).rejects.toThrow('Invalid or unsupported font format');
    });

    it('deletes font assets via delete()', async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'format-font-test-'));
      const store = new FsAssetStore(tempDir);

      const meta = await store.save({
        file: makeOtf(48),
        filename: 'MyFont.otf',
        scope: 'fonts',
        targetId: 'test-char'
      });

      const deleted = await store.delete(meta.path);
      expect(deleted).toBe(true);

      // Second delete returns false (already gone)
      const secondDelete = await store.delete(meta.path);
      expect(secondDelete).toBe(false);
    });
  });
});

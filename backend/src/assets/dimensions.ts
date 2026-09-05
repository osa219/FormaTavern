import type { SupportedMime } from './sniff';

export interface ImageDimensions {
  width: number;
  height: number;
}

export const MAX_DIMENSION = 4096;

export function getImageDimensions(buf: Uint8Array, mime: SupportedMime): ImageDimensions | null {
  try {
    switch (mime) {
      case 'image/png':
        return getPngDimensions(buf);
      case 'image/gif':
        return getGifDimensions(buf);
      case 'image/jpeg':
        return getJpegDimensions(buf);
      case 'image/webp':
        return getWebpDimensions(buf);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function getPngDimensions(buf: Uint8Array): ImageDimensions | null {
  if (buf.length < 24) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const width = view.getUint32(16, false); // big-endian
  const height = view.getUint32(20, false); // big-endian
  if (width === 0 || height === 0) return null;
  return { width, height };
}

function getGifDimensions(buf: Uint8Array): ImageDimensions | null {
  if (buf.length < 10) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const width = view.getUint16(6, true); // little-endian
  const height = view.getUint16(8, true); // little-endian
  if (width === 0 || height === 0) return null;
  return { width, height };
}

function getJpegDimensions(buf: Uint8Array): ImageDimensions | null {
  if (buf.length < 4) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  let offset = 2; // skip SOI (0xFF, 0xD8)
  while (offset < buf.length - 1) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }

    const marker = buf[offset + 1];

    // SOF0 (0xC0) to SOF3 (0xC3), SOF5..SOF7 (0xC5..0xC7), SOF9..SOF11 (0xC9..0xCB), SOF13..SOF15 (0xCD..0xCF)
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isSof) {
      if (offset + 8 >= buf.length) return null;
      const height = view.getUint16(offset + 5, false); // big-endian
      const width = view.getUint16(offset + 7, false); // big-endian
      if (width === 0 || height === 0) return null;
      return { width, height };
    }

    // Skip variable-length marker
    if (offset + 3 >= buf.length) return null;
    const length = view.getUint16(offset + 2, false);
    offset += 2 + length;
  }

  return null;
}

function getWebpDimensions(buf: Uint8Array): ImageDimensions | null {
  if (buf.length < 30) return null;

  // Check format: bytes 12..15
  const chunkType = String.fromCharCode(buf[12], buf[13], buf[14], buf[15]);

  if (chunkType === 'VP8 ') {
    // Lossy VP8
    // Keyframe header starts at offset 23
    if (buf.length < 30) return null;
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    // bytes 26-27: 16-bit little-endian width with 14 bits valid
    const rawWidth = view.getUint16(26, true);
    const rawHeight = view.getUint16(28, true);
    const width = rawWidth & 0x3fff;
    const height = rawHeight & 0x3fff;
    if (width === 0 || height === 0) return null;
    return { width, height };
  }

  if (chunkType === 'VP8L') {
    // Lossless VP8L
    if (buf.length < 25) return null;
    if (buf[20] !== 0x2f) return null; // 0x2f signature byte
    const b1 = buf[21];
    const b2 = buf[22];
    const b3 = buf[23];
    const b4 = buf[24];

    const width = 1 + (((b2 & 0x3f) << 8) | b1);
    const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
    if (width === 0 || height === 0) return null;
    return { width, height };
  }

  if (chunkType === 'VP8X') {
    // Extended VP8X
    if (buf.length < 30) return null;
    // 24-bit little endian width at 24..26 (1-based)
    const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    // 24-bit little endian height at 27..29 (1-based)
    const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    if (width === 0 || height === 0) return null;
    return { width, height };
  }

  return null;
}

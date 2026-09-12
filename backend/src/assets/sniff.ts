export type SupportedMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

export function sniffMimeType(buf: Uint8Array): SupportedMime | null {
  if (!buf || buf.length < 12) {
    return null;
  }

  // 1. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }

  // 2. JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }

  // 3. WebP: RIFF .... WEBP
  // 'RIFF' = 0x52 0x49 0x46 0x46, 'WEBP' = 0x57 0x45 0x42 0x50
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'image/webp';
  }

  // 4. GIF: 'GIF87a' or 'GIF89a'
  // 0x47 0x49 0x46 0x38 (0x37 or 0x39) 0x61
  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  ) {
    return 'image/gif';
  }

  // SVG, executable, HTML, etc. explicitly rejected
  return null;
}

export type SupportedFontMime = 'font/woff2' | 'font/woff' | 'font/ttf' | 'font/otf';

export function sniffFontMimeType(buf: Uint8Array): SupportedFontMime | null {
  if (!buf || buf.length < 4) {
    return null;
  }

  // 1. WOFF2: 'wOF2' (0x77, 0x4F, 0x46, 0x32)
  if (buf[0] === 0x77 && buf[1] === 0x4f && buf[2] === 0x46 && buf[3] === 0x32) {
    return 'font/woff2';
  }

  // 2. WOFF: 'wOFF' (0x77, 0x4F, 0x46, 0x46)
  if (buf[0] === 0x77 && buf[1] === 0x4f && buf[2] === 0x46 && buf[3] === 0x46) {
    return 'font/woff';
  }

  // 3. TrueType: 0x00 0x01 0x00 0x00 or 'true' (0x74, 0x72, 0x75, 0x65)
  if (
    (buf[0] === 0x00 && buf[1] === 0x01 && buf[2] === 0x00 && buf[3] === 0x00) ||
    (buf[0] === 0x74 && buf[1] === 0x72 && buf[2] === 0x75 && buf[3] === 0x65)
  ) {
    return 'font/ttf';
  }

  // 4. OpenType: 'OTTO' (0x4F, 0x54, 0x54, 0x4F)
  if (buf[0] === 0x4f && buf[1] === 0x54 && buf[2] === 0x54 && buf[3] === 0x4f) {
    return 'font/otf';
  }

  return null;
}

import { resolve, join, extname, normalize } from 'node:path';
import {
  mkdir,
  writeFile,
  rename,
  unlink,
  stat,
  readdir,
  rm
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { AssetStore, AssetUploadOptions, AssetMeta, AssetScope } from './contracts';
import { sniffMimeType, sniffFontMimeType, type SupportedMime, type SupportedFontMime } from './sniff';
import { getImageDimensions, MAX_DIMENSION } from './dimensions';
import { newId } from '../db/ids';
import { ApiError } from '../engine/errors';

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MiB
export const MAX_FONT_FILE_SIZE = 4 * 1024 * 1024; // 4 MiB (Slice 5)
export const MAX_DIRECTORY_QUOTA = 64 * 1024 * 1024; // 64 MiB

const EXT_FOR_MIME: Record<SupportedMime, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

const EXT_FOR_FONT_MIME: Record<SupportedFontMime, string> = {
  'font/woff2': '.woff2',
  'font/woff': '.woff',
  'font/ttf': '.ttf',
  'font/otf': '.otf'
};

export class FsAssetStore implements AssetStore {
  private readonly rootDir: string;

  constructor(assetsDir: string) {
    this.rootDir = resolve(assetsDir);
  }

  private assertContained(targetPath: string): string {
    const resolved = resolve(targetPath);
    const normalizedRoot = normalize(this.rootDir);
    if (!resolved.startsWith(normalizedRoot)) {
      throw new ApiError('forbidden', 403, 'Path traversal detected');
    }
    return resolved;
  }

  private async getDirSize(dirPath: string): Promise<number> {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      let total = 0;
      for (const entry of entries) {
        const full = join(dirPath, entry.name);
        if (entry.isFile()) {
          const s = await stat(full);
          total += s.size;
        } else if (entry.isDirectory()) {
          total += await this.getDirSize(full);
        }
      }
      return total;
    } catch {
      return 0;
    }
  }

  private getTargetSubdir(scope: AssetScope, targetId?: string): string {
    if (scope === 'persona') {
      return 'avatars';
    }
    if (scope === 'draft') {
      if (!targetId) throw new ApiError('validation_failed', 400, 'Draft scope requires targetId');
      return targetId.startsWith('draft-') ? targetId : `draft-${targetId}`;
    }
    if (scope === 'character') {
      if (!targetId) throw new ApiError('validation_failed', 400, 'Character scope requires targetId');
      return targetId;
    }
    if (scope === 'fonts') {
      const owner = targetId || 'global';
      return join('fonts', owner);
    }
    throw new ApiError('validation_failed', 400, `Unknown scope: ${scope}`);
  }

  async save(opts: AssetUploadOptions): Promise<AssetMeta> {
    const { file, scope, targetId } = opts;

    if (scope === 'fonts') {
      // 1. Size check (4 MiB)
      if (file.length > MAX_FONT_FILE_SIZE) {
        throw new ApiError('asset_too_large', 413, `Font asset exceeds maximum size of 4 MiB (${file.length} bytes)`);
      }

      // 2. Sniff magic bytes
      const fontMime = sniffFontMimeType(file);
      if (!fontMime) {
        throw new ApiError('asset_type_rejected', 415, 'Invalid or unsupported font format. Only WOFF2, WOFF, TTF, and OTF are allowed.');
      }

      // 3. Resolve directory and enforce directory quota
      const subdir = this.getTargetSubdir(scope, targetId);
      const destDir = this.assertContained(join(this.rootDir, subdir));
      await mkdir(destDir, { recursive: true });

      const currentDirSize = await this.getDirSize(destDir);
      if (currentDirSize + file.length > MAX_DIRECTORY_QUOTA) {
        throw new ApiError(
          'asset_quota',
          400,
          `Asset upload would exceed 64 MiB quota for ${subdir} (current: ${currentDirSize}, file: ${file.length})`
        );
      }

      // 4. File naming via ULID
      const ext = EXT_FOR_FONT_MIME[fontMime];
      const fileName = `${newId()}${ext}`;
      const targetFilePath = this.assertContained(join(destDir, fileName));

      // 5. Atomic write
      const tempFilePath = this.assertContained(join(destDir, `.${fileName}.${Date.now()}.tmp`));
      await writeFile(tempFilePath, file);
      await rename(tempFilePath, targetFilePath);

      // 6. Return web-relative path
      const webSubdir = subdir.split('\\').join('/');
      const webPath = `/assets/${webSubdir}/${fileName}`;
      return {
        path: webPath,
        width: 0,
        height: 0,
        size: file.length,
        mime: fontMime
      };
    }

    // 1. Size check
    if (file.length > MAX_FILE_SIZE) {
      throw new ApiError('asset_too_large', 413, `Asset exceeds maximum size of 10 MiB (${file.length} bytes)`);
    }

    // 2. Sniff magic bytes
    const mime = sniffMimeType(file);
    if (!mime) {
      throw new ApiError('asset_type_rejected', 415, 'Invalid or unsupported image format. Only PNG, JPEG, WebP, and GIF are allowed.');
    }

    // 3. Parse and check dimensions
    const dimensions = getImageDimensions(file, mime);
    if (!dimensions) {
      throw new ApiError('asset_dimensions', 400, 'Could not read image dimensions from header');
    }
    if (dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION) {
      throw new ApiError(
        'asset_dimensions',
        400,
        `Image dimensions ${dimensions.width}x${dimensions.height} exceed maximum allowed ${MAX_DIMENSION}x${MAX_DIMENSION}`
      );
    }

    // 4. Resolve directory and enforce directory quota
    const subdir = this.getTargetSubdir(scope, targetId);
    const destDir = this.assertContained(join(this.rootDir, subdir));
    await mkdir(destDir, { recursive: true });

    const currentDirSize = await this.getDirSize(destDir);
    if (currentDirSize + file.length > MAX_DIRECTORY_QUOTA) {
      throw new ApiError(
        'asset_quota',
        400,
        `Asset upload would exceed 64 MiB quota for ${subdir} (current: ${currentDirSize}, file: ${file.length})`
      );
    }

    // 5. Content-addressing: SHA-256 first 16 hex chars
    const hash = createHash('sha256').update(file).digest('hex').slice(0, 16);
    const ext = EXT_FOR_MIME[mime];
    const fileName = `${hash}${ext}`;
    const targetFilePath = this.assertContained(join(destDir, fileName));

    // 6. Atomic write (write to temp file then rename)
    const tempFilePath = this.assertContained(join(destDir, `.${fileName}.${Date.now()}.tmp`));
    await writeFile(tempFilePath, file);
    await rename(tempFilePath, targetFilePath);

    // 7. Return web-relative path
    const webPath = `/assets/${subdir}/${fileName}`;
    return {
      path: webPath,
      width: dimensions.width,
      height: dimensions.height,
      size: file.length,
      mime
    };
  }

  async delete(assetPath: string): Promise<boolean> {
    if (!assetPath) return false;
    let cleanPath = assetPath;
    if (cleanPath.startsWith('/assets/')) {
      cleanPath = cleanPath.slice('/assets/'.length);
    } else if (cleanPath.startsWith('assets/')) {
      cleanPath = cleanPath.slice('assets/'.length);
    }

    const fullPath = this.assertContained(join(this.rootDir, cleanPath));
    try {
      await unlink(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async promoteDraft(draftId: string, finalSlug: string): Promise<void> {
    const draftSubdir = draftId.startsWith('draft-') ? draftId : `draft-${draftId}`;
    const sourceDir = this.assertContained(join(this.rootDir, draftSubdir));
    const targetDir = this.assertContained(join(this.rootDir, finalSlug));

    try {
      await stat(sourceDir);
    } catch {
      // Draft dir doesn't exist, nothing to promote
      return;
    }

    await mkdir(this.rootDir, { recursive: true });
    // If target directory exists, move files over; otherwise rename
    try {
      await rename(sourceDir, targetDir);
    } catch {
      // Fallback: copy / move files individually if cross-device or directory exists
      await mkdir(targetDir, { recursive: true });
      const entries = await readdir(sourceDir, { withFileTypes: true });
      for (const entry of entries) {
        const src = join(sourceDir, entry.name);
        const dst = join(targetDir, entry.name);
        await rename(src, dst);
      }
      await rm(sourceDir, { recursive: true, force: true });
    }
  }

  async deleteScope(scope: AssetScope, targetId: string): Promise<void> {
    if (scope === 'persona') {
      // Personas share avatars/ directory, delete specific avatar file via delete() instead
      return;
    }
    const subdir = this.getTargetSubdir(scope, targetId);
    const targetDir = this.assertContained(join(this.rootDir, subdir));
    try {
      await rm(targetDir, { recursive: true, force: true });
    } catch {}
  }

  async cleanStaleDrafts(maxAgeMs: number): Promise<number> {
    try {
      const entries = await readdir(this.rootDir, { withFileTypes: true });
      const now = Date.now();
      let cleaned = 0;

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('draft-')) {
          const dirPath = join(this.rootDir, entry.name);
          const s = await stat(dirPath);
          const age = now - s.mtimeMs;
          if (age > maxAgeMs) {
            await rm(dirPath, { recursive: true, force: true });
            cleaned++;
          }
        }
      }
      return cleaned;
    } catch {
      return 0;
    }
  }
}

import { stat } from 'node:fs/promises';
import { ApiError } from '../../engine/errors';

export type SniffResult =
  | { kind: 'directory'; rootDir: string; hasCharacters: boolean; hasChats: boolean; hasMedia: boolean; hasManifest: boolean }
  | { kind: 'single_character'; filePath: string; raw: any }
  | { kind: 'single_chat'; filePath: string; raw: any };

export async function sniffCustomEngine(targetPath: string): Promise<SniffResult> {
  let stats;
  try {
    stats = await stat(targetPath);
  } catch (err: any) {
    throw new ApiError('not_found', 404, `Target path not found: ${targetPath}`);
  }

  if (stats.isFile()) {
    let raw: any;
    try {
      const content = await Bun.file(targetPath).text();
      raw = JSON.parse(content);
    } catch {
      throw new ApiError('unsupported_format', 400, `File is not valid JSON: ${targetPath}`);
    }

    if (raw && typeof raw === 'object') {
      // Check if it's a character file (listing identity + persona name)
      if (typeof raw.id === 'string' && typeof raw.card_title === 'string' && typeof raw.chat_name === 'string') {
        return { kind: 'single_character', filePath: targetPath, raw };
      }
      // Check if it's a chat file
      if (typeof raw.id === 'string' && typeof raw.character_id === 'string' && Array.isArray(raw.messages)) {
        return { kind: 'single_chat', filePath: targetPath, raw };
      }
    }

    throw new ApiError('unsupported_format', 400, `Unrecognized CustomEngine file schema: ${targetPath}`);
  }

  if (stats.isDirectory()) {
    let hasCharacters = false;
    let hasChats = false;
    let hasMedia = false;
    let hasManifest = false;

    try {
      const s = await stat(`${targetPath}/characters`);
      hasCharacters = s.isDirectory();
    } catch {}

    try {
      const s = await stat(`${targetPath}/chats`);
      hasChats = s.isDirectory();
    } catch {}

    try {
      const s = await stat(`${targetPath}/media`);
      hasMedia = s.isDirectory();
    } catch {}

    try {
      const s = await stat(`${targetPath}/manifest.json`);
      hasManifest = s.isFile();
    } catch {}

    if (!hasCharacters && !hasChats) {
      throw new ApiError('unsupported_format', 400, `Directory ${targetPath} does not contain characters/ or chats/ directories`);
    }

    return {
      kind: 'directory',
      rootDir: targetPath,
      hasCharacters,
      hasChats,
      hasMedia,
      hasManifest
    };
  }

  throw new ApiError('unsupported_format', 400, `Unsupported path type: ${targetPath}`);
}

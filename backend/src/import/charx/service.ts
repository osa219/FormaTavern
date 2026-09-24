import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { slugify, extractMediaHashes, type CharacterCard } from '@formatavern/shared';
import type { Repositories } from '../../db/contracts';
import type { AssetStore } from '../../assets/contracts';
import { ApiError } from '../../engine/errors';
import { buildZip, type ZipEntry } from '../zip/writer';
import { exportV2Card } from '../v2/service';
import { ASSETS_DIR } from '../../db/paths';

export function resolveDiskAsset(assetPath: string, assetStore?: AssetStore): Uint8Array | null {
  if (!assetPath) return null;

  try {
    const diskPath =
      assetStore?.getDiskPath(assetPath) ||
      (assetPath.startsWith('/assets/') ? resolve(ASSETS_DIR, assetPath.slice('/assets/'.length)) : null);
    if (diskPath && existsSync(diskPath)) {
      return new Uint8Array(readFileSync(diskPath));
    }
  } catch {}

  if (existsSync(assetPath)) {
    return new Uint8Array(readFileSync(assetPath));
  }

  return null;
}

export async function exportCharx(
  characterId: string,
  repos: Repositories,
  assetStore?: AssetStore
): Promise<{ data: Uint8Array; contentType: string; filename: string }> {
  const card = repos.characters.get(characterId);
  if (!card) {
    throw new ApiError('not_found', 404, `Character ${characterId} not found`);
  }

  const baseSlug = slugify(card.name) || 'character';
  const entries: ZipEntry[] = [];

  // 1. card.json (V2 metadata)
  const v2Result = await exportV2Card(characterId, repos, assetStore, 'json');
  entries.push({
    name: 'card.json',
    data: Buffer.from(v2Result.data as string, 'utf8')
  });

  // 2. Character assets from character_assets table
  const bindings = repos.assets.getCharacterAssets(characterId);
  let hasIcon = false;

  for (const b of bindings) {
    const asset = repos.assets.get(b.assetId);
    if (asset) {
      let fileBytes: Uint8Array | null = null;
      if (assetStore) {
        const poolPath = await assetStore.resolvePool(asset.id);
        if (poolPath && existsSync(poolPath)) {
          fileBytes = new Uint8Array(readFileSync(poolPath));
        }
      }
      if (!fileBytes) {
        fileBytes = resolveDiskAsset(asset.path, assetStore);
      }

      if (fileBytes) {
        const safeRole = b.role || 'misc';
        const safeLabel = b.label || asset.id;
        const entryPath = `assets/${safeRole}/${safeLabel}${asset.ext || '.png'}`;
        entries.push({
          name: entryPath,
          data: fileBytes
        });

        if (safeRole === 'avatar' && !hasIcon) {
          entries.push({
            name: `assets/icon/main${asset.ext || '.png'}`,
            data: fileBytes
          });
          hasIcon = true;
        }
      }
    }
  }

  // Fallback: if no icon entry yet, check card.avatar
  if (!hasIcon && card.avatar) {
    const avatarBytes = resolveDiskAsset(card.avatar, assetStore);
    if (avatarBytes) {
      const ext = card.avatar.endsWith('.webp') ? '.webp' : card.avatar.endsWith('.jpg') ? '.jpg' : '.png';
      entries.push({
        name: `assets/icon/main${ext}`,
        data: avatarBytes
      });
    }
  }

  const zipBytes = buildZip(entries);
  return {
    data: zipBytes,
    contentType: 'application/x-charx+zip',
    filename: `${baseSlug}.charx`
  };
}

export async function exportRelationalPack(
  characterId: string | undefined,
  repos: Repositories,
  assetStore?: AssetStore
): Promise<{ data: Uint8Array; contentType: string; filename: string }> {
  let characters: CharacterCard[] = [];

  if (characterId) {
    const card = repos.characters.get(characterId);
    if (!card) {
      throw new ApiError('not_found', 404, `Character ${characterId} not found`);
    }
    characters = [card];
  } else {
    const listResult = repos.characters.list({ limit: 10000 });
    for (const item of listResult.items) {
      const full = repos.characters.get(item.id);
      if (full) characters.push(full);
    }
  }

  const entries: ZipEntry[] = [];
  const referencedHashes = new Set<string>();
  let totalChats = 0;

  for (const char of characters) {
    const charOriginId = (char.origin === 'custom_engine' && char.originId) ? char.originId : char.id;

    // Collect avatar hash if pool asset
    let avatarHash: string | null = null;
    if (char.avatar && char.avatar.startsWith('/assets/pool/')) {
      const m = char.avatar.match(/\/([a-f0-9]{64})\./i);
      if (m) {
        avatarHash = m[1].toLowerCase();
        referencedHashes.add(avatarHash);
      }
    }

    const importMeta = (char.metadata as any)?.import ?? {};
    const charPayload: Record<string, unknown> = {
      id: charOriginId,
      name: char.name,
      chat_name: char.characterName ?? null,
      card_title: char.tagline ?? null,
      creator_name: char.creator ?? null,
      creator_url: char.creatorUrl ?? null,
      character_url: char.characterUrl ?? null,
      avatar_hash: avatarHash,
      description: char.description,
      personality: char.personality,
      scenario: char.scenario,
      first_message: char.firstMessage,
      alternate_greetings: char.alternateGreetings ?? [],
      mes_example: char.exampleDialogue ?? null,
      tags: char.tags ?? [],
      created_at: char.createdAt ? new Date(char.createdAt).toISOString() : null,
      updated_at: char.updatedAt ? new Date(char.updatedAt).toISOString() : null
    };

    if (importMeta.tokenCounts) charPayload.token_counts = importMeta.tokenCounts;
    if (importMeta.stats) charPayload.stats = importMeta.stats;
    if (importMeta.soundcloudTrackId) charPayload.soundcloud_track_id = importMeta.soundcloudTrackId;
    if (importMeta.isNsfw !== undefined) charPayload.is_nsfw = importMeta.isNsfw;
    if (importMeta.isImageNsfw !== undefined) charPayload.is_image_nsfw = importMeta.isImageNsfw;

    entries.push({
      name: `characters/${charOriginId}.json`,
      data: Buffer.from(JSON.stringify(charPayload, null, 2), 'utf8')
    });

    // Inline media hashes from character description
    for (const h of extractMediaHashes(char.description ?? '')) {
      referencedHashes.add(h);
    }

    // Chats for this character
    const chatsList = repos.chats.list({ characterId: char.id, limit: 10000 });
    for (const chatSummary of chatsList) {
      const chat = repos.chats.get(chatSummary.id);
      if (!chat) continue;
      totalChats++;

      const chatOriginId = (chat.origin === 'custom_engine' && chat.originId) ? chat.originId : chat.id;
      const allMsgs = repos.messages.listInChat(chat.id);

      const mappedMessages = allMsgs.map((m) => {
        const inlineHashes = extractMediaHashes(m.content ?? '');
        for (const h of inlineHashes) referencedHashes.add(h);

        return {
          id: m.originId || m.id,
          chat_id: chatOriginId,
          sequence_index: m.sequenceIndex ?? 0,
          role: m.role,
          sender_name: m.senderName ?? null,
          content: m.content,
          timestamp: m.createdAt,
          is_main: !(m.metadata as any)?.imported_swipe
        };
      });

      const persona = repos.personas.get(chat.activePersonaId);
      const chatPayload: Record<string, unknown> = {
        id: chatOriginId,
        character_id: charOriginId,
        title: chat.title,
        active_greeting_index: chat.activeGreetingIndex ?? 0,
        user_persona: chat.personaSnapshot
          ? (() => {
              try {
                return JSON.parse(chat.personaSnapshot);
              } catch {
                return { name: persona?.name ?? 'User' };
              }
            })()
          : { name: persona?.name ?? 'User' },
        created_at: new Date(chat.createdAt).toISOString(),
        updated_at: new Date(chat.updatedAt).toISOString(),
        messages: mappedMessages
      };

      entries.push({
        name: `chats/${charOriginId}/${chatOriginId}.json`,
        data: Buffer.from(JSON.stringify(chatPayload, null, 2), 'utf8')
      });
    }
  }

  // Include referenced media blobs
  let mediaCount = 0;
  for (const hash of referencedHashes) {
    let blobBytes: Uint8Array | null = null;
    let ext = '.png';

    if (assetStore) {
      const poolUrl = await assetStore.resolvePool(hash);
      if (poolUrl) {
        const diskFile = assetStore.getDiskPath(poolUrl);
        if (diskFile && existsSync(diskFile)) {
          blobBytes = new Uint8Array(readFileSync(diskFile));
          if (diskFile.endsWith('.webp')) ext = '.webp';
          else if (diskFile.endsWith('.jpg')) ext = '.jpg';
          else if (diskFile.endsWith('.gif')) ext = '.gif';
        }
      }
    }

    if (!blobBytes) {
      const candidatePath = resolve(ASSETS_DIR, 'pool', `${hash}.png`);
      if (existsSync(candidatePath)) {
        blobBytes = new Uint8Array(readFileSync(candidatePath));
      }
    }

    if (blobBytes) {
      entries.push({
        name: `media/${hash}${ext}`,
        data: blobBytes
      });
      mediaCount++;
    }
  }

  // Manifest
  const manifest = {
    generator: 'FormaTavern Relational Pack',
    exported_at: new Date().toISOString(),
    counts: {
      characters: characters.length,
      chats: totalChats,
      media: mediaCount
    }
  };

  entries.unshift({
    name: 'manifest.json',
    data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8')
  });

  const zipBytes = buildZip(entries);
  const outName = characterId && characters.length > 0
    ? `pack-${slugify(characters[0].name)}.zip`
    : 'format-tavern-export.zip';

  return {
    data: zipBytes,
    contentType: 'application/zip',
    filename: outName
  };
}

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import {
  DEFAULT_CHARACTER_THEME,
  normalizeTag,
  pruneAlternateGreetings,
  slugify,
  hashCanonical,
  sha256,
  type CharacterCard,
  type CharacterCreate
} from '@formatavern/shared';
import type { Repositories } from '../../db/contracts';
import type { AssetStore } from '../../assets/contracts';
import { ApiError } from '../../engine/errors';
import { isPng, extractPngTextChunks, embedPngTextChunk, createMinimalPng } from './png';
import { ulid } from 'ulid';
import { ASSETS_DIR } from '../../db/paths';

export interface TavernCardV2Data {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  creator?: string;
  character_version?: string;
  alternate_greetings?: string[];
  tags?: string[];
  system_prompt?: string;
  post_history_instructions?: string;
  creator_notes?: string;
  extensions?: Record<string, unknown>;
}

export interface TavernCardV2Payload {
  spec?: string;
  spec_version?: string;
  data?: TavernCardV2Data;
}

export async function importV2Card(
  fileBytes: Uint8Array,
  filename: string,
  repos: Repositories,
  assetStore?: AssetStore
): Promise<CharacterCard> {
  let v2Data: TavernCardV2Data | null = null;
  let avatarBytes: Uint8Array | null = null;

  if (isPng(fileBytes)) {
    avatarBytes = fileBytes;
    const chunks = extractPngTextChunks(fileBytes);
    const rawPayload = chunks.get('ccv3') || chunks.get('chara');
    if (!rawPayload) {
      throw new ApiError(
        'unsupported_format',
        422,
        'PNG file does not contain character card metadata in tEXt chunk ("ccv3" or "chara")'
      );
    }

    try {
      const jsonStr = Buffer.from(rawPayload, 'base64').toString('utf8');
      const parsed = JSON.parse(jsonStr) as TavernCardV2Payload & TavernCardV2Data;
      v2Data = parsed.data ?? parsed;
    } catch (err: any) {
      throw new ApiError('unsupported_format', 422, `Failed to decode character card JSON from PNG: ${err.message}`);
    }
  } else {
    // Try parsing as JSON
    try {
      const jsonStr = Buffer.from(fileBytes).toString('utf8');
      const parsed = JSON.parse(jsonStr) as TavernCardV2Payload & TavernCardV2Data;
      v2Data = parsed.data ?? parsed;
    } catch {
      throw new ApiError('unsupported_format', 422, 'Uploaded file is neither a valid PNG nor valid JSON');
    }
  }

  if (!v2Data || typeof v2Data !== 'object') {
    throw new ApiError('unsupported_format', 422, 'Invalid TavernCard V2 payload structure');
  }

  const name = (v2Data.name?.trim() || 'Unnamed Character').slice(0, 120);
  const description = v2Data.description ?? '';
  const personality = v2Data.personality ?? '';
  const scenario = v2Data.scenario ?? '';
  const firstMessage = v2Data.first_mes ?? '';
  const exampleDialogue = v2Data.mes_example ? v2Data.mes_example : undefined;
  const creator = v2Data.creator ? v2Data.creator.slice(0, 80) : undefined;
  const version = v2Data.character_version ? v2Data.character_version.slice(0, 32) : undefined;
  const alternateGreetings = pruneAlternateGreetings(v2Data.alternate_greetings);

  // Normalizable tags (max 12)
  const tags: string[] = [];
  for (const t of v2Data.tags ?? []) {
    if (tags.length >= 12) break;
    const norm = normalizeTag(t);
    if (norm && !tags.includes(norm)) {
      tags.push(norm);
    }
  }

  // Provenance hash computation (Invariant X1)
  const originId = sha256(fileBytes);
  const originHash = hashCanonical({
    name,
    description,
    personality,
    scenario,
    first_mes: v2Data.first_mes,
    mes_example: v2Data.mes_example,
    tags,
    alternate_greetings: alternateGreetings
  });

  const existing = repos.characters.findByProvenance('tavern_v2', originId);
  if (existing && existing.originHash === originHash) {
    return existing;
  }

  // Put avatar into pool if PNG bytes are available and card validation passed
  let avatarPath: string | undefined;
  let avatarHash: string | undefined;
  if (avatarBytes && assetStore) {
    try {
      const record = await assetStore.putPool(avatarBytes);
      repos.assets.insert(record);
      avatarPath = record.path;
      avatarHash = record.id;
    } catch (err: any) {
      console.warn('[import-v2] Could not store avatar in pool:', err.message);
    }
  }

  const importMeta: Record<string, unknown> = {
    origin: 'tavern_v2',
    originId,
    originHash,
    tagsRaw: v2Data.tags ?? []
  };
  if (v2Data.extensions?.token_counts) {
    importMeta.tokenCounts = v2Data.extensions.token_counts;
  }

  const metadata: Record<string, unknown> = {
    import: importMeta
  };
  if (v2Data.system_prompt) metadata.systemPrompt = v2Data.system_prompt;
  if (v2Data.post_history_instructions) metadata.postHistoryInstructions = v2Data.post_history_instructions;
  if (v2Data.creator_notes) metadata.creatorNotes = v2Data.creator_notes;
  if (v2Data.extensions) metadata.extensions = v2Data.extensions;

  if (existing) {
    const patchResult = repos.characters.patch(existing.id, {
      name,
      description,
      personality,
      scenario,
      firstMessage,
      alternateGreetings: alternateGreetings.length > 0 ? alternateGreetings : undefined,
      exampleDialogue,
      creator,
      version,
      tags,
      avatar: avatarPath ?? existing.avatar,
      expectedUpdatedAt: existing.updatedAt ?? Date.now()
    });
    if (typeof patchResult !== 'string') {
      return patchResult;
    }
  }

  const cardInput: CharacterCreate = {
    name,
    description,
    personality,
    scenario,
    firstMessage,
    alternateGreetings: alternateGreetings.length > 0 ? alternateGreetings : undefined,
    exampleDialogue,
    creator,
    version,
    tags,
    style: DEFAULT_CHARACTER_THEME,
    avatar: avatarPath,
    origin: 'tavern_v2',
    originId,
    originHash,
    metadata
  };

  const created = repos.characters.create(cardInput);

  // Bind avatar asset row if present
  if (avatarHash && repos.assets.has(avatarHash)) {
    repos.assets.bindCharacterAsset({
      id: ulid().toLowerCase(),
      characterId: created.id,
      assetId: avatarHash,
      role: 'avatar',
      sortOrder: 0,
      createdAt: Date.now()
    });
  }

  return created;
}

export async function exportV2Card(
  characterId: string,
  repos: Repositories,
  assetStore?: AssetStore,
  format: 'png' | 'json' = 'png'
): Promise<{ data: Uint8Array | string; contentType: string; filename: string }> {
  const card = repos.characters.get(characterId);
  if (!card) {
    throw new ApiError('not_found', 404, `Character ${characterId} not found`);
  }

  const meta = (card.metadata ?? {}) as Record<string, any>;
  const baseSlug = slugify(card.name) || 'character';

  const v2Payload: TavernCardV2Payload = {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: card.name,
      description: card.description,
      personality: card.personality,
      scenario: card.scenario,
      first_mes: card.firstMessage,
      mes_example: card.exampleDialogue ?? '',
      creator: card.creator ?? '',
      character_version: card.version ?? '',
      alternate_greetings: card.alternateGreetings ?? [],
      tags: card.tags ?? [],
      system_prompt: meta.systemPrompt ?? '',
      post_history_instructions: meta.postHistoryInstructions ?? '',
      creator_notes: meta.creatorNotes ?? '',
      extensions: meta.extensions ?? {}
    }
  };

  if (format === 'json') {
    return {
      data: JSON.stringify(v2Payload, null, 2),
      contentType: 'application/json; charset=utf-8',
      filename: `${baseSlug}.json`
    };
  }

  // PNG export (Invariant X8: Never mutates stored pool bytes)
  let rawPng: Uint8Array | null = null;
  if (card.avatar) {
    try {
      const diskPath =
        assetStore?.getDiskPath(card.avatar) ||
        (card.avatar.startsWith('/assets/') ? resolve(ASSETS_DIR, card.avatar.slice('/assets/'.length)) : null);
      if (diskPath && existsSync(diskPath)) {
        const buf = readFileSync(diskPath);
        if (isPng(buf)) {
          rawPng = new Uint8Array(buf);
        } else {
          // Transcode WebP/JPEG/GIF into genuine PNG format
          const pngBuf = await sharp(buf).png().toBuffer();
          rawPng = new Uint8Array(pngBuf);
        }
      }
    } catch (err: any) {
      console.warn('[export-v2] Image transcoding failed, using carrier PNG:', err.message);
    }
  }

  if (!rawPng) {
    rawPng = createMinimalPng();
  }

  const base64Json = Buffer.from(JSON.stringify(v2Payload), 'utf8').toString('base64');
  const withChara = embedPngTextChunk(rawPng, 'chara', base64Json);

  return {
    data: withChara,
    contentType: 'image/png',
    filename: `${baseSlug}.png`
  };
}

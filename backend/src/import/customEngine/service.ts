import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
import {
  clampGreetingIndex,
  extractMediaHashes,
  normalizeTag,
  pruneAlternateGreetings,
  slugify,
  DEFAULT_CHARACTER_THEME,
  type QuarantinedChat,
  type SyncReport
} from '@formatavern/shared';
import type {
  AssetRepository,
  CharacterRepository,
  ChatRepository,
  MessageRepository,
  PersonaRepository
} from '../../db/contracts';
import type { AssetStore } from '../../assets/contracts';
import { newId } from '../../db/ids';
import { reindexCharactersFts } from '../../db/fts';
import { ApiError } from '../../engine/errors';
import { acquireSyncLock } from './guard';
import { sniffCustomEngine } from './sniff';
import { planCustomEngineSync } from './plan';
import type {
  CustomEngineCharacter,
  CustomEngineChat,
  CustomEngineImportOptions,
  CustomEngineMessage,
  CustomEngineUserPersona,
  PlannedCharacter,
  PlannedChat,
  SyncPlan
} from './types';

export interface CustomEngineServiceOptions extends CustomEngineImportOptions {
  onBeforeBatchCommit?: (batchIndex: number) => void;
}

export class CustomEngineImportService {
  constructor(
    private db: Database,
    private assetStore: AssetStore,
    private assetRepo: AssetRepository,
    private charRepo: CharacterRepository,
    private chatRepo: ChatRepository,
    private messageRepo: MessageRepository,
    private personaRepo: PersonaRepository
  ) {}

  async sync(targetPath: string, options: CustomEngineServiceOptions = {}): Promise<SyncReport> {
    const releaseLock = acquireSyncLock();
    const startTime = performance.now();

    try {
      // 1. Sniff
      const sniffed = await sniffCustomEngine(targetPath);

      // 2. Plan
      const plan: SyncPlan = await planCustomEngineSync(
        sniffed,
        options,
        this.charRepo,
        this.chatRepo,
        this.messageRepo
      );

      // If dry-run: return report with planned counts without writing
      if (options.dryRun) {
        return {
          scanned: plan.scanned,
          skipped: plan.skipped,
          insertedChars: plan.toInsertChars,
          updatedChars: plan.toUpdateChars,
          insertedChats: plan.toInsertChats,
          appendedMessages: plan.toAppendChats,
          reusedBlobs: 0,
          copiedBlobs: 0,
          missingAssets: [],
          quarantinedChats: plan.quarantinedChats,
          durationMs: Math.round(performance.now() - startTime)
        };
      }

      // Root directory for media resolution
      const rootDir = sniffed.kind === 'directory' ? sniffed.rootDir : null;

      // Load manifest index if present
      const manifestIndex = new Map<string, string>();
      if (sniffed.kind === 'directory' && sniffed.hasManifest) {
        try {
          const manifestText = await Bun.file(join(sniffed.rootDir, 'manifest.json')).text();
          const manifest = JSON.parse(manifestText);
          if (Array.isArray(manifest.media_assets)) {
            for (const item of manifest.media_assets) {
              if (item.hash && item.relative_path) {
                manifestIndex.set(item.hash.toLowerCase(), item.relative_path);
              }
            }
          }
        } catch {}
      }

      const stats = {
        insertedChars: 0,
        updatedChars: 0,
        insertedChats: 0,
        appendedMessages: 0,
        reusedBlobs: 0,
        copiedBlobs: 0,
        missingAssets: new Set<string>()
      };

      const usedSlugs = new Set<string>();
      const personaCache = new Map<string, string>();
      const charOriginToSlug = new Map<string, string>();

      // Populate existing character origin mappings
      const allCEChars = this.db
        .query("SELECT id, origin_id FROM characters WHERE origin = 'custom_engine';")
        .all() as Array<{ id: string; origin_id: string }>;
      for (const row of allCEChars) {
        if (row.origin_id) {
          charOriginToSlug.set(row.origin_id, row.id);
        }
      }

      // 3. Batching & Execution
      // Partition characters into batches of batchSize (default 500)
      const batchSize = options.batchSize && options.batchSize > 0 ? options.batchSize : 500;
      const charBatches: PlannedCharacter[][] = [];
      for (let i = 0; i < plan.characters.length; i += batchSize) {
        charBatches.push(plan.characters.slice(i, i + batchSize));
      }

      // If there are no characters (e.g. single chat import), create 1 empty batch so chats run
      if (charBatches.length === 0) {
        charBatches.push([]);
      }

      // Index planned chats by character_id
      const chatsByCharOrigin = new Map<string, PlannedChat[]>();
      const unassignedChats: PlannedChat[] = [];

      for (const ch of plan.chats) {
        if (ch.action === 'quarantine') continue;
        const charOriginId = ch.data.character_id;
        let list = chatsByCharOrigin.get(charOriginId);
        if (!list) {
          list = [];
          chatsByCharOrigin.set(charOriginId, list);
        }
        list.push(ch);
      }

      for (let batchIndex = 0; batchIndex < charBatches.length; batchIndex++) {
        const batchChars = charBatches[batchIndex];

        // Collect all chats belonging to characters in this batch
        const batchChats: PlannedChat[] = [];
        for (const pChar of batchChars) {
          const charChats = chatsByCharOrigin.get(pChar.data.id);
          if (charChats) {
            batchChats.push(...charChats);
            chatsByCharOrigin.delete(pChar.data.id);
          }
        }

        // If this is the last batch, include any remaining chats whose characters were already in DB
        if (batchIndex === charBatches.length - 1 && chatsByCharOrigin.size > 0) {
          for (const remaining of chatsByCharOrigin.values()) {
            batchChats.push(...remaining);
          }
          chatsByCharOrigin.clear();
        }

        // Pre-copy referenced blobs for this batch
        await this.prepareBlobsForBatch(batchChars, batchChats, rootDir, manifestIndex, stats);

        // Execute batch transaction
        this.db.transaction(() => {
          // A. Characters
          for (const pChar of batchChars) {
            if (pChar.action === 'skip') continue;

            const char = pChar.data;
            const now = Date.now();

            let avatarPath: string | null = null;
            if (char.avatar_hash && this.assetRepo.has(char.avatar_hash)) {
              avatarPath = this.assetRepo.get(char.avatar_hash)!.path;
            }

            let showcase: string | null = null;
            if (char.creator_notes && char.creator_notes.trim()) {
              showcase = `<details><summary>Author notes</summary>\n\n${char.creator_notes.trim()}\n</details>`;
            }

            const prunedAlternates = pruneAlternateGreetings(char.alternate_greetings);

            if (pChar.action === 'insert') {
              let baseSlug = slugify(char.name);
              if (!baseSlug) baseSlug = 'c-' + newId().toLowerCase();
              let candidate = baseSlug;
              let counter = 2;
              while (
                usedSlugs.has(candidate) ||
                this.db.query('SELECT 1 FROM characters WHERE id = ? LIMIT 1;').get(candidate)
              ) {
                candidate = `${baseSlug}-${counter++}`;
              }
              usedSlugs.add(candidate);
              const charId = candidate;

              const importMeta: Record<string, unknown> = {
                origin: 'custom_engine',
                originId: char.id,
                originHash: pChar.originHash,
                tagsRaw: char.tags ?? []
              };
              if (char.token_counts !== undefined && char.token_counts !== null) importMeta.tokenCounts = char.token_counts;
              if (char.stats !== undefined && char.stats !== null) importMeta.stats = char.stats;
              if (char.soundcloud_track_id !== undefined && char.soundcloud_track_id !== null) importMeta.soundcloudTrackId = char.soundcloud_track_id;
              if (char.is_nsfw !== undefined && char.is_nsfw !== null) importMeta.isNsfw = Boolean(char.is_nsfw);
              if (char.is_image_nsfw !== undefined && char.is_image_nsfw !== null) importMeta.isImageNsfw = Boolean(char.is_image_nsfw);

              const metadataObj: Record<string, unknown> = { import: importMeta };
              if (char.mes_example) metadataObj.exampleDialogue = char.mes_example;

              const createdAt = char.created_at ? Date.parse(char.created_at) || now : now;
              const updatedAt = char.updated_at ? Date.parse(char.updated_at) || createdAt : createdAt;

              const charName = (char.name?.trim() || 'Character').slice(0, 120);
              const charTagline = char.card_title?.trim() ? char.card_title.trim().slice(0, 140) : null;

              this.db.run(
                `INSERT INTO characters (
                   id, name, character_name, avatar, tagline, creator, creator_url, character_url,
                   origin, origin_id, origin_hash, showcase, custom_css, layout, description,
                   personality, scenario, first_message, alternate_greetings, style,
                   created_at, updated_at, metadata
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'custom_engine', ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                [
                  charId,
                  charName,
                  char.chat_name?.trim() || null,
                  avatarPath,
                  charTagline,
                  char.creator_name || null,
                  char.creator_url || null,
                  char.character_url || null,
                  char.id,
                  pChar.originHash,
                  showcase,
                  char.description,
                  char.personality,
                  char.scenario,
                  char.first_message ?? '',
                  prunedAlternates.length > 0 ? JSON.stringify(prunedAlternates) : null,
                  JSON.stringify(DEFAULT_CHARACTER_THEME),
                  createdAt,
                  updatedAt,
                  JSON.stringify(metadataObj)
                ]
              );

              // Reconcile tags (max 12 tags per schema)
              this.db.run('DELETE FROM character_tags WHERE character_id = ?;', [charId]);
              const tagInsert = this.db.query('INSERT OR IGNORE INTO character_tags (character_id, tag) VALUES (?, ?);');
              let insertedTagCount = 0;
              for (const t of char.tags ?? []) {
                if (insertedTagCount >= 12) break;
                const norm = normalizeTag(t);
                if (norm) {
                  tagInsert.run(charId, norm);
                  insertedTagCount++;
                }
              }

              // Bind avatar
              if (char.avatar_hash && this.assetRepo.has(char.avatar_hash)) {
                this.assetRepo.bindCharacterAsset({
                  id: newId(),
                  characterId: charId,
                  assetId: char.avatar_hash,
                  role: 'avatar',
                  sortOrder: 0,
                  createdAt: now
                });
              }

              stats.insertedChars++;
              charOriginToSlug.set(char.id, charId);
            } else if (pChar.action === 'update') {
              const charId = pChar.existingId!;
              const existingRow = this.db
                .query('SELECT avatar, metadata FROM characters WHERE id = ?;')
                .get(charId) as { avatar: string | null; metadata: string | null } | null;

              // Preserve existing avatar if new avatar blob could not be resolved from source
              let finalAvatarPath = avatarPath;
              if (!finalAvatarPath && char.avatar_hash) {
                finalAvatarPath = existingRow?.avatar ?? null;
              }

              let metadataObj: Record<string, unknown> = {};
              if (existingRow?.metadata) {
                try {
                  metadataObj = JSON.parse(existingRow.metadata);
                } catch {}
              }

              const importMeta: Record<string, unknown> = {
                ...((metadataObj.import as Record<string, unknown>) ?? {}),
                origin: 'custom_engine',
                originId: char.id,
                originHash: pChar.originHash,
                tagsRaw: char.tags ?? []
              };
              if (char.token_counts !== undefined && char.token_counts !== null) importMeta.tokenCounts = char.token_counts;
              if (char.stats !== undefined && char.stats !== null) importMeta.stats = char.stats;
              if (char.soundcloud_track_id !== undefined && char.soundcloud_track_id !== null) importMeta.soundcloudTrackId = char.soundcloud_track_id;
              if (char.is_nsfw !== undefined && char.is_nsfw !== null) importMeta.isNsfw = Boolean(char.is_nsfw);
              if (char.is_image_nsfw !== undefined && char.is_image_nsfw !== null) importMeta.isImageNsfw = Boolean(char.is_image_nsfw);

              metadataObj.import = importMeta;
              if (char.mes_example) metadataObj.exampleDialogue = char.mes_example;

              const charName = (char.name?.trim() || 'Character').slice(0, 120);
              const charTagline = char.card_title?.trim() ? char.card_title.trim().slice(0, 140) : null;

              this.db.run(
                `UPDATE characters SET
                   name = ?,
                   character_name = ?,
                   avatar = ?,
                   tagline = ?,
                   creator = ?,
                   creator_url = ?,
                   character_url = ?,
                   showcase = ?,
                   description = ?,
                   personality = ?,
                   scenario = ?,
                   first_message = ?,
                   alternate_greetings = ?,
                   origin_hash = ?,
                   metadata = ?,
                   updated_at = ?
                 WHERE id = ?;`,
                [
                  charName,
                  char.chat_name?.trim() || null,
                  finalAvatarPath,
                  charTagline,
                  char.creator_name || null,
                  char.creator_url || null,
                  char.character_url || null,
                  showcase,
                  char.description,
                  char.personality,
                  char.scenario,
                  char.first_message ?? '',
                  prunedAlternates.length > 0 ? JSON.stringify(prunedAlternates) : null,
                  pChar.originHash,
                  JSON.stringify(metadataObj),
                  now,
                  charId
                ]
              );

              // Reconcile tags (max 12 tags per schema)
              this.db.run('DELETE FROM character_tags WHERE character_id = ?;', [charId]);
              const tagInsert = this.db.query('INSERT OR IGNORE INTO character_tags (character_id, tag) VALUES (?, ?);');
              let insertedTagCount = 0;
              for (const t of char.tags ?? []) {
                if (insertedTagCount >= 12) break;
                const norm = normalizeTag(t);
                if (norm) {
                  tagInsert.run(charId, norm);
                  insertedTagCount++;
                }
              }

              // Reconcile avatar
              if (char.avatar_hash && this.assetRepo.has(char.avatar_hash)) {
                this.assetRepo.deleteCharacterAssets(charId, 'avatar');
                this.assetRepo.bindCharacterAsset({
                  id: newId(),
                  characterId: charId,
                  assetId: char.avatar_hash,
                  role: 'avatar',
                  sortOrder: 0,
                  createdAt: now
                });
              } else if (!char.avatar_hash) {
                this.assetRepo.deleteCharacterAssets(charId, 'avatar');
              }

              stats.updatedChars++;
              charOriginToSlug.set(char.id, charId);
            }
          }

          // B. Chats & Messages
          for (const pChat of batchChats) {
            if (pChat.action === 'skip' || pChat.action === 'quarantine') continue;

            const chat = pChat.data;
            const primaryCharacterId =
              charOriginToSlug.get(chat.character_id) ||
              this.charRepo.findByProvenance('custom_engine', chat.character_id)?.id;

            if (!primaryCharacterId) {
              plan.quarantinedChats.push({
                chatId: chat.id,
                characterOriginId: chat.character_id,
                reason: 'missing_character'
              });
              continue;
            }

            const now = Date.now();
            const activePersonaId = this.resolvePersona(chat.user_persona, personaCache, now);

            if (pChat.action === 'insert') {
              const chatId = newId();
              const charCard = this.charRepo.get(primaryCharacterId);
              const charName = charCard?.name ?? 'Character';
              const title = (chat.title && chat.title.trim()) || `Chat with ${charName}`;
              const greetingCount = 1 + (charCard?.alternateGreetings?.length ?? 0);
              const activeGreetingIndex = clampGreetingIndex(chat.active_greeting_index, greetingCount);
              const personaSnapshot = chat.user_persona ? JSON.stringify(chat.user_persona) : null;
              const createdAt = chat.created_at ? Date.parse(chat.created_at) || now : now;
              const maxMsgTime = (chat.messages ?? []).reduce((max, m) => Math.max(max, m.timestamp ?? 0), 0);
              const updatedAt = chat.updated_at
                ? Date.parse(chat.updated_at) || createdAt
                : maxMsgTime > 0
                  ? maxMsgTime
                  : createdAt;
              const chatMetadata: Record<string, unknown> = {};
              if (chat.summary) chatMetadata.summary = chat.summary;
              if (chat.fork_source_chat_id) chatMetadata.forkSource = chat.fork_source_chat_id;

              this.db.run(
                `INSERT INTO chats (
                   id, title, primary_character_id, active_persona_id, active_leaf_id,
                   created_at, updated_at, metadata, origin, origin_id, origin_hash,
                   active_greeting_index, persona_snapshot
                 ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 'custom_engine', ?, ?, ?, ?);`,
                [
                  chatId,
                  title,
                  primaryCharacterId,
                  activePersonaId,
                  createdAt,
                  updatedAt,
                  JSON.stringify(chatMetadata),
                  chat.id,
                  pChat.originHash,
                  activeGreetingIndex,
                  personaSnapshot
                ]
              );

              // Messages
              const sortedMessages = [...(chat.messages ?? [])].sort(
                (a, b) => a.sequence_index - b.sequence_index
              );
              let currentMainId: string | null = null;
              let lastMainId: string | null = null;

              for (const m of sortedMessages) {
                if (m.is_main === false) {
                  const msgId = newId();
                  this.insertMessageRow(msgId, chatId, currentMainId, m, true, activePersonaId, primaryCharacterId, now);
                  stats.appendedMessages++;
                } else {
                  const msgId = newId();
                  const parentId = currentMainId;
                  this.insertMessageRow(msgId, chatId, parentId, m, false, activePersonaId, primaryCharacterId, now);
                  stats.appendedMessages++;

                  if (Array.isArray(m.alternate_swipes)) {
                    for (const swipe of m.alternate_swipes) {
                      if (typeof swipe !== 'string' || !swipe) continue;
                      const swipeId = newId();
                      this.insertSwipeRow(swipeId, chatId, parentId, m, swipe, activePersonaId, primaryCharacterId, now);
                      stats.appendedMessages++;
                    }
                  }

                  currentMainId = msgId;
                  lastMainId = msgId;
                }
              }

              this.db.run('UPDATE chats SET active_leaf_id = ? WHERE id = ?;', [lastMainId, chatId]);
              stats.insertedChats++;
            } else if (pChat.action === 'append') {
              const chatId = pChat.existingId!;
              const sortedHigher = [...pChat.messagesToInsert].sort(
                (a, b) => a.sequence_index - b.sequence_index
              );
              let currentMainId = pChat.existingLeafId ?? null;
              let lastMainId = currentMainId;

              for (const m of sortedHigher) {
                if (m.is_main === false) {
                  const msgId = newId();
                  this.insertMessageRow(msgId, chatId, currentMainId, m, true, activePersonaId, primaryCharacterId, now);
                  stats.appendedMessages++;
                } else {
                  const msgId = newId();
                  const parentId = currentMainId;
                  this.insertMessageRow(msgId, chatId, parentId, m, false, activePersonaId, primaryCharacterId, now);
                  stats.appendedMessages++;

                  if (Array.isArray(m.alternate_swipes)) {
                    for (const swipe of m.alternate_swipes) {
                      if (typeof swipe !== 'string' || !swipe) continue;
                      const swipeId = newId();
                      this.insertSwipeRow(swipeId, chatId, parentId, m, swipe, activePersonaId, primaryCharacterId, now);
                      stats.appendedMessages++;
                    }
                  }

                  currentMainId = msgId;
                  lastMainId = msgId;
                }
              }

              this.db.run('UPDATE chats SET active_leaf_id = ?, origin_hash = ?, updated_at = ? WHERE id = ?;', [
                lastMainId,
                pChat.originHash,
                now,
                chatId
              ]);
            } else if (pChat.action === 'header_update') {
              const chatId = pChat.existingId!;
              const charCard = this.charRepo.get(primaryCharacterId);
              const charName = charCard?.name ?? 'Character';
              const title = (chat.title && chat.title.trim()) || `Chat with ${charName}`;
              const greetingCount = 1 + (charCard?.alternateGreetings?.length ?? 0);
              const activeGreetingIndex = clampGreetingIndex(chat.active_greeting_index, greetingCount);
              const personaSnapshot = chat.user_persona ? JSON.stringify(chat.user_persona) : null;

              this.db.run(
                `UPDATE chats SET
                   title = ?,
                   active_greeting_index = ?,
                   persona_snapshot = ?,
                   origin_hash = ?,
                   updated_at = ?
                 WHERE id = ?;`,
                [title, activeGreetingIndex, personaSnapshot, pChat.originHash, now, chatId]
              );
            }
          }

          // Test hook to inject errors before batch commit
          if (options.onBeforeBatchCommit) {
            options.onBeforeBatchCommit(batchIndex);
          }
        })();
      }

      // 4. Rebuild FTS
      reindexCharactersFts(this.db);

      const durationMs = Math.round(performance.now() - startTime);

      return {
        scanned: plan.scanned,
        skipped: plan.skipped,
        insertedChars: stats.insertedChars,
        updatedChars: stats.updatedChars,
        insertedChats: stats.insertedChats,
        appendedMessages: stats.appendedMessages,
        reusedBlobs: stats.reusedBlobs,
        copiedBlobs: stats.copiedBlobs,
        missingAssets: Array.from(stats.missingAssets),
        quarantinedChats: plan.quarantinedChats,
        durationMs
      };
    } finally {
      releaseLock();
    }
  }

  private async prepareBlobsForBatch(
    chars: PlannedCharacter[],
    chats: PlannedChat[],
    rootDir: string | null,
    manifestIndex: Map<string, string>,
    stats: { copiedBlobs: number; reusedBlobs: number; missingAssets: Set<string> }
  ): Promise<void> {
    const hashesToEnsure = new Set<string>();

    for (const c of chars) {
      if (c.action === 'skip') continue;
      if (c.data.avatar_hash) hashesToEnsure.add(c.data.avatar_hash);
      for (const h of extractMediaHashes(c.data.description ?? '')) hashesToEnsure.add(h);
      for (const h of extractMediaHashes(c.data.first_message ?? '')) hashesToEnsure.add(h);
      for (const alt of c.data.alternate_greetings ?? []) {
        for (const h of extractMediaHashes(alt)) hashesToEnsure.add(h);
      }
    }

    for (const ch of chats) {
      if (ch.action === 'skip' || ch.action === 'quarantine') continue;
      if (ch.data.user_persona?.avatar) hashesToEnsure.add(ch.data.user_persona.avatar);
      for (const m of ch.data.messages ?? []) {
        for (const h of extractMediaHashes(m.content ?? '')) hashesToEnsure.add(h);
        for (const h of m.media_hashes ?? []) hashesToEnsure.add(h);
        for (const sw of m.alternate_swipes ?? []) {
          for (const h of extractMediaHashes(sw)) hashesToEnsure.add(h);
        }
      }
    }

    // Check for any missing assets previously recorded in DB that might now be available
    try {
      const dbMissing = this.db
        .query('SELECT missing_assets FROM messages WHERE missing_assets IS NOT NULL;')
        .all() as Array<{ missing_assets: string }>;
      for (const row of dbMissing) {
        try {
          const list = JSON.parse(row.missing_assets) as string[];
          for (const h of list) hashesToEnsure.add(h);
        } catch {}
      }
    } catch {}

    for (const hash of hashesToEnsure) {
      await this.ensureBlobInPool(hash, rootDir, manifestIndex, stats);
    }
  }

  private async ensureBlobInPool(
    hash: string,
    rootDir: string | null,
    manifestIndex: Map<string, string>,
    stats: { copiedBlobs: number; reusedBlobs: number; missingAssets: Set<string> }
  ): Promise<string | null> {
    const cleanHash = hash.toLowerCase();

    if (this.assetRepo.has(cleanHash)) {
      stats.reusedBlobs++;
      return this.assetRepo.get(cleanHash)!.path;
    }

    if (!rootDir) {
      stats.missingAssets.add(cleanHash);
      return null;
    }

    const bytes = await this.findSourceBlobBytes(rootDir, cleanHash, manifestIndex);
    if (!bytes) {
      stats.missingAssets.add(cleanHash);
      return null;
    }

    try {
      const record = await this.assetStore.putPool(bytes);
      if (record.id !== cleanHash) {
        console.warn(`[import] Warning: hash mismatch for blob. Expected ${cleanHash}, computed ${record.id}`);
        stats.missingAssets.add(cleanHash);
        return null;
      }
      this.assetRepo.insert(record);
      stats.copiedBlobs++;

      // Heal any existing messages in DB that had this hash listed in missing_assets
      try {
        const affectedRows = this.db
          .query('SELECT id, missing_assets FROM messages WHERE missing_assets LIKE ?;')
          .all(`%"${cleanHash}"%`) as Array<{ id: string; missing_assets: string }>;
        for (const row of affectedRows) {
          try {
            const list = JSON.parse(row.missing_assets) as string[];
            const filtered = list.filter((h) => h !== cleanHash);
            const newMissing = filtered.length > 0 ? JSON.stringify(filtered) : null;
            this.db.run('UPDATE messages SET missing_assets = ? WHERE id = ?;', [newMissing, row.id]);
            this.assetRepo.bindMessageAsset(row.id, cleanHash);
          } catch {}
        }
      } catch {}

      return record.path;
    } catch (err: any) {
      if (err instanceof ApiError && (err.code === 'asset_type_rejected' || err.code === 'asset_dimensions')) {
        stats.missingAssets.add(cleanHash);
        return null;
      }
      throw err;
    }
  }

  private async findSourceBlobBytes(
    rootDir: string,
    hash: string,
    manifestIndex: Map<string, string>
  ): Promise<Uint8Array | null> {
    // 1. Try manifest relative path
    if (manifestIndex.has(hash)) {
      const rel = manifestIndex.get(hash)!;
      const full = join(rootDir, rel);
      try {
        const file = Bun.file(full);
        if (await file.exists()) {
          return new Uint8Array(await file.arrayBuffer());
        }
      } catch {}
    }

    // 2. Try common extensions in media/
    const candidateExts = ['.webp', '.png', '.jpg', '.jpeg', '.gif', ''];
    for (const ext of candidateExts) {
      const full = join(rootDir, 'media', `${hash}${ext}`);
      try {
        const file = Bun.file(full);
        if (await file.exists()) {
          return new Uint8Array(await file.arrayBuffer());
        }
      } catch {}
    }

    return null;
  }

  private resolvePersona(
    userPersona: CustomEngineUserPersona | null | undefined,
    personaCache: Map<string, string>,
    now: number
  ): string {
    const name = userPersona?.name?.trim() || 'User';
    const cacheKey = name.toLowerCase();
    if (personaCache.has(cacheKey)) {
      return personaCache.get(cacheKey)!;
    }

    const existing = this.personaRepo.findByName(name);
    if (existing) {
      personaCache.set(cacheKey, existing.id);
      return existing.id;
    }

    const baseSlug = 'imported-' + (slugify(name) || 'user');
    let candidate = baseSlug;
    let counter = 2;
    const stmt = this.db.query('SELECT 1 FROM personas WHERE id = ? LIMIT 1;');
    while (stmt.get(candidate)) {
      candidate = `${baseSlug}-${counter++}`;
    }

    let avatarPath: string | null = null;
    if (userPersona?.avatar && this.assetRepo.has(userPersona.avatar)) {
      avatarPath = this.assetRepo.get(userPersona.avatar)!.path;
    }

    const persona = this.personaRepo.create({
      id: candidate,
      name,
      description: userPersona?.description ?? '',
      avatar: avatarPath ?? undefined,
      isDefault: false
    });

    personaCache.set(cacheKey, persona.id);
    return persona.id;
  }

  private insertMessageRow(
    msgId: string,
    chatId: string,
    parentId: string | null,
    m: CustomEngineMessage,
    isSwipe: boolean,
    activePersonaId: string,
    primaryCharacterId: string,
    now: number
  ): void {
    const role = m.role === 'system' ? 'system' : m.role === 'user' ? 'user' : 'assistant';
    const narrativeRole = role === 'user' ? 'persona' : role === 'assistant' ? 'character' : 'narrator';
    const senderId = role === 'user' ? activePersonaId : primaryCharacterId;
    const senderName = m.sender_name ?? null;
    const metadata: Record<string, unknown> = isSwipe ? { imported_swipe: true } : {};
    const createdAt = m.timestamp ?? now;

    const inlineHashes = extractMediaHashes(m.content ?? '');
    const explicitHashes = Array.isArray(m.media_hashes) ? m.media_hashes : [];
    const allHashes = Array.from(new Set([...inlineHashes, ...explicitHashes]));

    const missingForMsg: string[] = [];
    const presentHashes: string[] = [];
    for (const h of allHashes) {
      if (this.assetRepo.has(h)) {
        presentHashes.push(h);
      } else {
        missingForMsg.push(h);
      }
    }

    const missingAssetsStr = missingForMsg.length > 0 ? JSON.stringify(missingForMsg) : null;

    this.db.run(
      `INSERT INTO messages (
         id, chat_id, parent_id, sender_id, sender_name, role, narrative_role,
         content, segments, state, status, created_at, metrics, metadata,
         origin_id, sequence_index, missing_assets
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', NULL, 'complete', ?, NULL, ?, ?, ?, ?);`,
      [
        msgId,
        chatId,
        parentId,
        senderId,
        senderName,
        role,
        narrativeRole,
        m.content,
        createdAt,
        JSON.stringify(metadata),
        m.id,
        m.sequence_index,
        missingAssetsStr
      ]
    );

    for (const h of presentHashes) {
      this.assetRepo.bindMessageAsset(msgId, h);
    }
  }

  private insertSwipeRow(
    swipeId: string,
    chatId: string,
    parentId: string | null,
    m: CustomEngineMessage,
    swipeContent: string,
    activePersonaId: string,
    primaryCharacterId: string,
    now: number
  ): void {
    const role = m.role === 'system' ? 'system' : m.role === 'user' ? 'user' : 'assistant';
    const narrativeRole = role === 'user' ? 'persona' : role === 'assistant' ? 'character' : 'narrator';
    const senderId = role === 'user' ? activePersonaId : primaryCharacterId;
    const senderName = m.sender_name ?? null;
    const metadata: Record<string, unknown> = { imported_swipe: true };
    const createdAt = m.timestamp ? m.timestamp + 1 : now;

    const inlineHashes = extractMediaHashes(swipeContent ?? '');
    const missingForMsg: string[] = [];
    const presentHashes: string[] = [];
    for (const h of inlineHashes) {
      if (this.assetRepo.has(h)) {
        presentHashes.push(h);
      } else {
        missingForMsg.push(h);
      }
    }

    const missingAssetsStr = missingForMsg.length > 0 ? JSON.stringify(missingForMsg) : null;

    this.db.run(
      `INSERT INTO messages (
         id, chat_id, parent_id, sender_id, sender_name, role, narrative_role,
         content, segments, state, status, created_at, metrics, metadata,
         origin_id, sequence_index, missing_assets
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', NULL, 'complete', ?, NULL, ?, NULL, ?, ?);`,
      [
        swipeId,
        chatId,
        parentId,
        senderId,
        senderName,
        role,
        narrativeRole,
        swipeContent,
        createdAt,
        JSON.stringify(metadata),
        m.sequence_index,
        missingAssetsStr
      ]
    );

    for (const h of presentHashes) {
      this.assetRepo.bindMessageAsset(swipeId, h);
    }
  }
}

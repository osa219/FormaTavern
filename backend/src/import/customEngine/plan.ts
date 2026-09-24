import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalCharacter, canonicalChat, hashCanonical, type QuarantinedChat } from '@formatavern/shared';
import type { CharacterRepository, ChatRepository, MessageRepository } from '../../db/contracts';
import type {
  CustomEngineCharacter,
  CustomEngineChat,
  CustomEngineImportOptions,
  PlannedCharacter,
  PlannedChat,
  SyncPlan
} from './types';
import type { SniffResult } from './sniff';

export async function planCustomEngineSync(
  sniffed: SniffResult,
  options: CustomEngineImportOptions,
  charRepo: CharacterRepository,
  chatRepo: ChatRepository,
  messageRepo: MessageRepository
): Promise<SyncPlan> {
  const characters: PlannedCharacter[] = [];
  const chats: PlannedChat[] = [];
  const quarantinedChats: QuarantinedChat[] = [];

  // 1. Collect Characters
  if (sniffed.kind === 'single_character') {
    const raw = sniffed.raw as CustomEngineCharacter;
    const originHash = hashCanonical(canonicalCharacter(raw as unknown as Record<string, unknown>));
    const existing = charRepo.findByProvenance('custom_engine', raw.id);
    let action: 'insert' | 'update' | 'skip' = 'insert';
    let existingId: string | undefined = undefined;

    if (existing) {
      existingId = existing.id;
      action = existing.originHash === originHash ? 'skip' : 'update';
    }

    characters.push({
      file: sniffed.filePath,
      data: raw,
      originHash,
      action,
      existingId
    });
  } else if (sniffed.kind === 'directory' && sniffed.hasCharacters) {
    const charDir = join(sniffed.rootDir, 'characters');
    let entries: string[] = [];
    try {
      entries = (await readdir(charDir)).filter((f) => f.endsWith('.json'));
    } catch {}

    entries.sort(); // Deterministic ordering

    const filterOriginId = options.characterOriginId;
    if (filterOriginId) {
      entries = entries.filter((f) => f === `${filterOriginId}.json` || f.startsWith(filterOriginId));
    }

    if (options.limit !== undefined && options.limit > 0) {
      entries = entries.slice(0, options.limit);
    }

    for (const filename of entries) {
      const fullPath = join(charDir, filename);
      try {
        const text = await Bun.file(fullPath).text();
        const raw = JSON.parse(text) as CustomEngineCharacter;

        // If options.characterOriginId was given, double check raw.id
        if (options.characterOriginId && raw.id !== options.characterOriginId) {
          continue;
        }

        const originHash = hashCanonical(canonicalCharacter(raw as unknown as Record<string, unknown>));
        const existing = charRepo.findByProvenance('custom_engine', raw.id);
        let action: 'insert' | 'update' | 'skip' = 'insert';
        let existingId: string | undefined = undefined;

        if (existing) {
          existingId = existing.id;
          action = existing.originHash === originHash ? 'skip' : 'update';
        }

        characters.push({
          file: fullPath,
          data: raw,
          originHash,
          action,
          existingId
        });
      } catch (err: any) {
        console.warn(`[plan] Warning: failed to parse character file ${filename}:`, err.message);
      }
    }
  }

  // Set of known character origin IDs in DB or in this plan
  const knownCharacterOriginIds = new Set<string>();
  for (const c of characters) {
    knownCharacterOriginIds.add(c.data.id);
  }

  // Helper to check if a character exists in DB
  const checkCharExists = (originId: string): boolean => {
    if (knownCharacterOriginIds.has(originId)) return true;
    const inDb = charRepo.findByProvenance('custom_engine', originId);
    if (inDb) {
      knownCharacterOriginIds.add(originId);
      return true;
    }
    return false;
  };

  // 2. Collect Chats
  if (sniffed.kind === 'single_chat') {
    const raw = sniffed.raw as CustomEngineChat;
    const originHash = hashCanonical(canonicalChat(raw as unknown as Record<string, unknown>));

    if (!checkCharExists(raw.character_id)) {
      quarantinedChats.push({
        chatId: raw.id,
        characterOriginId: raw.character_id,
        reason: 'missing_character'
      });
      chats.push({
        file: sniffed.filePath,
        data: raw,
        originHash,
        action: 'quarantine',
        messagesToInsert: [],
        quarantineReason: 'missing_character'
      });
    } else {
      const existing = chatRepo.findByProvenance('custom_engine', raw.id);
      let action: 'insert' | 'append' | 'header_update' | 'skip' = 'insert';
      let existingId: string | undefined = undefined;
      let existingLeafId: string | null = null;
      let messagesToInsert = raw.messages ?? [];

      if (existing) {
        existingId = existing.id;
        existingLeafId = existing.activeLeafId;
        if (existing.originHash === originHash) {
          action = 'skip';
          messagesToInsert = [];
        } else {
          const maxSeq = messageRepo.getMaxSequenceIndex(existing.id);
          const higher = (raw.messages ?? []).filter((m) => m.sequence_index > maxSeq);
          if (higher.length > 0) {
            action = 'append';
            messagesToInsert = higher;
          } else {
            action = 'header_update';
            messagesToInsert = [];
          }
        }
      }

      chats.push({
        file: sniffed.filePath,
        data: raw,
        originHash,
        action,
        existingId,
        existingLeafId,
        messagesToInsert
      });
    }
  } else if (sniffed.kind === 'directory' && sniffed.hasChats) {
    const chatsDir = join(sniffed.rootDir, 'chats');
    let chatFiles: string[] = [];

    try {
      const subEntries = await readdir(chatsDir, { withFileTypes: true });

      // Determine which character folders to examine
      const activeCharOriginIds = new Set(characters.map((c) => c.data.id));

      for (const entry of subEntries) {
        const fullSubPath = join(chatsDir, entry.name);
        if (entry.isDirectory()) {
          // If we are filtering by characterOriginId or limit, skip folders for unselected characters
          if (options.characterOriginId && entry.name !== options.characterOriginId) {
            continue;
          }
          if (options.limit !== undefined && options.limit > 0 && !activeCharOriginIds.has(entry.name)) {
            continue;
          }

          try {
            const files = (await readdir(fullSubPath)).filter((f) => f.endsWith('.json'));
            for (const f of files) {
              chatFiles.push(join(fullSubPath, f));
            }
          } catch {}
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          // Direct chat file under chats/
          chatFiles.push(fullSubPath);
        }
      }
    } catch {}

    chatFiles.sort(); // Deterministic ordering

    for (const chatPath of chatFiles) {
      try {
        const text = await Bun.file(chatPath).text();
        const raw = JSON.parse(text) as CustomEngineChat;

        if (options.characterOriginId && raw.character_id !== options.characterOriginId) {
          continue;
        }

        const originHash = hashCanonical(canonicalChat(raw as unknown as Record<string, unknown>));

        if (!checkCharExists(raw.character_id)) {
          quarantinedChats.push({
            chatId: raw.id,
            characterOriginId: raw.character_id,
            reason: 'missing_character'
          });
          chats.push({
            file: chatPath,
            data: raw,
            originHash,
            action: 'quarantine',
            messagesToInsert: [],
            quarantineReason: 'missing_character'
          });
        } else {
          const existing = chatRepo.findByProvenance('custom_engine', raw.id);
          let action: 'insert' | 'append' | 'header_update' | 'skip' = 'insert';
          let existingId: string | undefined = undefined;
          let existingLeafId: string | null = null;
          let messagesToInsert = raw.messages ?? [];

          if (existing) {
            existingId = existing.id;
            existingLeafId = existing.activeLeafId;
            if (existing.originHash === originHash) {
              action = 'skip';
              messagesToInsert = [];
            } else {
              const maxSeq = messageRepo.getMaxSequenceIndex(existing.id);
              const higher = (raw.messages ?? []).filter((m) => m.sequence_index > maxSeq);
              if (higher.length > 0) {
                action = 'append';
                messagesToInsert = higher;
              } else {
                action = 'header_update';
                messagesToInsert = [];
              }
            }
          }

          chats.push({
            file: chatPath,
            data: raw,
            originHash,
            action,
            existingId,
            existingLeafId,
            messagesToInsert
          });
        }
      } catch (err: any) {
        console.warn(`[plan] Warning: failed to parse chat file ${chatPath}:`, err.message);
      }
    }
  }

  const toInsertChars = characters.filter((c) => c.action === 'insert').length;
  const toUpdateChars = characters.filter((c) => c.action === 'update').length;
  const toInsertChats = chats.filter((c) => c.action === 'insert').length;
  const toAppendChats = chats.filter((c) => c.action === 'append').length;

  const skipped =
    characters.filter((c) => c.action === 'skip').length +
    chats.filter((c) => c.action === 'skip').length;

  const scanned = characters.length + chats.length;

  return {
    characters,
    chats,
    quarantinedChats,
    scanned,
    skipped,
    toInsertChars,
    toUpdateChars,
    toInsertChats,
    toAppendChats
  };
}

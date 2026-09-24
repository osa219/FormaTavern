import { describe, it, expect } from 'bun:test';
import { Value } from '@sinclair/typebox/value';
import {
  SyncReportSchema,
  QuarantinedChatSchema,
  SyncRunResponseSchema,
  SyncRequestSchema,
  ImportPreviewSchema,
  CharacterMetadataSchema,
  ChatMetadataSchema,
  ChatViewSchema
} from '../src';

describe('Import/Export Schemas (Blueprint §3)', () => {
  it('validates a valid SyncReport payload', () => {
    const validReport = {
      scanned: 1623,
      skipped: 1600,
      insertedChars: 20,
      updatedChars: 3,
      insertedChats: 50,
      appendedMessages: 120,
      reusedBlobs: 4300,
      copiedBlobs: 5,
      missingAssets: ['44326304f3cbe987ced888a14600cf06442eaca8935899e8e5a9ec2a8a48fe8a'],
      quarantinedChats: [
        {
          chatId: 'orphan_1',
          characterOriginId: 'missing_char_uuid',
          reason: 'Character origin ID not found in database'
        }
      ],
      durationMs: 2450
    };

    expect(Value.Check(SyncReportSchema, validReport)).toBe(true);
  });

  it('rejects SyncReport with negative counts', () => {
    const invalidReport = {
      scanned: -1,
      skipped: 0,
      insertedChars: 0,
      updatedChars: 0,
      insertedChats: 0,
      appendedMessages: 0,
      reusedBlobs: 0,
      copiedBlobs: 0,
      missingAssets: [],
      quarantinedChats: [],
      durationMs: 0
    };
    expect(Value.Check(SyncReportSchema, invalidReport)).toBe(false);
  });

  it('validates CharacterMetadata with import metadata extension', () => {
    const metaWithImport = {
      creator: 'TestAuthor',
      import: {
        origin: 'custom_engine',
        originId: '000150a0-07bf-4e2a-a92c-123456789abc',
        tagsRaw: ['👩‍🦰 Female', 'Scholar'],
        tokenCounts: {
          personality_tokens: 1050,
          scenario_tokens: 300,
          total_tokens: 1350
        },
        stats: { chat: 120, message: 3400 },
        soundcloudTrackId: '1514713642',
        isNsfw: true,
        isImageNsfw: false
      }
    };
    expect(Value.Check(CharacterMetadataSchema, metaWithImport)).toBe(true);
  });

  it('validates ChatMetadata with summary and forkSource', () => {
    const chatMeta = {
      summary: 'Adventurer met the scholar in the tavern.',
      forkSource: '1566553883'
    };
    expect(Value.Check(ChatMetadataSchema, chatMeta)).toBe(true);
  });

  it('validates ChatView with activeGreetingIndex and personaSnapshot', () => {
    const chatView = {
      id: 'chat_01',
      title: 'Study Session',
      primaryCharacterId: 'char_01',
      activePersonaId: 'persona_01',
      createdAt: 1700000000000,
      updatedAt: 1700000005000,
      metadata: {},
      activeLeafId: null,
      activeGenerationMessageId: null,
      activeGreetingIndex: 2,
      personaSnapshot: JSON.stringify({ name: 'Adventurer', pronouns: 'they/them' }),
      messageCount: 10
    };
    expect(Value.Check(ChatViewSchema, chatView)).toBe(true);
  });

  it('validates character and chat import previews', () => {
    expect(
      Value.Check(ImportPreviewSchema, {
        kind: 'character',
        format: 'tavern-v2',
        card: { name: 'Preview Hero' },
        avatarDataUrl: 'data:image/png;base64,iVBOR',
        warnings: []
      })
    ).toBe(true);
    expect(
      Value.Check(ImportPreviewSchema, {
        kind: 'chat',
        format: 'sillytavern-jsonl',
        title: 'Trail Chat',
        messageCount: 2,
        warnings: []
      })
    ).toBe(true);
    expect(
      Value.Check(ImportPreviewSchema, {
        kind: 'character',
        format: 'nope',
        card: {},
        warnings: []
      })
    ).toBe(false);
  });
});

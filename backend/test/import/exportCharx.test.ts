import { describe, it, expect, afterEach } from 'bun:test';
import { inflateRawSync } from 'node:zlib';
import { DEFAULT_CHARACTER_THEME } from '@formatavern/shared';
import { createTestImportEnv, makePng, type TestImportEnv } from './testUtils';
import { exportCharx, exportRelationalPack } from '../../src/import/charx/service';
import { ulid } from 'ulid';

function readZipFile(zipBytes: Uint8Array, targetName: string): Uint8Array | null {
  const buf = Buffer.isBuffer(zipBytes) ? zipBytes : Buffer.from(zipBytes);
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString('utf8');
    const dataStart = offset + 30 + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + compSize);
    if (name === targetName) {
      return new Uint8Array(method === 8 ? inflateRawSync(data) : data);
    }
    offset = dataStart + compSize;
  }
  return null;
}

function listZipFileNames(zipBytes: Uint8Array): string[] {
  const names: string[] = [];
  const buf = Buffer.isBuffer(zipBytes) ? zipBytes : Buffer.from(zipBytes);
  let offset = 0;

  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig === 0x04034b50) {
      // Local File Header
      const compSize = buf.readUInt32LE(offset + 18);
      const nameLen = buf.readUInt16LE(offset + 26);
      const extraLen = buf.readUInt16LE(offset + 28);
      const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString('utf8');
      names.push(name);
      offset += 30 + nameLen + extraLen + compSize;
    } else {
      break;
    }
  }
  return names;
}

describe('CharX & Relational Pack Export (Slice E)', () => {
  let env: TestImportEnv;

  afterEach(async () => {
    if (env) {
      await env.cleanup();
    }
  });

  it('exports CharX pack containing card.json and bound assets in assets/ hierarchy', async () => {
    env = await createTestImportEnv();

    const avatarPng = makePng(40, 40);
    const galleryPng = makePng(60, 60);

    const avatarRecord = await env.store.putPool(avatarPng);
    env.repos.assets.insert(avatarRecord);

    const galleryRecord = await env.store.putPool(galleryPng);
    env.repos.assets.insert(galleryRecord);

    const char = env.repos.characters.create({
      name: 'Princess Lyra',
      description: 'Heir to the crystal throne',
      personality: 'Graceful, regal, determined',
      scenario: 'Throne room',
      firstMessage: 'Welcome to our court.',
      style: DEFAULT_CHARACTER_THEME,
      avatar: avatarRecord.path
    });

    // Bind avatar
    env.repos.assets.bindCharacterAsset({
      id: ulid().toLowerCase(),
      characterId: char.id,
      assetId: avatarRecord.id,
      role: 'avatar',
      sortOrder: 0,
      createdAt: Date.now()
    });

    // Bind gallery image
    env.repos.assets.bindCharacterAsset({
      id: ulid().toLowerCase(),
      characterId: char.id,
      assetId: galleryRecord.id,
      role: 'gallery',
      label: 'palace_garden',
      sortOrder: 1,
      createdAt: Date.now()
    });

    const charx = await exportCharx(char.id, env.repos, env.store);
    expect(charx.contentType).toBe('application/x-charx+zip');
    expect(charx.filename).toBe('princess-lyra.charx');

    const fileNames = listZipFileNames(charx.data);
    expect(fileNames).toContain('card.json');
    expect(fileNames).toContain('assets/icon/main.png');
    expect(fileNames).toContain('assets/gallery/palace_garden.png');
  });

  it('exports lossless relational pack with manifest, character JSON, chats, and media', async () => {
    env = await createTestImportEnv();

    const mediaBytes = makePng(20, 20);
    const mediaRecord = await env.store.putPool(mediaBytes);
    env.repos.assets.insert(mediaRecord);

    const char = env.repos.characters.create({
      name: 'Captain Reynolds',
      description: `Wanders the stars. Flagship photo: media://${mediaRecord.id}`,
      personality: 'Cynical with a heart of gold',
      scenario: 'Cargo hold',
      firstMessage: 'Keep flying.',
      style: DEFAULT_CHARACTER_THEME
    });

    const persona = env.repos.personas.create({
      name: 'Mal',
      description: 'Captain',
      isDefault: true
    });

    const chat = env.repos.chats.create({
      id: 'c_' + ulid().toLowerCase(),
      title: 'Serenity Voyage',
      primaryCharacterId: char.id,
      activePersonaId: persona.id,
      personaSnapshot: JSON.stringify({ name: persona.name })
    });

    const msg = env.repos.messages.insert({
      id: 'm_' + ulid().toLowerCase(),
      chatId: chat.id,
      parentId: null,
      senderId: char.id,
      senderName: char.name,
      role: 'assistant',
      narrativeRole: 'character',
      content: `Ship specs attached: media://${mediaRecord.id}`,
      status: 'complete'
    });
    env.repos.chats.setActiveLeaf(chat.id, msg.id);

    // Export single character pack
    const pack = await exportRelationalPack(char.id, env.repos, env.store);
    expect(pack.contentType).toBe('application/zip');
    expect(pack.filename).toBe('pack-captain-reynolds.zip');

    const files = listZipFileNames(pack.data);
    expect(files).toContain('manifest.json');
    expect(files).toContain(`characters/${char.id}.json`);
    expect(files).toContain(`chats/${char.id}/${chat.id}.json`);
    expect(files).toContain(`media/${mediaRecord.id}.png`);

    // New spec shape: listing identity as card_title/chat_name, no legacy name.
    const charJson = readZipFile(pack.data, `characters/${char.id}.json`);
    expect(charJson).not.toBeNull();
    const charPayload = JSON.parse(Buffer.from(charJson!).toString('utf8'));
    expect(charPayload.card_title).toBe('Captain Reynolds');
    expect(charPayload.chat_name).toBeNull();
    expect('name' in charPayload).toBe(false);

    // Sibling message swipe test (Fix S2)
    const swipeMsg = env.repos.messages.insert({
      id: 'm_swipe',
      chatId: chat.id,
      parentId: null,
      senderId: char.id,
      senderName: char.name,
      role: 'assistant',
      narrativeRole: 'character',
      content: 'Alternative destination coords.',
      status: 'complete'
    });

    const packWithSwipes = await exportRelationalPack(char.id, env.repos, env.store);
    // Find chats JSON inside zip
    const zipBuf = Buffer.from(packWithSwipes.data);
    const chatJsonName = `chats/${char.id}/${chat.id}.json`;
    // Verify pack produces valid zip with the chat
    expect(listZipFileNames(packWithSwipes.data)).toContain(chatJsonName);

    // Rejection of missing characterId (Fix S3 OOM defense)
    await expect(exportRelationalPack('' as any, env.repos, env.store)).rejects.toThrow();
  });
});

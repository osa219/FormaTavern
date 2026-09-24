import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { openTestDb, type TestDbInstance } from '../helpers';
import { runMigrations } from '../../src/db/migrate';
import { createRepositories } from '../../src/db/repositories';
import { eldrin } from '../../src/db/seeds/characters';
import { defaultPersona } from '../../src/db/seeds/personas';
import type { AssetRecord } from '../../src/db/contracts';

describe('SQLiteAssetRepository', () => {
  let inst: TestDbInstance;

  beforeEach(() => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);
    repos.characters.upsert(eldrin);
    repos.personas.upsert(defaultPersona);
  });

  afterEach(() => {
    inst?.cleanup();
  });

  const dummyAsset1: AssetRecord = {
    id: 'a'.repeat(64),
    mime: 'image/png',
    ext: '.png',
    size: 2048,
    width: 512,
    height: 512,
    path: `/assets/pool/${'a'.repeat(64)}.png`,
    createdAt: 1000
  };

  const dummyAsset2: AssetRecord = {
    id: 'b'.repeat(64),
    mime: 'image/webp',
    ext: '.webp',
    size: 4096,
    width: 1024,
    height: 1024,
    path: `/assets/pool/${'b'.repeat(64)}.webp`,
    createdAt: 2000
  };

  it('inserts, retrieves, checks existence, counts, lists, and deletes assets', () => {
    const repos = createRepositories(inst.db);
    expect(repos.assets.count()).toBe(0);
    expect(repos.assets.has(dummyAsset1.id)).toBe(false);
    expect(repos.assets.get(dummyAsset1.id)).toBeNull();

    repos.assets.insert(dummyAsset1);
    expect(repos.assets.count()).toBe(1);
    expect(repos.assets.has(dummyAsset1.id)).toBe(true);

    const fetched = repos.assets.get(dummyAsset1.id);
    expect(fetched).toEqual(dummyAsset1);

    // Upsert behavior on conflict
    const updatedAsset1: AssetRecord = {
      ...dummyAsset1,
      size: 3000,
      width: 600,
      height: 600
    };
    repos.assets.insert(updatedAsset1);
    expect(repos.assets.count()).toBe(1);
    expect(repos.assets.get(dummyAsset1.id)!.size).toBe(3000);

    repos.assets.insert(dummyAsset2);
    expect(repos.assets.count()).toBe(2);

    const list = repos.assets.list({ limit: 10 });
    expect(list.length).toBe(2);
    // Ordered by created_at DESC
    expect(list[0].id).toBe(dummyAsset2.id);
    expect(list[1].id).toBe(dummyAsset1.id);

    // Delete
    expect(repos.assets.delete(dummyAsset2.id)).toBe(true);
    expect(repos.assets.count()).toBe(1);
    expect(repos.assets.delete('nonexistent')).toBe(false);
  });

  it('manages character asset bindings and enforces foreign key cascades and restrictions', () => {
    const repos = createRepositories(inst.db);
    repos.assets.insert(dummyAsset1);
    repos.assets.insert(dummyAsset2);

    repos.assets.bindCharacterAsset({
      id: 'ca-1',
      characterId: eldrin.id,
      assetId: dummyAsset1.id,
      role: 'gallery',
      label: 'Portrait 1',
      sortOrder: 0,
      createdAt: 1000
    });

    repos.assets.bindCharacterAsset({
      id: 'ca-2',
      characterId: eldrin.id,
      assetId: dummyAsset2.id,
      role: 'gallery',
      label: 'Portrait 2',
      sortOrder: 1,
      createdAt: 1100
    });

    repos.assets.bindCharacterAsset({
      id: 'ca-3',
      characterId: eldrin.id,
      assetId: dummyAsset1.id,
      role: 'sprite',
      label: 'Happy',
      sortOrder: 0,
      createdAt: 1200
    });

    // Query all bindings for character
    const allBindings = repos.assets.getCharacterAssets(eldrin.id);
    expect(allBindings.length).toBe(3);

    // Query filtered by role
    const galleries = repos.assets.getCharacterAssets(eldrin.id, 'gallery');
    expect(galleries.length).toBe(2);
    expect(galleries[0].id).toBe('ca-1');
    expect(galleries[1].id).toBe('ca-2');

    const sprites = repos.assets.getCharacterAssets(eldrin.id, 'sprite');
    expect(sprites.length).toBe(1);
    expect(sprites[0].label).toBe('Happy');

    // RESTRICT: deleting dummyAsset1 from assets must fail because ca-1 and ca-3 reference it
    expect(() => repos.assets.delete(dummyAsset1.id)).toThrow();

    // Delete character assets by role
    repos.assets.deleteCharacterAssets(eldrin.id, 'sprite');
    expect(repos.assets.getCharacterAssets(eldrin.id, 'sprite').length).toBe(0);
    expect(repos.assets.getCharacterAssets(eldrin.id).length).toBe(2);

    // Cascade delete: removing the character should cascade delete character_assets
    repos.characters.remove(eldrin.id);
    expect(repos.assets.getCharacterAssets(eldrin.id).length).toBe(0);

    // Now deleting dummyAsset1 succeeds
    expect(repos.assets.delete(dummyAsset1.id)).toBe(true);
  });

  it('manages message asset bindings and cascades on message deletion', () => {
    const repos = createRepositories(inst.db);
    repos.assets.insert(dummyAsset1);

    const chat = repos.chats.create({
      id: 'chat-test-assets',
      title: 'Asset Test Chat',
      primaryCharacterId: eldrin.id,
      activePersonaId: defaultPersona.id
    });

    const msg = repos.messages.insert({
      id: 'msg-01',
      chatId: chat.id,
      parentId: null,
      role: 'user',
      narrativeRole: 'persona',
      content: 'Here is an image: media://' + dummyAsset1.id
    });

    repos.assets.bindMessageAsset(msg.id, dummyAsset1.id);
    // Duplicate bind is idempotent
    repos.assets.bindMessageAsset(msg.id, dummyAsset1.id);

    const msgAssets = repos.assets.getMessageAssets(msg.id);
    expect(msgAssets).toEqual([dummyAsset1.id]);

    // RESTRICT: deleting dummyAsset1 from assets must fail because msg-01 references it
    expect(() => repos.assets.delete(dummyAsset1.id)).toThrow();

    // Cascade delete on message removal
    repos.messages.remove(msg.id);
    expect(repos.assets.getMessageAssets(msg.id).length).toBe(0);

    // Now deleting dummyAsset1 succeeds
    expect(repos.assets.delete(dummyAsset1.id)).toBe(true);
  });
});

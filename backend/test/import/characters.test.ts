import { describe, it, expect, afterEach } from 'bun:test';
import { createHash } from 'node:crypto';
import { createTestImportEnv, makePng, type TestImportEnv } from './testUtils';

describe('CustomEngine Character Import', () => {
  let env: TestImportEnv;

  afterEach(async () => {
    if (env) {
      await env.cleanup();
    }
  });

  it('mints slug and handles collision with -2 suffix', async () => {
    env = await createTestImportEnv();

    const char1 = {
      id: 'uuid-1',
      name: 'Luna Star',
      description: 'First Luna',
      personality: 'Kind',
      scenario: 'Space',
      first_message: 'Hello'
    };

    const char2 = {
      id: 'uuid-2',
      name: 'Luna Star',
      description: 'Second Luna',
      personality: 'Fiery',
      scenario: 'Moon',
      first_message: 'Hi'
    };

    await env.writeCharacter(char1);
    await env.writeCharacter(char2);

    const report = await env.service.sync(env.sourceDir);
    expect(report.insertedChars).toBe(2);

    const c1 = env.repos.characters.findByProvenance('custom_engine', 'uuid-1');
    const c2 = env.repos.characters.findByProvenance('custom_engine', 'uuid-2');

    expect(c1).not.toBeNull();
    expect(c2).not.toBeNull();
    expect(c1!.id).toBe('luna-star');
    expect(c2!.id).toBe('luna-star-2');
  });

  it('stores emoji tags in metadata.import.tagsRaw and excludes from character_tags', async () => {
    env = await createTestImportEnv();

    const char = {
      id: 'uuid-emoji-tag',
      name: 'Sarah',
      description: 'A friendly girl',
      personality: 'Cheerful',
      scenario: 'Town',
      first_message: 'Hello there!',
      tags: ['👩‍🦰 Female', 'rpg', 'adventure']
    };

    await env.writeCharacter(char);

    const report = await env.service.sync(env.sourceDir);
    expect(report.insertedChars).toBe(1);

    const card = env.repos.characters.findByProvenance('custom_engine', 'uuid-emoji-tag');
    expect(card).not.toBeNull();

    // Normalized tags in card.tags
    expect(card!.tags).toContain('rpg');
    expect(card!.tags).toContain('adventure');
    expect(card!.tags).not.toContain('👩‍🦰 Female');

    // Stored raw tags in metadata.import.tagsRaw
    expect(card!.metadata?.import?.tagsRaw).toEqual(['👩‍🦰 Female', 'rpg', 'adventure']);
  });

  it('preserves all 13 alternate greetings in order', async () => {
    env = await createTestImportEnv();

    const alternates = Array.from({ length: 13 }, (_, i) => `Alternate greeting #${i + 1}`);

    const char = {
      id: 'uuid-13-alt',
      name: 'Greeting Master',
      description: 'Many greetings',
      personality: 'Varied',
      scenario: 'Crossroads',
      first_message: 'Default greeting',
      alternate_greetings: alternates
    };

    await env.writeCharacter(char);

    const report = await env.service.sync(env.sourceDir);
    expect(report.insertedChars).toBe(1);

    const card = env.repos.characters.findByProvenance('custom_engine', 'uuid-13-alt');
    expect(card).not.toBeNull();
    expect(card!.alternateGreetings).toBeDefined();
    expect(card!.alternateGreetings!.length).toBe(13);
    expect(card!.alternateGreetings![0]).toBe('Alternate greeting #1');
    expect(card!.alternateGreetings![12]).toBe('Alternate greeting #13');
  });

  it('handles avatar-less card with null avatar and imports card with avatar into pool', async () => {
    env = await createTestImportEnv();

    // Avatar-less card
    const charNoAvatar = {
      id: 'uuid-no-avatar',
      name: 'Faceless',
      description: 'No face',
      personality: 'Mysterious',
      scenario: 'Void',
      first_message: '...',
      avatar_hash: null
    };

    // Card with avatar
    const pngBytes = makePng(16, 16);
    const hash = createHash('sha256').update(pngBytes).digest('hex').toLowerCase();
    await env.writeMedia(hash, pngBytes, '.png');

    const charWithAvatar = {
      id: 'uuid-with-avatar',
      name: 'Faced',
      description: 'Has a face',
      personality: 'Expressive',
      scenario: 'Portraits',
      first_message: 'Look at me',
      avatar_hash: hash
    };

    await env.writeCharacter(charNoAvatar);
    await env.writeCharacter(charWithAvatar);

    const report = await env.service.sync(env.sourceDir);
    expect(report.insertedChars).toBe(2);
    expect(report.copiedBlobs).toBe(1);

    const c1 = env.repos.characters.findByProvenance('custom_engine', 'uuid-no-avatar');
    expect(c1!.avatar).toBeUndefined();

    const c2 = env.repos.characters.findByProvenance('custom_engine', 'uuid-with-avatar');
    expect(c2!.avatar).toBe(`/assets/pool/${hash}.png`);

    // Verify character_assets binding
    const bindings = env.repos.assets.getCharacterAssets(c2!.id, 'avatar');
    expect(bindings.length).toBe(1);
    expect(bindings[0].assetId).toBe(hash);
  });

  it('skips unchanged character and updates modified character on re-sync (X1)', async () => {
    env = await createTestImportEnv();

    const char = {
      id: 'uuid-skip-test',
      name: 'Static Character',
      description: 'Does not change',
      personality: 'Stable',
      scenario: 'Lab',
      first_message: 'Still here'
    };

    await env.writeCharacter(char);

    // Initial sync
    const report1 = await env.service.sync(env.sourceDir);
    expect(report1.insertedChars).toBe(1);
    expect(report1.skipped).toBe(0);

    const initialCard = env.repos.characters.findByProvenance('custom_engine', 'uuid-skip-test');
    expect(initialCard).not.toBeNull();
    const initialUpdatedAt = initialCard!.updatedAt;

    // Second sync without modifications -> MUST skip
    const report2 = await env.service.sync(env.sourceDir);
    expect(report2.scanned).toBe(1);
    expect(report2.skipped).toBe(1);
    expect(report2.insertedChars).toBe(0);
    expect(report2.updatedChars).toBe(0);

    const cardAfterSkip = env.repos.characters.findByProvenance('custom_engine', 'uuid-skip-test');
    expect(cardAfterSkip!.updatedAt).toBe(initialUpdatedAt);

    // Modify character description
    await Bun.sleep(10); // ensure timestamp ticks if updated
    const modifiedChar = {
      ...char,
      description: 'Now modified with new powers'
    };
    await env.writeCharacter(modifiedChar);

    // Third sync -> MUST update
    const report3 = await env.service.sync(env.sourceDir);
    expect(report3.scanned).toBe(1);
    expect(report3.skipped).toBe(0);
    expect(report3.insertedChars).toBe(0);
    expect(report3.updatedChars).toBe(1);

    const updatedCard = env.repos.characters.findByProvenance('custom_engine', 'uuid-skip-test');
    // Source description is showcase content: updates land in showcase,
    // lore description stays empty so prompt Block 2 is silent.
    expect(updatedCard!.showcase).toContain('Now modified with new powers');
    expect(updatedCard!.description).toBeFalsy();
    expect(updatedCard!.id).toBe(initialCard!.id); // Keeps same slug ID!
  });

  it('routes source description to showcase and keeps lore description empty', async () => {
    env = await createTestImportEnv();

    const char = {
      id: 'uuid-showcase-route',
      name: 'Shizuku',
      card_title: 'Shizuku - Your Neighbor',
      description: '<p style="text-align: center;">Your shy neighbor made you tea...</p>',
      personality: 'Shy and kind',
      scenario: 'Neighborhood',
      first_message: 'Hi...',
      creator_notes: 'Remastered by Necoza'
    };

    await env.writeCharacter(char);

    const report = await env.service.sync(env.sourceDir);
    expect(report.insertedChars).toBe(1);

    const card = env.repos.characters.findByProvenance('custom_engine', 'uuid-showcase-route');
    expect(card).not.toBeNull();
    expect(card!.description).toBeFalsy();
    expect(card!.showcase).toContain('Your shy neighbor made you tea');
    expect(card!.showcase).toContain('Author notes');
    expect(card!.showcase).toContain('Remastered by Necoza');
    expect(card!.personality).toBe('Shy and kind');
    expect(card!.metadata?.import?.sourceDescription).toBe(char.description);
  });

  it('clamps oversized source blurbs to the 65_536 showcase limit', async () => {
    env = await createTestImportEnv();

    const char = {
      id: 'uuid-long-blurb',
      name: 'Verbose',
      description: 'x'.repeat(70_000),
      personality: 'Talkative',
      scenario: 'Library',
      first_message: 'Hello'
    };

    await env.writeCharacter(char);

    const report = await env.service.sync(env.sourceDir);
    expect(report.insertedChars).toBe(1);

    const card = env.repos.characters.findByProvenance('custom_engine', 'uuid-long-blurb');
    expect(card).not.toBeNull();
    expect(card!.showcase!.length).toBeLessThanOrEqual(65_536);
    expect(card!.description).toBeFalsy();
  });

  it('self-heals legacy rows: moves lore description to showcase on re-sync', async () => {
    env = await createTestImportEnv();

    // Legacy row as written by mapping v1 (source blurb stored as lore).
    const now = Date.now();
    env.inst.db.run(
      `INSERT INTO characters (id, name, style, created_at, updated_at, origin, origin_id, origin_hash, description, showcase)
       VALUES (?, ?, ?, ?, ?, 'custom_engine', ?, ?, ?, NULL);`,
      [
        'legacy-shizuku',
        'Shizuku',
        JSON.stringify({}),
        now,
        now,
        'uuid-legacy',
        'stale-hash-from-v1',
        'Old lore text'
      ]
    );

    const char = {
      id: 'uuid-legacy',
      name: 'Shizuku',
      description: '<p>Your shy neighbor made you tea...</p>',
      personality: 'Shy',
      scenario: 'Doorway',
      first_message: 'Hi...'
    };
    await env.writeCharacter(char);

    const report = await env.service.sync(env.sourceDir);
    expect(report.updatedChars).toBe(1);
    expect(report.skipped).toBe(0);

    const card = env.repos.characters.findByProvenance('custom_engine', 'uuid-legacy');
    expect(card).not.toBeNull();
    expect(card!.id).toBe('legacy-shizuku');
    expect(card!.description).toBeFalsy();
    expect(card!.showcase).toContain('Your shy neighbor made you tea');
  });
});

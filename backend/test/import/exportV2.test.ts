import { describe, it, expect, afterEach } from 'bun:test';
import { createTestImportEnv, type TestImportEnv } from './testUtils';
import { importV2Card, exportV2Card } from '../../src/import/v2/service';
import { createMinimalPng, embedPngTextChunk, extractPngTextChunks, isPng } from '../../src/import/v2/png';

describe('TavernCard V2 Import & Export (Slice C & Invariant X8)', () => {
  let env: TestImportEnv;

  afterEach(async () => {
    if (env) {
      await env.cleanup();
    }
  });

  it('imports V2 card from JSON and exports back to valid V2 JSON', async () => {
    env = await createTestImportEnv();

    const sampleV2 = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'Aria Whisper',
        description: 'A gentle bard who wanders the realm singing forgotten tales.',
        personality: 'Gentle, curious, observant, soft-spoken.',
        scenario: 'You meet Aria beside a quiet camp fire at dusk.',
        first_mes: 'May I share your fire, traveler?',
        mes_example: '<START>\n{{user}}: Who are you?\n{{char}}: Just a wanderer with a song.',
        creator: 'BardCraft',
        character_version: '1.2.0',
        alternate_greetings: [
          'The stars are bright tonight, friend.',
          'Listen closely... the wind has a story to tell.'
        ],
        tags: ['fantasy', 'bard', 'traveler'],
        system_prompt: 'Stay in character as Aria at all times.',
        creator_notes: 'Created for fantasy roleplay.'
      }
    };

    const jsonBytes = Buffer.from(JSON.stringify(sampleV2), 'utf8');
    const importedCard = await importV2Card(jsonBytes, 'aria.json', env.repos, env.store);

    expect(importedCard.name).toBe('Aria Whisper');
    expect(importedCard.description).toBe(sampleV2.data.description);
    expect(importedCard.personality).toBe(sampleV2.data.personality);
    expect(importedCard.scenario).toBe(sampleV2.data.scenario);
    expect(importedCard.firstMessage).toBe(sampleV2.data.first_mes);
    expect(importedCard.exampleDialogue).toBe(sampleV2.data.mes_example);
    expect(importedCard.alternateGreetings).toEqual(sampleV2.data.alternate_greetings);
    expect(importedCard.tags).toEqual(['fantasy', 'bard', 'traveler']);

    // Export as JSON
    const exported = await exportV2Card(importedCard.id, env.repos, env.store, 'json');
    expect(exported.contentType).toBe('application/json; charset=utf-8');
    expect(exported.filename).toBe('aria-whisper.json');

    const exportedJson = JSON.parse(exported.data as string);
    expect(exportedJson.spec).toBe('chara_card_v2');
    expect(exportedJson.data.name).toBe(importedCard.name);
    expect(exportedJson.data.description).toBe(importedCard.description);
    expect(exportedJson.data.personality).toBe(importedCard.personality);
    expect(exportedJson.data.scenario).toBe(importedCard.scenario);
    expect(exportedJson.data.first_mes).toBe(importedCard.firstMessage);
    expect(exportedJson.data.alternate_greetings).toEqual(importedCard.alternateGreetings);
  });

  it('imports V2 card from PNG tEXt chunk and exports to PNG preserving avatar and round-tripping fields', async () => {
    env = await createTestImportEnv();

    const sampleV2 = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'Seraphina',
        description: 'An ethereal knight in silver armor.',
        personality: 'Noble, steadfast, righteous.',
        scenario: 'Guarding the gates of the ancient citadel.',
        first_mes: 'State your name and purpose, stranger.',
        mes_example: '<START>\n{{user}}: Open the gates.\n{{char}}: Only the worthy may enter.',
        alternate_greetings: ['Halt! Who goes there?'],
        tags: ['knight', 'guardian']
      }
    };

    const basePng = createMinimalPng();
    const base64Payload = Buffer.from(JSON.stringify(sampleV2), 'utf8').toString('base64');
    const embeddedPng = embedPngTextChunk(basePng, 'ccv3', base64Payload);

    // Import from PNG
    const importedCard = await importV2Card(embeddedPng, 'seraphina.png', env.repos, env.store);
    expect(importedCard.name).toBe('Seraphina');
    expect(importedCard.avatar).toBeDefined();
    expect(importedCard.avatar).toMatch(/^\/assets\/pool\//);

    // Verify avatar asset binding was created
    const assets = env.repos.assets.getCharacterAssets(importedCard.id);
    expect(assets.length).toBeGreaterThan(0);
    expect(assets[0].role).toBe('avatar');

    // Export to PNG
    const exportResult = await exportV2Card(importedCard.id, env.repos, env.store, 'png');
    expect(exportResult.contentType).toBe('image/png');
    expect(exportResult.filename).toBe('seraphina.png');

    const exportedBytes = exportResult.data as Uint8Array;
    expect(isPng(exportedBytes)).toBe(true);

    const chunks = extractPngTextChunks(exportedBytes);
    expect(chunks.has('ccv3') || chunks.has('chara')).toBe(true);

    // Re-import the exported PNG (roundtrip proof)
    const reimported = await importV2Card(exportedBytes, 'seraphina_reimport.png', env.repos, env.store);
    expect(reimported.name).toBe(importedCard.name);
    expect(reimported.description).toBe(importedCard.description);
    expect(reimported.personality).toBe(importedCard.personality);
    expect(reimported.scenario).toBe(importedCard.scenario);
    expect(reimported.firstMessage).toBe(importedCard.firstMessage);
    expect(reimported.exampleDialogue).toBe(importedCard.exampleDialogue);
    expect(reimported.alternateGreetings).toEqual(importedCard.alternateGreetings);
  });

  it('guarantees Invariant X8: export never mutates pool bytes on disk', async () => {
    env = await createTestImportEnv();

    const sampleV2 = {
      spec: 'chara_card_v2',
      data: {
        name: 'Pool Guard',
        description: 'Guards the pool invariant.',
        personality: 'Watchful',
        scenario: 'Storage',
        first_mes: 'Ready.'
      }
    };

    const basePng = createMinimalPng();
    const base64 = Buffer.from(JSON.stringify(sampleV2), 'utf8').toString('base64');
    const png = embedPngTextChunk(basePng, 'chara', base64);

    const card = await importV2Card(png, 'guard.png', env.repos, env.store);
    const hashMatch = card.avatar!.match(/\/([a-f0-9]{64})\./);
    const blobHash = hashMatch![1];

    const diskPath = env.store.getDiskPath(card.avatar!);
    const { readFileSync } = await import('node:fs');
    const beforeBytes = readFileSync(diskPath!);

    // Export multiple times in different formats
    await exportV2Card(card.id, env.repos, env.store, 'png');
    await exportV2Card(card.id, env.repos, env.store, 'json');
    await exportV2Card(card.id, env.repos, env.store, 'png');

    const afterBytes = readFileSync(diskPath!);
    expect(Buffer.compare(beforeBytes, afterBytes)).toBe(0);
  });
});

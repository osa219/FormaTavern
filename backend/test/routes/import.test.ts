import { describe, it, expect, afterEach } from 'bun:test';
import { setupTestApp } from './helpers';
import { FsAssetStore } from '../../src/assets/store';
import { CustomEngineImportService } from '../../src/import/customEngine';
import { acquireSyncLock } from '../../src/import/customEngine/guard';
import { DEFAULT_CHARACTER_THEME } from '@formatavern/shared';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ulid } from 'ulid';

describe('Import & Export API Routes (Step 5)', () => {
  let tmpAssetDir: string | undefined;
  let tmpSourceDir: string | undefined;

  afterEach(async () => {
    if (tmpAssetDir) {
      await rm(tmpAssetDir, { recursive: true, force: true });
      tmpAssetDir = undefined;
    }
    if (tmpSourceDir) {
      await rm(tmpSourceDir, { recursive: true, force: true });
      tmpSourceDir = undefined;
    }
  });

  async function createFixtureEnv() {
    tmpAssetDir = await mkdtemp(join(tmpdir(), 'ft-route-assets-'));
    tmpSourceDir = await mkdtemp(join(tmpdir(), 'ft-route-source-'));

    await mkdir(join(tmpSourceDir, 'characters'), { recursive: true });
    await mkdir(join(tmpSourceDir, 'chats'), { recursive: true });
    await mkdir(join(tmpSourceDir, 'media'), { recursive: true });

    const assets = new FsAssetStore(tmpAssetDir);
    const { app, db, repos } = setupTestApp({
      assets,
      allowedImportRoots: [tmpSourceDir],
      createImportService: (database, repositories) =>
        new CustomEngineImportService(
          database,
          assets,
          repositories.assets,
          repositories.characters,
          repositories.chats,
          repositories.messages,
          repositories.personas
        )
    });

    return { app, repos, assets, tmpSourceDir };
  }

  it('rejects path traversal or disallowed paths with 403 forbidden', async () => {
    const { app } = await createFixtureEnv();

    const res = await app.handle(
      new Request('http://127.0.0.1/api/import/custom-engine/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: '../../etc/forbidden-directory' })
      })
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('forbidden');
  });

  it('returns 200 with SyncReport on ?wait=true and 202 with runId on background sync', async () => {
    const { app, tmpSourceDir } = await createFixtureEnv();

    // 1. Synchronous wait
    const syncRes = await app.handle(
      new Request('http://127.0.0.1/api/import/custom-engine/sync?wait=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: tmpSourceDir })
      })
    );

    expect(syncRes.status).toBe(200);
    const report = (await syncRes.json()) as any;
    expect(report.scanned).toBeDefined();
    expect(report.durationMs).toBeGreaterThanOrEqual(0);

    // 2. Background run (202)
    const asyncRes = await app.handle(
      new Request('http://127.0.0.1/api/import/custom-engine/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: tmpSourceDir })
      })
    );

    expect(asyncRes.status).toBe(202);
    const asyncBody = (await asyncRes.json()) as any;
    expect(asyncBody.runId).toBeDefined();

    // Poll run status
    const pollRes = await app.handle(new Request(`http://127.0.0.1/api/import/runs/${asyncBody.runId}`));
    expect(pollRes.status).toBe(200);
    const pollBody = (await pollRes.json()) as any;
    expect(['running', 'done']).toContain(pollBody.status);

    // Unknown run returns 404
    const notFoundRes = await app.handle(new Request('http://127.0.0.1/api/import/runs/run_unknown_id'));
    expect(notFoundRes.status).toBe(404);
  });

  it('handles single character file import via POST /api/import/custom-engine/single', async () => {
    const { app } = await createFixtureEnv();

    const charJson = JSON.stringify({
      id: 'c-single-route-test',
      name: 'Single Route Hero',
      description: 'Imported via multipart single',
      personality: 'Bold',
      scenario: 'Tavern',
      first_message: 'I am here.'
    });

    const formData = new FormData();
    const blob = new Blob([charJson], { type: 'application/json' });
    formData.append('file', blob, 'c-single-route-test.json');

    const res = await app.handle(
      new Request('http://127.0.0.1/api/import/custom-engine/single', {
        method: 'POST',
        body: formData
      })
    );

    expect(res.status).toBe(200);
    const report = (await res.json()) as any;
    expect(report.insertedChars).toBe(1);
  });

  it('imports TavernCard V2 JSON via POST /api/import/v2', async () => {
    const { app } = await createFixtureEnv();

    const v2Json = JSON.stringify({
      spec: 'chara_card_v2',
      data: {
        name: 'V2 Route Paladin',
        description: 'Defender of the realm',
        personality: 'Noble',
        scenario: 'Fortress',
        first_mes: 'Greetings friend.'
      }
    });

    const formData = new FormData();
    const blob = new Blob([v2Json], { type: 'application/json' });
    formData.append('file', blob, 'paladin.json');

    const res = await app.handle(
      new Request('http://127.0.0.1/api/import/v2', {
        method: 'POST',
        body: formData
      })
    );

    expect(res.status).toBe(201);
    const created = (await res.json()) as any;
    expect(created.name).toBe('V2 Route Paladin');
  });

  it('imports SillyTavern JSONL chat via POST /api/import/jsonl', async () => {
    const { app, repos } = await createFixtureEnv();

    const char = repos.characters.create({
      name: 'Sage of Routes',
      description: 'Answers all queries',
      personality: 'Wise',
      scenario: 'Archway',
      firstMessage: 'Enter.',
      style: DEFAULT_CHARACTER_THEME
    });

    const lines = [
      JSON.stringify({ user_name: 'Traveler', character_name: 'Sage of Routes' }),
      JSON.stringify({ name: 'Traveler', is_user: true, mes: 'Where is the road?' }),
      JSON.stringify({ name: 'Sage of Routes', is_user: false, mes: 'Before you.' })
    ];

    const formData = new FormData();
    formData.append('file', new Blob([lines.join('\n')], { type: 'application/octet-stream' }), 'chat.jsonl');
    formData.append('characterId', char.id);

    const res = await app.handle(
      new Request('http://127.0.0.1/api/import/jsonl', {
        method: 'POST',
        body: formData
      })
    );

    expect(res.status).toBe(201);
    const chat = (await res.json()) as any;
    expect(chat.primaryCharacterId).toBe(char.id);
  });

  it('serves character export endpoints: .png (json/png), .charx, and chat export .jsonl', async () => {
    const { app, repos } = await createFixtureEnv();

    const char = repos.characters.create({
      name: 'Export Star',
      description: 'Ready for export',
      personality: 'Radiant',
      scenario: 'Sky',
      firstMessage: 'Look up.',
      style: DEFAULT_CHARACTER_THEME
    });

    // 1. Export as V2 JSON
    const exportJsonRes = await app.handle(
      new Request(`http://127.0.0.1/api/characters/${char.id}/export.png?format=json`)
    );
    expect(exportJsonRes.status).toBe(200);
    const v2Json = (await exportJsonRes.json()) as any;
    expect(v2Json.spec).toBe('chara_card_v2');
    expect(v2Json.data.name).toBe('Export Star');

    // 2. Export as V2 PNG
    const exportPngRes = await app.handle(
      new Request(`http://127.0.0.1/api/characters/${char.id}/export.png?format=png`)
    );
    expect(exportPngRes.status).toBe(200);
    expect(exportPngRes.headers.get('content-type')).toBe('image/png');

    // 3. Export as CharX
    const exportCharxRes = await app.handle(
      new Request(`http://127.0.0.1/api/characters/${char.id}/export.charx`)
    );
    expect(exportCharxRes.status).toBe(200);
    expect(exportCharxRes.headers.get('content-type')).toBe('application/x-charx+zip');

    // 4. Export Chat as JSONL
    const persona = repos.personas.getDefault() || repos.personas.list()[0];
    const chat = repos.chats.create({
      id: 'c_' + ulid().toLowerCase(),
      title: 'Starry Conversation',
      primaryCharacterId: char.id,
      activePersonaId: persona.id
    });
    const msg = repos.messages.insert({
      id: 'm_' + ulid().toLowerCase(),
      chatId: chat.id,
      parentId: null,
      senderId: char.id,
      senderName: char.name,
      role: 'assistant',
      narrativeRole: 'character',
      content: 'Hello traveler.',
      status: 'complete'
    });
    repos.chats.setActiveLeaf(chat.id, msg.id);

    const exportJsonlRes = await app.handle(
      new Request(`http://127.0.0.1/api/chats/${chat.id}/export.jsonl`)
    );
    expect(exportJsonlRes.status).toBe(200);
    const jsonlText = await exportJsonlRes.text();
    expect(jsonlText).toContain('Starry Conversation');
    expect(jsonlText).toContain('Hello traveler.');

    // 5. Export Relational Pack
    const exportPackRes = await app.handle(
      new Request(`http://127.0.0.1/api/export/relational-pack?characterId=${char.id}`)
    );
    expect(exportPackRes.status).toBe(200);
    expect(exportPackRes.headers.get('content-type')).toBe('application/zip');
  });
});

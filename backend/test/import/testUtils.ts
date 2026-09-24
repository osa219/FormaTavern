import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations } from '../../src/db/migrate';
import { createRepositories } from '../../src/db/repositories';
import { FsAssetStore } from '../../src/assets/store';
import { CustomEngineImportService } from '../../src/import/customEngine';
import { openTestDb, type TestDbInstance } from '../helpers';

// Helper: construct sample 10x10 PNG
export function makePng(width = 10, height = 10): Uint8Array {
  const buf = new Uint8Array(33);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  buf.set([0x00, 0x00, 0x00, 0x0d], 8);
  buf.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(buf.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  buf.set([0x08, 0x06, 0x00, 0x00, 0x00], 24);
  return buf;
}

export interface TestImportEnv {
  inst: TestDbInstance;
  repos: ReturnType<typeof createRepositories>;
  store: FsAssetStore;
  service: CustomEngineImportService;
  assetsDir: string;
  sourceDir: string;
  writeCharacter: (char: any) => Promise<string>;
  writeChat: (chat: any) => Promise<string>;
  writeMedia: (hash: string, bytes: Uint8Array, ext?: string) => Promise<string>;
  cleanup: () => Promise<void>;
}

export async function createTestImportEnv(): Promise<TestImportEnv> {
  const inst = openTestDb(':memory:');
  runMigrations(inst.db);

  const assetsDir = await mkdtemp(join(tmpdir(), 'ft-import-assets-'));
  const sourceDir = await mkdtemp(join(tmpdir(), 'ft-import-source-'));

  await mkdir(join(sourceDir, 'characters'), { recursive: true });
  await mkdir(join(sourceDir, 'chats'), { recursive: true });
  await mkdir(join(sourceDir, 'media'), { recursive: true });

  const repos = createRepositories(inst.db);
  const store = new FsAssetStore(assetsDir);
  const service = new CustomEngineImportService(
    inst.db,
    store,
    repos.assets,
    repos.characters,
    repos.chats,
    repos.messages,
    repos.personas
  );

  const writeCharacter = async (char: any) => {
    const filename = `${char.id}.json`;
    const fullPath = join(sourceDir, 'characters', filename);
    await writeFile(fullPath, JSON.stringify(char, null, 2), 'utf8');
    return fullPath;
  };

  const writeChat = async (chat: any) => {
    const charSubdir = join(sourceDir, 'chats', chat.character_id);
    await mkdir(charSubdir, { recursive: true });
    const fullPath = join(charSubdir, `${chat.id}.json`);
    await writeFile(fullPath, JSON.stringify(chat, null, 2), 'utf8');
    return fullPath;
  };

  const writeMedia = async (hash: string, bytes: Uint8Array, ext = '.png') => {
    const fullPath = join(sourceDir, 'media', `${hash}${ext}`);
    await writeFile(fullPath, bytes);
    return fullPath;
  };

  const cleanup = async () => {
    inst.cleanup();
    try {
      await rm(assetsDir, { recursive: true, force: true });
    } catch {}
    try {
      await rm(sourceDir, { recursive: true, force: true });
    } catch {}
  };

  return {
    inst,
    repos,
    store,
    service,
    assetsDir,
    sourceDir,
    writeCharacter,
    writeChat,
    writeMedia,
    cleanup
  };
}

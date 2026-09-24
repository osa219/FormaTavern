import { join } from 'node:path';
import { readdirSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { DB_PATH, ASSETS_DIR, ASSETS_POOL_DIR } from '../src/db/paths';
import { openDatabase } from '../src/db/connection';
import { FsAssetStore } from '../src/assets/store';
import { extractMediaHashes } from '@formatavern/shared';

const isPoolMode = process.argv.includes('--pool');
const isDelete = process.argv.includes('--delete');

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function extractPoolHash(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null;
  const match = avatarUrl.match(/\/assets\/pool\/([0-9a-f]{64})\.[a-z0-9]+/i);
  return match ? match[1].toLowerCase() : null;
}

if (!isPoolMode) {
  const store = new FsAssetStore(ASSETS_DIR);
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  try {
    const count = await store.cleanStaleDrafts(ONE_DAY_MS);
    console.log(`[assets-gc] Cleaned ${count} stale draft directories older than 24h.`);
  } catch (err: any) {
    console.error('[assets-gc] Error cleaning draft directories:', err.message);
    process.exit(1);
  }
} else {
  let db;
  try {
    db = openDatabase(DB_PATH);
  } catch (err: any) {
    console.error(`[assets-gc] Failed to open database ${DB_PATH}:`, err.message);
    process.exit(1);
  }

  try {
    console.log(`[assets-gc] Scanning references across all 5 sources...`);
    const referencedHashes = new Set<string>();

    // 1. characters.avatar & inline media
    const characters = db
      .query(`SELECT avatar, description, first_message, alternate_greetings FROM characters;`)
      .all() as Array<{
      avatar: string | null;
      description: string;
      first_message: string;
      alternate_greetings: string | null;
    }>;

    for (const c of characters) {
      const avatarHash = extractPoolHash(c.avatar);
      if (avatarHash) referencedHashes.add(avatarHash);

      for (const h of extractMediaHashes(c.description)) referencedHashes.add(h);
      for (const h of extractMediaHashes(c.first_message)) referencedHashes.add(h);
      if (c.alternate_greetings) {
        for (const h of extractMediaHashes(c.alternate_greetings)) referencedHashes.add(h);
      }
    }

    // 2. personas.avatar
    const personas = db.query(`SELECT avatar FROM personas;`).all() as Array<{ avatar: string | null }>;
    for (const p of personas) {
      const avatarHash = extractPoolHash(p.avatar);
      if (avatarHash) referencedHashes.add(avatarHash);
    }

    // 3. character_assets
    const charAssets = db.query(`SELECT asset_id FROM character_assets;`).all() as Array<{ asset_id: string }>;
    for (const ca of charAssets) {
      referencedHashes.add(ca.asset_id.toLowerCase());
    }

    // 4. message_assets
    const msgAssets = db.query(`SELECT asset_id FROM message_assets;`).all() as Array<{ asset_id: string }>;
    for (const ma of msgAssets) {
      referencedHashes.add(ma.asset_id.toLowerCase());
    }

    // 5. messages inline media
    const messages = db.query(`SELECT content FROM messages;`).all() as Array<{ content: string }>;
    for (const m of messages) {
      for (const h of extractMediaHashes(m.content)) referencedHashes.add(h);
    }

    console.log(`[assets-gc] Found ${referencedHashes.size} unique referenced asset hashes.`);

    // Inspect DB assets table
    const allDbAssets = db.query(`SELECT id, path, size FROM assets;`).all() as Array<{
      id: string;
      path: string;
      size: number;
    }>;

    const unreferencedDbAssets: Array<{ id: string; path: string; size: number }> = [];
    let referencedDbBytes = 0;
    let unreferencedDbBytes = 0;

    for (const a of allDbAssets) {
      const id = a.id.toLowerCase();
      if (referencedHashes.has(id)) {
        referencedDbBytes += a.size;
      } else {
        unreferencedDbAssets.push(a);
        unreferencedDbBytes += a.size;
      }
    }

    // Inspect disk pool files
    const diskFiles = existsSync(ASSETS_POOL_DIR)
      ? readdirSync(ASSETS_POOL_DIR).filter((f) => !f.startsWith('.'))
      : [];

    const unreferencedDiskFiles: Array<{ name: string; fullPath: string; size: number }> = [];
    let unreferencedDiskBytes = 0;

    for (const f of diskFiles) {
      const dotIdx = f.lastIndexOf('.');
      const hash = (dotIdx > 0 ? f.slice(0, dotIdx) : f).toLowerCase();
      const fullPath = join(ASSETS_POOL_DIR, f);
      const st = statSync(fullPath);
      if (!referencedHashes.has(hash)) {
        unreferencedDiskFiles.push({ name: f, fullPath, size: st.size });
        unreferencedDiskBytes += st.size;
      }
    }

    console.log(
      `[assets-gc] Pool status: ${referencedHashes.size} referenced, ` +
        `${unreferencedDbAssets.length} unreferenced in DB (${formatBytes(unreferencedDbBytes)}), ` +
        `${unreferencedDiskFiles.length} unreferenced on disk (${formatBytes(unreferencedDiskBytes)})`
    );

    if (!isDelete) {
      console.log(`[assets-gc] Dry run complete. To delete unreferenced files and rows, run with --delete`);
    } else {
      console.log(`[assets-gc] Deleting unreferenced pool assets...`);

      // Unlink unreferenced disk files
      let unlinkedCount = 0;
      for (const uf of unreferencedDiskFiles) {
        try {
          unlinkSync(uf.fullPath);
          unlinkedCount++;
        } catch (e: any) {
          console.error(`[assets-gc] Failed to unlink ${uf.fullPath}:`, e.message);
        }
      }

      // Delete unreferenced DB rows
      let deletedDbCount = 0;
      if (unreferencedDbAssets.length > 0) {
        db.transaction(() => {
          const stmt = db.query(`DELETE FROM assets WHERE id = ?;`);
          for (const a of unreferencedDbAssets) {
            stmt.run(a.id);
            deletedDbCount++;
          }
        })();
      }

      console.log(
        `[assets-gc] Swept ${unlinkedCount} unreferenced files on disk and ${deletedDbCount} rows in DB.`
      );
    }
  } finally {
    db.close();
  }
}

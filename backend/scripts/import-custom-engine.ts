import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { DB_PATH, ASSETS_DIR } from '../src/db/paths';
import { openDatabase } from '../src/db/connection';
import { createRepositories } from '../src/db/repositories';
import { FsAssetStore } from '../src/assets/store';
import { CustomEngineImportService } from '../src/import/customEngine';

function printUsage() {
  console.log(`
FormaTavern — CustomEngine Import CLI

Usage:
  bun run import:custom-engine --root <path-to-custom-engine-dir> [options]
  bun run import:custom-engine --file <path-to-character-or-chat.json> [options]

Options:
  --dry-run               Calculate plan and print statistics without writing
  --limit <number>        Import at most N characters (for smoke tests)
  --character <originId>  Import a single character by its origin UUID and its chats
  --batch-size <number>   Batch size for SQLite transactions (default: 500)
  --help, -h              Show this help message
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  let root: string | undefined;
  let file: string | undefined;
  let dryRun = false;
  let limit: number | undefined;
  let characterOriginId: string | undefined;
  let batchSize = 500;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--root' && i + 1 < args.length) {
      root = args[++i];
    } else if (arg === '--file' && i + 1 < args.length) {
      file = args[++i];
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--limit' && i + 1 < args.length) {
      limit = parseInt(args[++i], 10);
    } else if (arg === '--character' && i + 1 < args.length) {
      characterOriginId = args[++i];
    } else if (arg === '--batch-size' && i + 1 < args.length) {
      batchSize = parseInt(args[++i], 10);
    }
  }

  // Default fallback if no path specified: check known export dir
  const defaultDir = 'S:/WorkSpace/Projects Workspace/Python/JAI_Migration/exports/custom_engine';
  if (!root && !file) {
    if (existsSync(defaultDir)) {
      console.log(`[import-custom-engine] No --root or --file specified. Defaulting to: ${defaultDir}`);
      root = defaultDir;
    } else {
      console.error('[import-custom-engine] Error: Missing --root or --file argument.');
      printUsage();
      process.exit(1);
    }
  }

  const targetPath = file ? resolve(file) : resolve(root!);
  if (!existsSync(targetPath)) {
    console.error(`[import-custom-engine] Error: Target path does not exist: ${targetPath}`);
    process.exit(1);
  }

  console.log('='.repeat(64));
  console.log(' FormaTavern — CustomEngine Import Subsystem');
  console.log('='.repeat(64));
  console.log(` Target Path : ${targetPath}`);
  console.log(` Mode        : ${dryRun ? 'DRY-RUN (planning only)' : 'LIVE SYNC'}`);
  if (limit) console.log(` Limit       : ${limit} characters`);
  if (characterOriginId) console.log(` Character   : ${characterOriginId}`);
  console.log(` Database    : ${DB_PATH}`);
  console.log(` Assets Dir  : ${ASSETS_DIR}`);
  console.log('-'.repeat(64));

  let db;
  try {
    db = openDatabase(DB_PATH);
  } catch (err: any) {
    console.error('[import-custom-engine] Failed to open database:', err.message);
    process.exit(1);
  }

  try {
    const repos = createRepositories(db);
    const assetStore = new FsAssetStore(ASSETS_DIR);

    const service = new CustomEngineImportService(
      db,
      assetStore,
      repos.assets,
      repos.characters,
      repos.chats,
      repos.messages,
      repos.personas
    );

    console.log('[import-custom-engine] Starting sync...');
    const report = await service.sync(targetPath, {
      root,
      file,
      dryRun,
      limit,
      characterOriginId,
      batchSize
    });

    console.log('\n' + '='.repeat(64));
    console.log(dryRun ? ' Sync Plan Summary (Dry-Run)' : ' Sync Execution Report');
    console.log('='.repeat(64));
    console.log(` Total Scanned      : ${report.scanned}`);
    console.log(` Skipped (Unchanged): ${report.skipped}`);
    console.log(` Characters Inserted: ${report.insertedChars}`);
    console.log(` Characters Updated : ${report.updatedChars}`);
    console.log(` Chats Inserted     : ${report.insertedChats}`);
    console.log(` Messages Reconciled: ${report.appendedMessages}`);
    console.log(` Blobs Copied       : ${report.copiedBlobs}`);
    console.log(` Blobs Reused       : ${report.reusedBlobs}`);
    console.log(` Missing Assets     : ${report.missingAssets.length}`);
    if (report.missingAssets.length > 0 && report.missingAssets.length <= 10) {
      console.log(`   Hashes: ${report.missingAssets.join(', ')}`);
    } else if (report.missingAssets.length > 10) {
      console.log(`   Sample: ${report.missingAssets.slice(0, 5).join(', ')} ... (+${report.missingAssets.length - 5} more)`);
    }
    console.log(` Quarantined Chats  : ${report.quarantinedChats.length}`);
    if (report.quarantinedChats.length > 0) {
      for (const qc of report.quarantinedChats.slice(0, 5)) {
        console.log(`   - Chat ${qc.chatId} (Character: ${qc.characterOriginId}, Reason: ${qc.reason})`);
      }
      if (report.quarantinedChats.length > 5) {
        console.log(`   ... (+${report.quarantinedChats.length - 5} more)`);
      }
    }
    console.log(` Duration           : ${report.durationMs}ms`);
    console.log('='.repeat(64));

    if (report.quarantinedChats.length > 0) {
      console.warn(`[import-custom-engine] Completed with ${report.quarantinedChats.length} quarantined chat(s).`);
      process.exit(2);
    } else {
      console.log('[import-custom-engine] Completed successfully.');
      process.exit(0);
    }
  } catch (err: any) {
    console.error('\n[import-custom-engine] Fatal error:', err.message);
    if (err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  } finally {
    db.close();
  }
}

main();

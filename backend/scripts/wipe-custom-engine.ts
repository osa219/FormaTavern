import { DB_PATH } from '../src/db/paths';
import { openDatabase } from '../src/db/connection';

/**
 * Bulk-removes all custom_engine imports (characters + their chats/messages)
 * ahead of a clean re-import. Pool blobs, personas, and native chats/cards
 * are preserved; the next sync re-links pool assets by content hash.
 *
 * openDatabase() enforces foreign_keys, so dependent rows (messages,
 * character_assets, character_tags) cascade. Never replicate this with a raw
 * Database handle: without the FK pragma the cascades silently do not fire
 * and the database is left with orphans across four tables.
 *
 * Usage: bun run wipe:custom-engine --yes
 */
async function main() {
  const args = process.argv.slice(2);
  if (!args.includes('--yes')) {
    console.log(`
FormaTavern — CustomEngine Wipe (destructive)

  Deletes every character with origin='custom_engine' plus their chats and
  messages. Pool blobs, personas, and native content are preserved.

  1. Back up first: copy formatavern.db aside (WAL checkpoints on clean exit).
  2. Run: bun run wipe:custom-engine --yes
  3. Re-import: bun run import:custom-engine --root <dir>
`);
    process.exit(2);
  }

  const db = openDatabase(DB_PATH);
  const ceChars = (db.query("SELECT COUNT(*) AS c FROM characters WHERE origin='custom_engine'").get() as any).c;
  const ceChats = (
    db
      .query(
        "SELECT COUNT(*) AS c FROM chats WHERE primary_character_id IN (SELECT id FROM characters WHERE origin='custom_engine')"
      )
      .get() as any
  ).c;
  console.log(`CustomEngine characters: ${ceChars}, their chats: ${ceChats}`);

  db.transaction(() => {
    db.run(
      "DELETE FROM chats WHERE primary_character_id IN (SELECT id FROM characters WHERE origin='custom_engine')"
    );
    db.run("DELETE FROM characters WHERE origin='custom_engine'");
  })();

  const remaining = (db.query("SELECT COUNT(*) AS c FROM characters WHERE origin='custom_engine'").get() as any).c;
  const violations = db.query('PRAGMA foreign_key_check').all();
  console.log(`Remaining custom_engine characters: ${remaining}`);
  console.log(`Foreign key violations: ${violations.length}`);
  if (remaining !== 0 || violations.length !== 0) {
    console.error('[wipe] ERROR: wipe incomplete');
    process.exit(1);
  }
  console.log('[wipe] Done. Run db:reindex if FTS parity matters before the next import.');
  db.close();
}

main();

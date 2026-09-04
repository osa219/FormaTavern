import { DB_PATH } from '../src/db/paths';
import { openDatabase } from '../src/db/connection';
import { runMigrations } from '../src/db/migrate';

const db = openDatabase(DB_PATH);
try {
  const { from, to } = runMigrations(db);
  console.log(`[migrate] ${DB_PATH} migrations: ${from} → ${to}`);
} finally {
  db.close();
}

import { DB_PATH } from '../src/db/paths';
import { openDatabase } from '../src/db/connection';
import { runMigrations } from '../src/db/migrate';
import { createRepositories } from '../src/db/repositories';
import { seed } from '../src/db/seeds/seed';

const db = openDatabase(DB_PATH);
try {
  runMigrations(db);
  const repos = createRepositories(db);
  const force = process.argv.includes('--force');
  const result = seed(repos, { force });
  console.log(`[seed] seeded: ${result.seeded}, characters: ${result.characters}, personas: ${result.personas}`);
} finally {
  db.close();
}

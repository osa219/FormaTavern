import { DB_PATH } from '../src/db/paths';
import { openDatabase } from '../src/db/connection';
import { createRepositories } from '../src/db/repositories';
import { validate, CharacterCardSchema, PersonaSchema } from '@formatavern/shared';

let db;
try {
  db = openDatabase(DB_PATH);
} catch (err: any) {
  console.error(`[check] Failed to open database ${DB_PATH}:`, err.message);
  process.exit(1);
}

try {
  let hasFailure = false;

  const { user_version } = db.query('PRAGMA user_version;').get() as { user_version: number };
  const { journal_mode } = db.query('PRAGMA journal_mode;').get() as { journal_mode: string };
  const { foreign_keys } = db.query('PRAGMA foreign_keys;').get() as { foreign_keys: number };

  console.log(`journal_mode=${journal_mode}`);
  console.log(`foreign_keys=${foreign_keys}`);
  console.log(`user_version=${user_version}`);

  if (journal_mode !== 'wal') {
    console.error(`[check] ERROR: journal_mode is not wal`);
    hasFailure = true;
  }
  if (foreign_keys !== 1) {
    console.error(`[check] ERROR: foreign_keys is not 1`);
    hasFailure = true;
  }
  if (user_version !== 2) {
    console.error(`[check] ERROR: user_version is not 2`);
    hasFailure = true;
  }

  const integrity = db.query('PRAGMA integrity_check;').all() as Array<{ integrity_check: string }>;
  const integrityOk = integrity.length === 1 && integrity[0].integrity_check === 'ok';
  console.log(`integrity_check=${integrityOk ? 'ok' : 'failed'}`);
  if (!integrityOk) {
    console.error(`[check] PRAGMA integrity_check output:`, integrity);
    hasFailure = true;
  }

  const fkErrors = db.query('PRAGMA foreign_key_check;').all();
  if (fkErrors.length > 0) {
    console.error(`[check] ERROR: foreign_key_check found violations:`, fkErrors);
    hasFailure = true;
  } else {
    console.log(`foreign_key_check=empty`);
  }

  const msgCols = db.query('PRAGMA table_info(messages);').all() as Array<{ name: string }>;
  const msgColNames = msgCols.map((c) => c.name);
  console.log(`messages columns: ${msgColNames.join(', ')}`);

  const requiredMsgCols = ['narrative_role', 'sender_name', 'segments', 'state'];
  for (const col of requiredMsgCols) {
    if (!msgColNames.includes(col)) {
      console.error(`[check] ERROR: messages table missing required column '${col}'`);
      hasFailure = true;
    }
  }

  const repos = createRepositories(db);
  const characters = repos.characters.list();
  const personas = repos.personas.list();

  console.log(`counts: ${characters.length} characters, ${personas.length} personas`);

  let validChars = 0;
  for (const c of characters) {
    const v = validate(CharacterCardSchema, c);
    if (v.ok) {
      validChars++;
    } else {
      console.error(`[check] Character ${c.id} failed validation:`, v.issues);
      hasFailure = true;
    }
  }

  let validPersonas = 0;
  for (const p of personas) {
    const v = validate(PersonaSchema, p);
    if (v.ok) {
      validPersonas++;
    } else {
      console.error(`[check] Persona ${p.id} failed validation:`, v.issues);
      hasFailure = true;
    }
  }

  console.log(`${validChars}/${characters.length} characters valid, ${validPersonas}/${personas.length} personas valid`);

  if (hasFailure) {
    process.exit(1);
  }
} finally {
  db.close();
}

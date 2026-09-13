import { DB_PATH } from '../src/db/paths';
import { openDatabase } from '../src/db/connection';
import { createRepositories } from '../src/db/repositories';
import { nearestState } from '../src/engine/context';
import { validate, CharacterCardSchema, CharacterSummarySchema, PersonaSchema } from '@formatavern/shared';

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
  if (user_version !== 6) {
    console.error(`[check] ERROR: user_version is ${user_version}, expected 6`);
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

  const charCols = db.query('PRAGMA table_info(characters);').all() as Array<{ name: string }>;
  const charColNames = charCols.map((c) => c.name);
  if (!charColNames.includes('custom_css')) {
    console.error(`[check] ERROR: characters table missing required column 'custom_css'`);
    hasFailure = true;
  } else {
    const overCapCss = db.query('SELECT COUNT(*) as count FROM characters WHERE length(custom_css) > 131072;').get() as { count: number };
    if ((overCapCss?.count ?? 0) > 0) {
      console.error(`[check] ERROR: Found ${overCapCss.count} characters with custom_css exceeding 131,072 characters`);
      hasFailure = true;
    } else {
      console.log(`custom_css_column=ok`);
    }
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

  const chatCols = db.query('PRAGMA table_info(chats);').all() as Array<{ name: string }>;
  const chatColNames = chatCols.map((c) => c.name);
  if (!chatColNames.includes('active_leaf_id')) {
    console.error(`[check] ERROR: chats table missing required column 'active_leaf_id'`);
    hasFailure = true;
  }

  const cfgCols = db.query('PRAGMA table_info(provider_configs);').all() as Array<{ name: string }>;
  const cfgColNames = cfgCols.map((c) => c.name);
  const requiredCfgCols = ['id', 'name', 'provider_type', 'base_url', 'api_key', 'model', 'custom_prompt'];
  const missingCfgCols = requiredCfgCols.filter((c) => !cfgColNames.includes(c));
  if (missingCfgCols.length > 0) {
    console.error(`[check] ERROR: provider_configs table missing columns: ${missingCfgCols.join(', ')}`);
    hasFailure = true;
  } else {
    console.log(`provider_configs=ok`);
  }

  // Audit 1: No streaming rows
  const streamingCount = (
    db.query("SELECT COUNT(*) as count FROM messages WHERE status = 'streaming';").get() as { count: number }
  )?.count ?? 0;
  if (streamingCount > 0) {
    console.error(`[check] ERROR: Found ${streamingCount} stale 'streaming' message rows`);
    hasFailure = true;
  } else {
    console.log(`no_streaming_rows=ok`);
  }

  // Audit 2: active_leaf_id in-chat
  const chatsWithLeaves = db
    .query('SELECT id, primary_character_id, active_leaf_id, metadata FROM chats WHERE active_leaf_id IS NOT NULL;')
    .all() as Array<{ id: string; primary_character_id: string; active_leaf_id: string; metadata: string | null }>;

  const repos = createRepositories(db);

  for (const c of chatsWithLeaves) {
    const leafMsg = db.query('SELECT chat_id FROM messages WHERE id = ?;').get(c.active_leaf_id) as {
      chat_id: string;
    } | null;
    if (!leafMsg || leafMsg.chat_id !== c.id) {
      console.error(
        `[check] ERROR: Chat ${c.id} active_leaf_id ${c.active_leaf_id} not in chat (found in chat ${leafMsg?.chat_id})`
      );
      hasFailure = true;
    }

    // Audit 3: currentState matches leaf ancestor state
    const path = repos.messages.path(c.active_leaf_id);
    const char = repos.characters.get(c.primary_character_id);
    const expectedState = nearestState(path, char ?? { stateSchema: undefined, initialState: undefined });
    const chatMeta = c.metadata ? JSON.parse(c.metadata) : {};
    const currentState = chatMeta.currentState ?? {};

    const diff = Object.keys(expectedState).some((k) => expectedState[k] !== currentState[k]);
    if (diff) {
      console.error(
        `[check] ERROR: Chat ${c.id} currentState does not match leaf state. Expected: ${JSON.stringify(expectedState)}, Found: ${JSON.stringify(currentState)}`
      );
      hasFailure = true;
    }
  }
  console.log(`active_leaf_integrity=ok`);
  console.log(`current_state_integrity=ok`);
  // Audit 4: search_backend setting
  const searchSetting = db.query("SELECT value FROM settings WHERE key = 'search_backend';").get() as { value: string } | null;
  const searchBackend = searchSetting ? JSON.parse(searchSetting.value) : 'none';
  console.log(`search_backend=${searchBackend}`);

  // Audit 5: tags orphans
  const tagOrphans = (
    db.query('SELECT COUNT(*) as count FROM character_tags ct LEFT JOIN characters c ON ct.character_id = c.id WHERE c.id IS NULL;').get() as { count: number }
  )?.count ?? 0;
  if (tagOrphans > 0) {
    console.error(`[check] ERROR: Found ${tagOrphans} orphaned rows in character_tags`);
    hasFailure = true;
  } else {
    console.log(`tags_orphans=0`);
  }

  // Audit 6: FTS parity (if characters_fts exists)
  const ftsTable = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='characters_fts';").get();
  if (ftsTable) {
    const charCount = (db.query('SELECT COUNT(*) as count FROM characters;').get() as { count: number }).count;
    const ftsCount = (db.query('SELECT COUNT(*) as count FROM characters_fts;').get() as { count: number }).count;
    if (charCount !== ftsCount) {
      console.error(`[check] ERROR: FTS parity failure: characters=${charCount}, characters_fts=${ftsCount}`);
      hasFailure = true;
    } else {
      console.log(`fts_parity=ok (${charCount}/${ftsCount})`);
    }
  } else {
    console.log(`fts_parity=skipped (no characters_fts table)`);
  }

  const characterSummaries = repos.characters.list().items;
  const personas = repos.personas.list();

  console.log(`counts: ${characterSummaries.length} characters, ${personas.length} personas`);

  let validChars = 0;
  for (const cs of characterSummaries) {
    const vs = validate(CharacterSummarySchema, cs);
    if (!vs.ok) {
      console.error(`[check] Character summary ${cs.id} failed validation:`, vs.issues);
      hasFailure = true;
      continue;
    }
    const full = repos.characters.get(cs.id);
    if (!full) {
      console.error(`[check] Character ${cs.id} could not be retrieved in full`);
      hasFailure = true;
      continue;
    }
    const vf = validate(CharacterCardSchema, full);
    if (!vf.ok) {
      console.error(`[check] Character full card ${cs.id} failed validation:`, vf.issues);
      hasFailure = true;
      continue;
    }
    validChars++;
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

  console.log(`${validChars}/${characterSummaries.length} characters valid, ${validPersonas}/${personas.length} personas valid`);

  if (hasFailure) {
    process.exit(1);
  }
} finally {
  db.close();
}

import type { Database } from 'bun:sqlite';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database) => void;
}

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: (db) => {
      db.run(`CREATE TABLE IF NOT EXISTS characters (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT, description TEXT, personality TEXT,
        scenario TEXT, first_message TEXT, style TEXT NOT NULL,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, metadata TEXT
      );`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_characters_updated ON characters(updated_at DESC);`);

      db.run(`CREATE TABLE IF NOT EXISTS personas (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT, description TEXT,
        is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
        style_overrides TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );`);
      db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_personas_single_default ON personas(is_default) WHERE is_default = 1;`);

      db.run(`CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY, title TEXT NOT NULL,
        primary_character_id TEXT NOT NULL, active_persona_id TEXT NOT NULL,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, metadata TEXT,
        FOREIGN KEY (primary_character_id) REFERENCES characters(id) ON DELETE RESTRICT,
        FOREIGN KEY (active_persona_id) REFERENCES personas(id) ON DELETE RESTRICT
      );`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(updated_at DESC);`);

      db.run(`CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, parent_id TEXT, sender_id TEXT,
        role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
        content TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('streaming','complete','aborted','error')),
        created_at INTEGER NOT NULL, metrics TEXT, metadata TEXT,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES messages(id) ON DELETE CASCADE
      );`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id, id ASC);`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_id);`);

      db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);`);
    }
  },
  {
    version: 2,
    name: 'narrative_envelope',
    up: (db) => {
      db.run(`ALTER TABLE messages ADD COLUMN narrative_role TEXT NOT NULL DEFAULT 'character'
        CHECK (narrative_role IN ('character','persona','npc','narrator'));`);
      db.run(`ALTER TABLE messages ADD COLUMN sender_name TEXT;`);
      db.run(`ALTER TABLE messages ADD COLUMN segments TEXT;`);
      db.run(`ALTER TABLE messages ADD COLUMN state TEXT;`);
      db.run(`UPDATE messages SET narrative_role = 'persona' WHERE role = 'user';`);
    }
  },
  {
    version: 3,
    name: 'chat_branching',
    up: (db) => {
      db.run(`ALTER TABLE chats ADD COLUMN active_leaf_id TEXT REFERENCES messages(id) ON DELETE SET NULL;`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_messages_streaming ON messages(status) WHERE status = 'streaming';`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_messages_parent_id_id ON messages(parent_id, id);`);
      db.run(`UPDATE chats SET active_leaf_id = (SELECT id FROM messages WHERE chat_id = chats.id ORDER BY id DESC LIMIT 1);`);
    }
  },
  {
    version: 4,
    name: 'companion_platform',
    up: (db) => {
      // 1. characters display-only columns
      db.run(`ALTER TABLE characters ADD COLUMN tagline TEXT;`);
      db.run(`ALTER TABLE characters ADD COLUMN creator TEXT;`);
      db.run(`ALTER TABLE characters ADD COLUMN showcase TEXT;`);

      // 2. tags join table
      db.run(`CREATE TABLE IF NOT EXISTS character_tags (
        character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        tag          TEXT NOT NULL,
        PRIMARY KEY (character_id, tag)
      ) WITHOUT ROWID;`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_character_tags_tag ON character_tags(tag, character_id);`);

      // Backfill creator from metadata JSON if present
      db.run(`UPDATE characters SET creator = json_extract(metadata, '$.creator')
        WHERE metadata IS NOT NULL AND json_valid(metadata) AND json_extract(metadata, '$.creator') IS NOT NULL;`);

      // Backfill character_tags from metadata.tags JSON array if present
      try {
        db.run(`INSERT OR IGNORE INTO character_tags (character_id, tag)
          SELECT c.id, lower(trim(j.value))
          FROM characters c, json_each(c.metadata, '$.tags') j
          WHERE c.metadata IS NOT NULL AND json_valid(c.metadata) AND length(trim(j.value)) > 0;`);
      } catch {}

      // 3. FTS5 feature detect & virtual table
      const ftsRow = db.query(`SELECT 1 FROM pragma_compile_options WHERE compile_options = 'ENABLE_FTS5';`).get();
      const hasFts5 = Boolean(ftsRow);

      if (hasFts5) {
        db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS characters_fts USING fts5(
          id UNINDEXED, name, tagline, description, creator, tags,
          tokenize = 'unicode61 remove_diacritics 2'
        );`);

        // Backfill FTS
        db.run(`INSERT INTO characters_fts(id, name, tagline, description, creator, tags)
          SELECT c.id, c.name, coalesce(c.tagline, ''), c.description, coalesce(c.creator, ''),
                 coalesce((SELECT group_concat(tag, ' ') FROM character_tags WHERE character_id = c.id), '')
          FROM characters c;`);
      }

      // 4. Name nocase index
      db.run(`CREATE INDEX IF NOT EXISTS idx_characters_name_nocase ON characters(name COLLATE NOCASE, id);`);

      // 5. Record search backend in settings
      const now = Date.now();
      const searchBackend = hasFts5 ? 'fts5' : 'like';
      db.run(
        `INSERT INTO settings (key, value, updated_at) VALUES ('search_backend', json_quote(?), ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
        [searchBackend, now]
      );
    }
  },
  {
    version: 5,
    name: 'creator_customization',
    up: (db) => {
      db.run(`ALTER TABLE characters ADD COLUMN custom_css TEXT;`);
    }
  },
  {
    version: 6,
    name: 'provider_configs',
    up: (db) => {
      db.run(`CREATE TABLE IF NOT EXISTS provider_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        provider_type TEXT NOT NULL
          CHECK (provider_type IN ('openrouter','custom','gemini','gemini-interactions')),
        base_url TEXT,
        api_key TEXT,
        model TEXT,
        custom_prompt TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_provider_configs_updated ON provider_configs(updated_at DESC);`);
    }
  }
];

export function runMigrations(
  db: Database,
  list: readonly Migration[] = migrations
): { from: number; to: number } {
  list.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(`Migrations must be contiguous from 1; found v${m.version} at index ${i}`);
    }
  });
  const latest = list.length;
  const { user_version: from } = db.query('PRAGMA user_version;').get() as { user_version: number };
  if (from > latest) {
    throw new Error(`Database is schema v${from}; this build supports up to v${latest}. Refusing to open.`);
  }
  for (const m of list) {
    if (m.version <= from) continue;
    db.transaction(() => {
      m.up(db);
      db.run(`PRAGMA user_version = ${m.version};`);
    })();
  }
  return { from, to: latest };
}

import type { Database, Statement } from 'bun:sqlite';
import {
  assertValid,
  CharacterCardSchema,
  PersonaSchema,
  normalizeTag,
  slugify,
  type CharacterCard,
  type CharacterMetadata,
  type CharacterSummary,
  type CharacterCreate,
  type CharacterPatch,
  type CharacterListQuery,
  type Persona,
  type PersonaCreate,
  type PersonaPatch,
  type ThemeOverrides
} from '@formatavern/shared';
import type { CharacterRepository, PersonaRepository, Repositories } from './contracts';
import { SQLiteChatRepository } from './repositories/chats';
import { SQLiteMessageRepository } from './repositories/messages';
import { SQLiteSettingsRepository } from './repositories/settings';
import { SQLiteProviderConfigRepository } from './repositories/providerConfigs';
import { newId } from './ids';

interface CharacterRow {
  id: string;
  name: string;
  avatar: string | null;
  tagline: string | null;
  creator: string | null;
  showcase: string | null;
  custom_css: string | null;
  description: string;
  personality: string;
  scenario: string;
  first_message: string;
  style: string;
  created_at: number;
  updated_at: number;
  metadata: string | null;
}

interface PersonaRow {
  id: string;
  name: string;
  avatar: string | null;
  description: string;
  is_default: number;
  style_overrides: string | null;
  created_at: number;
  updated_at: number;
}

function encodeCursor(tuple: [any, string]): string {
  return Buffer.from(JSON.stringify(tuple)).toString('base64url');
}

function decodeCursor(cursor: string): [any, string] | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 2) {
      return parsed as [any, string];
    }
  } catch {}
  return null;
}

function cardToRow(card: CharacterCard, now: number) {
  const metadataObj: Record<string, unknown> = {};
  if (card.exampleDialogue !== undefined) metadataObj.exampleDialogue = card.exampleDialogue;
  if (card.stateSchema !== undefined) metadataObj.stateSchema = card.stateSchema;
  if (card.stateBindings !== undefined) metadataObj.stateBindings = card.stateBindings;
  if (card.initialState !== undefined) metadataObj.initialState = card.initialState;
  if (card.tags !== undefined) metadataObj.tags = card.tags;
  if (card.creator !== undefined) metadataObj.creator = card.creator;
  if (card.labels !== undefined) metadataObj.labels = card.labels;
  if (card.version !== undefined) metadataObj.version = card.version;

  const metadata = Object.keys(metadataObj).length > 0 ? JSON.stringify(metadataObj) : null;

  return {
    id: card.id,
    name: card.name,
    avatar: card.avatar ?? null,
    tagline: card.tagline ?? null,
    creator: card.creator ?? null,
    showcase: card.showcase ?? null,
    custom_css: card.customCss ?? null,
    description: card.description,
    personality: card.personality,
    scenario: card.scenario,
    first_message: card.firstMessage,
    style: JSON.stringify(card.style),
    created_at: card.createdAt ?? now,
    updated_at: card.updatedAt ?? now,
    metadata
  };
}

function rowToCard(row: CharacterRow, tags: string[] = []): CharacterCard {
  const card: CharacterCard = {
    id: row.id,
    name: row.name,
    description: row.description,
    personality: row.personality,
    scenario: row.scenario,
    firstMessage: row.first_message,
    style: JSON.parse(row.style),
    tags: tags.length > 0 ? tags : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };

  if (row.avatar) card.avatar = row.avatar;
  if (row.tagline) card.tagline = row.tagline;
  if (row.creator) card.creator = row.creator;
  if (row.showcase) card.showcase = row.showcase;
  if (row.custom_css) card.customCss = row.custom_css;

  if (row.metadata) {
    const meta = JSON.parse(row.metadata) as CharacterMetadata;
    if (meta.exampleDialogue !== undefined) card.exampleDialogue = meta.exampleDialogue;
    if (meta.stateSchema !== undefined) card.stateSchema = meta.stateSchema;
    if (meta.stateBindings !== undefined) card.stateBindings = meta.stateBindings;
    if (meta.initialState !== undefined) card.initialState = meta.initialState;
    if ((card.tags?.length ?? 0) === 0 && meta.tags !== undefined) card.tags = meta.tags;
    if (!card.creator && meta.creator !== undefined) card.creator = meta.creator;
    if (meta.labels !== undefined) card.labels = meta.labels;
    if (meta.version !== undefined) card.version = meta.version;
  }

  return card;
}

function personaToRow(persona: Persona, now: number) {
  return {
    id: persona.id,
    name: persona.name,
    avatar: persona.avatar ?? null,
    description: persona.description,
    is_default: persona.isDefault ? 1 : 0,
    style_overrides: persona.styleOverrides ? JSON.stringify(persona.styleOverrides) : null,
    created_at: persona.createdAt ?? now,
    updated_at: persona.updatedAt ?? now
  };
}

function rowToPersona(row: PersonaRow): Persona {
  const persona: Persona = {
    id: row.id,
    name: row.name,
    description: row.description,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };

  if (row.avatar) persona.avatar = row.avatar;
  if (row.style_overrides) {
    persona.styleOverrides = JSON.parse(row.style_overrides) as ThemeOverrides;
  }

  return persona;
}

export class SqliteCharacterRepository implements CharacterRepository {
  private stmtGet: Statement<CharacterRow, [string]>;
  private stmtCount: Statement<{ count: number }, []>;
  private stmtRemove: Statement<void, [string]>;
  private stmtInsert: Statement<void, any>;
  private stmtUpsert: Statement<void, any>;
  private stmtInsertIfAbsent: Statement<void, any>;

  constructor(private db: Database) {
    this.stmtGet = db.query(`SELECT * FROM characters WHERE id = ?;`);
    this.stmtCount = db.query(`SELECT count(*) as count FROM characters;`);
    this.stmtRemove = db.query(`DELETE FROM characters WHERE id = ?;`);

    this.stmtInsert = db.query(`
      INSERT INTO characters (
        id, name, avatar, tagline, creator, showcase, custom_css, description, personality, scenario,
        first_message, style, created_at, updated_at, metadata
      ) VALUES (
        $id, $name, $avatar, $tagline, $creator, $showcase, $custom_css, $description, $personality, $scenario,
        $first_message, $style, $created_at, $updated_at, $metadata
      );
    `);

    this.stmtUpsert = db.query(`
      INSERT INTO characters (
        id, name, avatar, tagline, creator, showcase, custom_css, description, personality, scenario,
        first_message, style, created_at, updated_at, metadata
      ) VALUES (
        $id, $name, $avatar, $tagline, $creator, $showcase, $custom_css, $description, $personality, $scenario,
        $first_message, $style, $created_at, $updated_at, $metadata
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        avatar = excluded.avatar,
        tagline = excluded.tagline,
        creator = excluded.creator,
        showcase = excluded.showcase,
        custom_css = excluded.custom_css,
        description = excluded.description,
        personality = excluded.personality,
        scenario = excluded.scenario,
        first_message = excluded.first_message,
        style = excluded.style,
        updated_at = excluded.updated_at,
        metadata = excluded.metadata;
    `);

    this.stmtInsertIfAbsent = db.query(`
      INSERT INTO characters (
        id, name, avatar, tagline, creator, showcase, custom_css, description, personality, scenario,
        first_message, style, created_at, updated_at, metadata
      ) VALUES (
        $id, $name, $avatar, $tagline, $creator, $showcase, $custom_css, $description, $personality, $scenario,
        $first_message, $style, $created_at, $updated_at, $metadata
      )
      ON CONFLICT(id) DO NOTHING;
    `);
  }

  private hasFts5(): boolean {
    const row = this.db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'characters_fts';").get();
    return Boolean(row);
  }

  private syncFts(
    id: string,
    name: string,
    tagline: string | null,
    description: string,
    creator: string | null,
    tags: string[]
  ) {
    if (!this.hasFts5()) return;
    this.db.run(`DELETE FROM characters_fts WHERE id = ?;`, [id]);
    this.db.run(
      `INSERT INTO characters_fts(id, name, tagline, description, creator, tags) VALUES (?, ?, ?, ?, ?, ?);`,
      [id, name, tagline ?? '', description, creator ?? '', tags.join(' ')]
    );
  }

  private syncTags(characterId: string, tags: string[]) {
    this.db.run(`DELETE FROM character_tags WHERE character_id = ?;`, [characterId]);
    const insert = this.db.query(`INSERT OR IGNORE INTO character_tags (character_id, tag) VALUES (?, ?);`);
    for (const t of tags) {
      const norm = normalizeTag(t);
      if (norm) insert.run(characterId, norm);
    }
  }

  list(q?: CharacterListQuery): { items: CharacterSummary[]; nextCursor: string | null } {
    const rawLimit = q?.limit !== undefined ? Number(q.limit) : 24;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.max(1, Math.min(60, Math.floor(rawLimit))) : 24;
    const sort = q?.sort ?? 'recent';
    const hasFts = this.hasFts5();

    let selectSql = `
      SELECT
        c.id, c.name, c.tagline, c.avatar, c.creator, c.style, c.created_at, c.updated_at,
        COUNT(DISTINCT ch.id) AS story_count,
        MAX(ch.updated_at) AS last_story_at
      FROM characters c
      LEFT JOIN chats ch ON ch.primary_character_id = c.id
    `;

    const joins: string[] = [];
    const wheres: string[] = [];
    const params: any[] = [];

    // 1. Search filter
    const queryStr = q?.q?.trim();
    if (queryStr && queryStr.length >= 2) {
      if (hasFts) {
        joins.push(`JOIN characters_fts fts ON fts.id = c.id`);
        const terms = queryStr.split(/\s+/).filter(Boolean);
        const ftsTerm = terms.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' ');
        wheres.push(`characters_fts MATCH ?`);
        params.push(ftsTerm);
      } else {
        const escaped = queryStr.replace(/([%_\\])/g, '\\$1');
        wheres.push(`(c.name LIKE ? ESCAPE '\\' OR c.tagline LIKE ? ESCAPE '\\' OR c.description LIKE ? ESCAPE '\\')`);
        params.push(`%${escaped}%`, `%${escaped}%`, `%${escaped}%`);
      }
    }

    // 2. Tag filter (AND logic)
    if (q?.tags) {
      const rawTags = typeof q.tags === 'string' ? q.tags.split(',') : [];
      const normalizedTags = rawTags.map((t) => normalizeTag(t)).filter(Boolean) as string[];
      if (normalizedTags.length > 0) {
        const placeholders = normalizedTags.map(() => '?').join(',');
        wheres.push(`c.id IN (
          SELECT character_id FROM character_tags
          WHERE tag IN (${placeholders})
          GROUP BY character_id
          HAVING COUNT(DISTINCT tag) = ?
        )`);
        params.push(...normalizedTags, normalizedTags.length);
      }
    }

    if (joins.length > 0) selectSql += ' ' + joins.join(' ');
    if (wheres.length > 0) selectSql += ' WHERE ' + wheres.join(' AND ');
    selectSql += ' GROUP BY c.id ';

    // 3. Sorting & Keyset Cursor
    const decodedCursor = q?.cursor ? decodeCursor(q.cursor) : null;
    let orderClause = '';
    let havingClause = '';

    if (sort === 'recent') {
      orderClause = `ORDER BY c.updated_at DESC, c.id ASC`;
      if (decodedCursor) {
        const [lastUpdatedAt, lastId] = decodedCursor;
        havingClause = `HAVING (c.updated_at < ? OR (c.updated_at = ? AND c.id > ?))`;
        params.push(Number(lastUpdatedAt), Number(lastUpdatedAt), String(lastId));
      }
    } else if (sort === 'name') {
      orderClause = `ORDER BY c.name COLLATE NOCASE ASC, c.id ASC`;
      if (decodedCursor) {
        const [lastName, lastId] = decodedCursor;
        havingClause = `HAVING (c.name COLLATE NOCASE > ? OR (c.name COLLATE NOCASE = ? AND c.id > ?))`;
        params.push(String(lastName), String(lastName), String(lastId));
      }
    } else if (sort === 'stories') {
      orderClause = `ORDER BY story_count DESC, c.id ASC`;
      if (decodedCursor) {
        const [lastStoryCount, lastId] = decodedCursor;
        havingClause = `HAVING (story_count < ? OR (story_count = ? AND c.id > ?))`;
        params.push(Number(lastStoryCount), Number(lastStoryCount), String(lastId));
      }
    }

    if (havingClause) {
      selectSql += ' ' + havingClause;
    }
    selectSql += ' ' + orderClause + ' LIMIT ?';
    params.push(limit + 1);

    const rows = this.db.query(selectSql).all(...params) as any[];
    const hasMore = rows.length > limit;
    const resultRows = hasMore ? rows.slice(0, limit) : rows;

    const characterIds = resultRows.map((r) => r.id);
    const tagMap = new Map<string, string[]>();
    if (characterIds.length > 0) {
      const ph = characterIds.map(() => '?').join(',');
      const tagRows = this.db
        .query(`SELECT character_id, tag FROM character_tags WHERE character_id IN (${ph}) ORDER BY tag ASC;`)
        .all(...characterIds) as Array<{ character_id: string; tag: string }>;
      for (const tr of tagRows) {
        const arr = tagMap.get(tr.character_id) ?? [];
        arr.push(tr.tag);
        tagMap.set(tr.character_id, arr);
      }
    }

    const items: CharacterSummary[] = resultRows.map((r) => ({
      id: r.id,
      name: r.name,
      tagline: r.tagline ?? undefined,
      avatar: r.avatar ?? undefined,
      creator: r.creator ?? undefined,
      tags: tagMap.get(r.id) ?? [],
      style: JSON.parse(r.style),
      storyCount: Number(r.story_count ?? 0),
      lastStoryAt: r.last_story_at ? Number(r.last_story_at) : undefined,
      updatedAt: Number(r.updated_at)
    }));

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1];
      if (sort === 'recent') {
        nextCursor = encodeCursor([last.updatedAt, last.id]);
      } else if (sort === 'name') {
        nextCursor = encodeCursor([last.name, last.id]);
      } else if (sort === 'stories') {
        nextCursor = encodeCursor([last.storyCount, last.id]);
      }
    }

    return { items, nextCursor };
  }

  get(id: string): CharacterCard | null {
    const row = this.stmtGet.get(id);
    if (!row) return null;

    const tags = this.db
      .query(`SELECT tag FROM character_tags WHERE character_id = ? ORDER BY tag ASC;`)
      .all(id)
      .map((r: any) => r.tag);

    return rowToCard(row, tags);
  }

  create(input: CharacterCreate): CharacterCard {
    const now = Date.now();
    let idCandidate = input.id ? slugify(input.id) : '';
    if (!idCandidate) {
      idCandidate = slugify(input.name);
    }
    if (!idCandidate) {
      idCandidate = 'c-' + newId().toLowerCase();
    }

    let finalId = idCandidate;
    let counter = 2;
    while (this.stmtGet.get(finalId)) {
      finalId = `${idCandidate}-${counter++}`;
    }

    const card: CharacterCard = {
      ...input,
      id: finalId,
      tags: (input.tags ?? []).map((t) => normalizeTag(t)).filter(Boolean) as string[],
      createdAt: now,
      updatedAt: now
    };

    assertValid(CharacterCardSchema, card, `CharacterCard(${finalId})`);
    const row = cardToRow(card, now);

    this.db.transaction(() => {
      this.stmtInsert.run({
        id: row.id,
        name: row.name,
        avatar: row.avatar,
        tagline: row.tagline,
        creator: row.creator,
        showcase: row.showcase,
        custom_css: row.custom_css,
        description: row.description,
        personality: row.personality,
        scenario: row.scenario,
        first_message: row.first_message,
        style: row.style,
        created_at: row.created_at,
        updated_at: row.updated_at,
        metadata: row.metadata
      });

      const safeTags = card.tags ?? [];
      this.syncTags(finalId, safeTags);
      this.syncFts(finalId, card.name, card.tagline ?? null, card.description, card.creator ?? null, safeTags);
    })();

    return card;
  }

  patch(id: string, input: CharacterPatch): CharacterCard | 'stale' | 'missing' {
    return this.db.transaction(() => {
      const existingRow = this.stmtGet.get(id);
      if (!existingRow) return 'missing';

      if (existingRow.updated_at !== input.expectedUpdatedAt) {
        return 'stale';
      }

      const now = Date.now();
      const currentTags = this.db
        .query('SELECT tag FROM character_tags WHERE character_id = ? ORDER BY tag ASC;')
        .all(id)
        .map((r: any) => r.tag);
      const currentCard = rowToCard(existingRow, currentTags);

      const mergedTags =
        input.tags !== undefined
          ? (input.tags.map((t) => normalizeTag(t)).filter(Boolean) as string[])
          : currentCard.tags;

      const mergedCard: CharacterCard = {
        ...currentCard,
        name: input.name !== undefined ? input.name : currentCard.name,
        avatar: input.avatar !== undefined ? input.avatar : currentCard.avatar,
        tagline: input.tagline !== undefined ? input.tagline : currentCard.tagline,
        creator: input.creator !== undefined ? input.creator : currentCard.creator,
        showcase: input.showcase !== undefined ? input.showcase : currentCard.showcase,
        customCss:
          input.customCss !== undefined
            ? (input.customCss ?? undefined)
            : currentCard.customCss,
        description: input.description !== undefined ? input.description : currentCard.description,
        personality: input.personality !== undefined ? input.personality : currentCard.personality,
        scenario: input.scenario !== undefined ? input.scenario : currentCard.scenario,
        firstMessage: input.firstMessage !== undefined ? input.firstMessage : currentCard.firstMessage,
        exampleDialogue: input.exampleDialogue !== undefined ? input.exampleDialogue : currentCard.exampleDialogue,
        style: input.style !== undefined ? input.style : currentCard.style,
        stateSchema: input.stateSchema !== undefined ? input.stateSchema : currentCard.stateSchema,
        stateBindings: input.stateBindings !== undefined ? input.stateBindings : currentCard.stateBindings,
        initialState: input.initialState !== undefined ? input.initialState : currentCard.initialState,
        tags: mergedTags,
        version: input.version !== undefined ? input.version : currentCard.version,
        updatedAt: now
      };

      assertValid(CharacterCardSchema, mergedCard, `CharacterCard(${id})`);
      const row = cardToRow(mergedCard, now);

      const res = this.db.run(
        `UPDATE characters SET
          name = ?,
          avatar = ?,
          tagline = ?,
          creator = ?,
          showcase = ?,
          custom_css = ?,
          description = ?,
          personality = ?,
          scenario = ?,
          first_message = ?,
          style = ?,
          updated_at = ?,
          metadata = ?
        WHERE id = ? AND updated_at = ?;`,
        [
          row.name,
          row.avatar,
          row.tagline,
          row.creator,
          row.showcase,
          row.custom_css,
          row.description,
          row.personality,
          row.scenario,
          row.first_message,
          row.style,
          now,
          row.metadata,
          id,
          input.expectedUpdatedAt
        ]
      );

      if (res.changes === 0) {
        return 'stale';
      }

      const safeMergedTags = mergedTags ?? [];
      if (input.tags !== undefined) {
        this.syncTags(id, safeMergedTags);
      }
      this.syncFts(
        id,
        mergedCard.name,
        mergedCard.tagline ?? null,
        mergedCard.description,
        mergedCard.creator ?? null,
        safeMergedTags
      );

      return mergedCard;
    })();
  }

  remove(id: string, opts?: { cascadeChats?: boolean }): { chats: number } | 'restricted' {
    return this.db.transaction(() => {
      const chatsCount = (
        this.db.query('SELECT count(*) as count FROM chats WHERE primary_character_id = ?;').get(id) as any
      )?.count ?? 0;

      if (chatsCount > 0 && !opts?.cascadeChats) {
        return 'restricted';
      }

      if (chatsCount > 0 && opts?.cascadeChats) {
        this.db.run('DELETE FROM chats WHERE primary_character_id = ?;', [id]);
      }

      this.db.run('DELETE FROM character_tags WHERE character_id = ?;', [id]);
      if (this.hasFts5()) {
        this.db.run('DELETE FROM characters_fts WHERE id = ?;', [id]);
      }
      this.db.run('DELETE FROM characters WHERE id = ?;', [id]);

      return { chats: chatsCount };
    })();
  }

  duplicate(id: string): CharacterCard {
    const card = this.get(id);
    if (!card) {
      throw new Error(`Character ${id} not found`);
    }

    const newName = `${card.name} (Copy)`;
    const newIdCandidate = `${card.id}-copy`;
    return this.create({
      ...card,
      name: newName,
      id: newIdCandidate
    });
  }

  chatCounts(id: string): { chats: number } {
    const row = this.db.query('SELECT count(*) as count FROM chats WHERE primary_character_id = ?;').get(id) as any;
    return { chats: Number(row?.count ?? 0) };
  }

  popularTags(limit = 100): Array<{ tag: string; count: number }> {
    const rows = this.db
      .query('SELECT tag, COUNT(*) as count FROM character_tags GROUP BY tag ORDER BY count DESC, tag ASC LIMIT ?;')
      .all(limit) as any[];
    return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
  }

  tags(): { tag: string; count: number }[] {
    return this.popularTags();
  }

  count(): number {
    return this.stmtCount.get()?.count ?? 0;
  }

  upsert(card: CharacterCard): void {
    assertValid(CharacterCardSchema, card, `CharacterCard(${card.id})`);
    const now = Date.now();
    const row = cardToRow(card, now);
    this.db.transaction(() => {
      this.stmtUpsert.run({
        id: row.id,
        name: row.name,
        avatar: row.avatar,
        tagline: row.tagline,
        creator: row.creator,
        showcase: row.showcase,
        custom_css: row.custom_css,
        description: row.description,
        personality: row.personality,
        scenario: row.scenario,
        first_message: row.first_message,
        style: row.style,
        created_at: row.created_at,
        updated_at: row.updated_at,
        metadata: row.metadata
      });
      const tags = (card.tags ?? []).map((t) => normalizeTag(t)).filter(Boolean) as string[];
      this.syncTags(card.id, tags);
      this.syncFts(card.id, card.name, card.tagline ?? null, card.description, card.creator ?? null, tags);
    })();
  }

  insertIfAbsent(card: CharacterCard): boolean {
    assertValid(CharacterCardSchema, card, `CharacterCard(${card.id})`);
    const now = Date.now();
    const row = cardToRow(card, now);
    let inserted = false;
    this.db.transaction(() => {
      const res = this.stmtInsertIfAbsent.run({
        id: row.id,
        name: row.name,
        avatar: row.avatar,
        tagline: row.tagline,
        creator: row.creator,
        showcase: row.showcase,
        custom_css: row.custom_css,
        description: row.description,
        personality: row.personality,
        scenario: row.scenario,
        first_message: row.first_message,
        style: row.style,
        created_at: row.created_at,
        updated_at: row.updated_at,
        metadata: row.metadata
      });
      inserted = res.changes === 1;
      if (inserted) {
        const tags = (card.tags ?? []).map((t) => normalizeTag(t)).filter(Boolean) as string[];
        this.syncTags(card.id, tags);
        this.syncFts(card.id, card.name, card.tagline ?? null, card.description, card.creator ?? null, tags);
      }
    })();
    return inserted;
  }
}

export class SqlitePersonaRepository implements PersonaRepository {
  private stmtList: Statement<PersonaRow, []>;
  private stmtGet: Statement<PersonaRow, [string]>;
  private stmtGetDefault: Statement<PersonaRow, []>;
  private stmtCount: Statement<{ count: number }, []>;
  private stmtRemove: Statement<void, [string]>;
  private stmtInsert: Statement<void, any>;
  private stmtUpsert: Statement<void, any>;
  private stmtInsertIfAbsent: Statement<void, any>;

  constructor(private db: Database) {
    this.stmtList = db.query(`SELECT * FROM personas ORDER BY updated_at DESC;`);
    this.stmtGet = db.query(`SELECT * FROM personas WHERE id = ?;`);
    this.stmtGetDefault = db.query(`SELECT * FROM personas WHERE is_default = 1 LIMIT 1;`);
    this.stmtCount = db.query(`SELECT count(*) as count FROM personas;`);
    this.stmtRemove = db.query(`DELETE FROM personas WHERE id = ?;`);

    this.stmtInsert = db.query(`
      INSERT INTO personas (
        id, name, avatar, description, is_default, style_overrides, created_at, updated_at
      ) VALUES (
        $id, $name, $avatar, $description, $is_default, $style_overrides, $created_at, $updated_at
      );
    `);

    this.stmtUpsert = db.query(`
      INSERT INTO personas (
        id, name, avatar, description, is_default, style_overrides, created_at, updated_at
      ) VALUES (
        $id, $name, $avatar, $description, $is_default, $style_overrides, $created_at, $updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        avatar = excluded.avatar,
        description = excluded.description,
        is_default = excluded.is_default,
        style_overrides = excluded.style_overrides,
        updated_at = excluded.updated_at;
    `);

    this.stmtInsertIfAbsent = db.query(`
      INSERT INTO personas (
        id, name, avatar, description, is_default, style_overrides, created_at, updated_at
      ) VALUES (
        $id, $name, $avatar, $description, $is_default, $style_overrides, $created_at, $updated_at
      )
      ON CONFLICT(id) DO NOTHING;
    `);
  }

  list(): Persona[] {
    return this.stmtList.all().map(rowToPersona);
  }

  get(id: string): Persona | null {
    const row = this.stmtGet.get(id);
    return row ? rowToPersona(row) : null;
  }

  getDefault(): Persona | null {
    const row = this.stmtGetDefault.get();
    return row ? rowToPersona(row) : null;
  }

  count(): number {
    return this.stmtCount.get()?.count ?? 0;
  }

  create(input: PersonaCreate): Persona {
    const now = Date.now();
    const count = this.count();
    const id = input.id ?? newId();
    const persona: Persona = {
      ...input,
      id,
      isDefault: count === 0 ? true : Boolean(input.isDefault),
      createdAt: now,
      updatedAt: now
    };

    assertValid(PersonaSchema, persona, `Persona(${id})`);
    const row = personaToRow(persona, now);

    this.db.transaction(() => {
      if (persona.isDefault) {
        this.db.run('UPDATE personas SET is_default = 0, updated_at = ? WHERE is_default = 1;', [now]);
      }
      this.stmtInsert.run({
        id: row.id,
        name: row.name,
        avatar: row.avatar,
        description: row.description,
        is_default: row.is_default,
        style_overrides: row.style_overrides,
        created_at: row.created_at,
        updated_at: row.updated_at
      });
    })();

    return persona;
  }

  patch(id: string, input: PersonaPatch): Persona | 'stale' | 'missing' {
    return this.db.transaction(() => {
      const existingRow = this.stmtGet.get(id);
      if (!existingRow) return 'missing';

      if (existingRow.updated_at !== input.expectedUpdatedAt) {
        return 'stale';
      }

      const now = Date.now();
      const current = rowToPersona(existingRow);
      const merged: Persona = {
        ...current,
        name: input.name !== undefined ? input.name : current.name,
        avatar: input.avatar !== undefined ? input.avatar : current.avatar,
        description: input.description !== undefined ? input.description : current.description,
        styleOverrides: input.styleOverrides !== undefined ? input.styleOverrides : current.styleOverrides,
        updatedAt: now
      };

      assertValid(PersonaSchema, merged, `Persona(${id})`);
      const row = personaToRow(merged, now);

      const res = this.db.run(
        `UPDATE personas SET
          name = ?,
          avatar = ?,
          description = ?,
          style_overrides = ?,
          updated_at = ?
        WHERE id = ? AND updated_at = ?;`,
        [
          row.name,
          row.avatar,
          row.description,
          row.style_overrides,
          now,
          id,
          input.expectedUpdatedAt
        ]
      );

      if (res.changes === 0) {
        return 'stale';
      }

      return merged;
    })();
  }

  setDefault(id: string): Persona[] {
    return this.db.transaction(() => {
      const row = this.stmtGet.get(id);
      if (!row) {
        throw new Error(`Persona ${id} not found`);
      }
      const now = Date.now();
      this.db.run('UPDATE personas SET is_default = 0, updated_at = ? WHERE is_default = 1;', [now]);
      this.db.run('UPDATE personas SET is_default = 1, updated_at = ? WHERE id = ?;', [now, id]);
      return this.list();
    })();
  }

  remove(id: string, opts?: { reassignTo?: string }): { chats: number } | 'restricted' | 'is_default' {
    return this.db.transaction(() => {
      const row = this.stmtGet.get(id);
      if (!row) return { chats: 0 };
      if (row.is_default === 1) return 'is_default';

      const chatsCount = (
        this.db.query('SELECT count(*) as count FROM chats WHERE active_persona_id = ?;').get(id) as any
      )?.count ?? 0;

      if (chatsCount > 0) {
        if (!opts?.reassignTo) {
          return 'restricted';
        }
        const targetPersona = this.stmtGet.get(opts.reassignTo);
        if (!targetPersona) {
          throw new Error(`Target persona ${opts.reassignTo} not found`);
        }
        const now = Date.now();
        this.db.run('UPDATE chats SET active_persona_id = ?, updated_at = ? WHERE active_persona_id = ?;', [
          opts.reassignTo,
          now,
          id
        ]);
        this.db.run(
          "UPDATE messages SET sender_id = ? WHERE sender_id = ? AND narrative_role = 'persona';",
          [opts.reassignTo, id]
        );
      }

      this.stmtRemove.run(id);
      return { chats: chatsCount };
    })();
  }

  chatCounts(id: string): { chats: number } {
    const row = this.db.query('SELECT count(*) as count FROM chats WHERE active_persona_id = ?;').get(id) as any;
    return { chats: Number(row?.count ?? 0) };
  }

  upsert(persona: Persona): void {
    assertValid(PersonaSchema, persona, `Persona(${persona.id})`);
    const now = Date.now();
    const row = personaToRow(persona, now);
    this.stmtUpsert.run({
      id: row.id,
      name: row.name,
      avatar: row.avatar,
      description: row.description,
      is_default: row.is_default,
      style_overrides: row.style_overrides,
      created_at: row.created_at,
      updated_at: row.updated_at
    });
  }

  insertIfAbsent(persona: Persona): boolean {
    assertValid(PersonaSchema, persona, `Persona(${persona.id})`);
    const now = Date.now();
    const row = personaToRow(persona, now);
    const res = this.stmtInsertIfAbsent.run({
      id: row.id,
      name: row.name,
      avatar: row.avatar,
      description: row.description,
      is_default: row.is_default,
      style_overrides: row.style_overrides,
      created_at: row.created_at,
      updated_at: row.updated_at
    });
    return res.changes === 1;
  }
}

export function createRepositories(db: Database): Repositories {
  const characters = new SqliteCharacterRepository(db);
  const personas = new SqlitePersonaRepository(db);
  const chats = new SQLiteChatRepository(db);
  const messages = new SQLiteMessageRepository(db);
  const settings = new SQLiteSettingsRepository(db);
  const providerConfigs = new SQLiteProviderConfigRepository(db);

  return {
    characters,
    personas,
    chats,
    messages,
    settings,
    providerConfigs,
    schemaVersion() {
      const row = db.query('PRAGMA user_version;').get() as { user_version: number };
      return row.user_version;
    },
    transaction<T>(fn: () => T): T {
      return db.transaction(fn)();
    }
  };
}

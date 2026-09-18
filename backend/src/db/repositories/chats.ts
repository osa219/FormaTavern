import type { Database } from 'bun:sqlite';
import type {
  ChatMetadata,
  ChatHubQuery,
  ChatHubResponse,
  ChatHubGroup,
  ChatHubRecentItem
} from '@formatavern/shared';
import type { ChatRepository, ChatRow } from '../contracts';

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

function toChatRow(raw: any): ChatRow {
  return {
    id: raw.id,
    title: raw.title,
    primaryCharacterId: raw.primary_character_id,
    activePersonaId: raw.active_persona_id,
    activeLeafId: raw.active_leaf_id ?? null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw.metadata ? JSON.parse(raw.metadata) : {}
  };
}

export class SQLiteChatRepository implements ChatRepository {
  constructor(private db: Database) {}

  create(input: {
    id: string;
    title: string;
    primaryCharacterId: string;
    activePersonaId: string;
    metadata?: ChatMetadata;
  }): ChatRow {
    const now = Date.now();
    this.db.run(
      `INSERT INTO chats (id, title, primary_character_id, active_persona_id, active_leaf_id, created_at, updated_at, metadata)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?);`,
      [
        input.id,
        input.title,
        input.primaryCharacterId,
        input.activePersonaId,
        now,
        now,
        JSON.stringify(input.metadata)
      ]
    );

    return {
      id: input.id,
      title: input.title,
      primaryCharacterId: input.primaryCharacterId,
      activePersonaId: input.activePersonaId,
      activeLeafId: null,
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata ?? {}
    };
  }

  get(id: string): ChatRow | null {
    const row = this.db.query('SELECT * FROM chats WHERE id = ?;').get(id);
    return row ? toChatRow(row) : null;
  }

  list(opts?: { characterId?: string; limit?: number; cursor?: string }): Array<ChatRow & { messageCount: number; turnCount: number }> {
    const params: any[] = [];
    const wheres: string[] = [];

    if (opts?.characterId) {
      wheres.push(`primary_character_id = ?`);
      params.push(opts.characterId);
    }
    if (opts?.cursor) {
      wheres.push(`updated_at < ?`);
      params.push(Number(opts.cursor));
    }
    const whereClause = wheres.length > 0 ? ` WHERE ` + wheres.join(' AND ') : '';

    let sql: string;
    if (opts?.limit) {
      sql = `WITH recent_chats AS (
        SELECT * FROM chats${whereClause}
        ORDER BY updated_at DESC
        LIMIT ?
      )
      SELECT c.*,
        COUNT(m.id) AS message_count,
        COUNT(CASE WHEN m.role = 'assistant' THEN 1 END) AS turn_count
      FROM recent_chats c
      LEFT JOIN messages m ON m.chat_id = c.id
      GROUP BY c.id
      ORDER BY c.updated_at DESC;`;
      params.push(opts.limit);
    } else {
      sql = `SELECT c.*,
        COUNT(m.id) AS message_count,
        COUNT(CASE WHEN m.role = 'assistant' THEN 1 END) AS turn_count
      FROM chats c
      LEFT JOIN messages m ON m.chat_id = c.id
      ${wheres.length > 0 ? ' WHERE ' + wheres.map((w) => 'c.' + w).join(' AND ') : ''}
      GROUP BY c.id
      ORDER BY c.updated_at DESC;`;
    }

    const rows = this.db.query(sql).all(...params) as any[];

    return rows.map((r) => ({
      ...toChatRow(r),
      messageCount: Number(r.message_count ?? 0),
      turnCount: Number(r.turn_count ?? 0)
    }));
  }

  update(
    id: string,
    patch: {
      title?: string;
      activePersonaId?: string;
      activeLeafId?: string | null;
      metadata?: ChatMetadata;
      updatedAt?: number;
    }
  ): ChatRow {
    const sets: string[] = [];
    const params: any[] = [];

    if (patch.title !== undefined) {
      sets.push('title = ?');
      params.push(patch.title);
    }
    if (patch.activePersonaId !== undefined) {
      sets.push('active_persona_id = ?');
      params.push(patch.activePersonaId);
    }
    if (patch.activeLeafId !== undefined) {
      sets.push('active_leaf_id = ?');
      params.push(patch.activeLeafId);
    }
    if (patch.metadata !== undefined) {
      sets.push('metadata = ?');
      params.push(JSON.stringify(patch.metadata));
    }

    sets.push('updated_at = ?');
    params.push(patch.updatedAt ?? Date.now());

    params.push(id);
    this.db.run(`UPDATE chats SET ${sets.join(', ')} WHERE id = ?;`, params);
    return this.get(id)!;
  }

  setActiveLeaf(id: string, leafId: string | null): void {
    this.db.run('UPDATE chats SET active_leaf_id = ? WHERE id = ?;', [leafId, id]);
  }

  remove(id: string): void {
    this.db.run('DELETE FROM chats WHERE id = ?;', [id]);
  }

  removeByCharacter(characterId: string): { deleted: number } {
    let deleted = 0;
    this.db.transaction(() => {
      const row = this.db.query('SELECT COUNT(*) as count FROM chats WHERE primary_character_id = ?;').get(characterId) as { count: number };
      deleted = row?.count ?? 0;
      this.db.run('DELETE FROM chats WHERE primary_character_id = ?;', [characterId]);
    })();
    return { deleted };
  }

  private hasFts5(): boolean {
    const row = this.db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'characters_fts';").get();
    return Boolean(row);
  }

  hub(opts?: ChatHubQuery): ChatHubResponse {
    const rawLimit = opts?.limit !== undefined ? Number(opts.limit) : 20;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.max(1, Math.min(50, Math.floor(rawLimit))) : 20;
    const sort = opts?.sort ?? 'recent';
    const hasFts = this.hasFts5();

    // 1. Total counts across all characters with chats
    const totals = this.db.query(`
      SELECT 
        COUNT(DISTINCT primary_character_id) AS total_characters,
        COUNT(*) AS total_chats
      FROM chats;
    `).get() as { total_characters: number; total_chats: number } | null;

    const totalCharacters = Number(totals?.total_characters ?? 0);
    const totalChats = Number(totals?.total_chats ?? 0);

    if (totalChats === 0) {
      return { items: [], nextCursor: null, totalCharacters: 0, totalChats: 0 };
    }

    let selectSql = `
      WITH char_stats AS (
        SELECT 
          primary_character_id,
          COUNT(*) AS chat_count,
          MAX(updated_at) AS last_chat_at
        FROM chats
        GROUP BY primary_character_id
      )
      SELECT 
        c.id, c.name, c.tagline, c.avatar, c.creator, c.style, c.description, c.created_at, c.updated_at,
        s.chat_count,
        s.last_chat_at
      FROM char_stats s
      JOIN characters c ON c.id = s.primary_character_id
    `;

    const wheres: string[] = [];
    const params: any[] = [];

    // 2. Search query across character fields and chat titles
    const queryStr = opts?.q?.trim();
    if (queryStr && queryStr.length >= 1) {
      const escaped = queryStr.replace(/([%_\\])/g, '\\$1');
      const chatTitleSubquery = `s.primary_character_id IN (SELECT primary_character_id FROM chats WHERE title LIKE ? ESCAPE '\\')`;
      const chatTitleParam = `%${escaped}%`;

      if (hasFts) {
        const terms = queryStr.split(/\s+/).filter(Boolean);
        const ftsTerm = terms.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' ');
        wheres.push(`(
          c.id IN (SELECT id FROM characters_fts WHERE characters_fts MATCH ?)
          OR ${chatTitleSubquery}
        )`);
        params.push(ftsTerm, chatTitleParam);
      } else {
        const charLikeParam = `%${escaped}%`;
        wheres.push(`(
          c.name LIKE ? ESCAPE '\\'
          OR c.tagline LIKE ? ESCAPE '\\'
          OR c.description LIKE ? ESCAPE '\\'
          OR ${chatTitleSubquery}
        )`);
        params.push(charLikeParam, charLikeParam, charLikeParam, chatTitleParam);
      }
    }

    // 3. Keyset sorting & cursor tiebreak
    const decodedCursor = opts?.cursor ? decodeCursor(opts.cursor) : null;
    let orderClause = '';

    if (sort === 'recent') {
      orderClause = `ORDER BY s.last_chat_at DESC, c.id ASC`;
      if (decodedCursor) {
        const [lastChatAt, lastId] = decodedCursor;
        wheres.push(`(s.last_chat_at < ? OR (s.last_chat_at = ? AND c.id > ?))`);
        params.push(Number(lastChatAt), Number(lastChatAt), String(lastId));
      }
    } else if (sort === 'chats') {
      orderClause = `ORDER BY s.chat_count DESC, c.id ASC`;
      if (decodedCursor) {
        const [lastCount, lastId] = decodedCursor;
        wheres.push(`(s.chat_count < ? OR (s.chat_count = ? AND c.id > ?))`);
        params.push(Number(lastCount), Number(lastCount), String(lastId));
      }
    } else if (sort === 'name') {
      orderClause = `ORDER BY c.name COLLATE NOCASE ASC, c.id ASC`;
      if (decodedCursor) {
        const [lastName, lastId] = decodedCursor;
        wheres.push(`(c.name COLLATE NOCASE > ? OR (c.name COLLATE NOCASE = ? AND c.id > ?))`);
        params.push(String(lastName), String(lastName), String(lastId));
      }
    }

    if (wheres.length > 0) {
      selectSql += ' WHERE ' + wheres.join(' AND ');
    }

    selectSql += ' ' + orderClause + ' LIMIT ?';
    params.push(limit + 1);

    const charRows = this.db.query(selectSql).all(...params) as any[];
    const hasMore = charRows.length > limit;
    const pageRows = hasMore ? charRows.slice(0, limit) : charRows;

    if (pageRows.length === 0) {
      return { items: [], nextCursor: null, totalCharacters, totalChats };
    }

    const characterIds = pageRows.map((r) => r.id);
    const placeholders = characterIds.map(() => '?').join(',');

    // 4. Batch-fetch tags
    const tagMap = new Map<string, string[]>();
    const tagRows = this.db
      .query(`SELECT character_id, tag FROM character_tags WHERE character_id IN (${placeholders}) ORDER BY tag ASC;`)
      .all(...characterIds) as Array<{ character_id: string; tag: string }>;
    for (const tr of tagRows) {
      const arr = tagMap.get(tr.character_id) ?? [];
      arr.push(tr.tag);
      tagMap.set(tr.character_id, arr);
    }

    // 5. Batch-fetch top-3 recent chats per character using window function
    const recentChatsMap = new Map<string, ChatHubRecentItem[]>();
    const recentChatRows = this.db.query(`
      WITH ranked_chats AS (
        SELECT 
          c.id, c.title, c.primary_character_id, c.updated_at,
          (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id) AS message_count,
          ROW_NUMBER() OVER (PARTITION BY c.primary_character_id ORDER BY c.updated_at DESC) AS rn
        FROM chats c
        WHERE c.primary_character_id IN (${placeholders})
      )
      SELECT id, title, primary_character_id, updated_at, message_count
      FROM ranked_chats
      WHERE rn <= 3
      ORDER BY primary_character_id, updated_at DESC;
    `).all(...characterIds) as any[];

    for (const cr of recentChatRows) {
      const list = recentChatsMap.get(cr.primary_character_id) ?? [];
      list.push({
        id: cr.id,
        title: cr.title ?? null,
        messageCount: Number(cr.message_count ?? 0),
        updatedAt: Number(cr.updated_at),
        activeGenerationMessageId: null
      });
      recentChatsMap.set(cr.primary_character_id, list);
    }

    // 6. Assemble response items
    const items: ChatHubGroup[] = pageRows.map((r) => ({
      character: {
        id: r.id,
        name: r.name,
        tagline: r.tagline ?? undefined,
        avatar: r.avatar ?? undefined,
        creator: r.creator ?? undefined,
        tags: tagMap.get(r.id) ?? [],
        style: JSON.parse(r.style),
        storyCount: Number(r.chat_count ?? 0),
        lastStoryAt: Number(r.last_chat_at ?? 0),
        updatedAt: Number(r.updated_at),
        description: r.description ?? undefined
      },
      chatCount: Number(r.chat_count ?? 0),
      lastChatAt: Number(r.last_chat_at ?? 0),
      recentChats: recentChatsMap.get(r.id) ?? []
    }));

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1];
      if (sort === 'recent') {
        nextCursor = encodeCursor([last.lastChatAt, last.character.id]);
      } else if (sort === 'chats') {
        nextCursor = encodeCursor([last.chatCount, last.character.id]);
      } else if (sort === 'name') {
        nextCursor = encodeCursor([last.character.name, last.character.id]);
      }
    }

    return {
      items,
      nextCursor,
      totalCharacters,
      totalChats
    };
  }

  count(): number {
    const row = this.db.query('SELECT COUNT(*) as count FROM chats;').get() as { count: number };
    return row?.count ?? 0;
  }
}

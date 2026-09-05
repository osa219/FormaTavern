import type { Database } from 'bun:sqlite';
import type { ChatMetadata } from '@formatavern/shared';
import type { ChatRepository, ChatRow } from '../contracts';

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
    metadata: ChatMetadata;
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
      metadata: input.metadata
    };
  }

  get(id: string): ChatRow | null {
    const row = this.db.query('SELECT * FROM chats WHERE id = ?;').get(id);
    return row ? toChatRow(row) : null;
  }

  list(): Array<ChatRow & { messageCount: number }> {
    const rows = this.db
      .query(
        `SELECT c.*, COUNT(m.id) AS message_count
         FROM chats c
         LEFT JOIN messages m ON m.chat_id = c.id
         GROUP BY c.id
         ORDER BY c.updated_at DESC;`
      )
      .all() as any[];

    return rows.map((r) => ({
      ...toChatRow(r),
      messageCount: Number(r.message_count ?? 0)
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

  count(): number {
    const row = this.db.query('SELECT COUNT(*) as count FROM chats;').get() as { count: number };
    return row?.count ?? 0;
  }
}

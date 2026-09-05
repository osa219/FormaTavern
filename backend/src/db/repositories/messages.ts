import type { Database } from 'bun:sqlite';
import type {
  Segment,
  StateVector,
  MessageStatus,
  MessageMetrics,
  MessageMetadata
} from '@formatavern/shared';
import type {
  MessageInsertInput,
  MessageRepository,
  MessageRow,
  MessageWithTree
} from '../contracts';

function toMessageRow(raw: any): MessageRow {
  return {
    id: raw.id,
    chatId: raw.chat_id,
    parentId: raw.parent_id ?? null,
    senderId: raw.sender_id ?? null,
    senderName: raw.sender_name ?? null,
    role: raw.role,
    narrativeRole: raw.narrative_role,
    content: raw.content,
    segments: raw.segments ? JSON.parse(raw.segments) : [],
    state: raw.state ? JSON.parse(raw.state) : null,
    status: raw.status,
    createdAt: raw.created_at,
    metrics: raw.metrics ? JSON.parse(raw.metrics) : null,
    metadata: raw.metadata ? JSON.parse(raw.metadata) : {}
  };
}

export class SQLiteMessageRepository implements MessageRepository {
  constructor(private db: Database) {}

  insert(row: MessageInsertInput): MessageRow {
    const createdAt = row.createdAt ?? Date.now();
    const status = row.status ?? 'complete';
    const senderId = row.senderId ?? null;
    const senderName = row.senderName ?? null;
    const segments = row.segments ?? [];
    const state = row.state ?? null;
    const metrics = row.metrics ?? null;
    const metadata = row.metadata ?? {};
    this.db.run(
      `INSERT INTO messages (
        id, chat_id, parent_id, sender_id, sender_name, role, narrative_role,
        content, segments, state, status, created_at, metrics, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        row.id,
        row.chatId,
        row.parentId,
        senderId,
        senderName,
        row.role,
        row.narrativeRole,
        row.content,
        JSON.stringify(segments),
        state ? JSON.stringify(state) : null,
        status,
        createdAt,
        metrics ? JSON.stringify(metrics) : null,
        JSON.stringify(metadata)
      ]
    );

    return {
      id: row.id,
      chatId: row.chatId,
      parentId: row.parentId,
      senderId,
      senderName,
      role: row.role,
      narrativeRole: row.narrativeRole,
      content: row.content,
      segments,
      state,
      status,
      createdAt,
      metrics,
      metadata
    };
  }

  get(id: string): MessageWithTree | null {
    const raw = this.db.query('SELECT * FROM messages WHERE id = ?;').get(id) as any;
    if (!raw) return null;

    const row = toMessageRow(raw);

    // Compute sibling stats
    let siblingsQuery: string;
    let params: any[];
    if (row.parentId === null) {
      siblingsQuery = 'SELECT id FROM messages WHERE chat_id = ? AND parent_id IS NULL ORDER BY id ASC;';
      params = [row.chatId];
    } else {
      siblingsQuery = 'SELECT id FROM messages WHERE chat_id = ? AND parent_id = ? ORDER BY id ASC;';
      params = [row.chatId, row.parentId];
    }

    const siblings = this.db.query(siblingsQuery).all(...params) as Array<{ id: string }>;
    const siblingIndex = siblings.findIndex((s) => s.id === row.id);
    const siblingCount = siblings.length;

    const childCheck = this.db
      .query('SELECT 1 FROM messages WHERE parent_id = ? LIMIT 1;')
      .get(row.id);
    const hasChildren = childCheck !== null;

    return {
      ...row,
      siblingIndex: siblingIndex >= 0 ? siblingIndex : 0,
      siblingCount: siblingCount > 0 ? siblingCount : 1,
      hasChildren
    };
  }

  path(leafId: string): MessageRow[] {
    const rows = this.db
      .query(
        `WITH RECURSIVE p(id, depth) AS (
           SELECT ?1, 0
           UNION ALL
           SELECT m.parent_id, p.depth + 1
           FROM messages m JOIN p ON m.id = p.id
           WHERE m.parent_id IS NOT NULL
         )
         SELECT m.* FROM messages m JOIN p ON m.id = p.id ORDER BY p.depth DESC;`
      )
      .all(leafId) as any[];

    return rows.map(toMessageRow);
  }

  children(id: string): MessageRow[] {
    const rows = this.db
      .query('SELECT * FROM messages WHERE parent_id = ? ORDER BY id ASC;')
      .all(id) as any[];
    return rows.map(toMessageRow);
  }

  siblings(id: string): MessageRow[] {
    const target = this.db.query('SELECT chat_id, parent_id FROM messages WHERE id = ?;').get(id) as any;
    if (!target) return [];

    let rows: any[];
    if (target.parent_id === null) {
      rows = this.db
        .query('SELECT * FROM messages WHERE chat_id = ? AND parent_id IS NULL ORDER BY id ASC;')
        .all(target.chat_id) as any[];
    } else {
      rows = this.db
        .query('SELECT * FROM messages WHERE chat_id = ? AND parent_id = ? ORDER BY id ASC;')
        .all(target.chat_id, target.parent_id) as any[];
    }

    return rows.map(toMessageRow);
  }

  descendLatest(id: string): string {
    let currentId = id;
    while (true) {
      const child = this.db
        .query('SELECT id FROM messages WHERE parent_id = ? ORDER BY id DESC LIMIT 1;')
        .get(currentId) as { id: string } | null;
      if (!child) break;
      currentId = child.id;
    }
    return currentId;
  }

  pageActiveBranch(
    chatId: string,
    leafId: string,
    opts: { before?: string; limit: number }
  ): MessageWithTree[] {
    const rows = this.db
      .query(
        `WITH RECURSIVE p(id, depth) AS (
           SELECT ?1, 0
           UNION ALL
           SELECT m.parent_id, p.depth + 1
           FROM messages m JOIN p ON m.id = p.id
           WHERE m.parent_id IS NOT NULL
         )
         SELECT m.* FROM messages m JOIN p ON m.id = p.id
         WHERE (?2 IS NULL OR p.depth > (SELECT p2.depth FROM p p2 WHERE p2.id = ?2))
         ORDER BY p.depth ASC
         LIMIT ?3;`
      )
      .all(leafId, opts.before ?? null, opts.limit) as any[];

    if (rows.length === 0) return [];

    // Chronological ascending order
    rows.reverse();
    const mapped = rows.map(toMessageRow);

    // Tree decorations in one extra query over the page's parent_ids
    const nonNullParents = Array.from(
      new Set(mapped.map((m) => m.parentId).filter((p): p is string => p !== null))
    );
    const hasRoot = mapped.some((m) => m.parentId === null);

    const conditions: string[] = [];
    const params: any[] = [chatId];

    if (nonNullParents.length > 0) {
      const placeholders = nonNullParents.map(() => '?').join(', ');
      conditions.push(`parent_id IN (${placeholders})`);
      params.push(...nonNullParents);
    }
    if (hasRoot) {
      conditions.push('parent_id IS NULL');
    }

    const whereClause = conditions.length > 0 ? `AND (${conditions.join(' OR ')})` : '';

    const treeStats = this.db
      .query(
        `SELECT id, parent_id,
                ROW_NUMBER() OVER (PARTITION BY chat_id, parent_id ORDER BY id) - 1 AS sibling_index,
                COUNT(*) OVER (PARTITION BY chat_id, parent_id) AS sibling_count,
                EXISTS(SELECT 1 FROM messages c WHERE c.parent_id = messages.id) AS has_children
         FROM messages
         WHERE chat_id = ? ${whereClause};`
      )
      .all(...params) as any[];

    const statsMap = new Map<string, { siblingIndex: number; siblingCount: number; hasChildren: boolean }>();
    for (const stat of treeStats) {
      statsMap.set(stat.id, {
        siblingIndex: Number(stat.sibling_index ?? 0),
        siblingCount: Number(stat.sibling_count ?? 1),
        hasChildren: Boolean(stat.has_children)
      });
    }

    return mapped.map((m) => {
      const s = statsMap.get(m.id);
      return {
        ...m,
        siblingIndex: s?.siblingIndex ?? 0,
        siblingCount: s?.siblingCount ?? 1,
        hasChildren: s?.hasChildren ?? false
      };
    });
  }

  countInChat(chatId: string): number {
    const row = this.db
      .query('SELECT COUNT(*) as count FROM messages WHERE chat_id = ?;')
      .get(chatId) as { count: number };
    return row?.count ?? 0;
  }

  updateStreaming(id: string, patch: { content: string; segments: Segment[] }): void {
    this.db.run(
      `UPDATE messages
       SET content = ?, segments = ?
       WHERE id = ? AND status = 'streaming';`,
      [patch.content, JSON.stringify(patch.segments), id]
    );
  }

  finalize(
    id: string,
    patch: {
      content: string;
      segments: Segment[];
      state: StateVector | null;
      status: MessageStatus;
      metrics: MessageMetrics | null;
      metadata: MessageMetadata;
    }
  ): void {
    this.db.run(
      `UPDATE messages
       SET content = ?, segments = ?, state = ?, status = ?, metrics = ?, metadata = ?
       WHERE id = ?;`,
      [
        patch.content,
        JSON.stringify(patch.segments),
        patch.state ? JSON.stringify(patch.state) : null,
        patch.status,
        patch.metrics ? JSON.stringify(patch.metrics) : null,
        JSON.stringify(patch.metadata ?? {}),
        id
      ]
    );
  }

  updateContent(
    id: string,
    patch: {
      content: string;
      segments: Segment[];
      state?: StateVector | null;
      metadata: MessageMetadata;
    }
  ): void {
    if (patch.state !== undefined) {
      this.db.run(
        `UPDATE messages
         SET content = ?, segments = ?, state = ?, metadata = ?
         WHERE id = ?;`,
        [
          patch.content,
          JSON.stringify(patch.segments),
          patch.state ? JSON.stringify(patch.state) : null,
          JSON.stringify(patch.metadata ?? {}),
          id
        ]
      );
    } else {
      this.db.run(
        `UPDATE messages
         SET content = ?, segments = ?, metadata = ?
         WHERE id = ?;`,
        [patch.content, JSON.stringify(patch.segments), JSON.stringify(patch.metadata ?? {}), id]
      );
    }
  }

  updateState(id: string, state: StateVector, metadata: MessageMetadata): void {
    this.db.run(
      `UPDATE messages
       SET state = ?, metadata = ?
       WHERE id = ?;`,
      [JSON.stringify(state), JSON.stringify(metadata ?? {}), id]
    );
  }

  reopenForContinue(id: string, content: string): void {
    this.db.run(
      `UPDATE messages
       SET status = 'streaming', content = ?
       WHERE id = ?;`,
      [content, id]
    );
  }

  remove(id: string): void {
    this.db.run('DELETE FROM messages WHERE id = ?;', [id]);
  }

  markStaleStreamingAsAborted(): string[] {
    const rows = this.db
      .query(`SELECT id, metadata FROM messages WHERE status = 'streaming';`)
      .all() as any[];

    if (rows.length === 0) return [];

    const recoveredIds: string[] = [];
    const updateStmt = this.db.prepare(
      `UPDATE messages SET status = 'aborted', metadata = ? WHERE id = ?;`
    );

    for (const r of rows) {
      const meta = r.metadata ? JSON.parse(r.metadata) : {};
      meta.recovered = true;
      meta.stateSource = 'inherited';
      updateStmt.run(JSON.stringify(meta), r.id);
      recoveredIds.push(r.id);
    }

    return recoveredIds;
  }
}

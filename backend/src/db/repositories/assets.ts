import type { Database, Statement } from 'bun:sqlite';
import type {
  AssetRecord,
  CharacterAssetRecord,
  CharacterAssetRole,
  AssetRepository
} from '../contracts';

export class SQLiteAssetRepository implements AssetRepository {
  private stmtGet: Statement;
  private stmtHas: Statement;
  private stmtInsert: Statement;
  private stmtCount: Statement;
  private stmtDelete: Statement;
  private stmtBindChar: Statement;
  private stmtGetCharAll: Statement;
  private stmtGetCharByRole: Statement;
  private stmtDeleteCharAll: Statement;
  private stmtDeleteCharByRole: Statement;
  private stmtBindMsg: Statement;
  private stmtGetMsg: Statement;

  constructor(private db: Database) {
    this.stmtGet = db.query(
      `SELECT id, mime, ext, size, width, height, path, created_at as createdAt FROM assets WHERE id = ?;`
    );
    this.stmtHas = db.query(`SELECT 1 FROM assets WHERE id = ?;`);
    this.stmtInsert = db.query(
      `INSERT INTO assets (id, mime, ext, size, width, height, path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         mime = excluded.mime,
         ext = excluded.ext,
         size = excluded.size,
         width = excluded.width,
         height = excluded.height,
         path = excluded.path;`
    );
    this.stmtCount = db.query(`SELECT COUNT(*) as count FROM assets;`);
    this.stmtDelete = db.query(`DELETE FROM assets WHERE id = ?;`);

    this.stmtBindChar = db.query(
      `INSERT INTO character_assets (id, character_id, asset_id, role, label, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         asset_id = excluded.asset_id,
         role = excluded.role,
         label = excluded.label,
         sort_order = excluded.sort_order;`
    );
    this.stmtGetCharAll = db.query(
      `SELECT id, character_id as characterId, asset_id as assetId, role, label, sort_order as sortOrder, created_at as createdAt
       FROM character_assets WHERE character_id = ? ORDER BY sort_order ASC, created_at ASC;`
    );
    this.stmtGetCharByRole = db.query(
      `SELECT id, character_id as characterId, asset_id as assetId, role, label, sort_order as sortOrder, created_at as createdAt
       FROM character_assets WHERE character_id = ? AND role = ? ORDER BY sort_order ASC, created_at ASC;`
    );
    this.stmtDeleteCharAll = db.query(`DELETE FROM character_assets WHERE character_id = ?;`);
    this.stmtDeleteCharByRole = db.query(`DELETE FROM character_assets WHERE character_id = ? AND role = ?;`);

    this.stmtBindMsg = db.query(`INSERT OR IGNORE INTO message_assets (message_id, asset_id) VALUES (?, ?);`);
    this.stmtGetMsg = db.query(`SELECT asset_id FROM message_assets WHERE message_id = ?;`);
  }

  get(id: string): AssetRecord | null {
    const row = this.stmtGet.get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      mime: row.mime,
      ext: row.ext,
      size: Number(row.size),
      width: Number(row.width),
      height: Number(row.height),
      path: row.path,
      createdAt: Number(row.createdAt)
    };
  }

  has(id: string): boolean {
    return Boolean(this.stmtHas.get(id));
  }

  insert(asset: AssetRecord): void {
    this.stmtInsert.run(
      asset.id,
      asset.mime,
      asset.ext,
      asset.size,
      asset.width,
      asset.height,
      asset.path,
      asset.createdAt
    );
  }

  count(): number {
    return (this.stmtCount.get() as any)?.count ?? 0;
  }

  list(opts?: { limit?: number; offset?: number }): AssetRecord[] {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;
    const rows = this.db
      .query(
        `SELECT id, mime, ext, size, width, height, path, created_at as createdAt
         FROM assets ORDER BY created_at DESC LIMIT ? OFFSET ?;`
      )
      .all(limit, offset) as any[];

    return rows.map((row) => ({
      id: row.id,
      mime: row.mime,
      ext: row.ext,
      size: Number(row.size),
      width: Number(row.width),
      height: Number(row.height),
      path: row.path,
      createdAt: Number(row.createdAt)
    }));
  }

  delete(id: string): boolean {
    const res = this.stmtDelete.run(id);
    return res.changes > 0;
  }

  bindCharacterAsset(binding: CharacterAssetRecord): void {
    this.stmtBindChar.run(
      binding.id,
      binding.characterId,
      binding.assetId,
      binding.role,
      binding.label ?? null,
      binding.sortOrder,
      binding.createdAt
    );
  }

  getCharacterAssets(characterId: string, role?: CharacterAssetRole): CharacterAssetRecord[] {
    const rows = role
      ? (this.stmtGetCharByRole.all(characterId, role) as any[])
      : (this.stmtGetCharAll.all(characterId) as any[]);

    return rows.map((r) => ({
      id: r.id,
      characterId: r.characterId,
      assetId: r.assetId,
      role: r.role as CharacterAssetRole,
      label: r.label,
      sortOrder: Number(r.sortOrder),
      createdAt: Number(r.createdAt)
    }));
  }

  deleteCharacterAssets(characterId: string, role?: CharacterAssetRole): void {
    if (role) {
      this.stmtDeleteCharByRole.run(characterId, role);
    } else {
      this.stmtDeleteCharAll.run(characterId);
    }
  }

  bindMessageAsset(messageId: string, assetId: string): void {
    this.stmtBindMsg.run(messageId, assetId);
  }

  getMessageAssets(messageId: string): string[] {
    const rows = this.stmtGetMsg.all(messageId) as any[];
    return rows.map((r) => r.asset_id);
  }
}

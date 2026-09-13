import type { Database } from 'bun:sqlite';
import {
  assertValid,
  ProviderConfigSchema,
  type ProviderConfig,
  type ProviderConfigCreate,
  type ProviderConfigPatch,
  type ProviderConfigType
} from '@formatavern/shared';
import type { ProviderConfigRepository } from '../contracts';
import { newId } from '../ids';

interface ProviderConfigRow {
  id: string;
  name: string;
  provider_type: string;
  base_url: string | null;
  api_key: string | null;
  model: string | null;
  custom_prompt: string | null;
  created_at: number;
  updated_at: number;
}

function rowToConfig(row: ProviderConfigRow): ProviderConfig {
  const config: ProviderConfig = {
    id: row.id,
    name: row.name,
    providerType: row.provider_type as ProviderConfigType,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (row.base_url !== null) config.baseUrl = row.base_url;
  if (row.api_key !== null) config.apiKey = row.api_key;
  if (row.model !== null) config.model = row.model;
  if (row.custom_prompt !== null) config.customPrompt = row.custom_prompt;
  return config;
}

export class SQLiteProviderConfigRepository implements ProviderConfigRepository {
  constructor(private db: Database) {}

  list(): ProviderConfig[] {
    const rows = this.db
      .query(`SELECT * FROM provider_configs ORDER BY updated_at DESC, id ASC;`)
      .all() as ProviderConfigRow[];
    return rows.map(rowToConfig);
  }

  get(id: string): ProviderConfig | null {
    const row = this.db.query(`SELECT * FROM provider_configs WHERE id = ?;`).get(id) as
      | ProviderConfigRow
      | null;
    return row ? rowToConfig(row) : null;
  }

  count(): number {
    const row = this.db.query(`SELECT count(*) as count FROM provider_configs;`).get() as {
      count: number;
    };
    return Number(row?.count ?? 0);
  }

  create(input: ProviderConfigCreate): ProviderConfig | 'name_taken' {
    const name = input.name.trim();
    if (!name) throw new Error('Provider config name cannot be empty');
    const existing = this.db
      .query(`SELECT id FROM provider_configs WHERE name = ? COLLATE NOCASE LIMIT 1;`)
      .get(name);
    if (existing) return 'name_taken';

    const now = Date.now();
    const config: ProviderConfig = {
      id: newId(),
      name,
      providerType: input.providerType,
      createdAt: now,
      updatedAt: now
    };
    if (input.baseUrl !== undefined && input.baseUrl !== null) config.baseUrl = input.baseUrl.trim();
    if (input.apiKey !== undefined && input.apiKey !== null) config.apiKey = input.apiKey;
    if (input.model !== undefined && input.model !== null) config.model = input.model.trim();
    if (input.customPrompt !== undefined && input.customPrompt !== null) {
      config.customPrompt = input.customPrompt;
    }

    assertValid(ProviderConfigSchema, config, `ProviderConfig(${config.id})`);
    this.db.run(
      `INSERT INTO provider_configs
        (id, name, provider_type, base_url, api_key, model, custom_prompt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        config.id,
        config.name,
        config.providerType,
        config.baseUrl ?? null,
        config.apiKey ?? null,
        config.model ?? null,
        config.customPrompt ?? null,
        config.createdAt,
        config.updatedAt
      ]
    );
    return config;
  }

  patch(id: string, input: ProviderConfigPatch): ProviderConfig | 'missing' | 'name_taken' {
    return this.db.transaction(() => {
      const row = this.db.query(`SELECT * FROM provider_configs WHERE id = ?;`).get(id) as
        | ProviderConfigRow
        | null;
      if (!row) return 'missing';
      const current = rowToConfig(row);

      let name = current.name;
      if (input.name !== undefined) {
        name = input.name.trim();
        if (!name) throw new Error('Provider config name cannot be empty');
        if (name.toLowerCase() !== current.name.toLowerCase()) {
          const clash = this.db
            .query(`SELECT id FROM provider_configs WHERE name = ? COLLATE NOCASE AND id != ? LIMIT 1;`)
            .get(name, id);
          if (clash) return 'name_taken';
        }
      }

      const merged: ProviderConfig = {
        ...current,
        name,
        baseUrl:
          input.baseUrl === undefined ? current.baseUrl : (input.baseUrl?.trim() || undefined),
        apiKey: input.apiKey === undefined ? current.apiKey : (input.apiKey ?? undefined),
        model:
          input.model === undefined ? current.model : (input.model?.trim() || undefined),
        customPrompt: input.customPrompt === undefined ? current.customPrompt : (input.customPrompt ?? undefined),
        updatedAt: Date.now()
      };

      assertValid(ProviderConfigSchema, merged, `ProviderConfig(${id})`);
      this.db.run(
        `UPDATE provider_configs SET
          name = ?, base_url = ?, api_key = ?, model = ?, custom_prompt = ?, updated_at = ?
         WHERE id = ?;`,
        [
          merged.name,
          merged.baseUrl ?? null,
          merged.apiKey ?? null,
          merged.model ?? null,
          merged.customPrompt ?? null,
          merged.updatedAt,
          id
        ]
      );
      return merged;
    })();
  }

  remove(id: string): boolean {
    const res = this.db.run(`DELETE FROM provider_configs WHERE id = ?;`, [id]);
    return res.changes > 0;
  }
}

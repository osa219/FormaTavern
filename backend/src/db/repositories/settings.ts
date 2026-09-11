import type { Database } from 'bun:sqlite';
import {
  Value,
  AppSettingsSchema,
  DEFAULT_SETTINGS,
  ShellThemeSchema,
  DEFAULT_SHELL_THEME,
  type AppSettings,
  type SettingsPatch,
  type ShellTheme
} from '@formatavern/shared';
import type { SettingsRepository } from '../contracts';

export class SQLiteSettingsRepository implements SettingsRepository {
  constructor(private db: Database) {}

  getAll(): AppSettings {
    const rows = this.db.query('SELECT key, value FROM settings;').all() as Array<{
      key: string;
      value: string;
    }>;

    const raw: Record<string, any> = {};
    const subSchemas: Record<string, any> = {
      provider: AppSettingsSchema.properties.provider,
      openrouter: AppSettingsSchema.properties.openrouter,
      generation: AppSettingsSchema.properties.generation,
      narrative: AppSettingsSchema.properties.narrative,
      preamble: AppSettingsSchema.properties.preamble
    };

    for (const r of rows) {
      try {
        const parsed = JSON.parse(r.value);
        const sub = subSchemas[r.key];
        if (sub) {
          const defaulted = Value.Default(sub, parsed);
          if (Value.Check(sub, defaulted)) {
            raw[r.key] = defaulted;
          } else {
            console.warn(`[Settings] Invalid or corrupt settings key "${r.key}"; resetting to default.`);
          }
        }
      } catch {
        console.warn(`[Settings] Unparseable JSON for key "${r.key}"; resetting to default.`);
      }
    }

    const cleaned = Value.Clean(AppSettingsSchema, raw);
    return Value.Default(AppSettingsSchema, cleaned) as AppSettings;
  }

  patch(p: SettingsPatch): AppSettings {
    const now = Date.now();
    const upsertStmt = this.db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`
    );
    const deleteStmt = this.db.prepare('DELETE FROM settings WHERE key = ?;');

    this.db.transaction(() => {
      // 1. provider
      if (p.provider !== undefined) {
        const current = this.loadSubObject('provider');
        const merged = { ...current, ...p.provider };
        upsertStmt.run('provider', JSON.stringify(merged), now);
      }

      // 2. openrouter
      if (p.openrouter !== undefined) {
        const current = this.loadSubObject('openrouter');
        if (p.openrouter.apiKey === null) {
          delete current.apiKey;
        } else if (p.openrouter.apiKey !== undefined) {
          current.apiKey = p.openrouter.apiKey;
        }
        upsertStmt.run('openrouter', JSON.stringify(current), now);
      }

      // 3. generation
      if (p.generation !== undefined) {
        const current = this.loadSubObject('generation');
        const merged = { ...current, ...p.generation };
        upsertStmt.run('generation', JSON.stringify(merged), now);
      }

      // 4. narrative
      if (p.narrative !== undefined) {
        const current = this.loadSubObject('narrative');
        const merged = { ...current, ...p.narrative };
        upsertStmt.run('narrative', JSON.stringify(merged), now);
      }

      // 5. preamble
      if (p.preamble !== undefined) {
        if (p.preamble === null) {
          deleteStmt.run('preamble');
        } else {
          upsertStmt.run('preamble', JSON.stringify(p.preamble), now);
        }
      }
    })();

    return this.getAll();
  }

  getRaw(key: string): string | null {
    const row = this.db.query('SELECT value FROM settings WHERE key = ?;').get(key) as {
      value: string;
    } | null;
    return row?.value ?? null;
  }

  getShellTheme(): ShellTheme {
    const raw = this.getRaw('shell_theme');
    if (!raw) return DEFAULT_SHELL_THEME;
    try {
      const parsed = JSON.parse(raw);
      if (Value.Check(ShellThemeSchema, parsed)) {
        return parsed as ShellTheme;
      }
      console.warn('[Settings] Invalid or corrupt shell_theme; resetting to default.');
      return DEFAULT_SHELL_THEME;
    } catch {
      console.warn('[Settings] Unparseable JSON for shell_theme; resetting to default.');
      return DEFAULT_SHELL_THEME;
    }
  }

  putShellTheme(doc: ShellTheme): ShellTheme {
    const now = Date.now();
    const cleaned = Value.Clean(ShellThemeSchema, doc);
    this.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`
      )
      .run('shell_theme', JSON.stringify(cleaned), now);
    return this.getShellTheme();
  }

  private loadSubObject(key: string): Record<string, any> {
    const raw = this.getRaw(key);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }
}

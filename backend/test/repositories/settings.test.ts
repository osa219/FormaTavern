import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { openTestDb, type TestDbInstance } from '../helpers';
import { runMigrations } from '../../src/db/migrate';
import { createRepositories } from '../../src/db/repositories';
import { DEFAULT_SETTINGS } from '@formatavern/shared';

describe('SQLiteSettingsRepository', () => {
  let inst: TestDbInstance;

  beforeEach(() => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
  });

  afterEach(() => {
    inst?.cleanup();
  });

  it('returns DEFAULT_SETTINGS on empty settings table', () => {
    const repos = createRepositories(inst.db);
    const settings = repos.settings.getAll();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('partially patches generation and narrative settings and preserves untouched keys', () => {
    const repos = createRepositories(inst.db);

    repos.settings.patch({
      generation: { temperature: 1.1, maxTokens: 2048 }
    });

    const s1 = repos.settings.getAll();
    expect(s1.generation.temperature).toBe(1.1);
    expect(s1.generation.maxTokens).toBe(2048);
    // contextLength kept default
    expect(s1.generation.contextLength).toBe(16_384);
    // provider and narrative kept default
    expect(s1.provider).toEqual({ id: 'mock' });
    expect(s1.narrative.defaultMode).toBe('narrative');

    // Patch narrative dialect
    repos.settings.patch({
      narrative: { defaultDialect: 'xml' }
    });

    const s2 = repos.settings.getAll();
    expect(s2.narrative.defaultDialect).toBe('xml');
    expect(s2.narrative.defaultMode).toBe('narrative');
    expect(s2.generation.temperature).toBe(1.1);
  });

  it('handles apiKey set, keep, and clear (via null)', () => {
    const repos = createRepositories(inst.db);

    // 1. Set key
    repos.settings.patch({
      openrouter: { apiKey: 'sk-or-secret-key-12345' }
    });

    const s1 = repos.settings.getAll();
    expect(s1.openrouter.apiKey).toBe('sk-or-secret-key-12345');

    // 2. Keep key on unrelated patch
    repos.settings.patch({
      provider: { id: 'openrouter', model: 'anthropic/claude-3.5-sonnet' }
    });

    const s2 = repos.settings.getAll();
    expect(s2.openrouter.apiKey).toBe('sk-or-secret-key-12345');
    expect(s2.provider).toEqual({ id: 'openrouter', model: 'anthropic/claude-3.5-sonnet' });

    // 3. Clear key with apiKey: null
    repos.settings.patch({
      openrouter: { apiKey: null }
    });

    const s3 = repos.settings.getAll();
    expect(s3.openrouter.apiKey).toBeUndefined();
  });

  it('falls back to defaults if a row in the database has invalid or corrupt JSON', () => {
    const repos = createRepositories(inst.db);

    // Corrupt generation key directly in table
    inst.db.run(
      `INSERT INTO settings (key, value, updated_at) VALUES ('generation', 'NOT_JSON', ?);`,
      [Date.now()]
    );
    // Invalid schema in narrative (e.g. temperature out of range or wrong type)
    inst.db.run(
      `INSERT INTO settings (key, value, updated_at) VALUES ('narrative', '{"defaultMode":"bogus"}', ?);`,
      [Date.now()]
    );

    const s = repos.settings.getAll();
    expect(s.generation).toEqual(DEFAULT_SETTINGS.generation);
    expect(s.narrative).toEqual(DEFAULT_SETTINGS.narrative);
  });

  it('roundtrips custom baseUrl/apiKey and gemini apiKey, including null clears', () => {
    const repos = createRepositories(inst.db);

    repos.settings.patch({
      custom: { baseUrl: 'http://localhost:11434/v1', apiKey: 'local-secret' },
      gemini: { apiKey: 'AI-test-key' }
    });

    const s1 = repos.settings.getAll();
    expect(s1.custom.baseUrl).toBe('http://localhost:11434/v1');
    expect(s1.custom.apiKey).toBe('local-secret');
    expect(s1.gemini.apiKey).toBe('AI-test-key');
    // openrouter untouched
    expect(s1.openrouter.apiKey).toBeUndefined();

    // Null clears
    repos.settings.patch({ custom: { baseUrl: null, apiKey: null }, gemini: { apiKey: null } });

    const s2 = repos.settings.getAll();
    expect(s2.custom.baseUrl).toBeUndefined();
    expect(s2.custom.apiKey).toBeUndefined();
    expect(s2.gemini.apiKey).toBeUndefined();
  });
});

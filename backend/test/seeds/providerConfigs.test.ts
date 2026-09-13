import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { openTestDb, type TestDbInstance } from '../helpers';
import { runMigrations } from '../../src/db/migrate';
import { createRepositories } from '../../src/db/repositories';
import { seedProviderConfigs } from '../../src/db/seeds/providerConfigs';

describe('seedProviderConfigs', () => {
  let inst: TestDbInstance;
  const savedEnv = { ...process.env };

  beforeEach(() => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.CUSTOM_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    process.env.OPENROUTER_API_KEY = savedEnv.OPENROUTER_API_KEY;
    process.env.CUSTOM_API_KEY = savedEnv.CUSTOM_API_KEY;
    process.env.GEMINI_API_KEY = savedEnv.GEMINI_API_KEY;
    inst?.cleanup();
  });

  it('no-ops on fresh installs with no legacy material', () => {
    const repos = createRepositories(inst.db);
    const res = seedProviderConfigs(repos);
    expect(res).toEqual({ seeded: false, configs: 0, activeConfigId: null });
    expect(repos.providerConfigs.count()).toBe(0);
  });

  it('seeds the legacy openrouter key, carries the model, and activates it', () => {
    const repos = createRepositories(inst.db);
    repos.settings.patch({
      provider: { id: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
      openrouter: { apiKey: 'sk-or-legacy' }
    });

    const res = seedProviderConfigs(repos);
    expect(res.seeded).toBe(true);
    expect(res.configs).toBe(1);

    const rows = repos.providerConfigs.list();
    expect(rows.map((r) => r.name)).toEqual(['OpenRouter']);
    expect(rows[0].providerType).toBe('openrouter');
    expect(rows[0].apiKey).toBe('sk-or-legacy');
    expect(rows[0].model).toBe('anthropic/claude-3.5-sonnet');

    expect(res.activeConfigId).toBe(rows[0].id);
    expect(repos.settings.getAll().provider.activeConfigId).toBe(rows[0].id);
    // Legacy rows left untouched
    expect(repos.settings.getAll().openrouter.apiKey).toBe('sk-or-legacy');
  });

  it('seeds multiple types, activates the legacy one, and is idempotent', () => {
    const repos = createRepositories(inst.db);
    repos.settings.patch({
      provider: { id: 'custom', model: 'llama3.1' },
      custom: { baseUrl: 'http://localhost:11434/v1' },
      gemini: { apiKey: 'AI-legacy' }
    });

    const first = seedProviderConfigs(repos);
    expect(first.seeded).toBe(true);
    expect(first.configs).toBe(2);

    const rows = repos.providerConfigs.list();
    const byName = new Map(rows.map((r) => [r.name, r]));
    expect(byName.get('Custom')?.baseUrl).toBe('http://localhost:11434/v1');
    expect(byName.get('Custom')?.apiKey).toBeUndefined();
    expect(byName.get('Custom')?.model).toBe('llama3.1');
    expect(byName.get('Gemini')?.apiKey).toBe('AI-legacy');
    expect(byName.get('Gemini')?.model).toBeUndefined();
    expect(first.activeConfigId).toBe(byName.get('Custom')!.id);

    const second = seedProviderConfigs(repos);
    expect(second.seeded).toBe(false);
    expect(second.configs).toBe(2);
    expect(repos.providerConfigs.count()).toBe(2);
  });

  it('seeds env-backed rows without storing the key', () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-env-only';
    const repos = createRepositories(inst.db);

    const res = seedProviderConfigs(repos);
    expect(res.seeded).toBe(true);
    const rows = repos.providerConfigs.list();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('OpenRouter');
    expect(rows[0].apiKey).toBeUndefined();
    expect(res.activeConfigId).toBe(rows[0].id);
  });

  it('leaves user-created configs alone', () => {
    const repos = createRepositories(inst.db);
    const mine = repos.providerConfigs.create({ name: 'Mine', providerType: 'custom' });
    if (mine === 'name_taken') throw new Error('unreachable');
    repos.settings.patch({ openrouter: { apiKey: 'sk-or-legacy' } });

    const res = seedProviderConfigs(repos);
    expect(res.seeded).toBe(false);
    expect(res.configs).toBe(1);
    expect(repos.providerConfigs.list().map((r) => r.name)).toEqual(['Mine']);
    expect(repos.settings.getAll().provider.activeConfigId).toBeUndefined();
  });
});

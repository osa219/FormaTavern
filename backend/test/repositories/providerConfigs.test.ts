import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { openTestDb, type TestDbInstance } from '../helpers';
import { runMigrations } from '../../src/db/migrate';
import { createRepositories } from '../../src/db/repositories';

describe('SQLiteProviderConfigRepository', () => {
  let inst: TestDbInstance;

  beforeEach(() => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
  });

  afterEach(() => {
    inst?.cleanup();
  });

  it('starts empty and roundtrips a full config', () => {
    const repos = createRepositories(inst.db);
    expect(repos.providerConfigs.count()).toBe(0);
    expect(repos.providerConfigs.list()).toEqual([]);

    const created = repos.providerConfigs.create({
      name: 'Local Ollama',
      providerType: 'custom',
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama3.1',
      customPrompt: 'Keep replies short.'
    });
    expect(created).not.toBe('name_taken');
    if (created === 'name_taken') throw new Error('unreachable');

    expect(created.id.length).toBeGreaterThan(0);
    expect(created.apiKey).toBeUndefined();

    const fetched = repos.providerConfigs.get(created.id);
    expect(fetched).toEqual(created);
    expect(repos.providerConfigs.count()).toBe(1);
  });

  it('rejects duplicate names case-insensitively', () => {
    const repos = createRepositories(inst.db);
    const first = repos.providerConfigs.create({ name: 'OpenRouter', providerType: 'openrouter' });
    expect(first).not.toBe('name_taken');

    expect(
      repos.providerConfigs.create({ name: 'openrouter', providerType: 'openrouter' })
    ).toBe('name_taken');
    expect(
      repos.providerConfigs.create({ name: '  OpenRouter  ', providerType: 'custom' })
    ).toBe('name_taken');

    if (first === 'name_taken') throw new Error('unreachable');
    expect(repos.providerConfigs.patch(first.id, { name: 'OPENROUTER' })).not.toBe('name_taken');

    const second = repos.providerConfigs.create({ name: 'Second', providerType: 'custom' });
    if (second === 'name_taken') throw new Error('unreachable');
    expect(repos.providerConfigs.patch(second.id, { name: 'openrouter' })).toBe('name_taken');
  });

  it('patches fields and clears optionals with null', () => {
    const repos = createRepositories(inst.db);
    const created = repos.providerConfigs.create({
      name: 'Gem',
      providerType: 'gemini',
      apiKey: 'AI-secret',
      model: 'gemini-3.5-flash'
    });
    if (created === 'name_taken') throw new Error('unreachable');

    const patched = repos.providerConfigs.patch(created.id, {
      name: 'Gemini Main',
      apiKey: null,
      model: null
    });
    expect(patched).not.toBe('missing');
    if (patched === 'missing' || patched === 'name_taken') throw new Error('unreachable');
    expect(patched.name).toBe('Gemini Main');
    expect(patched.apiKey).toBeUndefined();
    expect(patched.model).toBeUndefined();
    expect(patched.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);

    expect(repos.providerConfigs.patch('nope', { name: 'x' })).toBe('missing');
  });

  it('removes configs and reports counts in list order', () => {
    const repos = createRepositories(inst.db);
    const a = repos.providerConfigs.create({ name: 'A', providerType: 'openrouter' });
    if (a === 'name_taken') throw new Error('unreachable');
    const b = repos.providerConfigs.create({ name: 'B', providerType: 'openrouter' });
    if (b === 'name_taken') throw new Error('unreachable');

    expect(repos.providerConfigs.remove('missing-id')).toBe(false);
    expect(repos.providerConfigs.remove(b.id)).toBe(true);
    expect(repos.providerConfigs.get(b.id)).toBeNull();
    expect(repos.providerConfigs.count()).toBe(1);
    expect(repos.providerConfigs.list().map((c) => c.name)).toEqual(['A']);
  });
});

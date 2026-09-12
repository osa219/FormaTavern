import { describe, it, expect, afterEach } from 'bun:test';
import { runMigrations } from '../src/db/migrate';
import { createRepositories } from '../src/db/repositories';
import { seed } from '../src/db/seeds/seed';
import { alice } from '../src/db/seeds/characters';
import { sanitizeCss } from '@formatavern/shared/customCss';
import { openTestDb, type TestDbInstance } from './helpers';

describe('Database Seeding', () => {
  let inst: TestDbInstance;

  afterEach(() => {
    inst?.cleanup();
  });

  it('seeds empty database with 2 characters and 1 persona, and is idempotent on re-run without rewriting', async () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);

    const first = seed(repos);
    expect(first.seeded).toBe(true);
    expect(repos.characters.count()).toBe(2);
    expect(repos.personas.count()).toBe(1);

    const eldrin1 = repos.characters.get('eldrin-the-mage');
    const alice1 = repos.characters.get('alice');
    const persona1 = repos.personas.get('persona-default');
    expect(eldrin1).not.toBeNull();
    expect(alice1).not.toBeNull();
    expect(persona1).not.toBeNull();

    const row1 = inst.db
      .query(`SELECT updated_at FROM characters WHERE id = 'eldrin-the-mage'`)
      .get() as { updated_at: number };

    await new Promise((r) => setTimeout(r, 10));

    const second = seed(repos);
    expect(second.seeded).toBe(false);
    expect(repos.characters.count()).toBe(2);
    expect(repos.personas.count()).toBe(1);

    const row2 = inst.db
      .query(`SELECT updated_at FROM characters WHERE id = 'eldrin-the-mage'`)
      .get() as { updated_at: number };
    expect(row2.updated_at).toBe(row1.updated_at);
  });

  it('preserves user modifications on normal seed, but resets with force: true', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);

    seed(repos);

    const eldrin = repos.characters.get('eldrin-the-mage')!;
    repos.characters.upsert({ ...eldrin, name: 'Custom Archmage Name' });

    // Normal seed does not overwrite existing character
    seed(repos);
    expect(repos.characters.get('eldrin-the-mage')?.name).toBe('Custom Archmage Name');

    // Force seed reverts to official definition
    seed(repos, { force: true });
    expect(repos.characters.get('eldrin-the-mage')?.name).toBe('Eldrin the Mage');
  });

  it('does not re-seed deleted characters if other characters exist (seed-if-empty semantics)', () => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);

    seed(repos);
    expect(repos.characters.count()).toBe(2);

    repos.characters.remove('alice');
    expect(repos.characters.count()).toBe(1);

    // Booting / calling seed again must NOT restore Alice because DB is not empty
    const result = seed(repos);
    expect(result.seeded).toBe(false);
    expect(repos.characters.count()).toBe(1);
    expect(repos.characters.get('alice')).toBeNull();
  });

  it('seeds Alice with the gothic gold showpiece customCss which is 100% sanitizeCss-clean', () => {
    expect(alice.customCss).toBeDefined();
    expect(typeof alice.customCss).toBe('string');
    expect(alice.customCss!.length).toBeGreaterThan(100);

    const lineCount = alice.customCss!.trim().split('\n').length;
    expect(lineCount).toBeGreaterThanOrEqual(50);
    expect(lineCount).toBeLessThanOrEqual(70);

    // Verify sanitizeCss-clean on both character and chat scopes
    const charClean = sanitizeCss(alice.customCss!, 'character');
    expect(charClean.report.filter((r) => r.kind !== 'note')).toEqual([]);
    expect(charClean.css.length).toBeGreaterThan(0);

    const chatClean = sanitizeCss(alice.customCss!, 'chat');
    expect(chatClean.report.filter((r) => r.kind !== 'note')).toEqual([]);
    expect(chatClean.css.length).toBeGreaterThan(0);

    // Verify DB seeding stores Alice with customCss intact
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);
    seed(repos);

    const aliceRecord = repos.characters.get('alice');
    expect(aliceRecord).not.toBeNull();
    expect(aliceRecord?.customCss).toBe(alice.customCss);
    expect(aliceRecord?.style?.fx?.bubble).toBe('glow');
  });
});

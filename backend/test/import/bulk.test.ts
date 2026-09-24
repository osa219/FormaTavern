import { describe, it, expect, afterEach } from 'bun:test';
import { ApiError } from '../../src/engine/errors';
import { createTestImportEnv, type TestImportEnv } from './testUtils';

describe('CustomEngine Bulk Import & Atomicity (X2)', () => {
  let env: TestImportEnv;

  afterEach(async () => {
    if (env) {
      await env.cleanup();
    }
  });

  it('guarantees batch atomicity: injected error rolls back failing batch while preserving prior committed batches', async () => {
    env = await createTestImportEnv();

    // Create 4 characters with batchSize = 2 -> 2 batches
    for (let i = 1; i <= 4; i++) {
      await env.writeCharacter({
        id: `batch-char-${i}`,
        name: `Batch Character ${i}`,
        description: `Description ${i}`,
        personality: 'Test',
        scenario: 'Test',
        first_message: 'Hi'
      });
    }

    // Run import with failure injected in batch index 1 (second batch)
    let caughtError: any = null;
    try {
      await env.service.sync(env.sourceDir, {
        batchSize: 2,
        onBeforeBatchCommit: (batchIndex) => {
          if (batchIndex === 1) {
            throw new Error('Simulated failure during second batch');
          }
        }
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError.message).toBe('Simulated failure during second batch');

    // Batch 0 (char 1 and 2) MUST be committed in DB!
    const c1 = env.repos.characters.findByProvenance('custom_engine', 'batch-char-1');
    const c2 = env.repos.characters.findByProvenance('custom_engine', 'batch-char-2');
    expect(c1).not.toBeNull();
    expect(c2).not.toBeNull();

    // Batch 1 (char 3 and 4) MUST have rolled back!
    const c3 = env.repos.characters.findByProvenance('custom_engine', 'batch-char-3');
    const c4 = env.repos.characters.findByProvenance('custom_engine', 'batch-char-4');
    expect(c3).toBeNull();
    expect(c4).toBeNull();
  });

  it('rebuilds FTS index at end of bulk sync and achieves full search parity', async () => {
    env = await createTestImportEnv();

    for (let i = 1; i <= 5; i++) {
      await env.writeCharacter({
        id: `fts-char-${i}`,
        name: `Wizard ${i}`,
        description: `Specialized in elemental fire ${i}`,
        personality: 'Wise',
        scenario: 'Tower',
        first_message: 'Greetings traveler',
        tags: ['magic', 'sorcery']
      });
    }

    const report = await env.service.sync(env.sourceDir, { batchSize: 2 });
    expect(report.insertedChars).toBe(5);

    // Verify FTS table parity
    const ftsCount = (
      env.inst.db.query('SELECT COUNT(*) as count FROM characters_fts;').get() as { count: number }
    ).count;
    const charCount = env.repos.characters.count();
    expect(ftsCount).toBe(charCount);
    expect(ftsCount).toBe(5);

    // Test FTS search via character list
    const searchRes = env.repos.characters.list({ q: 'elemental fire' });
    expect(searchRes.items.length).toBe(5);
  });

  it('rejects concurrent sync with 409 sync_in_progress', async () => {
    env = await createTestImportEnv();

    await env.writeCharacter({
      id: 'concurrent-char',
      name: 'Concurrent Character',
      description: 'Testing concurrency guard',
      personality: 'Busy',
      scenario: 'Lock',
      first_message: 'Please wait'
    });

    let secondCallError: any = null;

    // Start first sync and pause inside it
    const sync1 = env.service.sync(env.sourceDir, {
      onBeforeBatchCommit: () => {
        // While first sync holds the lock, attempt second sync
        try {
          // This should throw immediately
          const sync2Promise = env.service.sync(env.sourceDir);
          // Catch synchronous or rejected promise
          sync2Promise.catch((e) => {
            secondCallError = e;
          });
        } catch (e) {
          secondCallError = e;
        }
      }
    });

    await sync1;

    // Allow promise to resolve
    await Bun.sleep(10);

    expect(secondCallError).not.toBeNull();
    expect(secondCallError).toBeInstanceOf(ApiError);
    expect(secondCallError.status).toBe(409);
    expect(secondCallError.code).toBe('sync_in_progress');
  });
});

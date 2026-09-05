import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { openTestDb, type TestDbInstance } from '../helpers';
import { runMigrations } from '../../src/db/migrate';
import { createRepositories } from '../../src/db/repositories';
import { eldrin } from '../../src/db/seeds/characters';
import { defaultPersona } from '../../src/db/seeds/personas';
import type { MessageRow } from '../../src/db/contracts';

describe('SQLiteMessageRepository', () => {
  let inst: TestDbInstance;

  beforeEach(() => {
    inst = openTestDb(':memory:');
    runMigrations(inst.db);
    const repos = createRepositories(inst.db);
    repos.characters.upsert(eldrin);
    repos.personas.upsert(defaultPersona);
    repos.chats.create({
      id: 'test-chat',
      title: 'Branching Tree Test',
      primaryCharacterId: eldrin.id,
      activePersonaId: defaultPersona.id,
      metadata: {}
    });
  });

  afterEach(() => {
    inst?.cleanup();
  });

  function makeMsg(partial: Partial<MessageRow> & { id: string }): MessageRow {
    return {
      chatId: 'test-chat',
      parentId: null,
      senderId: 'eldrin-the-mage',
      senderName: 'Eldrin',
      role: 'assistant',
      narrativeRole: 'character',
      content: 'content',
      segments: [],
      state: null,
      status: 'complete',
      createdAt: Date.now(),
      metrics: null,
      metadata: {},
      ...partial
    };
  }

  it('builds complex branching tree, walks paths, navigates siblings, and paginates active branch', () => {
    const repos = createRepositories(inst.db);

    // Tree structure:
    // G (root assistant)
    //   └── U1 (user 1)
    //         ├── A1 (assistant 1)
    //         │     └── U1b (user 1 branch)
    //         └── A2 (assistant 2)
    //               └── U2 (user 2)
    //                     └── A3 (assistant 3)
    const G = repos.messages.insert(makeMsg({ id: '01G', parentId: null, content: 'Greeting' }));
    const U1 = repos.messages.insert(
      makeMsg({ id: '01U1', parentId: G.id, role: 'user', narrativeRole: 'persona', content: 'User 1' })
    );
    const A1 = repos.messages.insert(makeMsg({ id: '01A1', parentId: U1.id, content: 'Asst 1' }));
    const U1b = repos.messages.insert(
      makeMsg({ id: '01U1B', parentId: A1.id, role: 'user', narrativeRole: 'persona', content: 'User 1b' })
    );
    const A2 = repos.messages.insert(makeMsg({ id: '01A2', parentId: U1.id, content: 'Asst 2' }));
    const U2 = repos.messages.insert(
      makeMsg({ id: '01U2', parentId: A2.id, role: 'user', narrativeRole: 'persona', content: 'User 2' })
    );
    const A3 = repos.messages.insert(makeMsg({ id: '01A3', parentId: U2.id, content: 'Asst 3' }));

    // 1. Path(A3) = [G, U1, A2, U2, A3]
    const pathA3 = repos.messages.path(A3.id);
    expect(pathA3.map((m) => m.id)).toEqual(['01G', '01U1', '01A2', '01U2', '01A3']);

    // Path(U1b) = [G, U1, A1, U1b]
    const pathU1b = repos.messages.path(U1b.id);
    expect(pathU1b.map((m) => m.id)).toEqual(['01G', '01U1', '01A1', '01U1B']);

    // 2. Siblings of A2 = [A1, A2] with ordinals
    const sibsA2 = repos.messages.siblings(A2.id);
    expect(sibsA2.map((m) => m.id)).toEqual(['01A1', '01A2']);

    const a2WithTree = repos.messages.get(A2.id);
    expect(a2WithTree).not.toBeNull();
    expect(a2WithTree!.siblingIndex).toBe(1);
    expect(a2WithTree!.siblingCount).toBe(2);
    expect(a2WithTree!.hasChildren).toBe(true);

    const a1WithTree = repos.messages.get(A1.id);
    expect(a1WithTree!.siblingIndex).toBe(0);
    expect(a1WithTree!.siblingCount).toBe(2);

    // Root sibling (G has parentId === null)
    const rootSiblings = repos.messages.siblings(G.id);
    expect(rootSiblings.map((m) => m.id)).toEqual(['01G']);
    const gWithTree = repos.messages.get(G.id);
    expect(gWithTree!.siblingIndex).toBe(0);
    expect(gWithTree!.siblingCount).toBe(1);

    // 3. descendLatest
    // U1 has children A1 and A2; A2 was inserted later, so descendLatest(U1) follows A2 -> U2 -> A3
    expect(repos.messages.descendLatest(U1.id)).toBe('01A3');
    // A1 has child U1b; descendLatest(A1) = U1b
    expect(repos.messages.descendLatest(A1.id)).toBe('01U1B');
    // Leaf A3 has no children; descendLatest(A3) = A3
    expect(repos.messages.descendLatest(A3.id)).toBe('01A3');

    // 4. pageActiveBranch(leaf=A3) with pagination window
    // Full path: [G, U1, A2, U2, A3] (5 messages)
    // Page 1: limit 2 -> newest 2: [U2, A3]
    const page1 = repos.messages.pageActiveBranch('test-chat', A3.id, { limit: 2 });
    expect(page1.map((m) => m.id)).toEqual(['01U2', '01A3']);
    expect(page1[0].hasChildren).toBe(true);
    expect(page1[1].hasChildren).toBe(false);

    // Page 2: before = U2, limit 2 -> [U1, A2]
    const page2 = repos.messages.pageActiveBranch('test-chat', A3.id, { before: '01U2', limit: 2 });
    expect(page2.map((m) => m.id)).toEqual(['01U1', '01A2']);
    expect(page2[1].siblingIndex).toBe(1);
    expect(page2[1].siblingCount).toBe(2);

    // Page 3: before = U1, limit 2 -> [G]
    const page3 = repos.messages.pageActiveBranch('test-chat', A3.id, { before: '01U1', limit: 2 });
    expect(page3.map((m) => m.id)).toEqual(['01G']);

    // Page 4: before = G -> []
    const page4 = repos.messages.pageActiveBranch('test-chat', A3.id, { before: '01G', limit: 2 });
    expect(page4).toEqual([]);
  });

  it('updateStreaming is a no-op on non-streaming messages and does not alter chat updated_at', async () => {
    const repos = createRepositories(inst.db);
    const chatBefore = repos.chats.get('test-chat')!;

    await new Promise((r) => setTimeout(r, 10));

    const msg = repos.messages.insert(
      makeMsg({ id: '01STREAM', status: 'streaming', content: 'part' })
    );

    repos.messages.updateStreaming(msg.id, {
      content: 'partial streaming content',
      segments: [{ kind: 'character', text: 'partial' }]
    });

    const streamed = repos.messages.get(msg.id)!;
    expect(streamed.content).toBe('partial streaming content');
    expect(streamed.segments).toEqual([{ kind: 'character', text: 'partial' }]);

    // Finalize
    repos.messages.finalize(msg.id, {
      content: 'finalized content',
      segments: [{ kind: 'character', text: 'finalized' }],
      state: { mood: 'calm' },
      status: 'complete',
      metrics: {
        provider: 'mock',
        model: 'mock:test',
        promptTokensEstimated: 10,
        durationMs: 100,
        droppedTurns: 0
      },
      metadata: { parse: { dialect: 'directive', parserVersion: 2, adherent: true, warnings: [], truncatedAt: null } }
    });

    const finalized = repos.messages.get(msg.id)!;
    expect(finalized.status).toBe('complete');
    expect(finalized.content).toBe('finalized content');

    // Stale updateStreaming after finalize MUST BE NO-OP (due to WHERE status = 'streaming')
    repos.messages.updateStreaming(msg.id, {
      content: 'stale overwrite',
      segments: []
    });

    const unchanged = repos.messages.get(msg.id)!;
    expect(unchanged.content).toBe('finalized content');

    // Verify chat updated_at was NOT touched by updateStreaming
    const chatAfter = repos.chats.get('test-chat')!;
    expect(chatAfter.updatedAt).toBe(chatBefore.updatedAt);
  });

  it('marks stale streaming rows as aborted with recovered: true on boot', () => {
    const repos = createRepositories(inst.db);

    repos.messages.insert(makeMsg({ id: '01STALE1', status: 'streaming', content: 'half' }));
    repos.messages.insert(makeMsg({ id: '01STALE2', status: 'streaming', content: 'split' }));
    repos.messages.insert(makeMsg({ id: '01DONE', status: 'complete', content: 'finished' }));

    const recoveredIds = repos.messages.markStaleStreamingAsAborted();
    expect(recoveredIds.sort()).toEqual(['01STALE1', '01STALE2']);

    const s1 = repos.messages.get('01STALE1')!;
    expect(s1.status).toBe('aborted');
    expect(s1.metadata.recovered).toBe(true);
    expect(s1.metadata.stateSource).toBe('inherited');

    const s2 = repos.messages.get('01STALE2')!;
    expect(s2.status).toBe('aborted');
    expect(s2.metadata.recovered).toBe(true);

    const d = repos.messages.get('01DONE')!;
    expect(d.status).toBe('complete');
    expect(d.metadata.recovered).toBeUndefined();
  });

  it('cascades deletion through the subtree when a node is removed', () => {
    const repos = createRepositories(inst.db);

    // Root -> N1 -> {N2, N3 -> N4}
    repos.messages.insert(makeMsg({ id: 'R', parentId: null }));
    repos.messages.insert(makeMsg({ id: 'N1', parentId: 'R' }));
    repos.messages.insert(makeMsg({ id: 'N2', parentId: 'N1' }));
    repos.messages.insert(makeMsg({ id: 'N3', parentId: 'N1' }));
    repos.messages.insert(makeMsg({ id: 'N4', parentId: 'N3' }));

    // Delete N3: should delete N3 and N4 only; R, N1, N2 survive
    repos.messages.remove('N3');

    expect(repos.messages.get('N3')).toBeNull();
    expect(repos.messages.get('N4')).toBeNull();
    expect(repos.messages.get('R')).not.toBeNull();
    expect(repos.messages.get('N1')).not.toBeNull();
    expect(repos.messages.get('N2')).not.toBeNull();
  });
});

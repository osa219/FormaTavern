import { describe, it, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import {
  ENVELOPE_SCRIPTS,
  parseEnvelope,
  type ChatStreamEvent
} from '@formatavern/shared';
import { runMigrations } from '../../src/db/migrate';
import { createRepositories } from '../../src/db/repositories';
import { GenerationHubImpl } from '../../src/engine/hub';
import { runGeneration } from '../../src/engine/generation';
import { MockLLMProvider } from '../../src/providers/mock';
import type { Repositories } from '../../src/db/contracts';
import type { GenerationJob } from '../../src/engine/contracts';

describe('runGeneration', () => {
  let db: Database;
  let repos: Repositories;
  let hub: GenerationHubImpl;

  const defaultParseOptions = {
    primaryCharacter: 'Eldrin',
    dialect: 'directive' as const,
    personaName: 'Traveler',
    knownNames: ['Eldrin', 'Traveler']
  };

  const dummyStateSchema = {
    mood: { type: 'enum' as const, values: ['calm', 'furious'], default: 'calm' },
    affinity: { type: 'int' as const, min: 0, max: 100, default: 10 }
  };

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    repos = createRepositories(db);
    hub = new GenerationHubImpl();

    repos.chats.create({
      id: 'chat-1',
      title: 'Gen Test Chat',
      primaryCharacterId: 'char-1',
      activePersonaId: 'pers-1',
      metadata: {
        envelopeDialect: 'directive',
        narrativeMode: 'narrative'
      }
    });
  });

  function createAssistantRow(id = 'asst-1'): string {
    repos.messages.insert({
      id,
      chatId: 'chat-1',
      parentId: null,
      role: 'assistant',
      narrativeRole: 'character',
      senderName: 'Eldrin',
      content: '',
      segments: [],
      status: 'streaming'
    });
    return id;
  }

  it('Happy path: row lifecycle streaming -> terminal, S4 authoritative DB finalization', async () => {
    const assistantId = createAssistantRow('asst-happy');
    const provider = new MockLLMProvider({ intervalMs: 5 });
    const events: ChatStreamEvent[] = [];

    const job: GenerationJob = {
      chatId: 'chat-1',
      assistantId,
      parentId: null,
      provider,
      model: 'mock:envelope-directive',
      request: {
        model: 'mock:envelope-directive',
        history: [{ role: 'user', content: 'Hello' }]
      },
      promptTokensEstimated: 50,
      droppedTurns: 0,
      parseOptions: defaultParseOptions,
      previousState: { mood: 'calm', affinity: 10 },
      stateSchema: dummyStateSchema,
      flushIntervalMs: 20
    };

    hub.subscribe(assistantId, (ev) => events.push(ev));
    await runGeneration(job, { repos, hub });

    const finalRow = repos.messages.get(assistantId);
    expect(finalRow).not.toBeNull();
    expect(finalRow!.status).toBe('complete');
    expect(finalRow!.content).toBe(ENVELOPE_SCRIPTS['envelope-directive'].text);

    const expectedParse = parseEnvelope(finalRow!.content, { ...defaultParseOptions, streaming: false });
    expect(finalRow!.segments).toEqual(expectedParse.segments);
    expect(finalRow!.metadata.parse?.adherent).toBe(expectedParse.adherent);
    expect(finalRow!.metrics?.promptTokens).toBeDefined();

    // S4: terminal event is done, and done.message deep-equals repos.messages.get(id)
    const doneEv = events.find((e) => e.type === 'done');
    expect(doneEv).toBeDefined();
    if (doneEv && doneEv.type === 'done') {
      expect(doneEv.message).toEqual(finalRow!);
    }
  });

  it('S5 bounded writes: updateStreaming called within expected bound and finalize called once', async () => {
    const assistantId = createAssistantRow('asst-s5');
    let updateStreamingCalls = 0;
    let finalizeCalls = 0;

    const originalUpdateStreaming = repos.messages.updateStreaming.bind(repos.messages);
    const originalFinalize = repos.messages.finalize.bind(repos.messages);

    repos.messages.updateStreaming = (...args) => {
      updateStreamingCalls++;
      return originalUpdateStreaming(...args);
    };
    repos.messages.finalize = (...args) => {
      finalizeCalls++;
      return originalFinalize(...args);
    };

    const provider = new MockLLMProvider({ intervalMs: 5 });
    const job: GenerationJob = {
      chatId: 'chat-1',
      assistantId,
      parentId: null,
      provider,
      model: 'mock:envelope-directive',
      request: { model: 'mock:envelope-directive', history: [] },
      promptTokensEstimated: 10,
      droppedTurns: 0,
      parseOptions: defaultParseOptions,
      previousState: { mood: 'calm', affinity: 10 },
      flushIntervalMs: 20
    };

    await runGeneration(job, { repos, hub });

    expect(finalizeCalls).toBe(1);
    const finalRow = repos.messages.get(assistantId);
    const durationMs = finalRow!.metrics!.durationMs ?? 100;
    const maxExpectedFlushes = Math.ceil(durationMs / 20) + 1;
    expect(updateStreamingCalls).toBeLessThanOrEqual(maxExpectedFlushes);
  });

  it('persona-violation: aborts with agency, status complete, content lacks persona text, no tokens after truncation', async () => {
    const assistantId = createAssistantRow('asst-violation');
    const provider = new MockLLMProvider({ intervalMs: 5 });
    const events: ChatStreamEvent[] = [];

    const job: GenerationJob = {
      chatId: 'chat-1',
      assistantId,
      parentId: null,
      provider,
      model: 'mock:persona-violation',
      request: { model: 'mock:persona-violation', history: [] },
      promptTokensEstimated: 20,
      droppedTurns: 0,
      parseOptions: defaultParseOptions,
      previousState: { mood: 'calm', affinity: 10 },
      flushIntervalMs: 20
    };

    hub.subscribe(assistantId, (ev) => events.push(ev));
    await runGeneration(job, { repos, hub });

    const finalRow = repos.messages.get(assistantId);
    expect(finalRow!.status).toBe('complete');
    expect(finalRow!.metadata.parse?.truncatedAt).toBe('persona');
    expect(finalRow!.content).not.toContain('I draw my sword.');

    const tokenEvents = events.filter((e) => e.type === 'token') as Array<{ type: 'token'; text: string }>;
    const allEmittedTokenText = tokenEvents.map((e) => e.text).join('');
    // No token events after truncation (chunk 3 with "furious" was dropped)
    expect(allEmittedTokenText).not.toContain('furious');
  });

  it('error script: yields status error, state inherited, error event terminal', async () => {
    const assistantId = createAssistantRow('asst-err');
    const provider = new MockLLMProvider({ intervalMs: 5 });
    const events: ChatStreamEvent[] = [];

    const job: GenerationJob = {
      chatId: 'chat-1',
      assistantId,
      parentId: null,
      provider,
      model: 'mock:error',
      request: { model: 'mock:error', history: [] },
      promptTokensEstimated: 10,
      droppedTurns: 0,
      parseOptions: defaultParseOptions,
      previousState: { mood: 'calm', affinity: 10 },
      flushIntervalMs: 20
    };

    hub.subscribe(assistantId, (ev) => events.push(ev));
    await runGeneration(job, { repos, hub });

    const finalRow = repos.messages.get(assistantId);
    expect(finalRow!.status).toBe('error');
    expect(finalRow!.metadata.stateSource).toBe('inherited');
    expect(finalRow!.metadata.error).toBeDefined();

    const lastEv = events[events.length - 1];
    expect(lastEv.type).toBe('error');
  });

  it('truncated script: done{length} sets stateSource inherited and metrics.finishReason length', async () => {
    const assistantId = createAssistantRow('asst-trunc');
    const provider = new MockLLMProvider({ intervalMs: 5 });

    const job: GenerationJob = {
      chatId: 'chat-1',
      assistantId,
      parentId: null,
      provider,
      model: 'mock:truncated',
      request: { model: 'mock:truncated', history: [] },
      promptTokensEstimated: 10,
      droppedTurns: 0,
      parseOptions: defaultParseOptions,
      previousState: { mood: 'calm', affinity: 10 },
      flushIntervalMs: 20
    };

    await runGeneration(job, { repos, hub });

    const finalRow = repos.messages.get(assistantId);
    expect(finalRow!.metrics?.finishReason).toBe('length');
    expect(finalRow!.metadata.stateSource).toBe('inherited');
  });

  it('stop mid-stream: abort sets status aborted, finishReason aborted', async () => {
    const assistantId = createAssistantRow('asst-stop');
    const provider = new MockLLMProvider({ intervalMs: 20 });
    const events: ChatStreamEvent[] = [];

    const job: GenerationJob = {
      chatId: 'chat-1',
      assistantId,
      parentId: null,
      provider,
      model: 'mock:envelope-directive',
      request: { model: 'mock:envelope-directive', history: [] },
      promptTokensEstimated: 10,
      droppedTurns: 0,
      parseOptions: defaultParseOptions,
      previousState: { mood: 'calm', affinity: 10 },
      flushIntervalMs: 10
    };

    hub.subscribe(assistantId, (ev) => {
      events.push(ev);
      if (events.filter((e) => e.type === 'token').length >= 3) {
        hub.abort(assistantId, 'user');
      }
    });

    await runGeneration(job, { repos, hub });

    const finalRow = repos.messages.get(assistantId);
    expect(finalRow!.status).toBe('aborted');
    expect(finalRow!.metrics?.finishReason).toBe('aborted');
  });

  it('S1 disconnect immunity: unsubscribe after 2 tokens does not stop generation', async () => {
    const assistantId = createAssistantRow('asst-s1');
    const provider = new MockLLMProvider({ intervalMs: 5 });
    let tokenCount = 0;

    const job: GenerationJob = {
      chatId: 'chat-1',
      assistantId,
      parentId: null,
      provider,
      model: 'mock:envelope-directive',
      request: { model: 'mock:envelope-directive', history: [] },
      promptTokensEstimated: 10,
      droppedTurns: 0,
      parseOptions: defaultParseOptions,
      previousState: { mood: 'calm', affinity: 10 },
      flushIntervalMs: 20
    };

    const unsub = hub.subscribe(assistantId, (ev) => {
      if (ev.type === 'token') {
        tokenCount++;
        if (tokenCount === 2) {
          unsub();
        }
      }
    });

    await runGeneration(job, { repos, hub });

    const finalRow = repos.messages.get(assistantId);
    expect(finalRow!.status).toBe('complete');
    expect(finalRow!.content).toBe(ENVELOPE_SCRIPTS['envelope-directive'].text);
  });

  it('late subscriber: snapshot + subsequent tokens equals final content', async () => {
    const assistantId = createAssistantRow('asst-late');
    const provider = new MockLLMProvider({ intervalMs: 15 });
    let tokenCount = 0;
    let lateSnapshot = '';
    const lateTokens: string[] = [];

    const job: GenerationJob = {
      chatId: 'chat-1',
      assistantId,
      parentId: null,
      provider,
      model: 'mock:envelope-directive',
      request: { model: 'mock:envelope-directive', history: [] },
      promptTokensEstimated: 10,
      droppedTurns: 0,
      parseOptions: defaultParseOptions,
      previousState: { mood: 'calm', affinity: 10 },
      flushIntervalMs: 10
    };

    hub.subscribe(assistantId, (ev) => {
      if (ev.type === 'token') {
        tokenCount++;
        if (tokenCount === 3) {
          const active = hub.get(assistantId);
          lateSnapshot = active?.snapshot() ?? '';
          hub.subscribe(assistantId, (lateEv) => {
            if (lateEv.type === 'token') {
              lateTokens.push(lateEv.text);
            }
          });
        }
      }
    });

    await runGeneration(job, { repos, hub });

    const reassembled = lateSnapshot + lateTokens.join('');
    const finalRow = repos.messages.get(assistantId);
    expect(reassembled).toBe(finalRow!.content);
  });

  it('S3 crash handling: finalize repo error marks error and closes hub; updateStreaming error is non-fatal', async () => {
    // 1. updateStreaming throw is non-fatal
    const asst1 = createAssistantRow('asst-s3-1');
    const origUpdateStreaming = repos.messages.updateStreaming.bind(repos.messages);
    repos.messages.updateStreaming = () => {
      throw new Error('Disk write failed');
    };

    const provider1 = new MockLLMProvider({ intervalMs: 5 });
    const job1: GenerationJob = {
      chatId: 'chat-1',
      assistantId: asst1,
      parentId: null,
      provider: provider1,
      model: 'mock:envelope-directive',
      request: { model: 'mock:envelope-directive', history: [] },
      promptTokensEstimated: 10,
      droppedTurns: 0,
      parseOptions: defaultParseOptions,
      previousState: { mood: 'calm', affinity: 10 },
      flushIntervalMs: 10
    };

    await runGeneration(job1, { repos, hub });
    const row1 = repos.messages.get(asst1);
    expect(row1!.status).toBe('complete');
    repos.messages.updateStreaming = origUpdateStreaming;

    // 2. finalize throwing once triggers fallback error finalize
    const asst2 = createAssistantRow('asst-s3-2');
    const origFinalize = repos.messages.finalize.bind(repos.messages);
    let finalizeAttempt = 0;
    repos.messages.finalize = (id, patch) => {
      finalizeAttempt++;
      if (finalizeAttempt === 1) {
        throw new Error('Transaction conflict');
      }
      return origFinalize(id, patch);
    };

    const provider2 = new MockLLMProvider({ intervalMs: 5 });
    const job2: GenerationJob = {
      chatId: 'chat-1',
      assistantId: asst2,
      parentId: null,
      provider: provider2,
      model: 'mock:envelope-directive',
      request: { model: 'mock:envelope-directive', history: [] },
      promptTokensEstimated: 10,
      droppedTurns: 0,
      parseOptions: defaultParseOptions,
      previousState: { mood: 'calm', affinity: 10 },
      flushIntervalMs: 10
    };

    const events2: ChatStreamEvent[] = [];
    hub.subscribe(asst2, (ev) => events2.push(ev));
    await runGeneration(job2, { repos, hub });

    const row2 = repos.messages.get(asst2);
    expect(row2!.status).toBe('error');
    expect(row2!.metadata.error?.message).toContain('finalize failed');
    expect(hub.get(asst2)).toBeNull();
    expect(events2.some((e) => e.type === 'error')).toBe(true);

    repos.messages.finalize = origFinalize;
  });

  it('registers new NPCs into chat.metadata.npcs without duplicating', async () => {
    const assistantId = createAssistantRow('asst-npc');
    const provider = new MockLLMProvider({ intervalMs: 5 });

    const job: GenerationJob = {
      chatId: 'chat-1',
      assistantId,
      parentId: null,
      provider,
      model: 'mock:envelope-directive',
      request: { model: 'mock:envelope-directive', history: [] },
      promptTokensEstimated: 10,
      droppedTurns: 0,
      parseOptions: defaultParseOptions,
      previousState: { mood: 'calm', affinity: 10 },
      flushIntervalMs: 20
    };

    await runGeneration(job, { repos, hub });

    const chat = repos.chats.get('chat-1');
    expect(chat!.metadata.npcs?.apprentice).toBeDefined();
    expect(chat!.metadata.npcs?.apprentice.displayName).toBe('Apprentice');

    // Run again in same chat
    const asst2 = createAssistantRow('asst-npc-2');
    const job2: GenerationJob = { ...job, assistantId: asst2 };
    await runGeneration(job2, { repos, hub });

    const chat2 = repos.chats.get('chat-1');
    expect(Object.keys(chat2!.metadata.npcs ?? {}).length).toBe(1);
  });

  it('continue: resume.content prefix preserved and resumedFrom equals prefix length', async () => {
    const assistantId = createAssistantRow('asst-cont');
    const prefix = 'The ancient library was silent.\n';
    repos.messages.reopenForContinue(assistantId, prefix);

    const provider = new MockLLMProvider({ intervalMs: 5 });
    const events: ChatStreamEvent[] = [];

    const job: GenerationJob = {
      chatId: 'chat-1',
      assistantId,
      parentId: null,
      provider,
      model: 'mock:envelope-directive',
      request: { model: 'mock:envelope-directive', history: [] },
      promptTokensEstimated: 10,
      droppedTurns: 0,
      parseOptions: defaultParseOptions,
      previousState: { mood: 'calm', affinity: 10 },
      resume: { content: prefix },
      flushIntervalMs: 20
    };

    hub.subscribe(assistantId, (ev) => events.push(ev));
    await runGeneration(job, { repos, hub });

    const startEv = events.find((e) => e.type === 'start');
    expect(startEv).toBeDefined();
    if (startEv && startEv.type === 'start') {
      expect(startEv.resumedFrom).toBe(prefix.length);
    }

    const finalRow = repos.messages.get(assistantId);
    expect(finalRow!.content.startsWith(prefix)).toBe(true);
  });

  it('persists reasoning in message metadata and calculates duration', async () => {
    const assistantId = createAssistantRow('asst-think');
    const thinkProvider = {
      id: 'custom-think',
      capabilities: { chatCompletion: true, textCompletion: false, listModels: false },
      async *generate() {
        yield { type: 'token' as const, text: '<think>' };
        yield { type: 'token' as const, text: 'Step 1: calculate.' };
        yield { type: 'token' as const, text: '</think>\n' };
        yield { type: 'token' as const, text: '::: speech\nThe answer is 42.' };
        yield { type: 'done' as const, finishReason: 'stop' as const };
      }
    };

    const job: GenerationJob = {
      chatId: 'chat-1',
      assistantId,
      parentId: null,
      provider: thinkProvider as any,
      model: 'think-model',
      request: { history: [] },
      promptTokensEstimated: 10,
      droppedTurns: 0,
      parseOptions: defaultParseOptions,
      previousState: {},
      flushIntervalMs: 20
    };

    await runGeneration(job, { repos, hub });

    const finalRow = repos.messages.get(assistantId);
    expect(finalRow).not.toBeNull();
    expect(finalRow!.status).toBe('complete');
    expect(finalRow!.metadata.reasoning).toBe('Step 1: calculate.');
    expect(finalRow!.metadata.reasoningDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('truncates reasoning in metadata at 16,000 characters with marker', async () => {
    const assistantId = createAssistantRow('asst-think-long');
    const longThink = 'a'.repeat(20_000);
    const thinkProvider = {
      id: 'custom-think-long',
      capabilities: { chatCompletion: true, textCompletion: false, listModels: false },
      async *generate() {
        yield { type: 'token' as const, text: `<think>${longThink}</think>\n` };
        yield { type: 'token' as const, text: 'Done.' };
        yield { type: 'done' as const, finishReason: 'stop' as const };
      }
    };

    const job: GenerationJob = {
      chatId: 'chat-1',
      assistantId,
      parentId: null,
      provider: thinkProvider as any,
      model: 'think-model',
      request: { history: [] },
      promptTokensEstimated: 10,
      droppedTurns: 0,
      parseOptions: defaultParseOptions,
      previousState: {},
      flushIntervalMs: 20
    };

    await runGeneration(job, { repos, hub });

    const finalRow = repos.messages.get(assistantId);
    expect(finalRow).not.toBeNull();
    expect(finalRow!.status).toBe('complete');
    expect(finalRow!.metadata.reasoning?.startsWith('a'.repeat(100))).toBe(true);
    expect(finalRow!.metadata.reasoning?.length).toBe(16_000 + '\n\n[Reasoning truncated]'.length);
    expect(finalRow!.metadata.reasoning?.endsWith('[Reasoning truncated]')).toBe(true);
  });
});

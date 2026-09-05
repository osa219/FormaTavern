import { describe, it, expect } from 'bun:test';
import {
  DEFAULT_CHARACTER_THEME,
  DEFAULT_SETTINGS,
  type CharacterCard,
  type Persona,
  type Segment
} from '@formatavern/shared';
import type { MessageRow } from '../../src/db/contracts';
import {
  assembleContext,
  nearestState,
  normalizeNpcKey
} from '../../src/engine/context';
import { buildPrompt } from '../../src/prompt/builder';

describe('engine/context', () => {
  const dummyCharacter: CharacterCard = {
    id: 'char-eldrin',
    name: 'Eldrin',
    description: 'A wise mage.',
    personality: 'Calm, mysterious.',
    scenario: 'Tower study.',
    firstMessage: 'Greetings traveler.',
    style: DEFAULT_CHARACTER_THEME,
    stateSchema: {
      mood: { type: 'enum', values: ['calm', 'furious'], default: 'calm' },
      affinity: { type: 'int', min: 0, max: 100, default: 10 }
    },
    initialState: { mood: 'calm', affinity: 10 }
  };

  const dummyPersona: Persona = {
    id: 'pers-traveler',
    name: 'Traveler',
    description: 'A wandering adventurer.',
    isDefault: true
  };

  const dummyChat = {
    metadata: {
      envelopeDialect: 'directive' as const,
      narrativeMode: 'narrative' as const,
      npcs: {
        guard: { displayName: 'City Guard', voice: 'Gravelly' }
      }
    }
  };

  it('normalizes NPC keys correctly', () => {
    expect(normalizeNpcKey('  City   Guard  ')).toBe('city guard');
    expect(normalizeNpcKey('Apprentice')).toBe('apprentice');
  });

  it('nearestState skips user rows and error rows, and falls back to defaultState', () => {
    const defaultRes = nearestState([], dummyCharacter);
    expect(defaultRes).toEqual({ mood: 'calm', affinity: 10 });

    const rows: Array<Pick<MessageRow, 'role' | 'status' | 'state'>> = [
      { role: 'assistant', status: 'complete', state: { mood: 'calm', affinity: 15 } },
      { role: 'user', status: 'complete', state: { mood: 'furious', affinity: 99 } }, // user rows skipped
      { role: 'assistant', status: 'error', state: { mood: 'furious', affinity: 0 } }, // error rows skipped
      { role: 'assistant', status: 'streaming', state: null } // null state skipped
    ];

    const state = nearestState(rows, dummyCharacter);
    expect(state).toEqual({ mood: 'calm', affinity: 15 });
  });

  function makeRow(
    partial: Partial<MessageRow> & {
      id: string;
      role: MessageRow['role'];
      narrativeRole: MessageRow['narrativeRole'];
      content: string;
    }
  ): MessageRow {
    return {
      id: partial.id,
      chatId: partial.chatId ?? 'c1',
      parentId: partial.parentId ?? null,
      senderId: partial.senderId ?? null,
      senderName: partial.senderName ?? null,
      role: partial.role,
      narrativeRole: partial.narrativeRole,
      content: partial.content,
      segments: partial.segments ?? [],
      state: partial.state ?? null,
      status: partial.status ?? 'complete',
      metrics: partial.metrics ?? null,
      metadata: partial.metadata ?? {},
      createdAt: partial.createdAt ?? 1
    };
  }

  it('assembles history from path with branch isolation', () => {
    const G = makeRow({
      id: '01-G',
      role: 'assistant',
      narrativeRole: 'character',
      senderName: 'Eldrin',
      content: 'Greeting',
      state: { mood: 'calm', affinity: 10 }
    });
    const U1 = makeRow({
      id: '01-U1',
      parentId: '01-G',
      role: 'user',
      narrativeRole: 'persona',
      senderName: 'Traveler',
      content: 'Hello'
    });
    const A1 = makeRow({
      id: '01-A1',
      parentId: '01-U1',
      role: 'assistant',
      narrativeRole: 'character',
      senderName: 'Eldrin',
      content: 'Branch 1 response'
    });

    const ctx = assembleContext({
      chat: dummyChat,
      character: dummyCharacter,
      persona: dummyPersona,
      settings: DEFAULT_SETTINGS,
      triggerId: '01-U1',
      capabilities: { prefill: true },
      pathRows: [G, U1]
    });

    expect(ctx.history.map((h) => h.id)).toEqual(['01-G', '01-U1']);
    // Branch A1 is never seen in the path for U1
  });

  it('extracts activeNpcs from last 6 assistant rows with voice from registry', () => {
    const npcSeg: Segment = { kind: 'npc', name: 'Guard', text: 'Halt!' };
    const unregisteredSeg: Segment = { kind: 'npc', name: 'Apprentice', text: 'Yes master.' };

    const assistantRows = [
      makeRow({
        id: 'a1',
        role: 'assistant',
        narrativeRole: 'character',
        senderName: 'Eldrin',
        content: '',
        segments: [npcSeg]
      }),
      makeRow({
        id: 'a2',
        parentId: 'a1',
        role: 'assistant',
        narrativeRole: 'character',
        senderName: 'Eldrin',
        content: '',
        segments: [unregisteredSeg]
      })
    ];

    const ctx = assembleContext({
      chat: dummyChat,
      character: dummyCharacter,
      persona: dummyPersona,
      settings: DEFAULT_SETTINGS,
      triggerId: 'a2',
      capabilities: { prefill: true },
      pathRows: assistantRows
    });

    expect(ctx.activeNpcs).toBeDefined();
    expect(ctx.activeNpcs).toHaveLength(2);

    const guardNpc = ctx.activeNpcs?.find((n) => n.displayName === 'City Guard');
    expect(guardNpc).toBeDefined();
    expect(guardNpc?.voice).toBe('Gravelly');

    const appNpc = ctx.activeNpcs?.find((n) => n.displayName === 'Apprentice');
    expect(appNpc).toBeDefined();
    expect(appNpc?.voice).toBeUndefined();
  });

  it('inherits directorNote from trigger only', () => {
    const U1 = makeRow({
      id: '01-U1',
      role: 'user',
      narrativeRole: 'persona',
      senderName: 'Traveler',
      content: 'Hello',
      metadata: { directorNote: 'Speak in riddles' }
    });

    const ctx = assembleContext({
      chat: dummyChat,
      character: dummyCharacter,
      persona: dummyPersona,
      settings: DEFAULT_SETTINGS,
      triggerId: '01-U1',
      capabilities: { prefill: true },
      pathRows: [U1]
    });

    expect(ctx.directorNote).toBe('Speak in riddles');
  });

  it('regenerate context produces identical prompt to original send context', () => {
    const G = makeRow({
      id: '01-G',
      role: 'assistant',
      narrativeRole: 'character',
      senderName: 'Eldrin',
      content: 'Greeting',
      state: { mood: 'calm', affinity: 10 }
    });
    const U1 = makeRow({
      id: '01-U1',
      parentId: '01-G',
      role: 'user',
      narrativeRole: 'persona',
      senderName: 'Traveler',
      content: 'Teach me magic',
      metadata: { directorNote: 'Be stern' }
    });

    const originalCtx = assembleContext({
      chat: dummyChat,
      character: dummyCharacter,
      persona: dummyPersona,
      settings: DEFAULT_SETTINGS,
      triggerId: '01-U1',
      capabilities: { prefill: true },
      pathRows: [G, U1]
    });

    const regenCtx = assembleContext({
      chat: dummyChat,
      character: dummyCharacter,
      persona: dummyPersona,
      settings: DEFAULT_SETTINGS,
      triggerId: '01-U1',
      capabilities: { prefill: true },
      pathRows: [G, U1]
    });

    const originalPrompt = buildPrompt(originalCtx);
    const regenPrompt = buildPrompt(regenCtx);

    expect(originalPrompt.systemPrompt).toBe(regenPrompt.systemPrompt);
    expect(originalPrompt.history).toEqual(regenPrompt.history);
    expect(originalPrompt.stop).toEqual(regenPrompt.stop);
  });

  it('continuation excludes the node itself from history', () => {
    const G = makeRow({
      id: '01-G',
      role: 'assistant',
      narrativeRole: 'character',
      senderName: 'Eldrin',
      content: 'Greeting',
      state: { mood: 'calm', affinity: 10 }
    });
    const U1 = makeRow({
      id: '01-U1',
      parentId: '01-G',
      role: 'user',
      narrativeRole: 'persona',
      senderName: 'Traveler',
      content: 'Tell me more'
    });
    const A1 = makeRow({
      id: '01-A1',
      parentId: '01-U1',
      role: 'assistant',
      narrativeRole: 'character',
      senderName: 'Eldrin',
      content: 'I began my journey in...',
      status: 'streaming'
    });

    const ctx = assembleContext({
      chat: dummyChat,
      character: dummyCharacter,
      persona: dummyPersona,
      settings: DEFAULT_SETTINGS,
      triggerId: '01-A1',
      capabilities: { prefill: true },
      continuation: { partial: A1.content },
      pathRows: [G, U1, A1]
    });

    expect(ctx.history.map((h) => h.id)).toEqual(['01-G', '01-U1']);
    expect(ctx.continuation?.partial).toBe('I began my journey in...');
  });
});

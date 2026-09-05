import { describe, it, expect } from 'bun:test';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { buildPrompt } from '../../src/prompt/builder';
import { PromptBudgetError, type PromptContext, type HistoryTurn } from '../../src/prompt/types';
import { MockLLMProvider } from '../../src/providers/mock';
import { collect } from '../providers/contract';
import {
  parseEnvelope,
  resolveState,
  defaultState,
  buildStopSequences,
  type CharacterCard,
  type Persona
} from '@formatavern/shared';

const eldrinCard: CharacterCard = {
  id: 'eldrin-the-mage',
  name: 'Eldrin the Mage',
  firstMessage: 'Greetings, traveler.',
  description: 'Ancient wizard in starry robes.',
  personality: 'Methodical, cautious, protective of arcane lore.',
  scenario: 'High atop the spire observatory as celestials align.',
  exampleDialogue: '{{char}}: The stars do not deceive, {{user}}.',
  style: {
    font: { family: 'Cinzel' },
    colors: {
      charBubbleBg: 'rgba(69, 26, 3, 0.6)',
      charBubbleText: '#fef3c7',
      userBubbleBg: 'rgba(15, 23, 42, 0.8)',
      userBubbleText: '#f8fafc',
      accent: '#6366f1'
    },
    bubble: { radius: '8px' },
    background: { overlay: 'rgba(10, 10, 15, 0.75)' }
  },
  stateSchema: {
    mood: {
      type: 'enum',
      values: ['calm', 'curious', 'urgent', 'furious'],
      aliases: { contemplative: 'calm', angry: 'furious' },
      default: 'calm'
    },
    affinity: {
      type: 'int',
      min: 0,
      max: 10,
      default: 5
    },
    danger: {
      type: 'enum',
      values: ['low', 'medium', 'high', 'critical'],
      default: 'low'
    },
    scene: {
      type: 'string',
      default: 'spire_observatory'
    }
  },
  initialState: {
    mood: 'calm',
    affinity: 5,
    danger: 'low',
    scene: 'spire_observatory'
  }
};

const travelerPersona: Persona = {
  id: 'persona-default',
  name: 'Traveler',
  description: 'A wayfarer seeking ancient knowledge.',
  isDefault: true
};

const sampleHistory: HistoryTurn[] = [
  {
    id: 'msg-1',
    role: 'assistant',
    narrativeRole: 'character',
    senderName: 'Eldrin the Mage',
    content: 'Welcome to the observatory, {{user}}.',
    status: 'complete'
  },
  {
    id: 'msg-2',
    role: 'user',
    narrativeRole: 'persona',
    senderName: 'Traveler',
    content: 'I climb the winding stone steps.',
    status: 'complete'
  },
  {
    id: 'msg-3',
    role: 'user',
    narrativeRole: 'persona',
    content: '',
    directorNote: 'Make the storm pick up outside.',
    status: 'complete'
  },
  {
    id: 'msg-4',
    role: 'assistant',
    narrativeRole: 'character',
    senderName: 'Eldrin the Mage',
    content: 'The storm is worsening.\n```state\n{"mood":"urgent"}\n```',
    status: 'aborted'
  },
  {
    id: 'msg-5',
    role: 'user',
    narrativeRole: 'narrator',
    content: 'Lightning strikes the glass spire with deafening force.',
    status: 'complete'
  },
  {
    id: 'msg-6',
    role: 'assistant',
    narrativeRole: 'character',
    content: 'An error happened here.',
    status: 'error'
  }
];

function makeContext(overrides: Partial<PromptContext> = {}): PromptContext {
  return {
    character: eldrinCard,
    persona: travelerPersona,
    chat: {
      narrativeMode: 'narrative',
      envelopeDialect: 'directive',
      standingDirection: 'Speak with archaic gravity.',
      npcs: {
        guide: { displayName: 'Mountain Guide', voice: 'gruff, quiet' }
      }
    },
    history: sampleHistory,
    directorNote: 'Focus on the vibrating lens.',
    sceneState: { mood: 'calm', affinity: 5, danger: 'low', scene: 'spire_observatory' },
    activeNpcs: [{ displayName: 'Mountain Guide', voice: 'gruff, quiet' }],
    lorebookEntries: ['The spire was built during the Second Epoch.'],
    budget: {
      contextLength: 8192,
      reservedCompletion: 1024,
      safetyFactor: 0.9
    },
    provider: {
      prefill: true
    },
    ...overrides
  };
}

describe('PromptBuilder', () => {
  it('includes narrative blocks 1b, 6b, 7b, 9c only in narrative mode', () => {
    const narrativeCtx = makeContext({ chat: { narrativeMode: 'narrative', envelopeDialect: 'directive' } });
    const builtNarrative = buildPrompt(narrativeCtx);
    expect(builtNarrative.dialect).toBe('directive');
    const narrativeIds = builtNarrative.blocks.filter((b) => b.included).map((b) => b.id);
    expect(narrativeIds).toContain('1b');
    expect(narrativeIds).toContain('6b');
    expect(narrativeIds).toContain('7b');
    expect(narrativeIds).toContain('9c');

    const classicCtx = makeContext({ chat: { narrativeMode: 'classic' } });
    const builtClassic = buildPrompt(classicCtx);
    expect(builtClassic.dialect).toBe('classic');
    const classicIds = builtClassic.blocks.filter((b) => b.included).map((b) => b.id);
    expect(classicIds).not.toContain('1b');
    expect(classicIds).not.toContain('6b');
    expect(classicIds).not.toContain('7b');
    expect(classicIds).not.toContain('9c');
  });

  it('contains agency clause and full stateSchema description in Block 1b', () => {
    const built = buildPrompt(makeContext());
    expect(built.systemPrompt).toContain('Never write dialogue, thoughts, feelings, or actions for Traveler.');
    expect(built.systemPrompt).toContain('mood: one of calm, curious, urgent, furious (default calm)');
    expect(built.systemPrompt).toContain('affinity: integer 0–10 (default 5)');
  });

  it('omits optional blocks 2, 3, 4, 5, 6 when blank or empty', () => {
    const bareCard: CharacterCard = {
      ...eldrinCard,
      description: '',
      personality: '',
      scenario: '',
      exampleDialogue: ''
    };
    const built = buildPrompt(makeContext({ character: bareCard, lorebookEntries: [] }));
    const included = built.blocks.filter((b) => b.included).map((b) => b.id);
    expect(included).not.toContain('2');
    expect(included).not.toContain('3');
    expect(included).not.toContain('4');
    expect(included).not.toContain('5');
    expect(included).not.toContain('6');
  });

  it('formats activeNpcs in 6b and sceneState in 7b in schema key order', () => {
    const built = buildPrompt(makeContext());
    expect(built.systemPrompt).toContain('[Side characters present]\n- Mountain Guide: gruff, quiet');
    expect(built.systemPrompt).toContain('[Scene state: mood=calm, affinity=5, danger=low, scene=spire_observatory]');
  });

  it('correctly filters history: skips error and director-only turns, strips state blocks from assistant turns, and wraps multi-track user turns', () => {
    const built = buildPrompt(makeContext());

    // Aborted turn 4 included but state block stripped
    const assistantTurn = built.history.find((m) => m.content.includes('The storm is worsening.'));
    expect(assistantTurn).toBeDefined();
    expect(assistantTurn!.content).not.toContain('```state');

    // Error turn 6 skipped
    expect(built.history.some((m) => m.content.includes('An error happened here.'))).toBe(false);

    // Past directorNote from turn 3 never serialized
    expect(built.history.some((m) => m.content.includes('Make the storm pick up outside.'))).toBe(false);

    // Multi-track user narrator turn 5 serialized with :::narrator
    const narratorUserTurn = built.history.find((m) => m.content.includes('Lightning strikes'));
    expect(narratorUserTurn).toBeDefined();
    expect(narratorUserTurn!.content).toContain(':::narrator');
  });

  it('attaches bottom blocks (9a, 9b, 9c) in order to the last user message', () => {
    const built = buildPrompt(makeContext());
    const lastUserMsg = built.history[built.history.length - 1];
    expect(lastUserMsg.role).toBe('user');
    expect(lastUserMsg.content).toContain('[Standing direction: Speak with archaic gravity.]');
    expect(lastUserMsg.content).toContain("[Director's note for this turn: Focus on the vibrating lens.]");
    expect(lastUserMsg.content).toContain('Reply using the directive block format and end with a state block.');
  });

  it('handles ending on assistant by appending synthetic [Continue the scene.]', () => {
    const assistantOnlyHistory: HistoryTurn[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        narrativeRole: 'character',
        content: 'I greet you.',
        status: 'complete'
      }
    ];
    const built = buildPrompt(makeContext({ history: assistantOnlyHistory }));
    const lastMsg = built.history[built.history.length - 1];
    expect(lastMsg.role).toBe('user');
    expect(lastMsg.content.startsWith('[Continue the scene.]')).toBe(true);
  });

  it('handles continuation with prefill:true and prefill:false', () => {
    // prefill: true
    const builtPrefill = buildPrompt(
      makeContext({
        provider: { prefill: true },
        continuation: { partial: 'The crystal radiates ```state\n{"mood":"calm"}\n```' }
      })
    );
    expect(builtPrefill.assistantPrefill).toBe('The crystal radiates');
    expect(builtPrefill.history[builtPrefill.history.length - 1].content).toContain(
      'Continue the reply exactly where it stopped, then end with a state block.'
    );

    // prefill: false
    const builtNoPrefill = buildPrompt(
      makeContext({
        provider: { prefill: false },
        continuation: { partial: 'The crystal radiates' }
      })
    );
    expect(builtNoPrefill.assistantPrefill).toBeUndefined();
    const lastUser = builtNoPrefill.history[builtNoPrefill.history.length - 1];
    expect(lastUser.content).toContain('[Continue your previous reply exactly where it stopped. Do not repeat.]');
  });

  it('prepends [Scene begins.] when history starts with assistant turn', () => {
    const built = buildPrompt(
      makeContext({
        history: [
          { id: '1', role: 'assistant', narrativeRole: 'character', content: 'Greetings.', status: 'complete' },
          { id: '2', role: 'user', narrativeRole: 'persona', content: 'Hello.', status: 'complete' }
        ]
      })
    );
    expect(built.history[0]).toEqual({ role: 'user', content: '[Scene begins.]' });
  });

  it('budget truncation drops oldest turns under pressure while retaining trigger turn', () => {
    // Very tight budget
    const tightCtx = makeContext({
      budget: {
        contextLength: 1200,
        reservedCompletion: 256,
        safetyFactor: 0.9
      }
    });
    const built = buildPrompt(tightCtx);
    expect(built.tokens.droppedTurns).toBeGreaterThan(0);
    expect(built.tokens.total).toBeLessThanOrEqual(built.tokens.available);
    // Last user turn must be kept
    expect(built.history[built.history.length - 1].role).toBe('user');
  });

  it('throws PromptBudgetError when trigger turn alone exceeds available budget', () => {
    const impossibleCtx = makeContext({
      budget: {
        contextLength: 200, // Impossibly small
        reservedCompletion: 100,
        safetyFactor: 0.9
      }
    });
    expect(() => buildPrompt(impossibleCtx)).toThrow(PromptBudgetError);
  });

  it('guarantees no macros survive in systemPrompt, history, or prefill', () => {
    const built = buildPrompt(makeContext());
    const macroRegex = /\{\{\s*(char|user)\s*\}\}|<BOT>|<USER>/i;

    expect(macroRegex.test(built.systemPrompt)).toBe(false);
    for (const msg of built.history) {
      expect(macroRegex.test(msg.content)).toBe(false);
    }
    if (built.assistantPrefill) {
      expect(macroRegex.test(built.assistantPrefill)).toBe(false);
    }
    expect(built.stop).toEqual(buildStopSequences('directive', 'Traveler'));
  });

  it('integrates with MockLLMProvider and envelope parser end-to-end', async () => {
    const ctx = makeContext();
    const built = buildPrompt(ctx);

    const provider = new MockLLMProvider({ intervalMs: 0 });
    const events = await collect(
      provider.generate({
        model: 'mock:envelope-directive',
        systemPrompt: built.systemPrompt,
        history: built.history,
        stop: built.stop
      })
    );

    expect(provider.calls[0].stop).toEqual(buildStopSequences('directive', 'Traveler'));

    const tokens = events.filter((e) => e.type === 'token').map((e: any) => e.text).join('');
    const parsed = parseEnvelope(tokens, {
      primaryCharacter: ctx.character.name,
      dialect: built.dialect as any,
      personaName: ctx.persona.name
    });

    const initial = defaultState(ctx.character);
    const resolved = resolveState(initial, parsed.statePatch, ctx.character.stateSchema);
    expect(resolved.state.mood).toBe('calm');
    expect(resolved.state.affinity).toBe(5);
  });

  it('never includes character showcase text in the prompt context (P4 sentinel)', () => {
    const cardWithShowcase: CharacterCard = {
      ...eldrinCard,
      showcase: '### Private Showcase Details\nSecret background never seen by LLM.'
    };
    const built = buildPrompt(makeContext({ character: cardWithShowcase }));
    expect(built.systemPrompt).not.toContain('Private Showcase Details');
    expect(built.systemPrompt).not.toContain('Secret background never seen by LLM.');
    for (const msg of built.history) {
      expect(msg.content).not.toContain('Private Showcase Details');
    }
  });

  // Golden file assertion
  it('matches canonical golden file exactly', async () => {
    const goldenCtx = makeContext();
    const built = buildPrompt(goldenCtx);

    const rendered =
      built.systemPrompt +
      '\n\n---\n\n' +
      JSON.stringify(
        {
          history: built.history,
          stop: built.stop,
          assistantPrefill: built.assistantPrefill ?? null
        },
        null,
        2
      );

    const goldenDir = join(import.meta.dir, '__golden__');
    const goldenPath = join(goldenDir, 'eldrin-narrative-directive.txt');

    if (process.env.UPDATE_GOLDEN?.trim() === '1' || !existsSync(goldenPath)) {
      mkdirSync(goldenDir, { recursive: true });
      await Bun.write(goldenPath, rendered);
    }

    const expected = await Bun.file(goldenPath).text();
    expect(rendered).toBe(expected);
  });
});

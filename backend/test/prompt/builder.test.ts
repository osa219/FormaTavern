import { describe, it, expect } from 'bun:test';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { buildPrompt } from '../../src/prompt/builder';
import { PromptBudgetError, type PromptContext, type HistoryTurn } from '../../src/prompt/types';
import { PREAMBLE_COAUTHOR_DEFAULT } from '../../src/prompt/templates';
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
    parentId: 'msg-0',
    content: 'Welcome to the observatory, {{user}}.',
    status: 'complete'
  },
  {
    id: 'msg-2',
    role: 'user',
    narrativeRole: 'persona',
    senderName: 'Traveler',
    parentId: 'msg-1',
    content: 'I climb the winding stone steps.',
    status: 'complete'
  },
  {
    id: 'msg-3',
    role: 'user',
    narrativeRole: 'persona',
    parentId: 'msg-1',
    content: '',
    directorNote: 'Make the storm pick up outside.',
    status: 'complete'
  },
  {
    id: 'msg-4',
    role: 'assistant',
    narrativeRole: 'character',
    senderName: 'Eldrin the Mage',
    parentId: 'msg-2',
    content: 'The storm is worsening.\n```state\n{"mood":"urgent"}\n```',
    status: 'aborted'
  },
  {
    id: 'msg-5',
    role: 'user',
    narrativeRole: 'narrator',
    parentId: 'msg-4',
    content: 'Lightning strikes the glass spire with deafening force.',
    status: 'complete'
  },
  {
    id: 'msg-6',
    role: 'assistant',
    narrativeRole: 'character',
    parentId: 'msg-5',
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
  it('includes narrative blocks 6b, 7b, 9c only in narrative mode (1b retired)', () => {
    const narrativeCtx = makeContext({ chat: { narrativeMode: 'narrative', envelopeDialect: 'directive' } });
    const builtNarrative = buildPrompt(narrativeCtx);
    expect(builtNarrative.dialect).toBe('directive');
    const narrativeIds = builtNarrative.blocks.filter((b) => b.included).map((b) => b.id);
    expect(narrativeIds).not.toContain('1b');
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

  it('keeps the agency clause in Block 1 and puts the stateSchema description in closing Block 9c', () => {
    const built = buildPrompt(makeContext());
    expect(built.systemPrompt).toContain('Never write dialogue, thoughts, feelings, or actions for Traveler.');
    expect(built.systemPrompt).not.toContain('[Response Format]');
    const lastUserMsg = built.history[built.history.length - 1];
    expect(lastUserMsg.content).toContain('[Response Format]');
    expect(lastUserMsg.content).toContain('mood: one of calm, curious, urgent, furious (default calm)');
    expect(lastUserMsg.content).toContain('affinity: integer 0–10 (default 5)');
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
    expect(lastUserMsg.content).toContain('[Response Format]');
    expect(lastUserMsg.content).toContain('End every reply with a state block exactly as shown above.');
  });

  it('renders the canonical example override per dialect in closing block 9c (§4)', () => {
    const custom = ':::narrator\nSnow falls.\n:::\n\n```state\n{"mood":"calm"}\n```';
    const built = buildPrompt(makeContext({ narrativeExample: custom }));
    const report = built.blocks.find((b) => b.id === '9c')!;
    expect(report.included).toBe(true);
    expect(report.text).toContain('Snow falls.');
    expect(report.text).not.toContain('morning mist');
    const lastUserMsg = built.history[built.history.length - 1];
    expect(lastUserMsg.content).toContain('Snow falls.');
    expect(built.systemPrompt).not.toContain('Snow falls.');

    // Same override under the xml dialect renders as xml.
    const builtXml = buildPrompt(
      makeContext({
        narrativeExample: custom,
        chat: { narrativeMode: 'narrative', envelopeDialect: 'xml' }
      })
    );
    const reportXml = builtXml.blocks.find((b) => b.id === '9c')!;
    expect(reportXml.text).toContain('<narrator>');
    expect(reportXml.text).toContain('Snow falls.');
    expect(reportXml.text).not.toContain(':::narrator');

    // Without an override the built-in example applies.
    const builtDefault = buildPrompt(makeContext());
    expect(builtDefault.blocks.find((b) => b.id === '9c')!.text).toContain('glances up');
  });

  it('attaches the closing format spec exactly once (no double bottom attach)', () => {
    const built = buildPrompt(makeContext());
    for (const msg of built.history) {
      expect(msg.content.match(/\[Response Format\]/g)?.length ?? 0).toBeLessThanOrEqual(1);
    }
    const lastUserMsg = built.history[built.history.length - 1];
    expect(lastUserMsg.content.match(/\[Response Format\]/g)?.length).toBe(1);
    // Canonical 9a, 9b, 9c order in the final message
    const idx9a = lastUserMsg.content.indexOf('[Standing direction:');
    const idx9b = lastUserMsg.content.indexOf("[Director's note for this turn:");
    const idx9c = lastUserMsg.content.indexOf('[Response Format]');
    expect(idx9a).toBeGreaterThanOrEqual(0);
    expect(idx9b).toBeGreaterThan(idx9a);
    expect(idx9c).toBeGreaterThan(idx9b);
  });

  describe('State tracking switch', () => {
    it('omits state lines from 9c and the 7b scene line when disabled', () => {
      const built = buildPrompt(makeContext({ stateEnabled: false }));
      expect(built.blocks.find((b) => b.id === '9c')!.included).toBe(true);
      expect(built.blocks.find((b) => b.id === '7b')!.included).toBe(false);
      expect(built.systemPrompt).not.toContain('[Scene state:');
      const lastUserMsg = built.history[built.history.length - 1];
      // Voice grammar stays so envelope adherence is preserved.
      expect(lastUserMsg.content).toContain('[Response Format]');
      expect(lastUserMsg.content).toContain(':::character[Eldrin the Mage]');
      // State pieces gone.
      expect(lastUserMsg.content).not.toContain('```state');
      expect(lastUserMsg.content).not.toContain('End every reply with a state block');
      expect(lastUserMsg.content).not.toContain('State schema fields:');
    });

    it('strips the state fence per dialect when disabled', () => {
      for (const dialect of ['directive', 'xml', 'prefix'] as const) {
        const built = buildPrompt(
          makeContext({
            stateEnabled: false,
            chat: { narrativeMode: 'narrative', envelopeDialect: dialect }
          })
        );
        const lastUserMsg = built.history[built.history.length - 1];
        expect(lastUserMsg.content).toContain('[Response Format]');
        expect(lastUserMsg.content).not.toContain('```state');
        expect(lastUserMsg.content).not.toContain('<state>');
      }
    });

    it('strips the state fence from a custom example when disabled', () => {
      const custom = ':::narrator\nSnow falls.\n:::\n\n```state\n{"mood":"calm"}\n```';
      const built = buildPrompt(makeContext({ stateEnabled: false, narrativeExample: custom }));
      const report = built.blocks.find((b) => b.id === '9c')!;
      expect(report.included).toBe(true);
      expect(report.text).toContain('Snow falls.');
      expect(report.text).not.toContain('```state');
    });

    it('defaults to state on when the flag is unset', () => {
      const built = buildPrompt(makeContext());
      expect(built.blocks.find((b) => b.id === '9c')!.included).toBe(true);
      expect(built.blocks.find((b) => b.id === '7b')!.included).toBe(true);
      expect(built.history[built.history.length - 1].content).toContain('```state');
    });
  });

  it('handles ending on assistant by appending synthetic [Continue the scene.]', () => {
    const assistantOnlyHistory: HistoryTurn[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        narrativeRole: 'character',
        parentId: 'msg-0',
        content: 'I greet you.',
        status: 'complete'
      }
    ];
    const built = buildPrompt(makeContext({ history: assistantOnlyHistory }));
    const lastMsg = built.history[built.history.length - 1];
    expect(lastMsg.role).toBe('user');
    expect(lastMsg.content.startsWith('[Continue the scene.]')).toBe(true);
  });

  it('wraps greeting roots in a prologue block by default', () => {
    const built = buildPrompt(
      makeContext({
        history: [
          {
            id: 'greet-1',
            role: 'assistant',
            narrativeRole: 'character',
            senderName: 'Eldrin the Mage',
            parentId: null,
            content: 'hey there buddy what kind of story you want',
            status: 'complete'
          }
        ]
      })
    );
    const greetingMsg = built.history.find((m) => m.role === 'assistant');
    expect(greetingMsg).toEqual({
      role: 'assistant',
      content: ':::greeting\nhey there buddy what kind of story you want\n:::'
    });
  });

  it('converts already-tagged greetings across dialects', () => {
    const built = buildPrompt(
      makeContext({
        chat: { narrativeMode: 'narrative', envelopeDialect: 'xml' },
        history: [
          {
            id: 'greet-1',
            role: 'assistant',
            narrativeRole: 'character',
            senderName: 'Eldrin the Mage',
            parentId: null,
            content: ':::character[Eldrin the Mage]\n"Step into the light."\n:::',
            status: 'complete'
          }
        ]
      })
    );
    const converted = built.history.find((m) => m.role === 'assistant');
    expect(converted?.content).toContain('<character name="Eldrin the Mage">\n"Step into the light."\n</character>');
  });

  it('splits greeting voices in split mode and keeps classic greetings raw', () => {
    const greeting = {
      id: 'greet-1',
      role: 'assistant' as const,
      narrativeRole: 'character' as const,
      senderName: 'Eldrin the Mage',
      parentId: null,
      content: 'Rain lashes the glass. "Step into the light where I can see your hands."',
      status: 'complete' as const
    };
    const split = buildPrompt(
      makeContext({ character: { ...eldrinCard, greetingMode: 'split' as const }, history: [greeting] })
    );
    const splitMsg = split.history.find((m) => m.role === 'assistant');
    expect(splitMsg?.content).toContain(':::narrator\nRain lashes the glass.\n:::');
    expect(splitMsg?.content).toContain(
      ':::character[Eldrin the Mage]\n"Step into the light where I can see your hands."\n:::'
    );

    const classic = buildPrompt(
      makeContext({ chat: { narrativeMode: 'classic' }, history: [{ ...greeting }] })
    );
    expect(classic.history.find((m) => m.role === 'assistant')).toEqual({
      role: 'assistant',
      content: greeting.content
    });
  });

  it('prefers reviewed AI overrides for matching greetings', () => {
    const aiCard = {
      ...eldrinCard,
      greetingMode: 'ai' as const,
      firstMessage: 'hey there buddy',
      greetingEnvelope: {
        first: ':::narrator\nRain falls.\n:::\n\n:::character[John]\n"Hey."\n:::'
      }
    };
    const withOverride = buildPrompt(
      makeContext({
        character: aiCard,
        history: [
          {
            id: 'greet-1',
            role: 'assistant' as const,
            narrativeRole: 'character' as const,
            senderName: 'John',
            parentId: null,
            content: 'hey there buddy',
            status: 'complete' as const
          }
        ]
      })
    );
    const overridden = withOverride.history.find((m) => m.role === 'assistant');
    expect(overridden?.content).toContain(':::narrator\nRain falls.\n:::');

    // AI mode without a matching override falls back to prologue.
    const withoutOverride = buildPrompt(
      makeContext({
        character: aiCard,
        history: [
          {
            id: 'greet-2',
            role: 'assistant' as const,
            narrativeRole: 'character' as const,
            senderName: 'John',
            parentId: null,
            content: 'An edited greeting nobody reviewed.',
            status: 'complete' as const
          }
        ]
      })
    );
    expect(withoutOverride.history.find((m) => m.role === 'assistant')?.content).toContain(':::greeting');
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
          { id: '1', role: 'assistant', narrativeRole: 'character', parentId: 'p0', content: 'Greetings.', status: 'complete' },
          { id: '2', role: 'user', narrativeRole: 'persona', parentId: '1', content: 'Hello.', status: 'complete' }
        ]
      })
    );
    expect(built.history[0]).toEqual({ role: 'user', content: '[Scene begins.]' });
  });

  it('wraps persona turns in the active dialect tags', () => {
    const personaTurn = {
      id: '1',
      role: 'user' as const,
      narrativeRole: 'persona' as const,
      senderName: 'Traveler',
      parentId: 'p0',
      content: 'Hello.',
      status: 'complete' as const
    };

    const directive = buildPrompt(makeContext({ history: [personaTurn] }));
    expect(directive.history[0].role).toBe('user');
    expect(directive.history[0].content).toContain(':::persona[Traveler]\nHello.\n:::');

    const xml = buildPrompt(
      makeContext({
        chat: { narrativeMode: 'narrative', envelopeDialect: 'xml' },
        history: [personaTurn]
      })
    );
    expect(xml.history[0].role).toBe('user');
    expect(xml.history[0].content).toContain('<persona name="Traveler">\nHello.\n</persona>');

    const prefix = buildPrompt(
      makeContext({
        chat: { narrativeMode: 'narrative', envelopeDialect: 'prefix' },
        history: [personaTurn]
      })
    );
    expect(prefix.history[0].role).toBe('user');
    expect(prefix.history[0].content).toContain('Traveler: Hello.');
  });

  it('falls back to raw persona text on delimiter collisions and missing names', () => {
    const colliding = buildPrompt(
      makeContext({
        history: [
          {
            id: '1',
            role: 'user' as const,
            narrativeRole: 'persona' as const,
            senderName: 'Traveler',
            parentId: 'p0',
            content: ':::\nHello.',
            status: 'complete' as const
          }
        ]
      })
    );
    expect(colliding.history[0].role).toBe('user');
    expect(colliding.history[0].content).toContain(':::\nHello.');
    expect(colliding.history[0].content).not.toContain(':::persona');

    const nameless = buildPrompt(
      makeContext({
        history: [
          { id: '1', role: 'user' as const, narrativeRole: 'persona' as const, parentId: 'p0', content: 'Hi.', status: 'complete' as const }
        ]
      })
    );
    expect(nameless.history[0].role).toBe('user');
    expect(nameless.history[0].content).toContain(':::persona[Traveler]\nHi.\n:::');
  });

  it('serializes classical persona turns as plain Name: headers without envelope tags', () => {
    const built = buildPrompt(
      makeContext({
        chat: { narrativeMode: 'classic' },
        history: [
          {
            id: '1',
            role: 'user' as const,
            narrativeRole: 'persona' as const,
            senderName: 'Traveler',
            parentId: 'p0',
            content: 'right now? *he sends her back* I am busy',
            status: 'complete' as const
          }
        ]
      })
    );
    expect(built.dialect).toBe('classic');
    const msg = built.history.find((m) => m.content.includes('I am busy'));
    expect(msg).toBeDefined();
    expect(msg!.role).toBe('user');
    expect(msg!.content).toContain('Traveler: right now? *he sends her back* I am busy');
    expect(msg!.content).not.toContain(':::persona');
    expect(msg!.content).not.toContain(':::');
  });

  it('keeps the classical speaker prefix on everyday RP text without envelope validation', () => {
    const built = buildPrompt(
      makeContext({
        chat: { narrativeMode: 'classic' },
        history: [
          {
            id: '1',
            role: 'user' as const,
            narrativeRole: 'persona' as const,
            senderName: 'Traveler',
            parentId: 'p0',
            content: '*sighs*\nPaul: are you coming?',
            status: 'complete' as const
          }
        ]
      })
    );
    const msg = built.history.find((m) => m.content.includes('are you coming?'));
    expect(msg).toBeDefined();
    // Asterisk lines and quoted Name: lines must not drop the speaker the
    // way envelope delimiter validation would.
    expect(msg!.content).toContain('Traveler: *sighs*\nPaul: are you coming?');
    expect(msg!.content).not.toContain(':::');
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

  it('drops unpinned examples under pressure while keeping history', () => {
    const bigExamples = `{{char}}: ${'lorem ipsum dolor sit amet '.repeat(60)}`;
    const history: HistoryTurn[] = [];
    for (let i = 0; i < 8; i++) {
      history.push({
        id: `u${i}`,
        role: 'user' as const,
        narrativeRole: 'persona' as const,
        parentId: i === 0 ? null : `a${i - 1}`,
        content: `User turn number ${i} with padding words to cost tokens.`,
        status: 'complete' as const
      });
      history.push({
        id: `a${i}`,
        role: 'assistant' as const,
        narrativeRole: 'character' as const,
        senderName: 'Eldrin the Mage',
        parentId: `u${i}`,
        content: `Assistant turn number ${i} with padding words to cost tokens.`,
        status: 'complete' as const
      });
    }
    // Measure with a roomy budget, then size a tight one where everything
    // fits except the examples (safety 1.0 keeps the arithmetic exact).
    const roomy = buildPrompt(
      makeContext({
        character: { ...eldrinCard, exampleDialogue: bigExamples },
        history,
        budget: { contextLength: 8000, reservedCompletion: 200, safetyFactor: 1 }
      })
    );
    const roomyBlock5 = roomy.blocks.find((b) => b.id === '5')!;
    expect(roomyBlock5.included).toBe(true);
    const exTokens = roomyBlock5.tokens;
    expect(exTokens).toBeGreaterThan(0);

    const staticNoEx = roomy.tokens.static - exTokens;
    const target = staticNoEx + roomy.tokens.history + roomy.tokens.bottom + Math.floor(exTokens / 2);
    const tightBudget = { contextLength: target + 200, reservedCompletion: 200, safetyFactor: 1 };

    const built = buildPrompt(
      makeContext({ character: { ...eldrinCard, exampleDialogue: bigExamples }, history, budget: tightBudget })
    );
    const block5 = built.blocks.find((b) => b.id === '5')!;
    expect(block5.included).toBe(false);
    expect(block5.reason).toContain('unpinned');
    expect(built.systemPrompt).not.toContain('lorem ipsum');
    // History untouched: fit-phase drops are zero.
    expect(built.tokens.total).toBeLessThanOrEqual(built.tokens.available);
  });

  it('protects pinned examples under pressure by shrinking history instead', () => {
    const bigExamples = `{{char}}: ${'lorem ipsum dolor sit amet '.repeat(60)}`;
    const history: HistoryTurn[] = [];
    for (let i = 0; i < 8; i++) {
      history.push({
        id: `u${i}`,
        role: 'user' as const,
        narrativeRole: 'persona' as const,
        parentId: i === 0 ? null : `a${i - 1}`,
        content: `User turn number ${i} with padding words to cost tokens.`,
        status: 'complete' as const
      });
      history.push({
        id: `a${i}`,
        role: 'assistant' as const,
        narrativeRole: 'character' as const,
        senderName: 'Eldrin the Mage',
        parentId: `u${i}`,
        content: `Assistant turn number ${i} with padding words to cost tokens.`,
        status: 'complete' as const
      });
    }
    const roomy = buildPrompt(
      makeContext({
        character: { ...eldrinCard, exampleDialogue: bigExamples },
        history,
        budget: { contextLength: 8000, reservedCompletion: 200, safetyFactor: 1 }
      })
    );
    const exTokens = roomy.blocks.find((b) => b.id === '5')!.tokens;
    const staticNoEx = roomy.tokens.static - exTokens;
    const target = staticNoEx + roomy.tokens.history + roomy.tokens.bottom + Math.floor(exTokens / 2);

    const built = buildPrompt(
      makeContext({
        character: { ...eldrinCard, exampleDialogue: bigExamples },
        history,
        budget: { contextLength: target + 200, reservedCompletion: 200, safetyFactor: 1, pinExamples: true }
      })
    );
    const block5 = built.blocks.find((b) => b.id === '5')!;
    expect(block5.included).toBe(true);
    expect(built.systemPrompt).toContain('lorem ipsum');
    expect(built.tokens.total).toBeLessThanOrEqual(built.tokens.available);
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

  describe('Block 1c (provider config prompt)', () => {
    it('is omitted without a config prompt and leaves the golden output untouched', () => {
      const built = buildPrompt(makeContext());
      const report = built.blocks.find((b) => b.id === '1c');
      expect(report).toMatchObject({ included: false, tokens: 0 });
    });

    it('sits between preamble and character blocks with macros applied', () => {
      const built = buildPrompt(
        makeContext({ configPrompt: 'Extra rule for {{char}}: keep replies terse, {{user}}.' })
      );
      const report = built.blocks.find((b) => b.id === '1c');
      expect(report?.included).toBe(true);
      expect(report!.tokens).toBeGreaterThan(0);

      const text = built.systemPrompt;
      expect(text).toContain('Extra rule for Eldrin the Mage: keep replies terse, Traveler.');
      expect(text).not.toContain('[Response Format]');
      const idxPrompt = text.indexOf('Extra rule for Eldrin');
      const idxPreamble = text.indexOf('Stop and yield');
      const idxChar = text.indexOf('Ancient wizard in starry robes.');
      expect(idxPreamble).toBeGreaterThanOrEqual(0);
      expect(idxChar).toBeGreaterThan(0);
      expect(idxPrompt).toBeGreaterThan(idxPreamble);
      expect(idxPrompt).toBeLessThan(idxChar);
    });

    it('ignores blank prompts', () => {
      const built = buildPrompt(makeContext({ configPrompt: '   ' }));
      expect(built.blocks.find((b) => b.id === '1c')).toMatchObject({ included: false });
    });
  });

  describe('Co-Author Persona Voicing Policy', () => {
    it('uses co-author preamble in system and persona tag instructions in closing 9c', () => {
      const built = buildPrompt(makeContext({ personaVoicing: 'allowed' }));
      expect(built.systemPrompt).toContain('You collaborate as a co-author');
      const lastUserMsg = built.history[built.history.length - 1];
      expect(lastUserMsg.content).toContain(':::persona[Traveler] ... ::: for Traveler\'s spoken dialogue and actions.');
      expect(built.stop).toEqual([]);
    });

    it('includes XML persona tag in xml dialect when personaVoicing is allowed', () => {
      const ctx = makeContext({
        personaVoicing: 'allowed',
        chat: { narrativeMode: 'narrative', envelopeDialect: 'xml' }
      });
      const built = buildPrompt(ctx);
      const lastUserMsg = built.history[built.history.length - 1];
      expect(lastUserMsg.content).toContain('<persona name="Traveler"> ... </persona> for Traveler\'s spoken dialogue and actions.');
      expect(built.stop).toEqual([]);
    });

    it('includes prefix persona line in prefix dialect when personaVoicing is allowed', () => {
      const ctx = makeContext({
        personaVoicing: 'allowed',
        chat: { narrativeMode: 'narrative', envelopeDialect: 'prefix' }
      });
      const built = buildPrompt(ctx);
      const lastUserMsg = built.history[built.history.length - 1];
      expect(lastUserMsg.content).toContain('Traveler: ... for Traveler\'s spoken dialogue and actions.');
      expect(built.stop).toEqual([]);
    });

    it('retains user custom preamble even when personaVoicing is allowed', () => {
      const ctx = makeContext({
        personaVoicing: 'allowed',
        preamble: 'Custom co-writing rules for {{char}} and {{user}}.'
      });
      const built = buildPrompt(ctx);
      expect(built.systemPrompt).toContain('Custom co-writing rules for Eldrin the Mage and Traveler.');
      expect(built.systemPrompt).not.toContain('You collaborate as a co-author');
      expect(built.stop).toEqual([]);
    });
  });
});

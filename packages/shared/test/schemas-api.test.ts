import { describe, it, expect } from 'bun:test';
import { Value } from '@sinclair/typebox/value';
import {
  SendMessageBodySchema,
  MessagePatchSchema,
  MessageViewSchema,
  SettingsPatchSchema,
  AppSettingsSchema,
  DEFAULT_SETTINGS,
  ChatCreateSchema,
  ChatViewSchema,
  ApiErrorSchema,
  type MessageView,
  type ChatView
} from '../src';

describe('Shared API & DTO Schemas', () => {
  it('SendMessageBodySchema validates message, directorNote, and npc role', () => {
    // Standard user turn
    const body1 = { message: 'Hello!' };
    expect(Value.Check(SendMessageBodySchema, body1)).toBe(true);

    // Director note only
    const body2 = { directorNote: 'Make it rain.' };
    expect(Value.Check(SendMessageBodySchema, body2)).toBe(true);

    // NPC role with senderName (route requires senderName, schema permits optional string)
    const body3 = {
      message: 'Halt!',
      narrativeRole: 'npc',
      senderName: 'Guard Captain'
    };
    expect(Value.Check(SendMessageBodySchema, body3)).toBe(true);

    // Invalid role
    const invalidRole = { message: 'Hi', narrativeRole: 'bogus' };
    expect(Value.Check(SendMessageBodySchema, invalidRole)).toBe(false);

    // Message too long (> 32_000)
    const tooLong = { message: 'a'.repeat(32_001) };
    expect(Value.Check(SendMessageBodySchema, tooLong)).toBe(false);
  });

  it('MessagePatchSchema discriminates string content vs segments + statePatch', () => {
    // 1. Content patch
    const patch1 = { content: 'Updated dialogue.' };
    expect(Value.Check(MessagePatchSchema, patch1)).toBe(true);

    // 2. Segments patch with statePatch
    const patch2 = {
      segments: [{ kind: 'character', text: 'Hello', name: 'Eldrin' }],
      statePatch: { mood: 'calm' }
    };
    expect(Value.Check(MessagePatchSchema, patch2)).toBe(true);

    // Segments patch with null statePatch
    const patch3 = {
      segments: [{ kind: 'narrator', text: 'Thunder rumbles.' }],
      statePatch: null
    };
    expect(Value.Check(MessagePatchSchema, patch3)).toBe(true);

    // Missing both content and segments
    expect(Value.Check(MessagePatchSchema, { statePatch: { mood: 'furious' } })).toBe(false);
  });

  it('SettingsPatchSchema enforces apiKey null/non-empty rules and cleans unknown keys', () => {
    // apiKey: null is valid (clears key)
    const p1 = { openrouter: { apiKey: null } };
    expect(Value.Check(SettingsPatchSchema, p1)).toBe(true);

    // apiKey: non-empty string is valid
    const p2 = { openrouter: { apiKey: 'sk-or-test-key' } };
    expect(Value.Check(SettingsPatchSchema, p2)).toBe(true);

    // apiKey: '' is invalid (minLength: 1)
    const p3 = { openrouter: { apiKey: '' } };
    expect(Value.Check(SettingsPatchSchema, p3)).toBe(false);

    // Partial generation patch
    const p4 = { generation: { temperature: 1.2 } };
    expect(Value.Check(SettingsPatchSchema, p4)).toBe(true);

    // Temperature out of range (< 0 or > 2)
    const p5 = { generation: { temperature: 2.5 } };
    expect(Value.Check(SettingsPatchSchema, p5)).toBe(false);

    // Cleaning unknown keys
    const dirty = {
      generation: { temperature: 0.9, extraKey: 'junk' },
      rogue: 123
    };
    const cleaned = Value.Clean(SettingsPatchSchema, dirty);
    expect(cleaned).toEqual({ generation: { temperature: 0.9 } });
  });

  it('SettingsPatchSchema accepts custom/gemini provider patches', () => {
    expect(Value.Check(SettingsPatchSchema, { provider: { id: 'custom' } })).toBe(true);
    expect(Value.Check(SettingsPatchSchema, { provider: { id: 'gemini' } })).toBe(true);
    expect(Value.Check(SettingsPatchSchema, { provider: { id: 'gemini-interactions' } })).toBe(true);
    expect(
      Value.Check(SettingsPatchSchema, {
        custom: { baseUrl: 'http://localhost:11434/v1', apiKey: null }
      })
    ).toBe(true);
    expect(Value.Check(SettingsPatchSchema, { custom: { baseUrl: null } })).toBe(true);
    expect(Value.Check(SettingsPatchSchema, { gemini: { apiKey: 'AI-test' } })).toBe(true);
    expect(Value.Check(SettingsPatchSchema, { custom: { apiKey: '' } })).toBe(false);
    expect(Value.Check(SettingsPatchSchema, { provider: { id: 'bogus' } })).toBe(false);
  });

  it('SettingsPatchSchema bounds generation sampling fields (TopK/Rep/Freq)', () => {
    // Top K int 0–100
    expect(Value.Check(SettingsPatchSchema, { generation: { topK: 40 } })).toBe(true);
    expect(Value.Check(SettingsPatchSchema, { generation: { topK: 0 } })).toBe(true);
    expect(Value.Check(SettingsPatchSchema, { generation: { topK: 100 } })).toBe(true);
    expect(Value.Check(SettingsPatchSchema, { generation: { topK: -1 } })).toBe(false);
    expect(Value.Check(SettingsPatchSchema, { generation: { topK: 101 } })).toBe(false);
    expect(Value.Check(SettingsPatchSchema, { generation: { topK: 1.5 } })).toBe(false);

    // Repetition penalty 1.0–2.0
    expect(Value.Check(SettingsPatchSchema, { generation: { repetitionPenalty: 1 } })).toBe(true);
    expect(Value.Check(SettingsPatchSchema, { generation: { repetitionPenalty: 1.5 } })).toBe(true);
    expect(Value.Check(SettingsPatchSchema, { generation: { repetitionPenalty: 2 } })).toBe(true);
    expect(Value.Check(SettingsPatchSchema, { generation: { repetitionPenalty: 0.9 } })).toBe(false);
    expect(Value.Check(SettingsPatchSchema, { generation: { repetitionPenalty: 2.1 } })).toBe(false);

    // Frequency penalty -2.0–2.0
    expect(Value.Check(SettingsPatchSchema, { generation: { frequencyPenalty: 0 } })).toBe(true);
    expect(Value.Check(SettingsPatchSchema, { generation: { frequencyPenalty: -2 } })).toBe(true);
    expect(Value.Check(SettingsPatchSchema, { generation: { frequencyPenalty: 2 } })).toBe(true);
    expect(Value.Check(SettingsPatchSchema, { generation: { frequencyPenalty: -2.1 } })).toBe(false);
    expect(Value.Check(SettingsPatchSchema, { generation: { frequencyPenalty: 2.1 } })).toBe(false);

    // Reasoning toggle (on | off | null in patch)
    expect(Value.Check(SettingsPatchSchema, { generation: { reasoning: 'on' } })).toBe(true);
    expect(Value.Check(SettingsPatchSchema, { generation: { reasoning: 'off' } })).toBe(true);
    expect(Value.Check(SettingsPatchSchema, { generation: { reasoning: null } })).toBe(true);
    expect(Value.Check(SettingsPatchSchema, { generation: { reasoning: 'auto' } })).toBe(false);
    expect(Value.Check(SettingsPatchSchema, { generation: { reasoning: 'none' } })).toBe(false);

    // Reasoning effort (low | medium | high | null in patch; minimal/max rejected)
    expect(Value.Check(SettingsPatchSchema, { generation: { reasoningEffort: 'low' } })).toBe(true);
    expect(Value.Check(SettingsPatchSchema, { generation: { reasoningEffort: 'medium' } })).toBe(true);
    expect(Value.Check(SettingsPatchSchema, { generation: { reasoningEffort: 'high' } })).toBe(true);
    expect(Value.Check(SettingsPatchSchema, { generation: { reasoningEffort: null } })).toBe(true);
    expect(Value.Check(SettingsPatchSchema, { generation: { reasoningEffort: 'minimal' } })).toBe(false);
    expect(Value.Check(SettingsPatchSchema, { generation: { reasoningEffort: 'max' } })).toBe(false);
    expect(Value.Check(SettingsPatchSchema, { generation: { reasoningEffort: 'xhigh' } })).toBe(false);

    // Stored schema mirrors the same bounds
    expect(Value.Check(AppSettingsSchema, {
      ...DEFAULT_SETTINGS,
      generation: { ...DEFAULT_SETTINGS.generation, frequencyPenalty: 0.5, reasoning: 'on', reasoningEffort: 'high' }
    })).toBe(true);
    expect(Value.Check(AppSettingsSchema, {
      ...DEFAULT_SETTINGS,
      generation: { ...DEFAULT_SETTINGS.generation, frequencyPenalty: 5 }
    })).toBe(false);

    // Absent stays absent (existing users unaffected)
    expect(DEFAULT_SETTINGS.generation).not.toHaveProperty('frequencyPenalty');
    expect(DEFAULT_SETTINGS.generation).not.toHaveProperty('topK');
    expect(DEFAULT_SETTINGS.generation).not.toHaveProperty('reasoning');
    expect(DEFAULT_SETTINGS.generation).not.toHaveProperty('reasoningEffort');
  });

  it('DEFAULT_SETTINGS matches documented architectural defaults', () => {
    expect(DEFAULT_SETTINGS.provider).toEqual({ id: 'mock' });
    expect(DEFAULT_SETTINGS.openrouter).toEqual({});
    expect(DEFAULT_SETTINGS.custom).toEqual({});
    expect(DEFAULT_SETTINGS.gemini).toEqual({});
    expect(DEFAULT_SETTINGS.generation.temperature).toBe(0.8);
    expect(DEFAULT_SETTINGS.generation.maxTokens).toBe(1024);
    expect(DEFAULT_SETTINGS.generation.contextLength).toBe(16_384);
    expect(DEFAULT_SETTINGS.narrative.defaultMode).toBe('narrative');
    expect(DEFAULT_SETTINGS.narrative.defaultDialect).toBe('directive');
    expect(DEFAULT_SETTINGS.preamble).toBeUndefined();

    // Default complies with AppSettingsSchema
    expect(Value.Check(AppSettingsSchema, DEFAULT_SETTINGS)).toBe(true);
  });

  it('MessageViewSchema accepts a complete hand-built view', () => {
    const view: MessageView = {
      id: '01J6ABCDEF0123456789012345',
      chatId: '01J6ABCDEF0123456789012346',
      parentId: null,
      role: 'assistant',
      narrativeRole: 'character',
      senderId: 'eldrin-the-mage',
      senderName: 'Eldrin the Mage',
      content: ':::character[Eldrin]\nSpeak.\n:::',
      segments: [{ kind: 'character', name: 'Eldrin', text: 'Speak.' }],
      state: { mood: 'calm', affinity: 5 },
      status: 'complete',
      createdAt: Date.now(),
      metrics: {
        provider: 'mock',
        model: 'mock:envelope-directive',
        promptTokensEstimated: 120,
        promptTokens: 118,
        completionTokens: 35,
        durationMs: 420,
        ttftMs: 45,
        finishReason: 'stop',
        droppedTurns: 0
      },
      metadata: {
        parse: {
          dialect: 'directive',
          parserVersion: 2,
          adherent: true,
          warnings: [],
          truncatedAt: null
        },
        stateSource: 'initial'
      },
      siblingIndex: 0,
      siblingCount: 1,
      hasChildren: true
    };

    expect(Value.Check(MessageViewSchema, view)).toBe(true);
  });

  it('ChatCreateSchema and ChatViewSchema validate chat payloads', () => {
    const createReq = {
      characterId: 'eldrin-the-mage',
      title: 'A meeting under the stars',
      narrativeMode: 'narrative' as const
    };
    expect(Value.Check(ChatCreateSchema, createReq)).toBe(true);

    const chatView: ChatView = {
      id: '01J6ABCDEF0123456789012346',
      title: 'A meeting under the stars',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'default-persona',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: {
        envelopeDialect: 'directive',
        narrativeMode: 'narrative',
        npcs: {},
        currentState: { mood: 'calm' }
      },
      activeLeafId: '01J6ABCDEF0123456789012345',
      activeGenerationMessageId: null,
      messageCount: 1
    };
    expect(Value.Check(ChatViewSchema, chatView)).toBe(true);
  });

  it('ApiErrorSchema validates structured error envelopes', () => {
    const err = {
      error: {
        code: 'generation_in_progress' as const,
        message: 'A generation is already active for this chat.',
        details: { activeMessageId: '01J6ABCDEF0123456789012345' }
      }
    };
    expect(Value.Check(ApiErrorSchema, err)).toBe(true);
  });
});

import { describe, it, expect } from 'bun:test';
import { ChatSession } from '../src/lib/state/session.svelte';
import type { ChatStreamEvent, ChatView, CharacterCard, MessageWithTree } from '@formatavern/shared';

describe('ChatSession Lifecycle & Reconciliation (Invariant U7, U9)', () => {
  const mockCharacter: CharacterCard = {
    id: 'eldrin-the-mage',
    name: 'Eldrin the Mage',
    description: 'An ancient archmage.',
    personality: 'Cryptic',
    scenario: 'Observatory',
    firstMessage: 'Welcome.',
    style: {
      font: { family: 'Cinzel' },
      colors: { charBubbleBg: '#111', charBubbleText: '#fff', userBubbleBg: '#222', userBubbleText: '#fff', accent: '#d97706' },
      bubble: { radius: '1rem' },
      background: {}
    }
  };

  const initialChat: ChatView = {
    id: 'chat-123',
    primaryCharacterId: 'eldrin-the-mage',
    personaId: 'traveler',
    title: 'Chat with Eldrin',
    activeLeafId: 'msg-root',
    activeGenerationMessageId: null,
    createdAt: 1000,
    updatedAt: 1000,
    messageCount: 1,
    metadata: { narrativeMode: 'envelope', envelopeDialect: 'directive' }
  };

  const rootMessage: MessageWithTree = {
    id: 'msg-root',
    chatId: 'chat-123',
    parentId: null,
    senderId: 'eldrin-the-mage',
    role: 'assistant',
    narrativeRole: 'character',
    senderName: 'Eldrin the Mage',
    content: 'Welcome.',
    segments: [{ kind: 'character', name: 'Eldrin the Mage', text: 'Welcome.' }],
    status: 'complete',
    createdAt: 1000,
    siblingIndex: 0,
    siblingCount: 1,
    childCount: 0,
    state: null,
    metadata: {},
    metrics: null
  };

  it('inserts optimistic user turn synchronously upon send()', async () => {
    let capturedSseUrl = '';
    const fakeReadSse = async (url: string) => {
      capturedSseUrl = url;
      // Do not emit events yet to inspect synchronous optimistic turn
    };

    const session = new ChatSession(
      { chat: { ...initialChat }, character: mockCharacter, messages: [rootMessage] },
      { readSse: fakeReadSse as any }
    );

    expect(session.messages.length).toBe(1);

    const sendPromise = session.send({ message: 'Hello master Eldrin.' });

    // Synchronous assertions:
    expect(session.messages.length).toBe(2);
    const optimisticTurn = session.messages[1];
    expect(optimisticTurn.role).toBe('user');
    expect(optimisticTurn.content).toBe('Hello master Eldrin.');
    expect(optimisticTurn.id.startsWith('tmp-')).toBe(true);
    expect(session.live).not.toBeNull();
    expect(session.live?.phase).toBe('connecting');

    await sendPromise;
    expect(capturedSseUrl).toBe('/api/chats/chat-123/messages');
  });

  it('updates live turn ids upon start event and reconciles at done', async () => {
    let sseCallback: (ev: ChatStreamEvent) => void = () => {};
    const fakeReadSse = async (_url: string, _init: any, cb: any) => {
      sseCallback = cb;
    };

    const session = new ChatSession(
      { chat: { ...initialChat }, character: mockCharacter, messages: [rootMessage] },
      { readSse: fakeReadSse as any }
    );

    const sendPromise = session.send({ message: 'Hello.' });

    // 1. Emit start event
    sseCallback({
      type: 'start',
      messageId: 'msg-reply-1',
      parentId: 'tmp-123',
      chatId: 'chat-123',
      role: 'assistant',
      narrativeRole: 'character',
      resumedFrom: 0
    });

    expect(session.live?.messageId).toBe('msg-reply-1');
    expect(session.live?.phase).toBe('streaming');

    // 2. Emit tokens
    sseCallback({ type: 'token', text: 'Greetings, seeker.' });

    // 3. Emit done
    sseCallback({
      type: 'done',
      message: {
        ...rootMessage,
        id: 'msg-reply-1',
        content: 'Greetings, seeker.',
        segments: [{ kind: 'character', name: 'Eldrin the Mage', text: 'Greetings, seeker.' }],
        status: 'complete'
      }
    });

    await sendPromise;
    expect(session.live).toBeNull();
  });

  it('rolls back optimistic turn when request fails before start', async () => {
    const fakeReadSse = async () => {
      const err = new Error('Generation already in progress');
      (err as any).status = 409;
      (err as any).value = { error: { code: 'generation_in_progress', message: '409 Conflict' } };
      throw err;
    };

    const session = new ChatSession(
      { chat: { ...initialChat }, character: mockCharacter, messages: [rootMessage] },
      { readSse: fakeReadSse as any }
    );

    expect(session.messages.length).toBe(1);

    await session.send({ message: 'Will fail.' });

    // Optimistic turn rolled back, live reset to null
    expect(session.messages.length).toBe(1);
    expect(session.live).toBeNull();
  });

  it('destroy() aborts the reader only without stopping generation (Invariant S1, U9)', () => {
    let aborted = false;
    const fakeReadSse = async (_url: string, _init: any, _cb: any, signal?: AbortSignal) => {
      signal?.addEventListener('abort', () => {
        aborted = true;
      });
      // Keep running indefinitely until aborted
      await new Promise(() => {});
    };

    const session = new ChatSession(
      { chat: { ...initialChat }, character: mockCharacter, messages: [rootMessage] },
      { readSse: fakeReadSse as any }
    );

    session.send({ message: 'Navigate away mid-stream' });
    expect(session.live).not.toBeNull();

    // User navigates away -> component destroys session
    session.destroy();

    expect(aborted).toBe(true);
  });

  it('reattaches automatically when constructed with activeGenerationMessageId', async () => {
    let reattachedUrl = '';
    const fakeReadSse = async (url: string) => {
      reattachedUrl = url;
    };

    const chatWithActiveGen: ChatView = {
      ...initialChat,
      activeGenerationMessageId: 'msg-active-99'
    };

    const session = new ChatSession(
      { chat: chatWithActiveGen, character: mockCharacter, messages: [rootMessage] },
      { readSse: fakeReadSse as any }
    );

    expect(session.live?.messageId).toBe('msg-active-99');
    expect(reattachedUrl).toBe('/api/messages/msg-active-99/stream');
  });

  it('seeds resumedFrom when continuing a leaf message', async () => {
    let continuedUrl = '';
    const fakeReadSse = async (url: string) => {
      continuedUrl = url;
    };

    const session = new ChatSession(
      {
        chat: { ...initialChat, activeLeafId: 'msg-root' },
        character: mockCharacter,
        messages: [rootMessage]
      },
      { readSse: fakeReadSse as any }
    );

    await session.continueTurn('msg-root');
    expect(continuedUrl).toBe('/api/messages/msg-root/continue');
    expect(session.live?.resumedFrom).toBe('Welcome.'.length);
  });
});

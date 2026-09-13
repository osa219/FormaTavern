import { describe, it, expect } from 'bun:test';
import {
  GeminiInteractionsProvider,
  renderInteractionsTranscript
} from '../../src/providers/gemini-interactions';
import type { FetchFn } from '../../src/providers/openai-compatible';
import { collect, assertStreamContract } from './contract';

function sse(frames: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const f of frames) controller.enqueue(encoder.encode(f));
      controller.close();
    }
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
}

describe('renderInteractionsTranscript', () => {
  it('renders roles as a plain-text transcript', () => {
    expect(
      renderInteractionsTranscript([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' }
      ])
    ).toBe('User: Hello\n\nAssistant: Hi there');
  });
});

describe('GeminiInteractionsProvider', () => {
  const FAKE_KEY = 'AI-test-secret-key-123';

  it('streams text deltas to tokens and ends on interaction.completed', async () => {
    const frames = [
      'data: {"event_type":"interaction.created","id":"int_1"}\n\n',
      'data: {"event_type":"step.delta","delta":{"type":"text","text":"Hello"}}\n\n',
      'data: {"event_type":"step.delta","delta":{"type":"text","text":" world."}}\n\n',
      'data: {"event_type":"interaction.completed","status":"completed","usage":{"total_tokens":12}}\n\n'
    ];
    const fakeFetch: FetchFn = async () => sse(frames);
    const provider = new GeminiInteractionsProvider({ apiKey: FAKE_KEY, fetch: fakeFetch });

    const events = await collect(provider.generate({ history: [{ role: 'user', content: 'hi' }] }));
    assertStreamContract(events);
    expect(events).toEqual([
      { type: 'token', text: 'Hello' },
      { type: 'token', text: ' world.' },
      { type: 'done', finishReason: 'stop' }
    ]);
  });

  it('wraps thought deltas in <think> tags', async () => {
    const frames = [
      'data: {"event_type":"step.delta","delta":{"type":"thought","text":"pondering"}}\n\n',
      'data: {"event_type":"step.delta","delta":{"type":"text","text":"Answer."}}\n\n',
      'data: {"event_type":"interaction.completed","status":"completed"}\n\n'
    ];
    const fakeFetch: FetchFn = async () => sse(frames);
    const provider = new GeminiInteractionsProvider({ apiKey: FAKE_KEY, fetch: fakeFetch });

    const events = await collect(provider.generate({ history: [] }));
    assertStreamContract(events);
    expect(events).toEqual([
      { type: 'token', text: '<think>' },
      { type: 'token', text: 'pondering' },
      { type: 'token', text: '</think>\n\n' },
      { type: 'token', text: 'Answer.' },
      { type: 'done', finishReason: 'stop' }
    ]);
  });

  it('ends cleanly on requires_action and EOF without completed', async () => {
    const fakeFetch: FetchFn = async () =>
      sse(['data: {"event_type":"interaction.requires_action"}\n\n']);
    const events = await collect(
      new GeminiInteractionsProvider({ apiKey: FAKE_KEY, fetch: fakeFetch }).generate({ history: [] })
    );
    assertStreamContract(events);
    expect(events).toEqual([{ type: 'done', finishReason: 'stop' }]);
  });

  it('posts system_instruction + transcript to ?alt=sse with x-goog-api-key', async () => {
    let capturedUrl = '';
    let capturedHeaders: any;
    let capturedBody: any;
    const fakeFetch: FetchFn = async (url, init) => {
      capturedUrl = String(url);
      capturedHeaders = init?.headers;
      capturedBody = JSON.parse(init?.body as string);
      return sse(['data: {"event_type":"interaction.completed"}\n\n']);
    };
    const provider = new GeminiInteractionsProvider({ apiKey: FAKE_KEY, fetch: fakeFetch });
    await collect(
      provider.generate({
        model: 'gemini-3.5-flash',
        systemPrompt: 'Be kind.',
        history: [
          { role: 'assistant', content: 'Early start' },
          { role: 'user', content: 'Hello' }
        ],
        temperature: 0.5,
        maxTokens: 999,
        topK: 40
      })
    );

    expect(capturedUrl).toBe('https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse');
    expect(capturedHeaders['x-goog-api-key']).toBe(FAKE_KEY);
    expect(capturedHeaders.Authorization).toBeUndefined();
    expect(capturedBody.model).toBe('gemini-3.5-flash');
    expect(capturedBody.stream).toBe(true);
    expect(capturedBody.system_instruction).toBe('Be kind.');
    expect(capturedBody.input).toContain('User: Hello');
    expect(capturedBody.input).toContain('[Scene begins.]');
    expect(capturedBody.generation_config).toEqual({ temperature: 0.5 });
    expect(capturedBody.max_tokens).toBeUndefined();
    expect(capturedBody.top_k).toBeUndefined();
  });

  it('maps the native models list and scrubs keys on 401', async () => {
    const listFetch: FetchFn = async () =>
      new Response(
        JSON.stringify({
          models: [
            { name: 'models/gemini-3.5-flash', displayName: 'Gemini 3.5 Flash', inputTokenLimit: 1048576 }
          ]
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    expect(
      await new GeminiInteractionsProvider({ apiKey: FAKE_KEY, fetch: listFetch }).listModels()
    ).toEqual([{ id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', contextLength: 1048576 }]);

    const fetch401: FetchFn = async () =>
      new Response(JSON.stringify({ error: { message: `bad key ${FAKE_KEY}` } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    const events = await collect(
      new GeminiInteractionsProvider({ apiKey: FAKE_KEY, fetch: fetch401 }).generate({ history: [] })
    );
    expect(events[0].type).toBe('error');
    expect((events[0] as any).message.includes(FAKE_KEY)).toBe(false);
    expect((events[0] as any).recoverable).toBe(false);
  });

  it('aborts before fetch without calling upstream and requires an apiKey', async () => {
    let called = false;
    const fakeFetch: FetchFn = async () => {
      called = true;
      return new Response('');
    };
    const controller = new AbortController();
    controller.abort();
    const events = await collect(
      new GeminiInteractionsProvider({ apiKey: FAKE_KEY, fetch: fakeFetch }).generate(
        { history: [] },
        controller.signal
      )
    );
    expect(called).toBe(false);
    expect(events).toEqual([{ type: 'done', finishReason: 'aborted' }]);
    expect(() => new GeminiInteractionsProvider({ apiKey: '  ' })).toThrow();
  });
});

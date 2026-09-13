import { describe, it, expect } from 'bun:test';
import {
  OpenAICompatibleProvider,
  normalizeBaseUrl,
  joinUrl,
  type FetchFn
} from '../../src/providers/openai-compatible';
import { collect, assertStreamContract } from './contract';

function makeByteStream(chunks: Uint8Array[], onCancel?: () => void): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
    cancel() {
      onCancel?.();
    }
  });
}

function makeTextStream(frames: string[], onCancel?: () => void): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return makeByteStream(frames.map((f) => encoder.encode(f)), onCancel);
}

const sse = (frames: string[], onCancel?: () => void) =>
  new Response(makeTextStream(frames, onCancel), {
    headers: { 'Content-Type': 'text/event-stream' }
  });

describe('normalizeBaseUrl', () => {
  it('leaves clean bases untouched', () => {
    expect(normalizeBaseUrl('https://api.openai.com/v1')).toBe('https://api.openai.com/v1');
    expect(normalizeBaseUrl('http://localhost:11434')).toBe('http://localhost:11434');
  });

  it('trims whitespace and trailing slashes', () => {
    expect(normalizeBaseUrl('  http://localhost:11434/v1/  ')).toBe('http://localhost:11434/v1');
  });

  it('strips a pasted /chat/completions suffix', () => {
    expect(normalizeBaseUrl('http://localhost:11434/v1/chat/completions')).toBe(
      'http://localhost:11434/v1'
    );
    expect(normalizeBaseUrl('http://localhost:11434/v1/chat/completions/')).toBe(
      'http://localhost:11434/v1'
    );
  });

  it('strips a pasted /models suffix', () => {
    expect(normalizeBaseUrl('https://example.com/api/v1/models')).toBe('https://example.com/api/v1');
  });

  it('joinUrl never produces double slashes', () => {
    expect(joinUrl('http://h/v1/', '/chat/completions')).toBe('http://h/v1/chat/completions');
    expect(joinUrl('http://h/v1', 'models')).toBe('http://h/v1/models');
  });
});

describe('OpenAICompatibleProvider', () => {
  const FAKE_KEY = 'sk-test-secret-key-999';

  it('exposes strict defaults: prefill=false, stream_options accounting', async () => {
    let capturedUrl = '';
    let capturedBody: any;
    const fakeFetch: FetchFn = async (url, init) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(init?.body as string);
      return sse(['data: [DONE]\n\n']);
    };

    const provider = new OpenAICompatibleProvider({
      baseUrl: 'http://localhost:11434/v1/',
      apiKey: FAKE_KEY,
      fetch: fakeFetch
    });

    expect(provider.capabilities.prefill).toBe(false);
    const events = await collect(provider.generate({ history: [{ role: 'user', content: 'hi' }] }));
    assertStreamContract(events);

    expect(capturedUrl).toBe('http://localhost:11434/v1/chat/completions');
    expect(capturedBody.stream).toBe(true);
    expect(capturedBody.stream_options).toEqual({ include_usage: true });
    expect(capturedBody.usage).toBeUndefined();
  });

  it('drops extended sampling params by default, keeps them when opted in', async () => {
    let capturedDefault: any;
    let capturedExtended: any;

    const base: FetchFn = async (_url, init) => {
      capturedDefault = JSON.parse(init?.body as string);
      return sse(['data: [DONE]\n\n']);
    };
    const ext: FetchFn = async (_url, init) => {
      capturedExtended = JSON.parse(init?.body as string);
      return sse(['data: [DONE]\n\n']);
    };

    const req = {
      history: [{ role: 'user' as const, content: 'hi' }],
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      minP: 0.05,
      repetitionPenalty: 1.1
    };

    await collect(
      new OpenAICompatibleProvider({ baseUrl: 'http://h/v1', apiKey: FAKE_KEY, fetch: base }).generate(
        req
      )
    );
    expect(capturedDefault.temperature).toBe(0.7);
    expect(capturedDefault.top_p).toBe(0.9);
    expect(capturedDefault.top_k).toBeUndefined();
    expect(capturedDefault.min_p).toBeUndefined();
    expect(capturedDefault.repetition_penalty).toBeUndefined();

    await collect(
      new OpenAICompatibleProvider({
        baseUrl: 'http://h/v1',
        apiKey: FAKE_KEY,
        fetch: ext,
        allowExtendedSampling: true
      }).generate(req)
    );
    expect(capturedExtended.top_k).toBe(40);
    expect(capturedExtended.min_p).toBe(0.05);
    expect(capturedExtended.repetition_penalty).toBe(1.1);
  });

  it('usageAccounting=openrouter sends usage.include instead of stream_options', async () => {
    let capturedBody: any;
    const fakeFetch: FetchFn = async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return sse(['data: [DONE]\n\n']);
    };

    const provider = new OpenAICompatibleProvider({
      baseUrl: 'http://h/v1',
      apiKey: FAKE_KEY,
      fetch: fakeFetch,
      usageAccounting: 'openrouter'
    });
    await collect(provider.generate({ history: [] }));
    expect(capturedBody.usage).toEqual({ include: true });
    expect(capturedBody.stream_options).toBeUndefined();
  });

  it('supports keyless local servers: omits Authorization header', async () => {
    let capturedHeaders: any;
    const fakeFetch: FetchFn = async (_url, init) => {
      capturedHeaders = init?.headers;
      return sse(['data: [DONE]\n\n']);
    };

    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:11434/v1', fetch: fakeFetch });
    await collect(provider.generate({ history: [{ role: 'user', content: 'hi' }] }));
    expect(capturedHeaders.Authorization).toBeUndefined();
    expect(capturedHeaders['Content-Type']).toBe('application/json');
  });

  it('applies extraBody and excludeKeys', async () => {
    let capturedBody: any;
    let capturedHeaders: any;
    const fakeFetch: FetchFn = async (_url, init) => {
      capturedHeaders = init?.headers;
      capturedBody = JSON.parse(init?.body as string);
      return sse(['data: [DONE]\n\n']);
    };

    const provider = new OpenAICompatibleProvider({
      baseUrl: 'http://h/v1',
      apiKey: FAKE_KEY,
      fetch: fakeFetch,
      extraHeaders: { 'X-Custom': 'yes' },
      extraBody: { custom_flag: true },
      excludeKeys: ['top_p']
    });
    await collect(provider.generate({ history: [], temperature: 0.9, topP: 0.5 }));
    expect(capturedBody.custom_flag).toBe(true);
    expect(capturedBody.temperature).toBe(0.9);
    expect(capturedBody.top_p).toBeUndefined();
    expect(capturedHeaders['X-Custom']).toBe('yes');
  });

  it('wraps reasoning_content in <think> tags compatible with the envelope parser', async () => {
    const frames = [
      'data: {"choices":[{"delta":{"reasoning_content":"Let me think"}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":" carefully"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"The answer."},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n'
    ];
    const fakeFetch: FetchFn = async () => sse(frames);
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'http://h/v1',
      apiKey: FAKE_KEY,
      fetch: fakeFetch
    });

    const events = await collect(provider.generate({ history: [] }));
    assertStreamContract(events);
    expect(events).toEqual([
      { type: 'token', text: '<think>' },
      { type: 'token', text: 'Let me think' },
      { type: 'token', text: ' carefully' },
      { type: 'token', text: '</think>\n\n' },
      { type: 'token', text: 'The answer.' },
      { type: 'done', finishReason: 'stop' }
    ]);
  });

  it('closes an unclosed <think> tag when the stream ends on reasoning', async () => {
    const frames = ['data: {"choices":[{"delta":{"reasoning":"only thoughts"}}]}\n\n', 'data: [DONE]\n\n'];
    const fakeFetch: FetchFn = async () => sse(frames);
    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://h/v1', fetch: fakeFetch });

    const events = await collect(provider.generate({ history: [] }));
    assertStreamContract(events);
    expect(events).toEqual([
      { type: 'token', text: '<think>' },
      { type: 'token', text: 'only thoughts' },
      { type: 'token', text: '</think>' },
      { type: 'done', finishReason: 'stop' }
    ]);
  });

  it('does not double-wrap when the model manages its own <think> tags', async () => {
    // Content carrying the model's own tags arrives first, so later
    // reasoning-channel chunks pass through bare instead of opening
    // a second synthetic <think> block.
    const frames = [
      'data: {"choices":[{"delta":{"content":"<think>model thought</think>Part."}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":"extra thought"}}]}\n\n',
      'data: [DONE]\n\n'
    ];
    const fakeFetch: FetchFn = async () => sse(frames);
    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://h/v1', fetch: fakeFetch });

    const events = await collect(provider.generate({ history: [] }));
    const tokens = events.filter((e) => e.type === 'token').map((e: any) => e.text);
    // Reasoning passes through bare once the model manages its own tags.
    expect(tokens).toEqual(['<think>model thought</think>Part.', 'extra thought']);
  });

  it('parses both OpenRouter and plain OpenAI /models shapes', async () => {
    const orFetch: FetchFn = async () =>
      new Response(
        JSON.stringify({ data: [{ id: 'a/b', name: 'B', context_length: 4096 }] }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    const oaiFetch: FetchFn = async () =>
      new Response(JSON.stringify({ data: [{ id: 'gpt-x' }] }), {
        headers: { 'Content-Type': 'application/json' }
      });
    const badFetch: FetchFn = async () => new Response('nope', { status: 500 });

    expect(
      await new OpenAICompatibleProvider({ baseUrl: 'http://h/v1', fetch: orFetch }).listModels()
    ).toEqual([{ id: 'a/b', name: 'B', contextLength: 4096 }]);
    expect(
      await new OpenAICompatibleProvider({ baseUrl: 'http://h/v1', fetch: oaiFetch }).listModels()
    ).toEqual([{ id: 'gpt-x', name: 'gpt-x', contextLength: 8192 }]);
    expect(
      await new OpenAICompatibleProvider({ baseUrl: 'http://h/v1', fetch: badFetch }).listModels()
    ).toEqual([]);
  });

  it('scrubs the api key and marks 429 recoverable', async () => {
    const fetch401: FetchFn = async () =>
      new Response(JSON.stringify({ error: { message: `bad key ${FAKE_KEY} here` } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    const ev401 = await collect(
      new OpenAICompatibleProvider({ baseUrl: 'http://h/v1', apiKey: FAKE_KEY, fetch: fetch401 }).generate({
        history: []
      })
    );
    expect(ev401[0].type).toBe('error');
    expect((ev401[0] as any).message.includes(FAKE_KEY)).toBe(false);
    expect((ev401[0] as any).recoverable).toBe(false);

    const fetch429: FetchFn = async () =>
      new Response(JSON.stringify({ error: { message: 'slow down' } }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    const ev429 = await collect(
      new OpenAICompatibleProvider({ baseUrl: 'http://h/v1', apiKey: FAKE_KEY, fetch: fetch429 }).generate({
        history: []
      })
    );
    expect((ev429[0] as any).recoverable).toBe(true);
  });

  it('aborts before fetch without calling upstream', async () => {
    let called = false;
    const fakeFetch: FetchFn = async () => {
      called = true;
      return new Response('');
    };
    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://h/v1', fetch: fakeFetch });
    const controller = new AbortController();
    controller.abort();
    const events = await collect(provider.generate({ history: [] }, controller.signal));
    expect(called).toBe(false);
    expect(events).toEqual([{ type: 'done', finishReason: 'aborted' }]);
  });

  it('requires a baseUrl', () => {
    expect(() => new OpenAICompatibleProvider({ baseUrl: '   ' })).toThrow();
  });
});

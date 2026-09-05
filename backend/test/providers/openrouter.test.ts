import { describe, it, expect } from 'bun:test';
import { OpenRouterProvider, type FetchFn } from '../../src/providers/openrouter';
import { collect, assertStreamContract } from './contract';

function makeByteStream(chunks: Uint8Array[], delayMs = 0, onCancel?: () => void): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
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
  const chunks = frames.map((f) => encoder.encode(f));
  return makeByteStream(chunks, 0, onCancel);
}

describe('OpenRouterProvider', () => {
  const FAKE_KEY = 'sk-or-test-secret-key-12345';

  it('handles happy path: tokens concat, usage in later frame, then done{stop}', async () => {
    const frames = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world."},"finish_reason":"stop"}]}\n\n',
      'data: {"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n',
      'data: [DONE]\n\n'
    ];

    const fakeFetch: FetchFn = async () =>
      new Response(makeTextStream(frames), {
        headers: { 'Content-Type': 'text/event-stream' }
      });

    const provider = new OpenRouterProvider({ apiKey: FAKE_KEY, fetch: fakeFetch });
    const events = await collect(provider.generate({ history: [{ role: 'user', content: 'hi' }] }));

    assertStreamContract(events);
    expect(events).toEqual([
      { type: 'token', text: 'Hello' },
      { type: 'token', text: ' world.' },
      { type: 'usage', promptTokens: 10, completionTokens: 5 },
      { type: 'done', finishReason: 'stop' }
    ]);
  });

  it('reassembles multibyte UTF-8 characters split across byte boundaries (— and emoji)', async () => {
    const encoder = new TextEncoder();
    // Em dash is 3 bytes: 0xE2, 0x80, 0x94
    // 🜁 is 4 bytes: 0xF0, 0x9F, 0x9C, 0x81
    const part1 = encoder.encode('data: {"choices":[{"delta":{"content":"Wind \u2014 ' + '"}]}\n\n');
    // We split inside the em dash or emoji:
    const fullText = 'data: {"choices":[{"delta":{"content":"ancient \uD83D\uDF01 energy"}}]}\n\n';
    const bytes = encoder.encode(fullText);

    // Split bytes right in the middle of \uD83D\uDF01 (which is 4 UTF-8 bytes)
    const splitPoint = bytes.length - 20;
    const chunkA = bytes.slice(0, splitPoint);
    const chunkB = bytes.slice(splitPoint);
    const doneChunk = encoder.encode('data: [DONE]\n\n');

    const fakeFetch: FetchFn = async () =>
      new Response(makeByteStream([chunkA, chunkB, doneChunk]), {
        headers: { 'Content-Type': 'text/event-stream' }
      });

    const provider = new OpenRouterProvider({ apiKey: FAKE_KEY, fetch: fakeFetch });
    const events = await collect(provider.generate({ history: [] }));

    assertStreamContract(events);
    const tokens = events.filter((e) => e.type === 'token').map((e: any) => e.text).join('');
    expect(tokens).toBe('ancient \uD83D\uDF01 energy');
  });

  it('handles frame splits inside data: {"cho and inside \\n\\n', async () => {
    const frames = [
      'data: {"choices":[{"de',
      'lta":{"content":"Part 1"}}]}\n',
      '\ndata: {"choices":[{"delta":{"content":"Part 2"}}]}\n\ndata: [DONE]\n\n'
    ];

    const fakeFetch: FetchFn = async () =>
      new Response(makeTextStream(frames), {
        headers: { 'Content-Type': 'text/event-stream' }
      });

    const provider = new OpenRouterProvider({ apiKey: FAKE_KEY, fetch: fakeFetch });
    const events = await collect(provider.generate({ history: [] }));

    assertStreamContract(events);
    const tokens = events.filter((e) => e.type === 'token').map((e: any) => e.text).join('');
    expect(tokens).toBe('Part 1Part 2');
  });

  it('ignores comment lines, empty content heartbeats, and handles \\r\\n line endings', async () => {
    const frames = [
      ': OPENROUTER PROCESSING\r\n\r\n',
      'data: {"choices":[{"delta":{"content":""}}]}\r\n\r\n',
      ': another comment\r\n',
      'data: {"choices":[{"delta":{"content":"Actual content"}}]}\r\n\r\n',
      'data: [DONE]\r\n\r\n'
    ];

    const fakeFetch: FetchFn = async () =>
      new Response(makeTextStream(frames), {
        headers: { 'Content-Type': 'text/event-stream' }
      });

    const provider = new OpenRouterProvider({ apiKey: FAKE_KEY, fetch: fakeFetch });
    const events = await collect(provider.generate({ history: [] }));

    assertStreamContract(events);
    expect(events.filter((e) => e.type === 'token')).toEqual([
      { type: 'token', text: 'Actual content' }
    ]);
  });

  it('terminates with done{stop} on EOF when [DONE] is omitted', async () => {
    const frames = ['data: {"choices":[{"delta":{"content":"Done without tag"}}]}\n\n'];

    const fakeFetch: FetchFn = async () =>
      new Response(makeTextStream(frames), {
        headers: { 'Content-Type': 'text/event-stream' }
      });

    const provider = new OpenRouterProvider({ apiKey: FAKE_KEY, fetch: fakeFetch });
    const events = await collect(provider.generate({ history: [] }));

    assertStreamContract(events);
    expect(events[events.length - 1]).toEqual({ type: 'done', finishReason: 'stop' });
  });

  it('terminates with done{length} when finish_reason is length', async () => {
    const frames = [
      'data: {"choices":[{"delta":{"content":"Truncated"},"finish_reason":"length"}]}\n\n',
      'data: [DONE]\n\n'
    ];

    const fakeFetch: FetchFn = async () =>
      new Response(makeTextStream(frames), {
        headers: { 'Content-Type': 'text/event-stream' }
      });

    const provider = new OpenRouterProvider({ apiKey: FAKE_KEY, fetch: fakeFetch });
    const events = await collect(provider.generate({ history: [] }));

    assertStreamContract(events);
    expect(events[events.length - 1]).toEqual({ type: 'done', finishReason: 'length' });
  });

  it('yields error event on mid-stream error frame', async () => {
    const frames = [
      'data: {"choices":[{"delta":{"content":"Started..."}}]}\n\n',
      'data: {"error":{"message":"Midstream failure"}}\n\n'
    ];

    const fakeFetch: FetchFn = async () =>
      new Response(makeTextStream(frames), {
        headers: { 'Content-Type': 'text/event-stream' }
      });

    const provider = new OpenRouterProvider({ apiKey: FAKE_KEY, fetch: fakeFetch });
    const events = await collect(provider.generate({ history: [] }));

    assertStreamContract(events, { expectedTerminal: 'error' });
    expect(events[events.length - 1]).toEqual({
      type: 'error',
      message: 'Midstream failure',
      recoverable: false
    });
  });

  it('handles HTTP 429 recoverable error and scrubs apiKey on 401 error', async () => {
    // 429 Rate Limit
    const fetch429: FetchFn = async () =>
      new Response(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });

    const p429 = new OpenRouterProvider({ apiKey: FAKE_KEY, fetch: fetch429 });
    const ev429 = await collect(p429.generate({ history: [] }));
    expect(ev429).toEqual([
      { type: 'error', message: 'OpenRouter 429: Rate limit exceeded', recoverable: true }
    ]);

    // 401 with body echoing the key
    const fetch401: FetchFn = async () =>
      new Response(JSON.stringify({ error: { message: `Invalid key ${FAKE_KEY}` } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });

    const p401 = new OpenRouterProvider({ apiKey: FAKE_KEY, fetch: fetch401 });
    const ev401 = await collect(p401.generate({ history: [] }));
    expect(ev401[0].type).toBe('error');
    expect(ev401[0]).toEqual({
      type: 'error',
      message: 'OpenRouter 401: Invalid key [REDACTED]',
      recoverable: false
    });
    expect((ev401[0] as any).message.includes(FAKE_KEY)).toBe(false);

    // 200 text/html interstitial
    const fetchHtml: FetchFn = async () =>
      new Response('<html><body>Cloudflare challenge</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      });

    const pHtml = new OpenRouterProvider({ apiKey: FAKE_KEY, fetch: fetchHtml });
    const evHtml = await collect(pHtml.generate({ history: [] }));
    expect(evHtml[0].type).toBe('error');
    expect((evHtml[0] as any).recoverable).toBe(true);
  });

  it('aborts immediately before fetch and mid-stream', async () => {
    let fetchCalled = false;
    const fakeFetch: FetchFn = async () => {
      fetchCalled = true;
      return new Response('');
    };

    const provider = new OpenRouterProvider({ apiKey: FAKE_KEY, fetch: fakeFetch });

    // Abort before fetch
    const controller1 = new AbortController();
    controller1.abort();
    const events1 = await collect(provider.generate({ history: [] }, controller1.signal));
    expect(fetchCalled).toBe(false);
    expect(events1).toEqual([{ type: 'done', finishReason: 'aborted' }]);

    // Abort mid-stream
    let upstreamSignal: AbortSignal | undefined;
    const fetchSlow: FetchFn = async (_url, init) => {
      upstreamSignal = init?.signal as any;
      const delayedStream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          await new Promise((r) => setTimeout(r, 100));
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'));
        }
      });
      return new Response(delayedStream, { headers: { 'Content-Type': 'text/event-stream' } });
    };

    const pSlow = new OpenRouterProvider({ apiKey: FAKE_KEY, fetch: fetchSlow });
    const controller2 = new AbortController();
    const genPromise = collect(pSlow.generate({ history: [] }, controller2.signal));

    setTimeout(() => controller2.abort(), 20);
    const events2 = await genPromise;
    expect(events2[events2.length - 1]).toEqual({ type: 'done', finishReason: 'aborted' });
    expect(upstreamSignal?.aborted).toBe(true);
  });

  it('triggers error on idle timeout and cancels reader', async () => {
    let cancelCalled = false;
    const fakeFetch: FetchFn = async () => {
      const stallingStream = new ReadableStream<Uint8Array>({
        pull() {
          // Never push anything
          return new Promise(() => {});
        },
        cancel() {
          cancelCalled = true;
        }
      });
      return new Response(stallingStream, { headers: { 'Content-Type': 'text/event-stream' } });
    };

    const provider = new OpenRouterProvider({
      apiKey: FAKE_KEY,
      fetch: fakeFetch,
      idleTimeoutMs: 30
    });

    const events = await collect(provider.generate({ history: [] }));
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('error');
    expect((events[0] as any).recoverable).toBe(true);
    expect((events[0] as any).message).toContain('upstream idle timeout after 30ms');
    expect(cancelCalled).toBe(true);
  });

  it('verifies outbound request shape: stream, usage, stop cap 4, prefill, coalescing, and user-first', async () => {
    let capturedBody: any;
    const fakeFetch: FetchFn = async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response('data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    };

    const provider = new OpenRouterProvider({ apiKey: FAKE_KEY, fetch: fakeFetch });

    await collect(
      provider.generate({
        systemPrompt: 'System instructions',
        history: [
          { role: 'assistant', content: 'Assistant first turn' },
          { role: 'user', content: 'User part 1' },
          { role: 'user', content: 'User part 2' }
        ],
        assistantPrefill: 'Assistant continues...',
        stop: ['stop1', 'stop2', 'stop3', 'stop4', 'stop5', 'stop6']
      })
    );

    expect(capturedBody.stream).toBe(true);
    expect(capturedBody.usage).toEqual({ include: true });
    expect(capturedBody.stop).toEqual(['stop1', 'stop2', 'stop3', 'stop4']); // capped to 4

    // Messages checks:
    // 1. System message preserved
    // 2. [Scene begins.] inserted before Assistant first turn (user-first)
    // 3. User part 1 & 2 coalesced with \n\n
    // 4. Prefill appended as trailing assistant
    expect(capturedBody.messages).toEqual([
      { role: 'system', content: 'System instructions' },
      { role: 'user', content: '[Scene begins.]' },
      { role: 'assistant', content: 'Assistant first turn' },
      { role: 'user', content: 'User part 1\n\nUser part 2' },
      { role: 'assistant', content: 'Assistant continues...' }
    ]);
  });

  it('cancels reader when consumer breaks loop early', async () => {
    let cancelCalled = false;
    const frames = [
      'data: {"choices":[{"delta":{"content":"1"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"2"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"3"}}]}\n\n',
      'data: [DONE]\n\n'
    ];

    const fakeFetch: FetchFn = async () =>
      new Response(makeTextStream(frames, () => { cancelCalled = true; }), {
        headers: { 'Content-Type': 'text/event-stream' }
      });

    const provider = new OpenRouterProvider({ apiKey: FAKE_KEY, fetch: fakeFetch });
    const collected: string[] = [];

    for await (const ev of provider.generate({ history: [] })) {
      if (ev.type === 'token') {
        collected.push(ev.text);
        if (collected.length === 2) {
          break; // break early
        }
      }
    }

    expect(collected).toEqual(['1', '2']);
    expect(cancelCalled).toBe(true);
  });
});

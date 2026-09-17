import { describe, it, expect } from 'bun:test';
import type { SettingsView } from '@formatavern/shared';
import { setupTestApp } from './helpers';

describe('routes/settings', () => {
  it('masks apiKey on GET, handles set/keep/clear on PATCH, and prevents empty string', async () => {
    const { app } = setupTestApp();

    // 1. Initial GET
    const getRes1 = await app.handle(new Request('http://127.0.0.1/api/settings'));
    expect(getRes1.status).toBe(200);
    const view1 = (await getRes1.json()) as SettingsView;
    expect(view1.openrouter.apiKeySet).toBe(false);
    expect(view1.openrouter.apiKeyHint).toBeNull();
    expect((view1 as any).openrouter.apiKey).toBeUndefined();

    // 2. PATCH empty string -> 422
    const emptyRes = await app.handle(
      new Request('http://127.0.0.1/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openrouter: { apiKey: '' } })
      })
    );
    expect(emptyRes.status).toBe(422);

    // 3. PATCH valid key -> 200, masked
    const patchRes1 = await app.handle(
      new Request('http://127.0.0.1/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openrouter: { apiKey: 'sk-or-test-secret-9876' } })
      })
    );
    expect(patchRes1.status).toBe(200);
    const view2 = (await patchRes1.json()) as SettingsView;
    expect(view2.openrouter.apiKeySet).toBe(true);
    expect(view2.openrouter.apiKeyHint).toBe('9876');
    expect(view2.openrouter.source).toBe('settings');
    expect(JSON.stringify(view2)).not.toContain('secret');

    // 4. PATCH clear via null -> 200, cleared
    const patchRes2 = await app.handle(
      new Request('http://127.0.0.1/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openrouter: { apiKey: null } })
      })
    );
    expect(patchRes2.status).toBe(200);
    const view3 = (await patchRes2.json()) as SettingsView;
    expect(view3.openrouter.apiKeySet).toBe(false);
    expect(view3.openrouter.apiKeyHint).toBeNull();
  });

  it('fails with 409 provider_unconfigured when provider.id is openrouter without key', async () => {
    const { app, repos } = setupTestApp();

    // Set provider to openrouter
    await app.handle(
      new Request('http://127.0.0.1/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: { id: 'openrouter' } })
      })
    );

    // Create chat
    const chat = repos.chats.create({
      id: 'c-unconf',
      title: 'Unconfigured',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default',
      metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
    });

    const sendRes = await app.handle(
      new Request(`http://127.0.0.1/api/chats/${chat.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello' })
      })
    );

    expect(sendRes.status).toBe(409);
    const json = (await sendRes.json()) as any;
    expect(json.error.code).toBe('provider_unconfigured');
  });

  it('sends stream: true to OpenRouter with fake fetch, and scrubs apiKey from error bodies', async () => {    let capturedBody: any = null;
    const testSecret = 'sk-or-v1-supersecret-7777';

    const fakeFetch = async (_url: any, init: any) => {
      capturedBody = JSON.parse(init.body);
      // Return 401 echoing the secret key
      return new Response(
        JSON.stringify({
          error: {
            message: `Unauthorized for key ${testSecret}: invalid credentials`
          }
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const { app, repos } = setupTestApp({ customFetch: fakeFetch });

    // Set openrouter and key
    await app.handle(
      new Request('http://127.0.0.1/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: { id: 'openrouter' },
          openrouter: { apiKey: testSecret }
        })
      })
    );

    const chat = repos.chats.create({
      id: 'c-fake-fetch',
      title: 'Fetch Test',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default',
      metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
    });

    const sendRes = await app.handle(
      new Request(`http://127.0.0.1/api/chats/${chat.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Cast spell' })
      })
    );

    // Should return SSE stream
    expect(sendRes.status).toBe(200);
    expect(capturedBody).not.toBeNull();
    expect(capturedBody.stream).toBe(true);

    // Allow background generation to complete and finalize
    await new Promise((r) => setTimeout(r, 50));

    const messages = repos.messages.pageActiveBranch(chat.id, repos.chats.get(chat.id)!.activeLeafId!, { limit: 10 });
    const asstMsg = messages.find((m) => m.role === 'assistant');
    expect(asstMsg).toBeDefined();
    expect(asstMsg!.status).toBe('error');
    // Invariant P7 / 7.4: Error message stored in DB must NOT contain the secret key!
    expect(JSON.stringify(asstMsg!.metadata)).not.toContain(testSecret);
  });

  describe('GET/PUT /api/settings/shell-theme (Slice 4)', () => {
    it('returns empty DEFAULT_SHELL_THEME on initial GET', async () => {
      const { app } = setupTestApp();
      const res = await app.handle(new Request('http://127.0.0.1/api/settings/shell-theme'));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({});
    });

    it('roundtrips valid ShellTheme document on PUT', async () => {
      const { app } = setupTestApp();
      const payload = {
        font: { family: 'Cinzel', size: '1.1rem' },
        chrome: { accent: '#38bdf8', surface: 'rgba(15,15,15,0.9)' },
        card: { radius: '0.75rem', density: 'compact' },
        scrim: '0.75',
        labels: { foyerTitle: 'Tavern Hall' },
        customCss: '.ft-topbar { box-shadow: none; }'
      };

      const putRes = await app.handle(
        new Request('http://127.0.0.1/api/settings/shell-theme', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      );
      expect(putRes.status).toBe(200);
      const putJson = await putRes.json();
      expect(putJson).toEqual(payload);

      // Subsequent GET should match
      const getRes = await app.handle(new Request('http://127.0.0.1/api/settings/shell-theme'));
      expect(getRes.status).toBe(200);
      const getJson = await getRes.json();
      expect(getJson).toEqual(payload);
    });

    it('rejects PUT with 422 when customCss exceeds 131,072 characters', async () => {
      const { app } = setupTestApp();
      const overCapPayload = {
        customCss: 'x'.repeat(131_073)
      };

      const res = await app.handle(
        new Request('http://127.0.0.1/api/settings/shell-theme', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(overCapPayload)
        })
      );
      expect(res.status).toBe(422);
    });

    it('rejects PUT with 422 on invalid schema fields (e.g. invalid density)', async () => {
      const { app } = setupTestApp();
      const invalidPayload = {
        card: { density: 'extra-huge' }
      };

      const res = await app.handle(
        new Request('http://127.0.0.1/api/settings/shell-theme', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(invalidPayload)
        })
      );
      expect(res.status).toBe(422);
    });
  });

  describe('custom + gemini providers', () => {
    it('exposes custom/gemini key status masked on GET', async () => {
      const { app } = setupTestApp();
      const res = await app.handle(new Request('http://127.0.0.1/api/settings'));
      expect(res.status).toBe(200);
      const view = (await res.json()) as SettingsView;
      expect(view.custom.baseUrl).toBeNull();
      expect(view.custom.apiKeySet).toBe(false);
      expect(view.custom.source).toBe('none');
      expect(view.gemini.apiKeySet).toBe(false);
      expect(view.gemini.source).toBe('none');
      expect((view as any).custom.apiKey).toBeUndefined();
      expect((view as any).gemini.apiKey).toBeUndefined();
    });

    it('rejects invalid custom base URLs and empty keys with 422', async () => {
      const { app } = setupTestApp();

      const badUrl = await app.handle(
        new Request('http://127.0.0.1/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ custom: { baseUrl: 'not-a-url' } })
        })
      );
      expect(badUrl.status).toBe(422);

      const ftpUrl = await app.handle(
        new Request('http://127.0.0.1/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ custom: { baseUrl: 'ftp://host/v1' } })
        })
      );
      expect(ftpUrl.status).toBe(422);

      const emptyKey = await app.handle(
        new Request('http://127.0.0.1/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gemini: { apiKey: '' } })
        })
      );
      expect(emptyKey.status).toBe(422);
    });

    it('fails with 409 provider_unconfigured for custom without base URL and gemini without key', async () => {
      const { app, repos } = setupTestApp();
      const chat = repos.chats.create({
        id: 'c-unconf-p3',
        title: 'Unconfigured P3',
        primaryCharacterId: 'eldrin-the-mage',
        activePersonaId: 'persona-default',
        metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
      });

      await app.handle(
        new Request('http://127.0.0.1/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: { id: 'custom' } })
        })
      );
      const customRes = await app.handle(
        new Request(`http://127.0.0.1/api/chats/${chat.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Hello' })
        })
      );
      expect(customRes.status).toBe(409);
      expect(((await customRes.json()) as any).error.code).toBe('provider_unconfigured');

      await app.handle(
        new Request('http://127.0.0.1/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: { id: 'gemini' } })
        })
      );
      const geminiRes = await app.handle(
        new Request(`http://127.0.0.1/api/chats/${chat.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Hello again' })
        })
      );
      expect(geminiRes.status).toBe(409);
      expect(((await geminiRes.json()) as any).error.code).toBe('provider_unconfigured');

      await app.handle(
        new Request('http://127.0.0.1/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: { id: 'gemini-interactions' } })
        })
      );
      const nativeRes = await app.handle(
        new Request(`http://127.0.0.1/api/chats/${chat.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Hello native' })
        })
      );
      expect(nativeRes.status).toBe(409);
      expect(((await nativeRes.json()) as any).error.code).toBe('provider_unconfigured');
    });

    it('generates through a keyless custom endpoint with fake fetch', async () => {
      let capturedUrl = '';
      let capturedBody: any = null;
      const fakeFetch = async (url: any, init: any) => {
        capturedUrl = String(url);
        capturedBody = JSON.parse(init.body);
        return new Response('data: [DONE]\n\n', {
          headers: { 'Content-Type': 'text/event-stream' }
        });
      };

      const { app, repos } = setupTestApp({ customFetch: fakeFetch });
      const setupRes = await app.handle(
        new Request('http://127.0.0.1/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: { id: 'custom', model: 'llama3.1' },
            custom: { baseUrl: 'http://localhost:11434/v1' }
          })
        })
      );
      expect(setupRes.status).toBe(200);

      const chat = repos.chats.create({
        id: 'c-custom-fetch',
        title: 'Custom Fetch',
        primaryCharacterId: 'eldrin-the-mage',
        activePersonaId: 'persona-default',
        metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
      });

      const sendRes = await app.handle(
        new Request(`http://127.0.0.1/api/chats/${chat.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Hello local' })
        })
      );
      expect(sendRes.status).toBe(200);
      // Generation runs in the background; wait for the upstream call.
      for (let i = 0; i < 100 && capturedUrl === ''; i++) {
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(capturedUrl).toBe('http://localhost:11434/v1/chat/completions');
      expect(capturedBody?.model).toBe('llama3.1');
      expect(capturedBody?.stream).toBe(true);
    });

    it('forwards generation.frequencyPenalty into the upstream body (0 included)', async () => {
      let capturedBody: any = null;
      const fakeFetch = async (_url: any, init: any) => {
        capturedBody = JSON.parse(init.body);
        return new Response('data: [DONE]\n\n', {
          headers: { 'Content-Type': 'text/event-stream' }
        });
      };

      const { app, repos } = setupTestApp({ customFetch: fakeFetch });
      const setupRes = await app.handle(
        new Request('http://127.0.0.1/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: { id: 'custom', model: 'llama3.1' },
            custom: { baseUrl: 'http://localhost:11434/v1' },
            generation: { frequencyPenalty: 0 }
          })
        })
      );
      expect(setupRes.status).toBe(200);

      const chat = repos.chats.create({
        id: 'c-freq-fwd',
        title: 'Freq Forward',
        primaryCharacterId: 'eldrin-the-mage',
        activePersonaId: 'persona-default',
        metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
      });

      const sendRes = await app.handle(
        new Request(`http://127.0.0.1/api/chats/${chat.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Hello freq' })
        })
      );
      expect(sendRes.status).toBe(200);
      for (let i = 0; i < 100 && capturedBody === null; i++) {
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(capturedBody?.frequency_penalty).toBe(0);
    });

    it('rejects out-of-range generation sampling patches with 422', async () => {
      const { app } = setupTestApp();
      for (const body of [
        { generation: { topK: 101 } },
        { generation: { repetitionPenalty: 0.5 } },
        { generation: { frequencyPenalty: 2.5 } }
      ]) {
        const res = await app.handle(
          new Request('http://127.0.0.1/api/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          })
        );
        expect(res.status).toBe(422);
      }
    });

    it('patches and clears reasoning and reasoningEffort with null without corrupting settings', async () => {
      const { app } = setupTestApp();

      // 1. Patch reasoning 'on' and reasoningEffort 'high'
      const patch1 = await app.handle(
        new Request('http://127.0.0.1/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            generation: { reasoning: 'on', reasoningEffort: 'high' }
          })
        })
      );
      expect(patch1.status).toBe(200);
      const json1 = (await patch1.json()) as any;
      expect(json1.generation.reasoning).toBe('on');
      expect(json1.generation.reasoningEffort).toBe('high');

      // 2. Clear with null
      const patch2 = await app.handle(
        new Request('http://127.0.0.1/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            generation: { reasoning: null, reasoningEffort: null }
          })
        })
      );
      expect(patch2.status).toBe(200);
      const json2 = (await patch2.json()) as any;
      expect(json2.generation.reasoning).toBeUndefined();
      expect(json2.generation.reasoningEffort).toBeUndefined();
      // Ensure existing defaults (e.g. temperature) were NOT wiped or reset due to corrupted schema check
      expect(json2.generation.temperature).toBe(0.8);
      expect(json2.generation.maxTokens).toBe(1024);
    });
  });

  it('stores, validates, and clears the canonical narrative example (§4)', async () => {
    const { app } = setupTestApp();

    const patch = (body: unknown) =>
      app.handle(
        new Request('http://127.0.0.1/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
      );

    // Per-dialect renderings of the built-in are exposed for reference.
    const getRes = await app.handle(new Request('http://127.0.0.1/api/settings'));
    const view0 = (await getRes.json()) as SettingsView;
    expect(view0.exampleRenderings.directive).toContain(':::narrator');
    expect(view0.exampleRenderings.xml).toContain('<narrator>');
    expect(view0.exampleRenderings.prefix).toContain('Narrator:');
    expect(view0.narrative.example).toBeUndefined();

    // Missing state demo -> 422, nothing stored.
    const noFence = await patch({
      narrative: { example: ':::narrator\nSnow falls.\n:::' }
    });
    expect(noFence.status).toBe(422);

    // Persona voice -> 422.
    const personaVoice = await patch({
      narrative: {
        example: ':::persona\nI wander.\n:::\n\n```state\n{}\n```'
      }
    });
    expect(personaVoice.status).toBe(422);

    // Non-directive authoring -> 422.
    const xmlAuthored = await patch({
      narrative: { example: '<narrator>Snow.</narrator>\n\n<state>\n{}\n</state>' }
    });
    expect(xmlAuthored.status).toBe(422);

    // Blank -> 422 (reset instead).
    const blank = await patch({ narrative: { example: '   ' } });
    expect(blank.status).toBe(422);

    // Valid custom example stores, surfaces in the view, and renders per dialect.
    const custom = ':::narrator\nSnow falls.\n:::\n\n```state\n{"mood":"calm"}\n```';
    const ok = await patch({ narrative: { example: custom } });
    expect(ok.status).toBe(200);
    const view1 = (await ok.json()) as SettingsView;
    expect(view1.narrative.example).toBe(custom);
    expect(view1.exampleRenderings.directive).toContain('Snow falls.');
    expect(view1.exampleRenderings.xml).toContain('<narrator>');
    expect(view1.exampleRenderings.xml).toContain('Snow falls.');
    expect(view1.narrative.defaultDialect).toBe('directive');

    // Null clears back to built-in.
    const cleared = await patch({ narrative: { example: null } });
    expect(cleared.status).toBe(200);
    const view2 = (await cleared.json()) as SettingsView;
    expect(view2.narrative.example).toBeUndefined();
    expect(view2.exampleRenderings.directive).toContain('glances up');
    expect(view2.preambleDefault).toBeDefined();
  });
});

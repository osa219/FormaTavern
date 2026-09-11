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

  it('sends stream: true to OpenRouter with fake fetch, and scrubs apiKey from error bodies', async () => {
    let capturedBody: any = null;
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
});

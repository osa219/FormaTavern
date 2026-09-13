import { describe, it, expect } from 'bun:test';
import type { ProviderConfigView } from '@formatavern/shared';
import { setupTestApp } from './helpers';

const json = (v: unknown) =>
  new Request('http://127.0.0.1/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(v)
  });

async function post(app: any, path: string, body: unknown) {
  const req = json(body);
  return app.handle(new Request(`http://127.0.0.1${path}`, req));
}

describe('routes/provider-configs', () => {
  it('CRUD roundtrip stays masked and enforces names', async () => {
    const { app } = setupTestApp();

    const createRes = await post(app, '/api/provider-configs', {
      name: 'Local',
      providerType: 'custom',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'local-secret',
      model: 'llama3.1'
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as ProviderConfigView;
    expect(created.name).toBe('Local');
    expect(created.apiKeySet).toBe(true);
    expect(created.apiKeyHint).toBe('cret');
    expect((created as any).apiKey).toBeUndefined();
    expect(JSON.stringify(created)).not.toContain('local-secret');

    const dupeRes = await post(app, '/api/provider-configs', {
      name: 'local',
      providerType: 'openrouter'
    });
    expect(dupeRes.status).toBe(409);

    const listRes = await app.handle(new Request('http://127.0.0.1/api/provider-configs'));
    const list = (await listRes.json()) as ProviderConfigView[];
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain('local-secret');

    const patchRes = await app.handle(
      new Request(`http://127.0.0.1/api/provider-configs/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: null })
      })
    );
    expect(patchRes.status).toBe(200);
    expect(((await patchRes.json()) as ProviderConfigView).apiKeySet).toBe(false);

    const missingRes = await app.handle(
      new Request('http://127.0.0.1/api/provider-configs/nope', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'x' })
      })
    );
    expect(missingRes.status).toBe(404);
  });

  it('validates custom base URLs and rejects baseUrl on other types', async () => {
    const { app } = setupTestApp();

    const noUrl = await post(app, '/api/provider-configs', { name: 'C', providerType: 'custom' });
    expect(noUrl.status).toBe(422);

    const badUrl = await post(app, '/api/provider-configs', {
      name: 'C',
      providerType: 'custom',
      baseUrl: 'ftp://host/v1'
    });
    expect(badUrl.status).toBe(422);

    const foreignUrl = await post(app, '/api/provider-configs', {
      name: 'O',
      providerType: 'openrouter',
      baseUrl: 'http://localhost:11434/v1'
    });
    expect(foreignUrl.status).toBe(422);
  });

  it('activate sets the pointer; deleting the active config clears it', async () => {
    const { app } = setupTestApp();

    const created = (await (
      await post(app, '/api/provider-configs', { name: 'OR', providerType: 'openrouter' })
    ).json()) as ProviderConfigView;

    const actRes = await app.handle(
      new Request(`http://127.0.0.1/api/provider-configs/${created.id}/activate`, { method: 'POST' })
    );
    expect(actRes.status).toBe(200);

    const settingsRes = await app.handle(new Request('http://127.0.0.1/api/settings'));
    expect(((await settingsRes.json()) as any).provider.activeConfigId).toBe(created.id);

    const missingAct = await app.handle(
      new Request('http://127.0.0.1/api/provider-configs/nope/activate', { method: 'POST' })
    );
    expect(missingAct.status).toBe(404);

    const delRes = await app.handle(
      new Request(`http://127.0.0.1/api/provider-configs/${created.id}`, { method: 'DELETE' })
    );
    expect(delRes.status).toBe(200);

    const afterRes = await app.handle(new Request('http://127.0.0.1/api/settings'));
    expect(((await afterRes.json()) as any).provider.activeConfigId).toBeUndefined();
  });

  it('test endpoint reports ok and scrubs keys on failure', async () => {
    const okFetch = async () =>
      new Response('data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    const { app } = setupTestApp({ customFetch: okFetch });

    const created = (await (
      await post(app, '/api/provider-configs', {
        name: 'Local',
        providerType: 'custom',
        baseUrl: 'http://localhost:11434/v1'
      })
    ).json()) as ProviderConfigView;

    const okRes = await app.handle(
      new Request(`http://127.0.0.1/api/provider-configs/${created.id}/test`, { method: 'POST' })
    );
    expect(okRes.status).toBe(200);
    const okJson = (await okRes.json()) as any;
    expect(okJson.ok).toBe(true);
    expect(typeof okJson.latencyMs).toBe('number');

    const secret = 'sk-test-leak-check-1234';
    const badFetch = async () =>
      new Response(JSON.stringify({ error: { message: `bad key ${secret}` } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    const app2 = setupTestApp({ customFetch: badFetch }).app;
    const created2 = (await (
      await post(app2, '/api/provider-configs', {
        name: 'Remote',
        providerType: 'custom',
        baseUrl: 'https://example.com/v1',
        apiKey: secret
      })
    ).json()) as ProviderConfigView;

    const failRes = await app2.handle(
      new Request(`http://127.0.0.1/api/provider-configs/${created2.id}/test`, { method: 'POST' })
    );
    const failJson = (await failRes.json()) as any;
    expect(failJson.ok).toBe(false);
    expect(JSON.stringify(failJson)).not.toContain(secret);

    const missingRes = await app.handle(
      new Request('http://127.0.0.1/api/provider-configs/nope/test', { method: 'POST' })
    );
    expect(missingRes.status).toBe(404);
  });

  it('generation through the active config hits its endpoint', async () => {
    let capturedUrl = '';
    const fakeFetch = async (url: any) => {
      capturedUrl = String(url);
      return new Response('data: [DONE]\n\n', {
        headers: { 'Content-Type': 'text/event-stream' }
      });
    };
    const { app, repos } = setupTestApp({ customFetch: fakeFetch });

    const created = (await (
      await post(app, '/api/provider-configs', {
        name: 'Local',
        providerType: 'custom',
        baseUrl: 'http://localhost:11434/v1',
        model: 'llama3.1'
      })
    ).json()) as ProviderConfigView;
    await app.handle(
      new Request(`http://127.0.0.1/api/provider-configs/${created.id}/activate`, { method: 'POST' })
    );

    const chat = repos.chats.create({
      id: 'c-active-cfg',
      title: 'Active Config',
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
    expect(sendRes.status).toBe(200);
    for (let i = 0; i < 100 && capturedUrl === ''; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(capturedUrl).toBe('http://localhost:11434/v1/chat/completions');
  });
});
